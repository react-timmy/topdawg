/**
 * FilmSort — Cloudflare Worker API Proxy
 *
 * Routes:
 *   POST /tmdb               { path: string, params?: Record<string,string> }
 *   POST /gemini             { contents: string, systemInstruction?: string,
 *                              temperature?: number, maxOutputTokens?: number,
 *                              responseMimeType?: string, isPro?: boolean }
 *   POST /subtitles/search   { query: string, tmdbId?: string, season?: number,
 *                              episode?: number, language?: string }
 *   POST /subtitles/download { fileId: string }
 *
 * Auth:
 *   Every request must include a valid Firebase ID token:
 *     Authorization: Bearer <firebase-id-token>
 *   Unsigned-out users get 401. This prevents abuse of your TMDB/Gemini quota.
 *
 * Secrets (set via `wrangler secret put`):
 *   TMDB_API_KEY             — TMDB v3 read key
 *   GEMINI_API_KEY           — Free-tier Gemini key
 *   GEMINI_PRO_API_KEY       — Optional Pro VIP key
 *   OPENSUBTITLES_API_KEY    — Free OpenSubtitles REST API key
 *                              Register free at https://www.opensubtitles.com/en/consumers
 *                              Free tier: 5 downloads/day anonymous, 20/day with account
 *
 * Free tier:
 *   Cloudflare Workers free plan = 100,000 requests/day. More than enough.
 */

// ── Env type ──────────────────────────────────────────────────────────────────
interface Env {
  TMDB_API_KEY: string;
  GEMINI_API_KEY: string;
  GEMINI_PRO_API_KEY?: string;
  FIREBASE_PROJECT_ID: string;
  OPENSUBTITLES_API_KEY?: string;
}

// ── CORS headers ──────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function corsResponse(body: string, status: number, extra?: HeadersInit): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...extra },
  });
}

function json(data: unknown, status = 200): Response {
  return corsResponse(JSON.stringify(data), status);
}

function err(message: string, status: number): Response {
  return corsResponse(JSON.stringify({ error: message }), status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Firebase ID token verification ────────────────────────────────────────────
//
// Cloudflare Workers support the Web Crypto API natively.
// We verify the JWT signature against Firebase's public keys without any SDK.

const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

// Cache the public keys for up to 1 hour (they rotate daily)
let cachedKeys: Record<string, CryptoKey> = {};
let keysCachedAt = 0;
const KEY_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getFirebasePublicKeys(): Promise<Record<string, CryptoKey>> {
  const now = Date.now();
  if (Object.keys(cachedKeys).length > 0 && now - keysCachedAt < KEY_CACHE_TTL) {
    return cachedKeys;
  }

  const res = await fetch(FIREBASE_JWKS_URL);
  if (!res.ok) throw new Error('Failed to fetch Firebase public keys');

  const jwks = await res.json() as { keys: { kid: string; n: string; e: string; kty: string; alg: string; use: string }[] };
  const keys: Record<string, CryptoKey> = {};

  for (const jwk of jwks.keys) {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    keys[jwk.kid] = key;
  }

  cachedKeys = keys;
  keysCachedAt = now;
  return keys;
}

function base64UrlDecode(s: string): Uint8Array {
  // Pad to multiple of 4
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Verifies a Firebase ID token.
 * Returns the decoded payload (uid = payload.sub) or null on failure.
 */
async function verifyFirebaseToken(
  token: string,
  projectId: string,
): Promise<{ sub: string; email?: string } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;

    // Decode header to get kid
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64))) as {
      kid: string;
      alg: string;
    };

    if (header.alg !== 'RS256') return null;

    // Decode payload
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as {
      sub: string;
      aud: string;
      iss: string;
      iat: number;
      exp: number;
      email?: string;
    };

    // Validate claims
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;          // expired
    if (payload.iat > now + 300) return null;    // issued in the future (clock skew)
    if (payload.aud !== projectId) return null;  // wrong project
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (!payload.sub) return null;

    // Verify signature
    const keys = await getFirebasePublicKeys();
    const key = keys[header.kid];
    if (!key) return null;

    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlDecode(sigB64);

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      signature as BufferSource,
      signingInput as BufferSource,
    );

    if (!valid) return null;
    return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

// ── TMDB proxy ────────────────────────────────────────────────────────────────

const TMDB_BASE = 'https://api.themoviedb.org/3';
const MAX_RETRIES = 3;

async function handleTmdb(request: Request, env: Env): Promise<Response> {
  let body: { path?: string; params?: Record<string, string> };
  try {
    body = await request.json() as typeof body;
  } catch {
    return err('Invalid JSON body', 400);
  }

  const { path, params = {} } = body;

  if (!path || typeof path !== 'string' || !path.startsWith('/')) {
    return err('Missing or invalid path', 400);
  }

  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', env.TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string') url.searchParams.set(k, v);
  }

  let lastError = '';
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const upstream = await fetch(url.toString());

    if (upstream.status === 429) {
      const retryAfter = Number(upstream.headers.get('retry-after')) || 1.5;
      const wait = Math.max(retryAfter * 1000, 1000 * (attempt + 1));
      await sleep(wait);
      lastError = `TMDB 429 on ${path}`;
      continue;
    }

    if (!upstream.ok) {
      return err(`TMDB error ${upstream.status}`, upstream.status);
    }

    const data = await upstream.json();
    return json(data);
  }

  return err(`TMDB upstream failed after retries: ${lastError}`, 502);
}

// ── Gemini proxy ──────────────────────────────────────────────────────────────

const GEMINI_MODELS = ['gemma-4-31b-it', 'gemma-4-26b-a4b-it'] as const;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function callGeminiModel(
  apiKey: string,
  model: string,
  geminiBody: Record<string, unknown>,
): Promise<{ text: string } | 'rate_limited' | 'empty'> {
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(geminiBody),
  });

  if (upstream.status === 429) return 'rate_limited';

  if (!upstream.ok) {
    const errText = await upstream.text();
    throw new Error(`Gemini ${upstream.status}: ${errText.slice(0, 200)}`);
  }

  const data = await upstream.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  return text ? { text } : 'empty';
}

async function handleGemini(request: Request, env: Env): Promise<Response> {
  let body: {
    contents?: string;
    systemInstruction?: string;
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
    isPro?: boolean;
  };

  try {
    body = await request.json() as typeof body;
  } catch {
    return err('Invalid JSON body', 400);
  }

  const {
    contents,
    systemInstruction,
    temperature = 0.1,
    maxOutputTokens = 2048,
    responseMimeType,
    isPro = false,
  } = body;

  if (!contents || typeof contents !== 'string') {
    return err('Missing contents', 400);
  }

  // Build Gemini REST body
  const geminiBody: Record<string, unknown> = {
    contents: [{ parts: [{ text: contents }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
      ...(responseMimeType ? { responseMimeType } : {}),
    },
  };
  if (systemInstruction) {
    geminiBody.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  // Key pool: Pro key first if requested and configured, then free key
  const proKey = (env.GEMINI_PRO_API_KEY ?? '').trim();
  const freeKey = env.GEMINI_API_KEY.trim();
  const keyPool: string[] = [];
  if (isPro && proKey) keyPool.push(proKey);
  if (freeKey) keyPool.push(freeKey);

  if (keyPool.length === 0) {
    return err('No Gemini keys configured on server', 503);
  }

  // Try each key × each model
  for (const apiKey of keyPool) {
    for (const model of GEMINI_MODELS) {
      try {
        const result = await callGeminiModel(apiKey, model, geminiBody);
        if (result === 'rate_limited') continue; // try next model/key
        if (result === 'empty') continue;        // try next model
        return json({ text: result.text });
      } catch (e) {
        console.error(`[Gemini] Error with model ${model}:`, e);
        // Non-quota error — try next model
      }
    }
  }

  return err('All Gemini keys rate-limited — retry later', 429);
}

// ── OpenSubtitles proxy ───────────────────────────────────────────────────────
//
// Uses the OpenSubtitles.com REST API v1 (api.opensubtitles.com/api/v1).
// Free tier: 20 searches/day and 20 downloads/day with a free account.
// Register at https://www.opensubtitles.com/en/consumers to get an API key,
// then add it as a Worker secret: wrangler secret put OPENSUBTITLES_API_KEY
//
// Without a key the routes still work — OpenSubtitles allows unauthenticated
// requests (5 downloads/day limit), so the app degrades gracefully.

const OS_BASE = 'https://api.opensubtitles.com/api/v1';
const OS_APP  = 'FilmSort v1.0'; // User-Agent required by OpenSubtitles

function osHeaders(apiKey?: string): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': OS_APP,
    'Api-Version': '1',
  };
  if (apiKey) h['Api-Key'] = apiKey;
  return h;
}

/**
 * POST /subtitles/search
 * Body: { query: string, tmdbId?: string, season?: number, episode?: number, language?: string }
 * Returns: { results: SubtitleHit[] }
 */
async function handleSubtitleSearch(request: Request, env: Env): Promise<Response> {
  let body: {
    query?: string;
    tmdbId?: string;
    season?: number;
    episode?: number;
    language?: string;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return err('Invalid JSON body', 400);
  }

  const { query, tmdbId, season, episode, language = 'en' } = body;

  if (!query && !tmdbId) {
    return err('Provide at least query or tmdbId', 400);
  }

  const url = new URL(`${OS_BASE}/subtitles`);
  if (query)   url.searchParams.set('query', query);
  if (tmdbId)  url.searchParams.set('tmdb_id', tmdbId);
  if (season != null)  url.searchParams.set('season_number', String(season));
  if (episode != null) url.searchParams.set('episode_number', String(episode));
  url.searchParams.set('languages', language);
  url.searchParams.set('type', season != null ? 'episode' : 'movie');

  const upstream = await fetch(url.toString(), {
    headers: osHeaders(env.OPENSUBTITLES_API_KEY),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return err(`OpenSubtitles search failed: ${upstream.status} ${text.slice(0, 120)}`, upstream.status);
  }

  const data = await upstream.json() as {
    data?: {
      id: string;
      attributes: {
        language: string;
        release: string;
        upload_date: string;
        downloads_count: number;
        ratings: number;
        files: { file_id: number; file_name: string }[];
      };
    }[];
  };

  // Normalise to a flat list the app can consume directly
  const results = (data.data ?? []).flatMap((item) =>
    (item.attributes.files ?? []).map((f) => ({
      fileId: f.file_id,
      fileName: f.file_name ?? item.attributes.release ?? 'subtitle.srt',
      language: item.attributes.language,
      release: item.attributes.release ?? '',
      uploadDate: item.attributes.upload_date ?? '',
      downloads: item.attributes.downloads_count ?? 0,
      rating: item.attributes.ratings ?? 0,
    })),
  ).slice(0, 30); // cap at 30 results

  return json({ results });
}

/**
 * POST /subtitles/download
 * Body: { fileId: number | string }
 * Returns the raw SRT text (Content-Type: text/plain) so the client can
 * hand it directly to parseSRT() without a second round-trip.
 *
 * OpenSubtitles requires a "download" POST to get a one-time link, then a
 * second GET to fetch the actual file.  We do both here and stream the SRT
 * back so the client never has to deal with time-limited URLs.
 */
async function handleSubtitleDownload(request: Request, env: Env): Promise<Response> {
  let body: { fileId?: number | string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return err('Invalid JSON body', 400);
  }

  const { fileId } = body;
  if (!fileId) return err('Missing fileId', 400);

  // Step 1 — request a download link from OpenSubtitles
  const linkRes = await fetch(`${OS_BASE}/download`, {
    method: 'POST',
    headers: osHeaders(env.OPENSUBTITLES_API_KEY),
    body: JSON.stringify({ file_id: Number(fileId), sub_format: 'srt' }),
  });

  if (!linkRes.ok) {
    const text = await linkRes.text();
    return err(`OpenSubtitles download request failed: ${linkRes.status} ${text.slice(0, 120)}`, linkRes.status);
  }

  const linkData = await linkRes.json() as { link?: string; message?: string };
  const downloadUrl = linkData.link;
  if (!downloadUrl) {
    return err(linkData.message ?? 'No download link returned by OpenSubtitles', 502);
  }

  // Step 2 — fetch the actual SRT file
  const srtRes = await fetch(downloadUrl);
  if (!srtRes.ok) {
    return err(`SRT file fetch failed: ${srtRes.status}`, srtRes.status);
  }

  const srtText = await srtRes.text();

  // Return raw SRT so the client can pipe it directly into parseSRT()
  return new Response(srtText, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS pre-flight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return err('Method not allowed', 405);
    }

    // ── Auth: verify Firebase ID token ───────────────────────────────────────
    const authHeader = request.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return err('Missing Authorization header', 401);
    }
    const token = authHeader.slice(7);
    const decoded = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
    if (!decoded) {
      return err('Invalid or expired Firebase token', 401);
    }

    // ── Route ────────────────────────────────────────────────────────────────
    const { pathname } = new URL(request.url);

    if (pathname === '/tmdb')                return handleTmdb(request, env);
    if (pathname === '/gemini')              return handleGemini(request, env);
    if (pathname === '/subtitles/search')    return handleSubtitleSearch(request, env);
    if (pathname === '/subtitles/download')  return handleSubtitleDownload(request, env);

    return err('Not found', 404);
  },
};

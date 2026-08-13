/**
 * proxyClient.ts
 *
 * Shared fetch wrapper for the Cloudflare Worker proxy.
 *
 * What it does:
 *  1. Gets the current user's Firebase ID token (cached ~55 min)
 *  2. POSTs to the worker endpoint with Authorization: Bearer <token>
 *  3. On 401, force-refreshes the token and retries once
 *  4. Throws ProxyError on non-OK responses so callers can handle gracefully
 *
 * Usage:
 *   import { proxyFetch } from './proxyClient';
 *
 *   // TMDB
 *   const data = await proxyFetch<TmdbResult>('tmdb', {
 *     path: '/trending/movie/week',
 *     params: { language: 'en-US' },
 *   });
 *
 *   // Gemini
 *   const { text } = await proxyFetch<{ text: string }>('gemini', {
 *     contents: 'Parse these filenames…',
 *     systemInstruction: '…',
 *     isPro: false,
 *   });
 */

import auth from '@react-native-firebase/auth';
import { PROXY_BASE_URL } from '../config/env';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProxyEndpoint = 'tmdb' | 'gemini' | 'subtitles/search' | 'subtitles/download';

export class ProxyError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ProxyError';
  }
}

// ── Token cache ───────────────────────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiresAt = 0; // ms epoch

/**
 * Returns a valid Firebase ID token for the current user.
 * Caches the token and only hits Firebase when within 60s of expiry.
 * Throws ProxyError(401) when no user is signed in.
 */
async function getIdToken(forceRefresh = false): Promise<string> {
  const user = auth().currentUser;
  if (!user) {
    throw new ProxyError(401, 'Not signed in — proxy requires authentication');
  }

  const now = Date.now();
  // Use cached token if still valid for at least 60 more seconds
  if (!forceRefresh && cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  cachedToken = await user.getIdToken(forceRefresh);
  tokenExpiresAt = now + 60 * 60 * 1000; // Firebase tokens are valid 1 hour
  return cachedToken;
}

// ── Core fetch ────────────────────────────────────────────────────────────────

async function doFetch<T>(
  endpoint: ProxyEndpoint,
  body: Record<string, unknown>,
  token: string,
): Promise<T> {
  if (!PROXY_BASE_URL) {
    throw new ProxyError(
      503,
      'PROXY_BASE_URL is not set. Deploy the Cloudflare Worker and set EXPO_PUBLIC_PROXY_BASE_URL in .env',
    );
  }

  const url = `${PROXY_BASE_URL}/${endpoint}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new ProxyError(res.status, text);
  }

  return res.json() as Promise<T>;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a request to the Cloudflare Worker proxy endpoint.
 * Automatically attaches the user's Firebase ID token.
 * Retries once with a refreshed token on 401.
 */
export async function proxyFetch<T>(
  endpoint: ProxyEndpoint,
  body: Record<string, unknown>,
): Promise<T> {
  let token = await getIdToken();

  try {
    return await doFetch<T>(endpoint, body, token);
  } catch (err) {
    // Token may have just expired — force refresh and retry once
    if (err instanceof ProxyError && err.status === 401) {
      token = await getIdToken(true);
      return doFetch<T>(endpoint, body, token);
    }
    throw err;
  }
}

/**
 * publicProxyFetch: Unauthenticated proxy fetch for public TMDB data.
 *
 * This posts to the Cloudflare Worker at /tmdb/public and does NOT attach
 * an Authorization header. The Worker must expose a corresponding public
 * route that forwards requests to TMDB without requiring an ID token.
 *
 * Use this only for non-user-specific read-only TMDB endpoints (e.g.
 * /trending, /discover). The server-side worker must enforce rate limits.
 */
export async function proxyFetchPublic<T>(
  endpoint: ProxyEndpoint,
  body: Record<string, unknown>,
): Promise<T> {
  if (!PROXY_BASE_URL) {
    throw new ProxyError(
      503,
      'PROXY_BASE_URL is not set. Deploy the Cloudflare Worker and set EXPO_PUBLIC_PROXY_BASE_URL in .env',
    );
  }

  // Endpoint will be "tmdb" for public TMDB calls. Worker should expose
  // a matching /tmdb/public route.
  const url = `${PROXY_BASE_URL}/${endpoint}/public`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new ProxyError(res.status, text);
  }

  return res.json() as Promise<T>;
}

/**
 * Returns true when a user is currently signed in and the proxy can be used.
 * Use this before making proxy requests if you want a graceful no-op fallback.
 */
export function isProxyAvailable(): boolean {
  return auth().currentUser !== null;
}

/**
 * Like proxyFetch but returns the raw response text instead of parsing JSON.
 * Used for /subtitles/download which streams back plain-text SRT content.
 */
export async function proxyFetchText(
  endpoint: ProxyEndpoint,
  body: Record<string, unknown>,
): Promise<string> {
  if (!PROXY_BASE_URL) {
    throw new ProxyError(
      503,
      'PROXY_BASE_URL is not set. Deploy the Cloudflare Worker and set EXPO_PUBLIC_PROXY_BASE_URL in .env',
    );
  }

  let token = await getIdToken();

  const doText = async (tok: string): Promise<string> => {
    const url = `${PROXY_BASE_URL}/${endpoint}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tok}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => `HTTP ${res.status}`);
      throw new ProxyError(res.status, text);
    }

    return res.text();
  };

  try {
    return await doText(token);
  } catch (e) {
    if (e instanceof ProxyError && e.status === 401) {
      token = await getIdToken(true);
      return doText(token);
    }
    throw e;
  }
}

/**
 * FilmSort — Firebase Cloud Functions API Proxy
 *
 * Keeps TMDB_API_KEY and GEMINI_API_KEY server-side.
 * The app never needs the real keys in its bundle.
 *
 * Deploy:
 *   firebase functions:secrets:set TMDB_API_KEY
 *   firebase functions:secrets:set GEMINI_API_KEY
 *   firebase functions:secrets:set GEMINI_PRO_API_KEY   (optional)
 *   firebase deploy --only functions
 *
 * Endpoints:
 *   POST /tmdb    { path: string, params?: Record<string,string> }
 *   POST /gemini  { contents: string, systemInstruction?: string,
 *                   temperature?: number, maxOutputTokens?: number,
 *                   responseMimeType?: string, isPro?: boolean }
 *
 * Auth:
 *   Both endpoints require a valid Firebase ID token in the
 *   Authorization: Bearer <token> header.
 *   This ensures only your own signed-in users can call through.
 */

import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { Request, Response } from "express";

// ── Secrets (stored in Google Secret Manager — never in code) ─────────────────
const TMDB_KEY    = defineSecret("TMDB_API_KEY");
const GEMINI_KEY  = defineSecret("GEMINI_API_KEY");
const GEMINI_PRO  = defineSecret("GEMINI_PRO_API_KEY");

// ── Firebase Admin init ───────────────────────────────────────────────────────
admin.initializeApp();

// ── Helpers ───────────────────────────────────────────────────────────────────

const TMDB_BASE = "https://api.themoviedb.org/3";

function cors(res: Response): void {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

/**
 * Verify the Firebase ID token in the Authorization header.
 * Returns the decoded token on success, null on failure.
 */
async function verifyAuth(req: Request): Promise<admin.auth.DecodedIdToken | null> {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  try {
    return await admin.auth().verifyIdToken(token);
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── TMDB Proxy ────────────────────────────────────────────────────────────────

export const tmdb = onRequest(
  { secrets: [TMDB_KEY], region: "us-central1", cors: false },
  async (req, res) => {
    cors(res);

    // Handle CORS pre-flight
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Auth check — only signed-in FilmSort users
    const decoded = await verifyAuth(req);
    if (!decoded) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { path, params = {} } = req.body as {
      path?: string;
      params?: Record<string, string>;
    };

    if (!path || typeof path !== "string") {
      res.status(400).json({ error: "Missing path" });
      return;
    }

    // Whitelist: only allow paths that start with / (no protocol smuggling)
    if (!path.startsWith("/")) {
      res.status(400).json({ error: "Invalid path" });
      return;
    }

    const url = new URL(`${TMDB_BASE}${path}`);
    url.searchParams.set("api_key", TMDB_KEY.value());
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === "string") url.searchParams.set(k, v);
    }

    // Pass through to TMDB with retry on 429
    const MAX_RETRIES = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const upstream = await fetch(url.toString());

        if (upstream.status === 429) {
          const retryAfter = Number(upstream.headers.get("retry-after")) || 1.5;
          const wait = Math.max(retryAfter * 1000, 1000 * (attempt + 1));
          console.warn(`[TMDB Proxy] 429 on ${path}, retrying in ${wait}ms`);
          await sleep(wait);
          lastError = new Error(`TMDB 429: ${path}`);
          continue;
        }

        if (!upstream.ok) {
          res.status(upstream.status).json({ error: `TMDB error ${upstream.status}` });
          return;
        }

        const data = await upstream.json();
        res.status(200).json(data);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES - 1) await sleep(400 * (attempt + 1));
      }
    }

    console.error("[TMDB Proxy] All retries failed:", lastError);
    res.status(502).json({ error: "TMDB upstream failed" });
  }
);

// ── Gemini Proxy ──────────────────────────────────────────────────────────────

/**
 * The Gemini proxy accepts a single generate-content request and returns
 * the text response. Key rotation is handled server-side.
 *
 * Body shape (matches what the app currently sends):
 * {
 *   contents:          string
 *   systemInstruction?: string
 *   temperature?:      number   (default 0.1)
 *   maxOutputTokens?:  number   (default 2048)
 *   responseMimeType?: string
 *   isPro?:            boolean  (use Pro key when true)
 * }
 */

const GEMINI_MODELS = [
  "gemma-4-31b-it",      // primary — 1500 req/day free
  "gemma-4-26b-a4b-it",  // fallback
] as const;

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

async function callGemini(
  apiKey: string,
  model: string,
  body: Record<string, unknown>
): Promise<{ text: string } | null> {
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
  const upstream = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (upstream.status === 429) {
    console.warn(`[Gemini Proxy] 429 on model ${model}`);
    return null; // caller rotates
  }

  if (!upstream.ok) {
    const errText = await upstream.text();
    throw new Error(`Gemini ${upstream.status}: ${errText.slice(0, 200)}`);
  }

  const data = await upstream.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  return text ? { text } : null;
}

export const gemini = onRequest(
  {
    secrets: [GEMINI_KEY, GEMINI_PRO],
    region: "us-central1",
    cors: false,
    // Gemini calls can take a few seconds — give it breathing room
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (req, res) => {
    cors(res);

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Auth check
    const decoded = await verifyAuth(req);
    if (!decoded) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const {
      contents,
      systemInstruction,
      temperature = 0.1,
      maxOutputTokens = 2048,
      responseMimeType,
      isPro = false,
    } = req.body as {
      contents?: string;
      systemInstruction?: string;
      temperature?: number;
      maxOutputTokens?: number;
      responseMimeType?: string;
      isPro?: boolean;
    };

    if (!contents || typeof contents !== "string") {
      res.status(400).json({ error: "Missing contents" });
      return;
    }

    // Build the request body for Gemini REST API
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

    // Pick key: Pro users get GEMINI_PRO first if set, else free key
    const proKeyValue  = GEMINI_PRO.value().trim();
    const freeKeyValue = GEMINI_KEY.value().trim();

    // Build ordered key list: pro key first (if isPro and set), then free key
    const keyPool: string[] = [];
    if (isPro && proKeyValue) keyPool.push(proKeyValue);
    if (freeKeyValue) keyPool.push(freeKeyValue);
    // Fallback: if pro requested but no pro key configured, free key is already added
    if (keyPool.length === 0) {
      res.status(503).json({ error: "No Gemini keys configured on server" });
      return;
    }

    // Try each key × each model
    for (const apiKey of keyPool) {
      for (const model of GEMINI_MODELS) {
        try {
          const result = await callGemini(apiKey, model, geminiBody);
          if (result) {
            res.status(200).json({ text: result.text });
            return;
          }
          // null = 429 — try next model / key
        } catch (err) {
          console.error(`[Gemini Proxy] Error with model ${model}:`, err);
          // Non-quota error — try next model
        }
      }
    }

    // All keys + models exhausted
    res.status(429).json({ error: "All Gemini keys exhausted — retry later" });
  }
);

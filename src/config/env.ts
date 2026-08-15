/**
 * Runtime config for FilmSort.
 *
 * API keys (TMDB, Gemini) are NO LONGER shipped in the app bundle.
 * All key-bearing calls go through the Cloudflare Worker proxy.
 *
 * The only value the app needs at runtime is PROXY_BASE_URL —
 * a plain HTTPS endpoint that requires a valid Firebase ID token.
 * Even if someone reads this value, they can't use it without an account.
 *
 * To update the proxy URL after deploying the worker:
 *   1. Copy the worker URL from `wrangler deploy` output
 *      e.g. https://filmsort-proxy.<your-subdomain>.workers.dev
 *   2. Set EXPO_PUBLIC_PROXY_BASE_URL in .env
 *   3. Rebuild the app (expo start --clear  or  eas build)
 */

import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

// ── Proxy URL ──────────────────────────────────────────────────────────────────
// Set EXPO_PUBLIC_PROXY_BASE_URL in .env after deploying the Cloudflare Worker.
// Never ends with a trailing slash.
export const PROXY_BASE_URL: string = (
  process.env.EXPO_PUBLIC_PROXY_BASE_URL ??
  extra.proxyBaseUrl ??
  '' // empty until you deploy — set in .env
).replace(/\/$/, '');

// Debug: surface whether proxy URL was bundled into the app at runtime (redacted)
try {
  // eslint-disable-next-line no-console
  console.log('[env][debug] PROXY_BASE_URL present?', PROXY_BASE_URL ? '[REDACTED SET]' : '[NOT SET]');
} catch (e) {
  /* ignore */
}

// ── Google Sign-In / Firebase ──────────────────────────────────────────────────
/** Web Client ID from Firebase Console → Authentication → Sign-in method → Google */
export const GOOGLE_WEB_CLIENT_ID: string =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? extra.googleWebClientId ?? '';

/** Firebase project ID */
export const FIREBASE_PROJECT_ID: string =
  process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? extra.firebaseProjectId ?? 'filmoor-49db3';

/**
 * Master switch for the cloud sync feature.
 * Set EXPO_PUBLIC_ENABLE_CLOUD_SYNC=false to disable — app behaves as v1.1.
 */
export const ENABLE_CLOUD_SYNC: boolean =
  process.env.EXPO_PUBLIC_ENABLE_CLOUD_SYNC !== 'false';

// ── Legacy exports — kept so existing imports compile during migration ─────────
// These are always empty strings now. The proxy holds the real keys server-side.
/** @deprecated Keys are server-side. Use proxyFetch from src/services/proxyClient.ts */
export const TMDB_API_KEY = '';
/** @deprecated Keys are server-side. Use proxyFetch from src/services/proxyClient.ts */
export const GEMINI_API_KEYS: string[] = [];
/** @deprecated Keys are server-side. Use proxyFetch from src/services/proxyClient.ts */
export const GEMINI_PRO_API_KEY = '';
/** Gemini model list — kept for reference only, server picks the model */
export const GEMINI_MODELS = [
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
] as const;

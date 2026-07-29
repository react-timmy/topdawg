/**
 * Runtime config / API keys for FilmSort.
 *
 * Keys are stored in app.json → extra (which reads from .env at build time).
 * They are never hardcoded in service files. Import from here — don't reach
 * into Constants directly from services.
 *
 * To update a key:
 *   1. Change the value in .env
 *   2. Change the matching value in app.json → extra
 *   3. Rebuild the app (EAS build or expo start)
 */

import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

/** TMDB v3 read API key — https://www.themoviedb.org/settings/api */
export const TMDB_API_KEY: string = extra.tmdbApiKey ?? '';

/** Gemini API key — https://aistudio.google.com/app/apikey */
export const GEMINI_API_KEY: string = extra.geminiApiKey ?? '';

/**
 * Gemini model fallback chain.
 * The service tries each model in order, moving to the next on a 429.
 *
 * Free tier (Gemini API, July 2026):
 *   gemma-4-31b-it      — 1,500 requests/day  (primary)
 *   gemma-4-26b-a4b-it  — also free tier       (fallback)
 */
export const GEMINI_MODELS = [
  'gemma-4-31b-it',      // primary — Gemma 4 31B, 1500 req/day free
  'gemma-4-26b-a4b-it',  // fallback — Gemma 4 26B MoE variant
] as const;

/** Google Sign-In web client ID (from Firebase Console → OAuth 2.0 credentials) */
export const GOOGLE_WEB_CLIENT_ID: string = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

/** Firebase project ID */
export const FIREBASE_PROJECT_ID: string = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '';

/**
 * Master switch for the cloud sync feature.
 * Set EXPO_PUBLIC_ENABLE_CLOUD_SYNC=false to disable entirely — app behaves as v1.1.
 */
export const ENABLE_CLOUD_SYNC: boolean = process.env.EXPO_PUBLIC_ENABLE_CLOUD_SYNC !== 'false';

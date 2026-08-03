/**
 * subtitleSearchService.ts
 *
 * Client-side helpers that talk to the Cloudflare Worker's
 * /subtitles/search and /subtitles/download routes, which in turn proxy the
 * OpenSubtitles REST API (api.opensubtitles.com/api/v1).
 *
 * Free tier: 20 searches/day · 20 downloads/day (with a free OS account).
 * The API key lives only in the Worker as a secret — never on the device.
 *
 * How to enable auto-fetch:
 *   1. Register free at https://www.opensubtitles.com/en/consumers
 *   2. Copy your API key and run:
 *        cd worker && npx wrangler secret put OPENSUBTITLES_API_KEY
 *   3. Redeploy the Worker:  npx wrangler deploy
 *
 * Without the key the Worker still forwards requests anonymously (5/day limit).
 */

import { proxyFetch, proxyFetchText } from './proxyClient';
import { parseSRT, SubtitleCue } from '../utils/srtParser';

// ─── Public types ─────────────────────────────────────────────────────────────

/** One subtitle file returned by a search. */
export interface SubtitleHit {
  fileId: number;
  fileName: string;
  language: string;
  release: string;
  uploadDate: string;
  downloads: number;
  rating: number;
}

export interface SubtitleSearchParams {
  /** Movie / show title — used when TMDB id is not available */
  query: string;
  /** TMDB id string (e.g. "550") — improves match accuracy */
  tmdbId?: string;
  /** Season number for TV episodes */
  season?: number;
  /** Episode number for TV episodes */
  episode?: number;
  /** BCP-47 language code, e.g. "en", "fr", "es". Defaults to "en". */
  language?: string;
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Search OpenSubtitles for subtitles matching the given params.
 * Returns up to 30 hits, sorted by download count (most popular first).
 * Throws on network / proxy error — callers should catch and show a toast.
 */
export async function searchSubtitles(
  params: SubtitleSearchParams,
): Promise<SubtitleHit[]> {
  const res = await proxyFetch<{ results: SubtitleHit[] }>('subtitles/search', {
    query:    params.query,
    tmdbId:   params.tmdbId,
    season:   params.season,
    episode:  params.episode,
    language: params.language ?? 'en',
  });

  // Sort by downloads desc so the best match floats to the top
  return (res.results ?? []).sort((a, b) => b.downloads - a.downloads);
}

// ─── Download + parse ─────────────────────────────────────────────────────────

/**
 * Downloads an SRT file by file ID and parses it into SubtitleCue[].
 *
 * The Worker handles the two-step OpenSubtitles flow (get download link →
 * fetch file) and streams back raw SRT text so we never touch time-limited
 * URLs from the client.
 *
 * Throws on network / parse error.
 */
export async function downloadSubtitleCues(fileId: number): Promise<SubtitleCue[]> {
  const srtText = await proxyFetchText('subtitles/download', { fileId });

  if (!srtText?.trim()) {
    throw new Error('Empty SRT file returned from server');
  }

  const cues = parseSRT(srtText);

  if (cues.length === 0) {
    throw new Error('SRT downloaded but no cues were parsed — the file may be empty or malformed');
  }

  return cues;
}

// ─── Language display helpers ─────────────────────────────────────────────────

/** Common language codes displayed in the search UI. */
export const SUBTITLE_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'zh-cn', label: 'Chinese (Simplified)' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'tr', label: 'Turkish' },
  { code: 'sv', label: 'Swedish' },
  { code: 'da', label: 'Danish' },
  { code: 'fi', label: 'Finnish' },
  { code: 'nb', label: 'Norwegian' },
  { code: 'ro', label: 'Romanian' },
  { code: 'hu', label: 'Hungarian' },
];

export function languageLabel(code: string): string {
  return SUBTITLE_LANGUAGES.find((l) => l.code === code)?.label ?? code.toUpperCase();
}

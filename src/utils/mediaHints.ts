/**
 * Filename heuristics for anime vs live-action matching.
 *
 * Critical for franchises that exist as BOTH anime and live-action
 * (e.g. One Piece: Netflix live-action vs Toei anime).
 */

import { ANIME_SOURCES, alt } from './releaseSources';

/** Western streaming / live-action distribution tags (not anime-only platforms). */
const LIVE_ACTION_SOURCE_RE =
  /\b(netflix|hulu|disney\+|disneyplus|disney\s*plus|hbo(?:\s*max)?|peacock|paramount\+|paramountplus|apple\s*tv\+?|amc\+|showtime|starz|prime\s*video|amazon(?:\s*originals?)?|bbc|itv)\b|\[(?:nf|netflix|hulu|dsnp|atvp|amzn|hbo|max|pcok|pmtp)\]/i;

/** Explicit anime release groups / anime-only platforms / "anime" token. */
const ANIME_SIGNAL_RE = new RegExp(
  `\\b(?:${alt(ANIME_SOURCES)}|funimation|hidive|crunchyroll)\\b|\\banime\\b|\\[anime\\]|\\(anime\\)`,
  'i',
);

export function hasLiveActionSource(filename: string): boolean {
  return LIVE_ACTION_SOURCE_RE.test(filename);
}

export function hasAnimeSignals(filename: string): boolean {
  return ANIME_SIGNAL_RE.test(filename);
}

/**
 * Decide whether a file should be matched as anime.
 *
 * Rules (highest priority first):
 * 1. Live-action source tag (e.g. [netflix]) without anime signals → NOT anime
 * 2. Explicit anime signals → anime
 * 3. Otherwise trust the AI flag (default false)
 *
 * Never treat a bare franchise name as anime solely because the franchise is famous as anime.
 */
export function resolveIsAnime(filename: string, aiIsAnime?: boolean): boolean {
  const live = hasLiveActionSource(filename);
  const anime = hasAnimeSignals(filename);

  if (live && !anime) return false;
  if (anime) return true;
  if (live) return false;
  return aiIsAnime === true;
}

export function isAnimationMedia(item: {
  id?: string;
  genre_ids?: number[];
  genres?: string[];
}): boolean {
  if (item.id?.startsWith('anime:')) return true;
  if (item.genre_ids?.includes(16)) return true;
  if (item.genres?.some((g) => /animation/i.test(g))) return true;
  return false;
}

/**
 * Rank TMDB (or mixed) search hits for the preferred media form.
 * preferAnime=true  → animation first
 * preferAnime=false → live-action / non-animation first
 */
export function rankSearchResults<T extends { id?: string; genre_ids?: number[]; genres?: string[] }>(
  results: T[],
  preferAnime: boolean,
): T[] {
  return [...results].sort((a, b) => {
    const aAnim = isAnimationMedia(a);
    const bAnim = isAnimationMedia(b);
    if (preferAnime) {
      if (aAnim && !bAnim) return -1;
      if (!aAnim && bAnim) return 1;
    } else {
      if (!aAnim && bAnim) return -1;
      if (aAnim && !bAnim) return 1;
    }
    return 0;
  });
}

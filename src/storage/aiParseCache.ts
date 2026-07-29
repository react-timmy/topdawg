/**
 * AI Parse Cache
 *
 * Persists filename → ParsedFilename results in AsyncStorage so that
 * filenames are never sent to the AI API more than once per device.
 *
 * Storage key: @cinescan:parse_cache:v1
 * Format:      A single JSON blob — Record<normalizedFilename, ParsedFilename>
 *
 * Normalization: filenames are lowercased and stripped of their extension
 * before being used as cache keys, so minor casing differences and
 * re-downloads of the same title don't miss the cache.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ParsedFilename } from '../services/geminiAIService';

const CACHE_KEY = '@cinescan:parse_cache:v1';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Normalize a filename to a stable cache key.
 * Strips path segments, lowercases, and removes the video extension.
 * "Fight.Club.1999.1080p.mkv" and "fight.club.1999.1080p.MKV" → same key.
 */
function toCacheKey(filename: string): string {
  const basename = filename.trim().toLowerCase().replace(/\\/g, '/').split('/').pop() ?? filename;
  return basename.replace(/\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts|mpg|mpeg|rmvb|3gp)$/i, '');
}

/** Read the entire cache blob from storage. Returns {} on any error. */
async function readCache(): Promise<Record<string, ParsedFilename>> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ParsedFilename>;
  } catch {
    return {};
  }
}

/** Overwrite the entire cache blob in storage. Silently swallows write errors. */
async function writeCache(cache: Record<string, ParsedFilename>): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('[ParseCache] write failed:', err);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Look up a single filename in the cache.
 * Returns the cached ParsedFilename or null if not found.
 */
export async function getCachedParse(filename: string): Promise<ParsedFilename | null> {
  const cache = await readCache();
  return cache[toCacheKey(filename)] ?? null;
}

/**
 * Partition an array of filenames into cache hits and misses in a single
 * storage read. Use this before calling the AI API to avoid redundant calls.
 *
 * @returns
 *   hits   — map of filename → ParsedFilename for entries already cached
 *   misses — filenames that were not found in the cache (need AI)
 */
export async function bulkGetCached(filenames: string[]): Promise<{
  hits: Record<string, ParsedFilename>;
  misses: string[];
}> {
  if (filenames.length === 0) return { hits: {}, misses: [] };

  const cache = await readCache();
  const hits: Record<string, ParsedFilename> = {};
  const misses: string[] = [];

  for (const filename of filenames) {
    const cached = cache[toCacheKey(filename)];
    if (cached) {
      hits[filename] = cached;
    } else {
      misses.push(filename);
    }
  }

  return { hits, misses };
}

/**
 * Write a batch of new AI parse results into the cache.
 * Merges with existing entries — previously cached filenames are not overwritten.
 */
export async function bulkSetCached(
  results: Record<string, ParsedFilename>,
): Promise<void> {
  const entries = Object.entries(results);
  if (entries.length === 0) return;

  const cache = await readCache();
  for (const [filename, parsed] of entries) {
    cache[toCacheKey(filename)] = parsed;
  }
  await writeCache(cache);
  console.log(`[ParseCache] Stored ${entries.length} new entry(ies). Cache size: ${Object.keys(cache).length}`);
}

/**
 * Remove all cached parse results. Useful for a "reset" option in settings
 * or during development when the prompt changes significantly.
 */
export async function clearParseCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
    console.log('[ParseCache] Cache cleared.');
  } catch (err) {
    console.warn('[ParseCache] clear failed:', err);
  }
}

/**
 * Return the number of filenames currently stored in the cache.
 * Useful for a debug/settings screen.
 */
export async function getParseCacheSize(): Promise<number> {
  const cache = await readCache();
  return Object.keys(cache).length;
}

export const aiParseCache = {
  getCachedParse,
  bulkGetCached,
  bulkSetCached,
  clearParseCache,
  getParseCacheSize,
};

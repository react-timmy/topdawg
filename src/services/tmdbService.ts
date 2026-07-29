import AsyncStorage from '@react-native-async-storage/async-storage';
import { MediaItem, EpisodeInfo, UpcomingItem, WatchProvider, SupportedPlatform } from '../types';
import { TMDB_API_KEY } from '../config/env';

// ─── Config ───────────────────────────────────────────────────────────────────
// API key is read from src/config/env.ts → app.json extra.
// To rotate: update .env and app.json, then rebuild.
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

const CACHE_PREFIX = '@cinescan:cache:tmdb:';

/** Minimum gap between TMDB HTTP calls (~36 req / 10s, under the free-tier cap). */
const MIN_REQUEST_GAP_MS = 280;
const MAX_RETRIES = 3;

// ─── ID helpers ───────────────────────────────────────────────────────────────

/** Build a stable library id that cannot collide across movie/tv/anime namespaces. */
export function mediaId(type: 'movie' | 'tv' | 'anime', rawId: string | number): string {
  return `${type}:${rawId}`;
}

/** Strip type prefix for TMDB path segments. Accepts legacy bare numeric ids. */
export function rawMediaId(id: string): string {
  const idx = id.indexOf(':');
  if (idx === -1) return id;
  return id.slice(idx + 1);
}

// ─── Cache ────────────────────────────────────────────────────────────────────

async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function setCached(key: string, value: any): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    // Ignore
  }
}

// ─── Throttled fetch with retry ───────────────────────────────────────────────

let lastRequestAt = 0;
let requestChain: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Serialize TMDB calls so we never burst past the rate limit. */
function enqueueRequest<T>(fn: () => Promise<T>): Promise<T> {
  const run = requestChain.then(async () => {
    const wait = Math.max(0, MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt));
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return fn();
  });
  // Keep the chain alive even if one request fails
  requestChain = run.then(() => undefined, () => undefined);
  return run;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function posterUrl(path: string | null | undefined): string | undefined {
  return path ? `${IMG_BASE}/w500${path}` : undefined;
}

function backdropUrl(path: string | null | undefined): string | undefined {
  return path ? `${IMG_BASE}/w1280${path}` : undefined;
}

function logoUrl(path: string | null | undefined): string | undefined {
  return path ? `${IMG_BASE}/w300${path}` : undefined;
}

/** Returns true when err looks like an offline/network error (not a TMDB API error). */
function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('connection refused') ||
    msg.includes('timeout')
  );
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const cacheKey = `${path}?${new URLSearchParams(params).toString()}`;

  // Always check cache first — works offline
  const cached = await getCached<T>(cacheKey);
  if (cached) return cached;

  return enqueueRequest(async () => {
    // Re-check cache after waiting in queue (another call may have filled it)
    const cachedAfterWait = await getCached<T>(cacheKey);
    if (cachedAfterWait) return cachedAfterWait;

    const url = new URL(`${BASE_URL}${path}`);
    url.searchParams.set('api_key', TMDB_API_KEY);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url.toString());
        if (res.status === 429) {
          const retryAfter = Number(res.headers.get('retry-after')) || 1.5;
          const backoff = Math.max(retryAfter * 1000, 1000 * (attempt + 1));
          console.warn(`[TMDB] Rate limited on ${path}, retrying in ${backoff}ms (attempt ${attempt + 1})`);
          await sleep(backoff);
          lastRequestAt = Date.now();
          lastError = new Error(`TMDB 429: ${path}`);
          continue;
        }
        if (!res.ok) throw new Error(`TMDB ${res.status}: ${path}`);
        const data = (await res.json()) as T;
        await setCached(cacheKey, data);
        return data;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Fail immediately on network errors — no point retrying when offline
        if (isNetworkError(lastError)) throw lastError;
        // API errors — brief backoff then retry
        if (attempt < MAX_RETRIES - 1) {
          await sleep(400 * (attempt + 1));
          lastRequestAt = Date.now();
        }
      }
    }
    throw lastError ?? new Error(`TMDB failed: ${path}`);
  });
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMovie(raw: any): MediaItem {
  return {
    id: mediaId('movie', raw.id),
    title: raw.title ?? raw.original_title ?? 'Unknown',
    type: 'movie',
    description: raw.overview ?? '',
    posterUrl: posterUrl(raw.poster_path),
    backdropUrl: backdropUrl(raw.backdrop_path),
    rating: raw.vote_average ?? 0,
    releaseDate: raw.release_date,
    runtime: raw.runtime,
    genres: raw.genres?.map((g: { name: string }) => g.name) ?? [],
    genre_ids: raw.genre_ids,
    tagline: raw.tagline,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTV(raw: any): MediaItem {
  return {
    id: mediaId('tv', raw.id),
    title: raw.name ?? raw.original_name ?? 'Unknown',
    type: 'tv',
    description: raw.overview ?? '',
    posterUrl: posterUrl(raw.poster_path),
    backdropUrl: backdropUrl(raw.backdrop_path),
    rating: raw.vote_average ?? 0,
    releaseDate: raw.first_air_date,
    runtime: raw.episode_run_time?.[0],
    numberOfSeasons: raw.number_of_seasons,
    genres: raw.genres?.map((g: { name: string }) => g.name) ?? [],
    genre_ids: raw.genre_ids,
    tagline: raw.tagline,
  };
}

// ─── Watch providers (supported platforms only) ───────────────────────────────

/** TMDB provider_name → our platform id */
const PLATFORM_MATCHERS: { id: SupportedPlatform; patterns: RegExp[]; label: string }[] = [
  { id: 'netflix', patterns: [/^netflix$/i], label: 'Netflix' },
  { id: 'hulu', patterns: [/^hulu$/i], label: 'Hulu' },
  { id: 'prime', patterns: [/prime\s*video/i, /^amazon\s*prime/i, /^amazon\s*video/i], label: 'Prime Video' },
  { id: 'crunchyroll', patterns: [/^crunchyroll$/i], label: 'Crunchyroll' },
];

function platformSearchUrl(platform: SupportedPlatform, title: string): string {
  const q = encodeURIComponent(title);
  switch (platform) {
    case 'netflix':
    case 'netflix_anime':
      return `https://www.netflix.com/search?q=${q}`;
    case 'hulu':
      return `https://www.hulu.com/search?q=${q}`;
    case 'prime':
      return `https://www.amazon.com/s?k=${q}&i=instant-video`;
    case 'crunchyroll':
      return `https://www.crunchyroll.com/search?q=${q}`;
    default:
      return `https://www.google.com/search?q=${q}+watch`;
  }
}

function matchSupportedProvider(
  providerName: string,
  logoPath: string | null | undefined,
  title: string,
  isAnime: boolean,
): WatchProvider | null {
  for (const m of PLATFORM_MATCHERS) {
    if (!m.patterns.some((re) => re.test(providerName))) continue;

    // Crunchyroll only for anime titles
    if (m.id === 'crunchyroll' && !isAnime) continue;

    // Anime on Netflix surfaces as "Netflix Anime"
    if (m.id === 'netflix' && isAnime) {
      return {
        id: 'netflix_anime',
        name: 'Netflix Anime',
        logoUrl: logoPath ? `${IMG_BASE}/w92${logoPath}` : undefined,
        url: platformSearchUrl('netflix_anime', title),
      };
    }

    return {
      id: m.id,
      name: m.label,
      logoUrl: logoPath ? `${IMG_BASE}/w92${logoPath}` : undefined,
      url: platformSearchUrl(m.id, title),
    };
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const tmdbService = {
  mediaId,
  rawMediaId,

  /** Trending movies or TV shows */
  async getTrending(type: 'movie' | 'tv'): Promise<MediaItem[]> {
    try {
      const data = await get<{ results: unknown[] }>(`/trending/${type}/week`);
      return data.results.map(type === 'movie' ? mapMovie : mapTV);
    } catch {
      return [];
    }
  },

  /** Search movies or TV shows (optional year narrows results) */
  async search(
    query: string,
    type: 'movie' | 'tv' = 'movie',
    year?: number | null,
  ): Promise<MediaItem[]> {
    try {
      const params: Record<string, string> = { query };
      if (year) {
        if (type === 'movie') params.year = String(year);
        else params.first_air_date_year = String(year);
      }
      const data = await get<{ results: unknown[] }>(`/search/${type}`, params);
      return data.results.map(type === 'movie' ? mapMovie : mapTV);
    } catch (err) {
      console.warn(`[TMDB] search failed for "${query}" (${type}):`, err);
      return [];
    }
  },

  /** Full details for a single title */
  async getDetails(id: string, type: 'movie' | 'tv'): Promise<Partial<MediaItem>> {
    try {
      const rawId = rawMediaId(id);
      const raw = await get<Record<string, unknown>>(`/${type}/${rawId}`, {
        append_to_response: 'images',
      });

      // Pick the best English logo if available
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logos: any[] = (raw.images as any)?.logos ?? [];
      const logo = logos.find((l) => l.iso_639_1 === 'en') ?? logos[0];

      const base = type === 'movie' ? mapMovie(raw) : mapTV(raw);
      return { ...base, logoUrl: logoUrl(logo?.file_path) };
    } catch (err) {
      if (!isNetworkError(err)) console.warn(`[TMDB] getDetails failed for ${type}/${id}:`, err);
      return {};
    }
  },

  /** Episodes for a given season */
  async getSeasonDetails(showId: string, season: number): Promise<EpisodeInfo[]> {
    try {
      const rawId = rawMediaId(showId);
      const data = await get<{ episodes: unknown[] }>(`/tv/${rawId}/season/${season}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return data.episodes.map((ep: any): EpisodeInfo => ({
        id: String(ep.id),
        episodeNumber: ep.episode_number,
        seasonNumber: ep.season_number,
        name: ep.name ?? `Episode ${ep.episode_number}`,
        overview: ep.overview,
        stillUrl: ep.still_path ? `${IMG_BASE}/w300${ep.still_path}` : undefined,
        airDate: ep.air_date,
        runtime: ep.runtime,
      }));
    } catch {
      return [];
    }
  },

  /** Details for a single episode */
  async getEpisodeDetails(showId: string, season: number, episode: number): Promise<EpisodeInfo | null> {
    try {
      const rawId = rawMediaId(showId);
      const ep = await get<any>(`/tv/${rawId}/season/${season}/episode/${episode}`);
      return {
        id: String(ep.id),
        episodeNumber: ep.episode_number,
        seasonNumber: ep.season_number,
        name: ep.name ?? `Episode ${ep.episode_number}`,
        overview: ep.overview,
        stillUrl: ep.still_path ? `${IMG_BASE}/w300${ep.still_path}` : undefined,
        airDate: ep.air_date,
        runtime: ep.runtime,
      };
    } catch {
      return null;
    }
  },

  /** YouTube trailer URL (opens in browser / YouTube app) */
  async getTrailerUrl(id: string, type: 'movie' | 'tv'): Promise<string | null> {
    try {
      const rawId = rawMediaId(id);
      const data = await get<{ results: { site: string; type: string; key: string }[] }>(
        `/${type}/${rawId}/videos`,
      );
      const trailer = data.results.find(
        (v) => v.site === 'YouTube' && v.type === 'Trailer',
      );
      return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
    } catch {
      return null;
    }
  },

  /**
   * Streaming availability for supported platforms only:
   * Netflix (or Netflix Anime), Hulu, Prime Video, Crunchyroll (anime).
   * Returns empty when offline / none of those platforms carry the title.
   */
  async getWatchProviders(
    id: string,
    type: 'movie' | 'tv',
    title: string,
    options?: { isAnime?: boolean; region?: string },
  ): Promise<WatchProvider[]> {
    try {
      const rawId = rawMediaId(id);
      const data = await get<{
        results?: Record<
          string,
          {
            link?: string;
            flatrate?: { provider_id: number; provider_name: string; logo_path?: string }[];
            free?: { provider_id: number; provider_name: string; logo_path?: string }[];
            ads?: { provider_id: number; provider_name: string; logo_path?: string }[];
          }
        >;
      }>(`/${type}/${rawId}/watch/providers`);

      const region = options?.region ?? 'US';
      const isAnime = options?.isAnime ?? false;
      const bucket = data.results?.[region] ?? data.results?.['US'];
      if (!bucket) return [];

      const rows = [
        ...(bucket.flatrate ?? []),
        ...(bucket.free ?? []),
        ...(bucket.ads ?? []),
      ];

      const seen = new Set<SupportedPlatform>();
      const providers: WatchProvider[] = [];

      for (const row of rows) {
        const matched = matchSupportedProvider(
          row.provider_name,
          row.logo_path,
          title,
          isAnime,
        );
        if (!matched || seen.has(matched.id)) continue;
        seen.add(matched.id);
        // Prefer JustWatch deep link when available (still opens platform picker)
        if (bucket.link && !matched.url.includes('netflix.com') && matched.id === 'prime') {
          // keep platform-specific search URLs for reliability
        }
        providers.push(matched);
      }

      return providers;
    } catch (err) {
      // Silently return empty when offline — providers section just stays hidden
      if (!isNetworkError(err)) {
        console.warn(`[TMDB] getWatchProviders failed for ${type}/${id}:`, err);
      }
      return [];
    }
  },

  /**
   * Up to `limit` recommendations for a movie or TV show.
   * Falls back to /similar if recommendations returns nothing.
   */
  async getSimilar(id: string, type: 'movie' | 'tv', limit = 5): Promise<MediaItem[]> {
    try {
      const rawId = rawMediaId(id);
      const data = await get<{ results: unknown[] }>(`/${type}/${rawId}/recommendations`);
      const results = data.results.map(type === 'movie' ? mapMovie : mapTV);
      if (results.length > 0) return results.slice(0, limit);

      // fallback
      const fallback = await get<{ results: unknown[] }>(`/${type}/${rawId}/similar`);
      return fallback.results.map(type === 'movie' ? mapMovie : mapTV).slice(0, limit);
    } catch {
      return [];
    }
  },

  /**
   * Build upcoming release cards from the user's scanned library.
   * - TV: next_episode_to_air from TMDB
   * - Movies: future parts in the same collection (sequels), else future-dated recommendations
   */
  async getUpcomingForLibrary(library: MediaItem[]): Promise<UpcomingItem[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isFutureOrRecent = (dateStr?: string | null) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return false;
      // include items airing today or in the next ~18 months
      const max = new Date(today);
      max.setMonth(max.getMonth() + 18);
      return d >= today && d <= max;
    };

    const results: UpcomingItem[] = [];
    const seen = new Set<string>();

    // Cap work so a huge library doesn't hammer TMDB
    const candidates = library
      .filter((i) => !i.id.startsWith('anime:'))
      .slice(0, 40);

    for (const item of candidates) {
      try {
        if (item.type === 'tv') {
          const rawId = rawMediaId(item.id);
          const raw = await get<any>(`/tv/${rawId}`);
          const next = raw.next_episode_to_air;
          if (next?.air_date && isFutureOrRecent(next.air_date)) {
            const uid = `ep:${item.id}:${next.season_number}:${next.episode_number}`;
            if (!seen.has(uid)) {
              seen.add(uid);
              const animeGenres: string[] = (raw.genres ?? []).map((g: any) =>
                String(g.name ?? '').toLowerCase(),
              );
              const isAnime =
                animeGenres.includes('animation') &&
                (raw.origin_country ?? []).some((c: string) => c === 'JP');

              results.push({
                id: uid,
                type: 'episode',
                title: raw.name ?? item.title,
                sourceTitle: item.title,
                releaseDate: next.air_date,
                overview: next.overview || raw.overview || item.description,
                posterUrl: item.posterUrl ?? posterUrl(raw.poster_path),
                backdropUrl:
                  item.backdropUrl ??
                  backdropUrl(raw.backdrop_path) ??
                  (next.still_path ? `${IMG_BASE}/w780${next.still_path}` : undefined),
                episodeName: next.name ?? `Episode ${next.episode_number}`,
                episodeNumber: next.episode_number,
                seasonNumber: next.season_number,
                tmdbId: rawId,
                mediaType: 'tv',
                isAnime,
              });
            }
          }
        } else if (item.type === 'movie') {
          const rawId = rawMediaId(item.id);
          const raw = await get<any>(`/movie/${rawId}`);

          // Collection sequels with future release dates
          const collectionId = raw.belongs_to_collection?.id;
          if (collectionId) {
            const col = await get<any>(`/collection/${collectionId}`);
            const parts: any[] = col.parts ?? [];
            for (const part of parts) {
              if (!part.release_date || !isFutureOrRecent(part.release_date)) continue;
              // Skip the movie they already have
              if (String(part.id) === rawId) continue;
              const uid = `movie:${part.id}`;
              if (seen.has(uid)) continue;
              seen.add(uid);
              results.push({
                id: uid,
                type: 'movie',
                title: part.title ?? part.original_title ?? 'Upcoming',
                sourceTitle: item.title,
                releaseDate: part.release_date,
                overview: part.overview || undefined,
                posterUrl: posterUrl(part.poster_path) ?? item.posterUrl,
                backdropUrl: backdropUrl(part.backdrop_path) ?? item.backdropUrl,
                tmdbId: String(part.id),
                mediaType: 'movie',
                isAnime: false,
              });
            }
          }

          // Unreleased library movie itself (scanned early / pre-release file)
          if (raw.release_date && isFutureOrRecent(raw.release_date)) {
            const uid = `movie:${rawId}`;
            if (!seen.has(uid)) {
              seen.add(uid);
              results.push({
                id: uid,
                type: 'movie',
                title: raw.title ?? item.title,
                sourceTitle: item.title,
                releaseDate: raw.release_date,
                overview: raw.overview || item.description,
                posterUrl: item.posterUrl ?? posterUrl(raw.poster_path),
                backdropUrl: item.backdropUrl ?? backdropUrl(raw.backdrop_path),
                tmdbId: rawId,
                mediaType: 'movie',
                isAnime: false,
              });
            }
          }
        }
      } catch (err) {
        if (!isNetworkError(err)) console.warn(`[TMDB] upcoming lookup failed for ${item.id}:`, err);
      }
    }

    // Soonest first
    results.sort(
      (a, b) =>
        new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime(),
    );
    return results;
  },
};

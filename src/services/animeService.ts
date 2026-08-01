import AsyncStorage from '@react-native-async-storage/async-storage';
import { MediaItem } from '../types';

// Uses the public Jikan REST API (MyAnimeList) — no key required.
const BASE_URL = 'https://api.jikan.moe/v4';

const CACHE_PREFIX = '@cinescan:cache:anime:';

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

 
function mapAnime(raw: any): MediaItem {
  return {
    // Namespace MAL ids so they never collide with TMDB numeric ids
    id: `anime:${raw.mal_id}`,
    title: raw.title_english ?? raw.title ?? 'Unknown',
    type: 'tv',
    description: raw.synopsis ?? '',
    posterUrl: raw.images?.jpg?.large_image_url ?? raw.images?.jpg?.image_url,
    backdropUrl: raw.trailer?.images?.maximum_image_url ?? raw.images?.jpg?.large_image_url,
    rating: raw.score ?? 0,
    releaseDate: raw.aired?.from?.split('T')[0],
    runtime: raw.duration ? parseInt(raw.duration, 10) : undefined,
    numberOfSeasons: 1,
    genres: raw.genres?.map((g: { name: string }) => g.name) ?? [],
  };
}

export const animeService = {
  /** Top airing / popular anime from Jikan */
  async getTopAnime(): Promise<MediaItem[]> {
    const cacheKey = 'top_anime';
    const cached = await getCached<MediaItem[]>(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetch(`${BASE_URL}/top/anime?filter=airing&limit=25`);
      if (!res.ok) throw new Error(`Jikan ${res.status}`);
      const data = await res.json();
      const mapped = (data.data ?? []).map(mapAnime);
      await setCached(cacheKey, mapped);
      return mapped;
    } catch {
      return [];
    }
  },

  /** Search anime by title */
  async search(query: string): Promise<MediaItem[]> {
    const cacheKey = `search:${query}`;
    const cached = await getCached<MediaItem[]>(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetch(
        `${BASE_URL}/anime?q=${encodeURIComponent(query)}&limit=20&sfw=true`,
      );
      if (!res.ok) throw new Error(`Jikan ${res.status}`);
      const data = await res.json();
      const mapped = (data.data ?? []).map(mapAnime);
      await setCached(cacheKey, mapped);
      return mapped;
    } catch {
      return [];
    }
  },
};

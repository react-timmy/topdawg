/**
 * FilmSort Wrapped — year-in-review recap for Advanced Memories (Pro).
 *
 * Watch history still drives hours/streaks/plays.
 * The user's scanned library shelf is merged in for nostalgia — legendary
 * movies & shows in their collection appear every year even if unwatched.
 */

import { Share } from 'react-native';
import { MediaItem } from '../types';
import { WatchEvent } from '../storage/watchHistoryService';
import { computeStats } from '../utils/statsEngine';
import { memoriesService, UniqueTitleEntry } from './memoriesService';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ShowEpisodeStat {
  mediaId: string;
  title: string;
  posterUrl?: string;
  episodesLogged: number;
  ofTvPercent: number;
}

export interface WrappedRecap {
  year: number;
  eventCount: number;
  totalHours: number;
  totalMinutes: number;
  moviesWatched: number;
  episodesWatched: number;
  uniqueMovies: number;
  uniqueShows: number;
  uniqueTitles: number;
  /** Library shelf counts (include unwatched) */
  libraryMovies: number;
  libraryShows: number;
  movieWatchPercent: number;
  tvWatchPercent: number;
  movieTitlePercent: number;
  showTitlePercent: number;
  topGenre: string | null;
  genreBreakdown: { genre: string; count: number }[];
  animeHours: number;
  animeEpisodes: number;
  currentStreak: number;
  longestStreak: number;
  topTitles: UniqueTitleEntry[];
  movieTitles: UniqueTitleEntry[];
  showTitles: UniqueTitleEntry[];
  topShowsByEpisodes: ShowEpisodeStat[];
  headline: string;
  subhead: string;
  shareMessage: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function eventsForYear(history: WatchEvent[], year: number): WatchEvent[] {
  return history.filter((e) => new Date(e.watchedAt).getFullYear() === year);
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function releaseYearOf(item: MediaItem): number | undefined {
  if (!item.releaseDate) return undefined;
  const y = parseInt(item.releaseDate.slice(0, 4), 10);
  return Number.isFinite(y) ? y : undefined;
}

/**
 * Library titles for this wrap year:
 * - Released in that year (classic “back in the day” nostalgia), OR
 * - No release year known (still on their shelf)
 * Plus anything they watched that year even if not in library (handled separately).
 */
function libraryShelfForYear(library: MediaItem[], year: number): MediaItem[] {
  return library.filter((item) => {
    const ry = releaseYearOf(item);
    if (ry == null) return true;
    // Titles from that year or earlier — the legends already on their hard drive
    return ry <= year;
  });
}

function sortShelf(a: UniqueTitleEntry, b: UniqueTitleEntry): number {
  // Watched first (they still matter most), then more plays, then title
  const aw = a.watched || a.watchCount > 0 ? 1 : 0;
  const bw = b.watched || b.watchCount > 0 ? 1 : 0;
  if (aw !== bw) return bw - aw;
  if (a.watchCount !== b.watchCount) return b.watchCount - a.watchCount;
  return a.title.localeCompare(b.title);
}

/**
 * Merge scanned library + watch history into nostalgic movie/show lists.
 * Watched titles keep play counts; unwatched library titles still appear.
 */
export function mergeLibraryAndHistory(
  library: MediaItem[],
  historyTitles: UniqueTitleEntry[],
  year: number,
): { movieTitles: UniqueTitleEntry[]; showTitles: UniqueTitleEntry[]; all: UniqueTitleEntry[] } {
  const map = new Map<string, UniqueTitleEntry>();

  // 1) History first (watched)
  for (const t of historyTitles) {
    map.set(t.mediaId, {
      ...t,
      watched: t.watchCount > 0,
      inLibrary: false,
    });
  }

  // 2) Library shelf — nostalgic collection
  for (const item of libraryShelfForYear(library, year)) {
    const existing = map.get(item.id);
    const ry = releaseYearOf(item);
    if (existing) {
      map.set(item.id, {
        ...existing,
        posterUrl: existing.posterUrl || item.posterUrl,
        title: existing.title || item.title,
        watched: true,
        inLibrary: true,
        releaseYear: existing.releaseYear ?? ry,
      });
    } else {
      map.set(item.id, {
        mediaId: item.id,
        title: item.title,
        type: item.type,
        posterUrl: item.posterUrl,
        firstWatchedAt: item.releaseDate || `${year}-01-01T00:00:00.000Z`,
        watchCount: 0,
        watched: false,
        inLibrary: true,
        releaseYear: ry,
      });
    }
  }

  const all = [...map.values()];
  const movieTitles = all.filter((t) => t.type === 'movie').sort(sortShelf);
  const showTitles = all.filter((t) => t.type === 'tv').sort(sortShelf);
  return { movieTitles, showTitles, all };
}

function buildShowEpisodeStats(events: WatchEvent[]): ShowEpisodeStat[] {
  const tv = events.filter((e) => e.type === 'tv');
  if (tv.length === 0) return [];

  const byShow = new Map<
    string,
    { title: string; posterUrl?: string; epKeys: Set<string> }
  >();

  for (const e of tv) {
    let row = byShow.get(e.mediaId);
    if (!row) {
      row = { title: e.title, posterUrl: e.posterUrl, epKeys: new Set() };
      byShow.set(e.mediaId, row);
    }
    if (!row.posterUrl && e.posterUrl) row.posterUrl = e.posterUrl;
    const key =
      e.seasonNumber != null && e.episodeNumber != null
        ? `S${e.seasonNumber}E${e.episodeNumber}`
        : e.id;
    row.epKeys.add(key);
  }

  const totalDistinctEps = [...byShow.values()].reduce(
    (s, r) => s + r.epKeys.size,
    0,
  );

  return [...byShow.entries()]
    .map(([mediaId, r]) => ({
      mediaId,
      title: r.title,
      posterUrl: r.posterUrl,
      episodesLogged: r.epKeys.size,
      ofTvPercent: pct(r.epKeys.size, totalDistinctEps || 1),
    }))
    .sort((a, b) => b.episodesLogged - a.episodesLogged)
    .slice(0, 6);
}

function pickHeadline(
  recap: Omit<WrappedRecap, 'headline' | 'subhead' | 'shareMessage'>,
): { headline: string; subhead: string } {
  const {
    year,
    totalHours,
    animeHours,
    topGenre,
    uniqueMovies,
    uniqueShows,
    libraryMovies,
    libraryShows,
    eventCount,
  } = recap;

  if (eventCount <= 0 && libraryMovies + libraryShows === 0) {
    return {
      headline: `Your ${year} is just getting started`,
      subhead: 'Scan or watch something — build a shelf of legends.',
    };
  }

  if (eventCount <= 0 && libraryMovies + libraryShows > 0) {
    return {
      headline: `${libraryMovies + libraryShows} legends on your shelf`,
      subhead: `${libraryMovies} movies · ${libraryShows} shows waiting in FilmSort`,
    };
  }

  if (animeHours >= 10 && animeHours >= totalHours * 0.35) {
    return {
      headline: `You watched ${animeHours} hours of anime in ${year}`,
      subhead: topGenre
        ? `Biggest vibe: ${topGenre}`
        : 'That’s a whole season of dedication.',
    };
  }

  if (totalHours >= 1) {
    return {
      headline: `You watched ${totalHours} hours in ${year}`,
      subhead: `${uniqueMovies} movies played · ${uniqueShows} shows · ${libraryMovies + libraryShows} on your shelf`,
    };
  }

  return {
    headline: `${recap.uniqueTitles} titles close to home`,
    subhead: topGenre ? `Top genre: ${topGenre}` : 'Your FilmSort year so far.',
  };
}

function buildShareMessage(recap: WrappedRecap): string {
  const lines = [
    `🎬 FilmSort Wrapped ${recap.year}`,
    '',
    recap.headline,
    recap.subhead,
    '',
  ];
  if (recap.totalHours > 0) lines.push(`⏱ ${recap.totalHours}h watched`);
  lines.push(
    `🎞 Movies: ${recap.uniqueMovies} played · ${recap.libraryMovies} on shelf`,
  );
  lines.push(
    `📺 TV: ${recap.uniqueShows} shows · ${recap.episodesWatched} eps · ${recap.libraryShows} on shelf`,
  );
  if (recap.topGenre) lines.push(`🏷 Top genre: ${recap.topGenre}`);
  if (recap.animeHours > 0) lines.push(`✨ Anime: ${recap.animeHours}h`);
  if (recap.longestStreak > 1) {
    lines.push(`🔥 Best streak: ${recap.longestStreak} days`);
  }
  if (recap.topTitles.length > 0) {
    lines.push('', 'Most watched:');
    recap.topTitles.slice(0, 5).forEach((t, i) => {
      lines.push(
        `${i + 1}. ${t.title}${t.watchCount > 1 ? ` (×${t.watchCount})` : ''}`,
      );
    });
  }
  lines.push('', '— shared from FilmSort');
  return lines.join('\n');
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function buildWrappedRecap(
  history: WatchEvent[],
  library: MediaItem[] = [],
  year: number = new Date().getFullYear(),
): WrappedRecap {
  let yearEvents = eventsForYear(history, year);
  const usedYear = year;

  if (yearEvents.length === 0 && history.length > 0) {
    yearEvents = history;
  }

  const stats = computeStats(yearEvents);
  const historyTitles = memoriesService.buildUniqueTitles(yearEvents);
  const { movieTitles, showTitles, all } = mergeLibraryAndHistory(
    library,
    historyTitles,
    usedYear,
  );

  const uniqueMovies = all.filter((t) => t.type === 'movie' && t.watched).length;
  const uniqueShows = all.filter((t) => t.type === 'tv' && t.watched).length;
  const libraryMovies = movieTitles.length;
  const libraryShows = showTitles.length;
  const totalPlays = stats.moviesWatched + stats.episodesWatched;

  const topTitles = [...historyTitles]
    .sort(
      (a, b) =>
        b.watchCount - a.watchCount || a.title.localeCompare(b.title),
    )
    .slice(0, 8)
    .map((t) => ({ ...t, watched: true }));

  const topShowsByEpisodes = buildShowEpisodeStats(yearEvents);

  const base = {
    year: usedYear,
    eventCount: yearEvents.length,
    totalHours: stats.totalHours,
    totalMinutes: stats.totalMinutes,
    moviesWatched: stats.moviesWatched,
    episodesWatched: stats.episodesWatched,
    uniqueMovies,
    uniqueShows,
    uniqueTitles: Math.max(stats.uniqueTitles, all.filter((t) => t.watched).length),
    libraryMovies,
    libraryShows,
    movieWatchPercent: pct(stats.moviesWatched, totalPlays),
    tvWatchPercent: pct(stats.episodesWatched, totalPlays),
    movieTitlePercent: pct(libraryMovies, libraryMovies + libraryShows),
    showTitlePercent: pct(libraryShows, libraryMovies + libraryShows),
    topGenre: stats.topGenre,
    genreBreakdown: stats.genreBreakdown,
    animeHours: stats.animeHours,
    animeEpisodes: stats.animeEpisodes,
    currentStreak: stats.currentStreak,
    longestStreak: stats.longestStreak,
    topTitles,
    movieTitles,
    showTitles,
    topShowsByEpisodes,
  };

  const { headline, subhead } = pickHeadline(base);
  const recap: WrappedRecap = {
    ...base,
    headline,
    subhead,
    shareMessage: '',
  };
  recap.shareMessage = buildShareMessage(recap);
  return recap;
}

export async function shareWrapped(recap: WrappedRecap): Promise<void> {
  if (recap.eventCount === 0 && recap.libraryMovies + recap.libraryShows === 0) {
    throw new Error('NO_HISTORY');
  }
  await Share.share({
    message: recap.shareMessage,
    title: `FilmSort Wrapped ${recap.year}`,
  });
}

export const wrappedService = {
  buildWrappedRecap,
  shareWrapped,
  mergeLibraryAndHistory,
};

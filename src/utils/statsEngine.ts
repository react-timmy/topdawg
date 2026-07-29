import { WatchEvent } from '../storage/watchHistoryService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WatchStats {
  totalHours: number;       // sum of runtime / 60, rounded to 1 decimal
  totalMinutes: number;     // remainder minutes for display: Xh Ym
  moviesWatched: number;
  episodesWatched: number;
  genreBreakdown: { genre: string; count: number }[];   // sorted desc, top 10
  animeEpisodes: number;
  animeHours: number;       // rounded to 1 decimal
  animeGenres: { genre: string; count: number }[];
  topGenre: string | null;
  // ── Streak ──────────────────────────────────────────────────────────────────
  /** Consecutive calendar days with at least one watch event, ending today. */
  currentStreak: number;
  /** Longest streak ever recorded in the history. */
  longestStreak: number;
  // ── Week comparison ─────────────────────────────────────────────────────────
  /** Total completions in the current calendar week (Mon–Sun). */
  thisWeekCount: number;
  /** Total completions in the previous calendar week. */
  lastWeekCount: number;
  // ── All-time ────────────────────────────────────────────────────────────────
  /** Unique title count (deduplicated by mediaId). */
  uniqueTitles: number;
  /** Year the user started watching (earliest event year), or current year. */
  watchingSince: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tallyGenres(
  events: WatchEvent[],
  limit = 10,
): { genre: string; count: number }[] {
  const map = new Map<string, number>();
  for (const event of events) {
    for (const g of event.genres) {
      map.set(g, (map.get(g) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Returns "YYYY-MM-DD" in local time for a given Date. */
function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Computes current streak (ending today) and longest streak ever
 * from a set of date keys.
 */
function computeStreaks(dateKeys: Set<string>): { current: number; longest: number } {
  if (dateKeys.size === 0) return { current: 0, longest: 0 };

  // Sort all distinct day keys descending
  const sorted = [...dateKeys].sort().reverse(); // "2024-07-28", "2024-07-27", …

  const todayKey = toDateKey(new Date());

  // ── Current streak: walk back from today ──────────────────────────────────
  let current = 0;
  const cursor = new Date();
  // Allow for "watched yesterday" still counting as active (grace period)
  // — check today first, then yesterday, then keep walking back
  while (true) {
    const key = toDateKey(cursor);
    if (dateKeys.has(key)) {
      current++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (current === 0 && key === todayKey) {
      // Nothing today yet — check yesterday before giving up
      cursor.setDate(cursor.getDate() - 1);
      const yesterdayKey = toDateKey(cursor);
      if (dateKeys.has(yesterdayKey)) {
        // Streak is alive from yesterday
        current++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    } else {
      break;
    }
  }

  // ── Longest streak: scan entire sorted list ───────────────────────────────
  let longest = 0;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diff = Math.round((prev.getTime() - curr.getTime()) / 86400000);
    if (diff === 1) {
      run++;
    } else {
      longest = Math.max(longest, run);
      run = 1;
    }
  }
  longest = Math.max(longest, run);

  return { current, longest };
}

/** Returns Monday of the week containing `d` as a Date at midnight. */
function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay(); // 0 = Sun
  const diff = day === 0 ? 6 : day - 1; // shift so Mon = 0
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export function computeStats(history: WatchEvent[]): WatchStats {
  if (history.length === 0) {
    return {
      totalHours: 0,
      totalMinutes: 0,
      moviesWatched: 0,
      episodesWatched: 0,
      genreBreakdown: [],
      animeEpisodes: 0,
      animeHours: 0,
      animeGenres: [],
      topGenre: null,
      currentStreak: 0,
      longestStreak: 0,
      thisWeekCount: 0,
      lastWeekCount: 0,
      uniqueTitles: 0,
      watchingSince: new Date().getFullYear(),
    };
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totalRawMinutes = history.reduce((sum, e) => sum + (e.runtime ?? 0), 0);
  const totalHours = Math.round((totalRawMinutes / 60) * 10) / 10;
  const totalMinutes = Math.round(totalHours * 60) % 60;

  // ── Type counts ────────────────────────────────────────────────────────────
  const moviesWatched   = history.filter((e) => e.type === 'movie').length;
  const episodesWatched = history.filter((e) => e.type === 'tv').length;

  // ── Genre breakdown ────────────────────────────────────────────────────────
  const genreBreakdown = tallyGenres(history, 10);
  const topGenre = genreBreakdown[0]?.genre ?? null;

  // ── Anime ──────────────────────────────────────────────────────────────────
  const animeEvents   = history.filter((e) => e.isAnime === true);
  const animeEpisodes = animeEvents.length;
  const animeRawMin   = animeEvents.reduce((sum, e) => sum + (e.runtime ?? 0), 0);
  const animeHours    = Math.round((animeRawMin / 60) * 10) / 10;
  const animeGenres   = tallyGenres(animeEvents, 10);

  // ── Streak ─────────────────────────────────────────────────────────────────
  const dayKeys = new Set(history.map((e) => toDateKey(new Date(e.watchedAt))));
  const { current: currentStreak, longest: longestStreak } = computeStreaks(dayKeys);

  // ── Week comparison ────────────────────────────────────────────────────────
  const now = new Date();
  const thisWeekStart = startOfWeek(now).getTime();
  const lastWeekStart = thisWeekStart - 7 * 86400000;
  const thisWeekCount = history.filter((e) => {
    const t = new Date(e.watchedAt).getTime();
    return t >= thisWeekStart;
  }).length;
  const lastWeekCount = history.filter((e) => {
    const t = new Date(e.watchedAt).getTime();
    return t >= lastWeekStart && t < thisWeekStart;
  }).length;

  // ── Unique titles ──────────────────────────────────────────────────────────
  const uniqueTitles = new Set(history.map((e) => e.mediaId)).size;

  // ── Watching since ─────────────────────────────────────────────────────────
  const earliest = history.reduce((min, e) => {
    const yr = new Date(e.watchedAt).getFullYear();
    return yr < min ? yr : min;
  }, new Date().getFullYear());
  const watchingSince = earliest;

  return {
    totalHours,
    totalMinutes,
    moviesWatched,
    episodesWatched,
    genreBreakdown,
    animeEpisodes,
    animeHours,
    animeGenres,
    topGenre,
    currentStreak,
    longestStreak,
    thisWeekCount,
    lastWeekCount,
    uniqueTitles,
    watchingSince,
  };
}

import { WatchEvent } from '../storage/watchHistoryService';
import { WatchStats } from './statsEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BadgeResult {
  id: string;
  name: string;
  description: string;
  icon: string;       // lucide-react-native icon name
  color: string;      // hex — shown when earned
  earned: boolean;
  progress: number;   // 0–1
  target: number;     // for display: "X / target"
  current: number;
}

// Internal definition shape
interface BadgeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  target: number;
  eval: (stats: WatchStats, history: WatchEvent[]) => number;
}

// ─── Badge definitions ────────────────────────────────────────────────────────

const BADGE_DEFS: BadgeDef[] = [
  {
    id: 'first_watch',
    name: 'First Watch',
    description: 'Watch your first title',
    icon: 'Play',
    color: '#60a5fa',
    target: 1,
    eval: (s) => s.moviesWatched + s.episodesWatched,
  },
  {
    id: 'movie_binger',
    name: 'Movie Binger',
    description: 'Watch 10 movies',
    icon: 'Film',
    color: '#f59e0b',
    target: 10,
    eval: (s) => s.moviesWatched,
  },
  {
    id: 'marathon',
    name: 'Marathon',
    description: 'Watch 25 movies',
    icon: 'Clapperboard',
    color: '#a78bfa',
    target: 25,
    eval: (s) => s.moviesWatched,
  },
  {
    id: 'series_devotee',
    name: 'Series Devotee',
    description: 'Watch 10 TV episodes',
    icon: 'Tv',
    color: '#34d399',
    target: 10,
    eval: (s) => s.episodesWatched,
  },
  {
    id: 'binge_machine',
    name: 'Binge Machine',
    description: 'Watch 50 TV episodes',
    icon: 'Zap',
    color: '#f97316',
    target: 50,
    eval: (s) => s.episodesWatched,
  },
  {
    id: 'anime_freak',
    name: 'Anime Freak',
    description: 'Watch 10 anime episodes',
    icon: 'Star',
    color: '#e879f9',
    target: 10,
    eval: (s) => s.animeEpisodes,
  },
  {
    id: 'otaku',
    name: 'Otaku',
    description: 'Watch 50 anime episodes',
    icon: 'Sparkles',
    color: '#f472b6',
    target: 50,
    eval: (s) => s.animeEpisodes,
  },
  {
    id: 'romance_lover',
    name: 'Romance Lover',
    description: '5 completions in the Romance genre',
    icon: 'Heart',
    color: '#fb7185',
    target: 5,
    eval: (_s, h) => h.filter((e) => e.genres.includes('Romance')).length,
  },
  {
    id: 'thriller_seeker',
    name: 'Thriller Seeker',
    description: '5 completions in Thriller or Mystery',
    icon: 'Eye',
    color: '#64748b',
    target: 5,
    eval: (_s, h) =>
      h.filter((e) =>
        e.genres.some((g) => g === 'Thriller' || g === 'Mystery'),
      ).length,
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    description: '5 completions watched between 10 PM and 4 AM',
    icon: 'Moon',
    color: '#818cf8',
    target: 5,
    eval: (_s, h) =>
      h.filter((e) => {
        const hour = new Date(e.watchedAt).getHours();
        return hour >= 22 || hour < 4;
      }).length,
  },
  {
    id: 'century_club',
    name: 'Century Club',
    description: '100 total completions',
    icon: 'Trophy',
    color: '#fbbf24',
    target: 100,
    eval: (s) => s.moviesWatched + s.episodesWatched,
  },
  {
    id: 'time_sink',
    name: 'Time Sink',
    description: '100 total watch hours logged',
    icon: 'Clock',
    color: '#2dd4bf',
    target: 100,
    eval: (s) => Math.floor(s.totalHours),
  },
];

// ─── Engine ───────────────────────────────────────────────────────────────────

export function evaluateBadges(
  history: WatchEvent[],
  stats: WatchStats,
): BadgeResult[] {
  const results: BadgeResult[] = BADGE_DEFS.map((def) => {
    const current = def.eval(stats, history);
    const earned  = current >= def.target;
    const progress = Math.min(1, current / def.target);

    return {
      id: def.id,
      name: def.name,
      description: def.description,
      icon: def.icon,
      color: def.color,
      earned,
      progress,
      target: def.target,
      current,
    };
  });

  // Earned badges first (alpha by name), then locked (desc by progress)
  return results.sort((a, b) => {
    if (a.earned !== b.earned) return a.earned ? -1 : 1;
    if (a.earned) return a.name.localeCompare(b.name);
    return b.progress - a.progress;
  });
}

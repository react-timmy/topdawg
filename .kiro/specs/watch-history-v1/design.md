# Watch History & Stats — v1.1 Design

## Architecture Overview

```
VideoPlayerScreen
    └─► watchHistoryService.recordCompletion()   ← triggered at 92% playback
            └─► AsyncStorage @filmsort:watch_history

ProfileScreen
    └─► watchHistoryService.getHistory()
    └─► statsEngine.compute(history)             ← pure functions, no I/O
    └─► badgeEngine.evaluate(stats)              ← pure functions, no I/O
    └─► <StatsSection />
    └─► <BadgeGrid />
    └─► <RecentlyWatchedList />

DetailsScreen  (existing, modified)
    └─► watchHistoryService.hasWatched(mediaId)
    └─► watchHistoryService.recordCompletion()   ← manual mark
```

No new third-party packages. No backend. No context provider needed — the Profile screen
reads directly from storage on focus.

---

## New Files

### `src/storage/watchHistoryService.ts`

The single source of truth for all watch history I/O.

```typescript
// AsyncStorage key
const HISTORY_KEY = '@filmsort:watch_history';
const MAX_EVENTS  = 5000;
const PRUNE_TO    = 4500;

export interface WatchEvent {
  id: string;              // uuid-lite: `${mediaId}::${Date.now()}`
  mediaId: string;
  title: string;
  type: 'movie' | 'tv';
  genres: string[];
  runtime: number;         // minutes; 0 if unknown
  posterUrl?: string;
  watchedAt: string;       // ISO-8601
  // TV-specific
  seasonNumber?: number;
  episodeNumber?: number;
  // Meta
  manual?: boolean;        // true = user tapped "Mark as Watched"
  isAnime?: boolean;       // derived from genres heuristic at record time
}

export const watchHistoryService = {
  async getHistory(): Promise<WatchEvent[]>,
  async recordCompletion(event: Omit<WatchEvent, 'id' | 'watchedAt'>): Promise<void>,
  async hasWatched(mediaId: string): Promise<boolean>,
  async clearHistory(): Promise<void>,       // dev/settings only
};
```

**`isAnime` heuristic at record time:**
```
genres.includes('Animation') && type === 'tv'
```
Simple, deterministic, no network call.

**Deduplication:** Before writing, check if an event with the same `mediaId`,
`seasonNumber`, and `episodeNumber` (or no episode for movies) was recorded in the
last 60 seconds. If so, skip — prevents double-fires from the VideoPlayer progress
callback being called twice at boundary.

---

### `src/screens/ProfileScreen.tsx`

Single-file screen. Uses `useFocusEffect` to re-read history when the tab is tapped
(same pattern as MoviesScreen / TVScreen).

```
ProfileScreen
├── ScrollView
│   ├── <HeroStats />         — hours, films, episodes
│   ├── <GenreChart />        — top-5 genre bar chart (plain Views)
│   ├── [<AnimeBlock />]      — conditional: only if anime events exist
│   ├── <BadgeSection />      — grid of earned + locked badges
│   └── <RecentlyWatched />   — last 20 events, tappable
└── FloatingHeader title="Profile"
```

---

### `src/utils/statsEngine.ts`

Pure functions — no I/O, no side effects. Easy to unit-test.

```typescript
export interface WatchStats {
  totalHours: number;       // sum of runtime / 60, rounded to 1 decimal
  totalMinutes: number;     // for display: Xh Ym
  moviesWatched: number;
  episodesWatched: number;
  genreBreakdown: { genre: string; count: number }[];   // sorted desc
  animeEpisodes: number;
  animeHours: number;
  animeGenres: { genre: string; count: number }[];
  topGenre: string | null;
}

export function computeStats(history: WatchEvent[]): WatchStats
```

---

### `src/utils/badgeEngine.ts`

Pure evaluation. Returns an array of badge results.

```typescript
export interface BadgeResult {
  id: string;
  name: string;
  description: string;
  icon: string;           // lucide icon name
  color: string;          // hex, shown when earned
  earned: boolean;
  progress: number;       // 0–1, for locked badge progress bars
  target: number;         // display "X / target"
  current: number;
}

export function evaluateBadges(
  history: WatchEvent[],
  stats: WatchStats,
): BadgeResult[]
```

Badge definitions are a static array in this file — no storage, no async.

---

## Modified Files

### `src/screens/VideoPlayerScreen.tsx`

At the point where `watchProgressService.save()` is called and playback is at or past
`COMPLETED_FRACTION`, also call:

```typescript
watchHistoryService.recordCompletion({
  mediaId: item.id,
  title: item.title,
  type: item.type,
  genres: item.genres ?? [],
  runtime: item.runtime ?? item.localFile?.duration
    ? Math.round((item.localFile.duration ?? 0) / 60)
    : 0,
  posterUrl: item.posterUrl,
  seasonNumber: item.localFile?.seasonNumber,
  episodeNumber: item.localFile?.episodeNumber,
});
```

This is additive — zero changes to existing watchProgressService calls.

### `src/screens/DetailsScreen.tsx`

Add a "Mark as Watched" / "Watched ✓" button below the existing action buttons.
Uses `useFocusEffect` + `watchHistoryService.hasWatched(item.id)` to determine state.

### `src/navigation/TabNavigator.tsx`

Add a fifth tab entry:
```typescript
<Tab.Screen name="Profile" component={ProfileScreen} />
```
Icon: `User` from lucide-react-native (already a dep).

### `src/types.ts`

Add to `TabParamList`:
```typescript
Profile: undefined;
```

No changes to `MediaItem`, `WatchProgress`, or any existing type.

---

## Data Flow — Automatic Completion

```
VideoPlayerScreen
  onPlaybackStatusUpdate(status)
    if status.positionMillis / status.durationMillis >= COMPLETED_FRACTION
      watchProgressService.save(...)   ← existing, unchanged
      watchHistoryService.recordCompletion(...)  ← new, additive
```

The completion call is fire-and-forget (`void`, no await needed in the callback since
it's already async and non-blocking).

---

## Stats Computation — Example

Given history: 12 Horror movies, 8 Romance movies, 30 anime episodes, 5 Thriller episodes.

```
genreBreakdown = [
  { genre: 'Horror',    count: 12 },
  { genre: 'Romance',   count: 8  },
  { genre: 'Thriller',  count: 5  },
]
moviesWatched   = 20
episodesWatched = 35
animeEpisodes   = 30
```

Badges earned from this: Movie Binger (10+), Marathon (25... no, only 20 movies — locked),
Series Devotee (10+), Romance Lover (5+), Thriller Seeker (5+), Anime Freak (10+), Otaku (30/50 — locked at 60%).

---

## Badge Definitions

```typescript
const BADGE_DEFS = [
  { id: 'first_watch',     name: 'First Watch',     icon: 'Play',       color: '#60a5fa', target: 1,   eval: (s) => s.moviesWatched + s.episodesWatched },
  { id: 'movie_binger',    name: 'Movie Binger',    icon: 'Film',       color: '#f59e0b', target: 10,  eval: (s) => s.moviesWatched },
  { id: 'marathon',        name: 'Marathon',        icon: 'Clapperboard',color:'#a78bfa', target: 25,  eval: (s) => s.moviesWatched },
  { id: 'series_devotee',  name: 'Series Devotee',  icon: 'Tv',         color: '#34d399', target: 10,  eval: (s) => s.episodesWatched },
  { id: 'binge_machine',   name: 'Binge Machine',   icon: 'Zap',        color: '#f97316', target: 50,  eval: (s) => s.episodesWatched },
  { id: 'anime_freak',     name: 'Anime Freak',     icon: 'Star',       color: '#e879f9', target: 10,  eval: (s) => s.animeEpisodes },
  { id: 'otaku',           name: 'Otaku',           icon: 'Sparkles',   color: '#f472b6', target: 50,  eval: (s) => s.animeEpisodes },
  { id: 'romance_lover',   name: 'Romance Lover',   icon: 'Heart',      color: '#fb7185', target: 5,   eval: (s, h) => h.filter(e => e.genres.includes('Romance')).length },
  { id: 'thriller_seeker', name: 'Thriller Seeker', icon: 'Eye',        color: '#64748b', target: 5,   eval: (s, h) => h.filter(e => e.genres.some(g => ['Thriller','Mystery'].includes(g))).length },
  { id: 'night_owl',       name: 'Night Owl',       icon: 'Moon',       color: '#818cf8', target: 5,   eval: (s, h) => h.filter(e => { const h = new Date(e.watchedAt).getHours(); return h >= 22 || h < 4; }).length },
  { id: 'century_club',    name: 'Century Club',    icon: 'Trophy',     color: '#fbbf24', target: 100, eval: (s) => s.moviesWatched + s.episodesWatched },
  { id: 'time_sink',       name: 'Time Sink',       icon: 'Clock',      color: '#2dd4bf', target: 100, eval: (s) => Math.floor(s.totalHours) },
];
```

---

## AsyncStorage Key Summary

| Key                         | Owner                  | Format                    |
|-----------------------------|------------------------|---------------------------|
| `@cinescan:library`         | storageService         | `MediaItem[]` JSON        |
| `@cinescan:watch_progress`  | watchProgressService   | `Record<string, WatchProgress>` JSON |
| `@filmsort:pro_unlocked`    | proStatusService       | `"true"` string           |
| `@filmsort:watch_history`   | watchHistoryService    | `WatchEvent[]` JSON ← **NEW** |

No key collisions.

---

## Visual Style

Match existing app conventions throughout:
- Background: `#000000`
- Surface cards: `rgba(255,255,255,0.04)` with `rgba(255,255,255,0.07)` border
- Primary text: `#ffffff`
- Secondary text: `#a1a1aa`
- Accent: badge-specific colour, otherwise `#ffffff`
- Animations: `FadeInDown` from `react-native-reanimated` (already used in MediaCard, LibraryView)
- No new icon library — `lucide-react-native` is already installed

Genre bar chart: plain `View` with `flex` width proportional to the max count.
Badge grid: `FlatList` with `numColumns={3}`, each cell is a pressable card
showing icon + name + earned/locked state.

---

## Phase 2 Hooks (not built in v1, but design leaves room)

- `WatchEvent.id` is already a stable string — Google account sync can use it as a
  document ID in Firestore.
- `manual: true` flag on events means the sync layer can distinguish
  auto-completions from manual marks for conflict resolution.
- `watchHistoryService.clearHistory()` stub is present for a "disconnect account /
  delete data" flow.

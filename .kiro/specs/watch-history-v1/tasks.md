# Watch History & Stats — v1.1 Tasks

## Task 1 — `watchHistoryService` storage layer

Create `src/storage/watchHistoryService.ts`.

- Define the `WatchEvent` interface as specified in design.md
- Implement `getHistory()` — reads `@filmsort:watch_history`, returns `WatchEvent[]`, returns `[]` on error
- Implement `recordCompletion(event)`:
  - Generates `id` as `${event.mediaId}::${Date.now()}`
  - Sets `watchedAt` to `new Date().toISOString()`
  - Derives `isAnime` from `event.genres.includes('Animation') && event.type === 'tv'`
  - Deduplicates: skip if an event with same `mediaId` + `seasonNumber` + `episodeNumber` was recorded within the last 60 seconds
  - Appends to the front of the array (most-recent-first order)
  - Prunes to `MAX_EVENTS = 5000`, keeping the newest events
  - Writes back to `@filmsort:watch_history`
- Implement `hasWatched(mediaId)` — returns `true` if any event with that `mediaId` exists
- Implement `clearHistory()` — removes `@filmsort:watch_history`
- Export both the `WatchEvent` type and the `watchHistoryService` object

Sub-tasks:
- [ ] Define `WatchEvent` interface and constants
- [ ] Implement `getHistory` with error handling
- [ ] Implement `recordCompletion` with deduplication and pruning
- [ ] Implement `hasWatched` and `clearHistory`
- [ ] Export service and types

---

## Task 2 — `statsEngine` pure functions

Create `src/utils/statsEngine.ts`.

- Define and export `WatchStats` interface
- Implement `computeStats(history: WatchEvent[]): WatchStats`:
  - `totalHours`: sum of all `event.runtime / 60`, rounded to 1 decimal place
  - `totalMinutes`: `Math.round(totalHours * 60) % 60`
  - `moviesWatched`: count of events where `type === 'movie'`
  - `episodesWatched`: count of events where `type === 'tv'`
  - `genreBreakdown`: flatten all `event.genres`, tally counts, sort descending, return top 10
  - `animeEpisodes`: count of events where `isAnime === true`
  - `animeHours`: sum of `runtime / 60` for anime events, rounded to 1 decimal
  - `animeGenres`: genre breakdown for anime events only
  - `topGenre`: `genreBreakdown[0]?.genre ?? null`
- All computations are pure — no AsyncStorage, no side effects

Sub-tasks:
- [ ] Define `WatchStats` interface
- [ ] Implement `computeStats` — totals and movie/episode counts
- [ ] Implement genre breakdown logic (flatten, tally, sort)
- [ ] Implement anime-specific stats
- [ ] Export `WatchStats` and `computeStats`

---

## Task 3 — `badgeEngine` pure functions

Create `src/utils/badgeEngine.ts`.

- Define and export `BadgeResult` interface (as specified in design.md)
- Define the static `BADGE_DEFS` array with all 12 badges from requirements R5.2
- Implement `evaluateBadges(history: WatchEvent[], stats: WatchStats): BadgeResult[]`:
  - For each badge def, compute `current` by calling its `eval` function with `(stats, history)`
  - Set `earned = current >= target`
  - Set `progress = Math.min(1, current / target)`
  - Sort result: earned badges first (by name), then locked badges (by progress desc)
- Handle the Night Owl badge's hour-range logic correctly (`hour >= 22 || hour < 4`)

Sub-tasks:
- [ ] Define `BadgeResult` interface
- [ ] Implement all 12 badge definitions in `BADGE_DEFS`
- [ ] Implement `evaluateBadges` with sort
- [ ] Export `BadgeResult` and `evaluateBadges`

---

## Task 4 — `ProfileScreen` — skeleton and stats section

Create `src/screens/ProfileScreen.tsx`.

Build the screen shell and the stats section only (badges and history list come in Tasks 5–6).

- Use `useFocusEffect` + `useCallback` to load history and compute stats on tab focus
- Show `ActivityIndicator` while loading (same pattern as MoviesScreen)
- `FloatingHeader` with `title="Profile"` and no search button
- `ScrollView` with `#000000` background and bottom padding for tab bar
- **HeroStats block**: total hours as `Xh Ym` (or `Xh` if minutes are 0), films count, episodes count — large centred typography
- **Genre chart**: top genres rendered as a ranked list with a proportional `View`-based bar for each. Bar width = `(count / maxCount) * 100%`. Use `rgba(255,255,255,0.12)` for the bar track and `#ffffff` for the filled portion.
- **Anime block**: conditionally rendered when `stats.animeEpisodes > 0`. Shows anime episodes count, anime hours, and a mini genre list for anime. Label it "Anime" with a star icon.
- All surface cards: `backgroundColor: 'rgba(255,255,255,0.04)'`, `borderWidth: 1`, `borderColor: 'rgba(255,255,255,0.07)'`, `borderRadius: 12`
- Use `FadeInDown` animation on each section card (same as LibraryView)

Sub-tasks:
- [ ] Screen file, imports, useFocusEffect data load
- [ ] HeroStats block (hours + films + episodes)
- [ ] Genre bar chart using plain View widths
- [ ] Anime block (conditional)
- [ ] StyleSheet

---

## Task 5 — `ProfileScreen` — badges section

Add the `BadgeSection` component to `ProfileScreen.tsx`.

- Renders inside the existing `ScrollView` below the stats section
- Section title: "Badges" with a trophy icon
- Display badges in a 3-column `FlatList` (or nested rows — avoid nested `FlatList` inside `ScrollView`; use `numColumns` or map to rows manually)
- Each badge card:
  - **Earned**: coloured icon at full opacity, badge name in white, description in `#a1a1aa`
  - **Locked**: icon at 20% opacity with a lock overlay, name in `#52525b`, progress fraction shown as `X / target`
- Badge cards are pressable but show no action (v1 — tapping does nothing)
- Sort order: earned first, locked after (already handled by `badgeEngine`)

Sub-tasks:
- [ ] BadgeCard component (earned vs locked visual states)
- [ ] 3-column grid layout without nested FlatList
- [ ] Section header
- [ ] Wire up `evaluateBadges` output

---

## Task 6 — `ProfileScreen` — recently watched list

Add the `RecentlyWatchedList` component to `ProfileScreen.tsx`.

- Section title: "Recently Watched"
- Shows last 20 events from `history` (already sorted newest-first)
- Each row:
  - 40×60 poster thumbnail (`borderRadius: 4`) or a grey placeholder if no `posterUrl`
  - Title (white, medium weight)
  - Type badge: "Movie" or "TV" in a small pill (`borderRadius: 4`)
  - Date watched: formatted as "Jul 27" or "Yesterday" or "Today" using a simple local formatter (no new lib)
  - Episode info if TV: "S01E03"
- Tapping a row: navigate to `Details` screen if the `mediaId` starts with `movie:` or `tv:` (always will). Check `storageService.getLibrary()` — if the item is found, navigate. If not found, do nothing (no crash, no toast needed in v1).
- Empty state: centred text "Nothing watched yet. Play a file to build your history." with a clock icon above it.

Sub-tasks:
- [ ] Date formatter helper (Today / Yesterday / "Jul 27")
- [ ] RecentlyWatchedRow component
- [ ] Empty state component
- [ ] Navigation on tap with library existence check

---

## Task 7 — Hook completion events into `VideoPlayerScreen`

Modify `src/screens/VideoPlayerScreen.tsx` to call `watchHistoryService.recordCompletion` when playback reaches `COMPLETED_FRACTION`.

- Import `watchHistoryService` from `../storage/watchHistoryService`
- Import `COMPLETED_FRACTION` from `../storage/watchProgressService`
- Locate the `onPlaybackStatusUpdate` callback (or equivalent progress handler)
- After the existing `watchProgressService.save(...)` call, add:
  ```typescript
  if (
    status.durationMillis > 0 &&
    status.positionMillis / status.durationMillis >= COMPLETED_FRACTION &&
    !hasRecordedCompletionRef.current
  ) {
    hasRecordedCompletionRef.current = true;
    watchHistoryService.recordCompletion({
      mediaId: item.id,
      title: item.title,
      type: item.type,
      genres: item.genres ?? [],
      runtime: item.runtime ?? (item.localFile?.duration
        ? Math.round(item.localFile.duration / 60)
        : 0),
      posterUrl: item.posterUrl,
      seasonNumber: item.localFile?.seasonNumber,
      episodeNumber: item.localFile?.episodeNumber,
    });
  }
  ```
- Add `const hasRecordedCompletionRef = useRef(false)` inside the component so the completion fires at most once per player mount
- Reset the ref to `false` in the player's cleanup / `useEffect` return

Sub-tasks:
- [ ] Read VideoPlayerScreen to locate the progress callback
- [ ] Add `hasRecordedCompletionRef`
- [ ] Add completion call after existing watchProgressService.save
- [ ] Reset ref in cleanup

---

## Task 8 — "Mark as Watched" on `DetailsScreen`

Modify `src/screens/DetailsScreen.tsx` to add a manual watch marker.

- Import `watchHistoryService` from `../storage/watchHistoryService`
- Add state: `const [isWatched, setIsWatched] = useState(false)`
- In `useFocusEffect`, call `watchHistoryService.hasWatched(item.id)` and set state
- Add a button below the existing Play/action buttons:
  - Not yet watched: outlined button "Mark as Watched" with a check icon
  - Already watched: non-interactive, filled green-tinted button "Watched ✓"
- On press (not-yet-watched state):
  - For `type === 'movie'`: call `recordCompletion` once with the item's runtime
  - For `type === 'tv'`: call `recordCompletion` for each `localFile` in `item.localFiles`, capped at 24 calls. Use `localFile.duration` as runtime if `item.runtime` is not set.
  - Set `manual: true` on all events
  - After all calls, set `setIsWatched(true)`

Sub-tasks:
- [ ] Read DetailsScreen to understand existing button layout
- [ ] Add `isWatched` state and `useFocusEffect` check
- [ ] Add "Mark as Watched" / "Watched ✓" button
- [ ] Implement press handler for movie and TV cases

---

## Task 9 — Wire up the Profile tab in navigation

Modify `src/navigation/TabNavigator.tsx` and `src/types.ts`.

- In `src/types.ts`: add `Profile: undefined` to `TabParamList`
- In `src/navigation/TabNavigator.tsx`:
  - Import `ProfileScreen` from `../screens/ProfileScreen`
  - Import `User` from `lucide-react-native`
  - Add the tab screen:
    ```tsx
    <Tab.Screen
      name="Profile"
      component={ProfileScreen}
      options={{
        tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        tabBarLabel: 'Profile',
      }}
    />
    ```
  - Place it as the last tab (after Scan), or between Library and Scan — match the visual order that makes sense: Movies | TV | Library | Profile | Scan

Sub-tasks:
- [ ] Add `Profile: undefined` to `TabParamList` in types.ts
- [ ] Import and register ProfileScreen in TabNavigator
- [ ] Add User icon and tab label
- [ ] Verify no TypeScript errors on TabParamList

---

## Task 10 — Settings: clear watch history

Modify `src/screens/SettingsScreen.tsx` to add a destructive "Clear Watch History" option.

- Add a new section in the settings list titled "Data"
- Add a row: "Clear Watch History" with a trash icon, red text
- On press: show a confirmation `Alert` ("This will permanently delete your watch history and reset all badges. This cannot be undone.")
- On confirm: call `watchHistoryService.clearHistory()`, show a brief success toast or `Alert("Done", "Watch history cleared.")`
- No changes to library data — only `@filmsort:watch_history` is affected

Sub-tasks:
- [ ] Read SettingsScreen to find the right insertion point
- [ ] Add "Data" section with "Clear Watch History" row
- [ ] Implement Alert confirmation + clearHistory call

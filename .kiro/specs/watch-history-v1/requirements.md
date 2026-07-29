# Watch History & Stats — v1.1 Requirements

## Overview

Users scan their local video files into FilmSort. Right now that data disappears into a
list with no memory of what they watched, when they watched it, or how much they've
consumed. This feature gives that history a home: a dedicated Profile tab that shows
every title marked as watched, total hours logged, a genre and anime breakdown, and a
set of earned badges — all stored locally, no account needed.

---

## Requirements

### R1 — Watch completion events

**R1.1** When a user watches a video past 92% of its duration (the existing `COMPLETED_FRACTION`),
FilmSort records a completion event: `mediaId`, `title`, `type` (movie/tv), `genres`,
`runtime` (minutes), `watchedAt` timestamp, and for TV episodes: `seasonNumber`, `episodeNumber`.

**R1.2** Each file plays exactly once per completion cycle. Rewatching the same file after
completion records a new event with a new timestamp (not a duplicate update).

**R1.3** A completion event is written to AsyncStorage under the key `@filmsort:watch_history`.

**R1.4** The watch history store must never grow above 5 000 events. When the cap is hit,
the oldest 500 events are pruned automatically.

---

### R2 — Profile tab

**R2.1** A fifth bottom-tab labelled **Profile** is added to the existing four tabs
(Movies, TV, Library, Scan). It uses a person/user icon.

**R2.2** The Profile tab is always accessible — no Pro gate, no account required.

**R2.3** The tab renders a **ProfileScreen** that is a single scrollable dark page
(background `#000000`) consistent with the rest of the app.

---

### R3 — Stats section

**R3.1** The profile screen shows a hero stat at the top: **total watch hours** (sum of
`runtime` across all completion events, displayed as `Xh Ym` or just `Xh` if minutes are 0).

**R3.2** Below the hero stat: total **films watched** count and total **episodes watched** count
as a paired stat row.

**R3.3** A **genre breakdown** section shows the user's top genres by count of completions,
displayed as a horizontal bar chart or ranked list (at least top 5, or all if fewer than 5).

**R3.4** If the user has any completions whose `genres` array contains `"Animation"` and
`type === 'tv'`, or whose `mediaId` maps to an anime title (detected via the existing
`isAnime` flag path or genre heuristic), a separate **Anime** stat block is shown:
episodes watched, hours watched as anime, and top anime genres.

**R3.5** Stats are computed on demand from the raw history array — no pre-aggregated
cache needed for v1.

---

### R4 — Watch history list

**R4.1** Below the stats, a chronological list titled **Recently Watched** shows the last 20
completions (most recent first), with poster thumbnail, title, type badge, and the date watched.

**R4.2** Tapping a history item navigates to the existing **Details** screen for that title
if the `mediaId` still exists in the library. If the item is no longer in the library,
the row is still shown but tapping does nothing (no crash).

**R4.3** An empty state is shown when no watch history exists yet ("Nothing watched yet.
Start playing a file to build your history.").

---

### R5 — Badges

**R5.1** Badges are computed from the watch history at render time — no separate badge
storage needed for v1.

**R5.2** The following badges must be implemented:

| Badge name       | Unlock condition                                         |
|------------------|----------------------------------------------------------|
| First Watch      | 1 completion (any type)                                  |
| Movie Binger     | 10 movies watched                                        |
| Marathon         | 25 movies watched                                        |
| Series Devotee   | 10 TV episodes watched                                   |
| Binge Machine    | 50 TV episodes watched                                   |
| Anime Freak      | 10 anime episodes watched                                |
| Otaku            | 50 anime episodes watched                                |
| Romance Lover    | 5 completions in the Romance genre                       |
| Thriller Seeker  | 5 completions in the Thriller or Mystery genre           |
| Night Owl        | 5 completions where `watchedAt` hour is between 22–04    |
| Century Club     | 100 total completions                                    |
| Time Sink        | 100 total watch hours logged                             |

**R5.3** Earned badges display with a coloured icon and label. Unearned badges are shown
as locked (greyed out) so users can see what they're working toward.

**R5.4** Badges are displayed in a horizontal scroll row or a 3-column grid on the
Profile screen, with earned badges sorted before locked ones.

---

### R6 — Marking watched manually

**R6.1** On the **Details** screen, a "Mark as Watched" button is present for titles that
have not yet triggered an automatic completion event.

**R6.2** Tapping the button records a completion event with `runtime` from `item.runtime`,
`watchedAt` set to now, and a `manual: true` flag. For TV shows, the manual mark applies
to the whole show (records one event per localFile in the library, up to a max of 24 to
prevent runaway writes for large series).

**R6.3** If a completion event already exists for a title (auto or manual), the button
changes to "Watched ✓" and is non-interactive.

---

### R7 — Non-functional requirements

**R7.1** All reads and writes are async and non-blocking. The ProfileScreen may show a
loading spinner for up to 500 ms while history is read from storage.

**R7.2** No new third-party libraries may be introduced. Charts / bars must be built with
plain React Native `View` components.

**R7.3** All new AsyncStorage keys use the `@filmsort:` namespace, not the legacy
`@cinescan:` namespace.

**R7.4** The feature must not modify the existing `watchProgressService` public API.
The completion hook is added in the VideoPlayer layer, calling a new
`watchHistoryService` separately.

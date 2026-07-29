# Google Account & Cloud Sync — v1.2 Requirements

## Overview

Phase 1 (v1.1) built a fully local watch history, stats engine, and badge system.
Phase 2 adds a Google account layer on top of it — "Continue with Google" lets users
back up everything they've already built, survive app reinstalls, and optionally share
their profile in the future. The local-first architecture from v1.1 is preserved: the
app always reads from and writes to local storage first. The cloud is a backup and
sync layer, not the primary data store.

**Prerequisite:** v1.1 must be fully shipped and validated before v1.2 is implemented.

---

## Requirements

### R1 — Google Sign-In

**R1.1** A "Continue with Google" button appears on the Profile screen (above the stats
section) when the user is signed out. It uses `@react-native-google-signin/google-signin`
(the standard Expo-compatible Google Sign-In library).

**R1.2** Sign-in is always optional. All local features (history, stats, badges) remain
fully functional without an account.

**R1.3** On successful sign-in, the user's Google display name, email, and profile photo
URL are stored locally in AsyncStorage under `@filmsort:account` and used to personalise
the Profile screen header.

**R1.4** If sign-in fails (network error, user cancels, Play Services unavailable),
the app continues normally with no account. A brief inline error message is shown on
the Profile screen — no `Alert` pop-up.

**R1.5** A signed-in user can sign out from Settings. Signing out clears the local
`@filmsort:account` key and disconnects from Firestore listeners. Local watch history
is NOT deleted on sign-out.

**R1.6** The `@filmsort:account` key stores:
```
{ uid: string, displayName: string, email: string, photoUrl?: string }
```

---

### R2 — Firebase / Firestore backend

**R2.1** The app uses **Firebase** (Firestore + Firebase Auth with Google Sign-In
credential). The Firestore path for a user's watch history is:

```
users/{uid}/watchHistory/{eventId}
```

Each document mirrors the `WatchEvent` type from v1.1 exactly. `eventId` = `WatchEvent.id`.

**R2.2** The app uses `@react-native-firebase/app` and `@react-native-firebase/firestore`
(the React Native Firebase SDK — not the web SDK — because this is a native app).

**R2.3** Firebase configuration (`google-services.json` for Android,
`GoogleService-Info.plist` for iOS) is added to the project. These files must be listed
in `.gitignore` and never committed.

**R2.4** Firestore security rules must enforce that a user can only read and write their
own `users/{uid}/**` documents. The rules file is included in the repo at
`firestore.rules` but applied manually via the Firebase console or CLI — not
auto-deployed by the app.

**R2.5** No Realtime Database, no Firebase Storage, no Cloud Functions required in v1.2.
Only Firestore and Firebase Auth.

---

### R3 — Initial sync on sign-in

**R3.1** When a user signs in for the first time (no existing cloud data), all existing
local `WatchEvent` records are uploaded to Firestore in a batched write. Batch size is
capped at 500 documents per Firestore batch (Firestore limit).

**R3.2** When a user signs in on a device that already has cloud data, a **merge** is
performed:
- Local events not in the cloud → uploaded.
- Cloud events not in local storage → downloaded and prepended to local history.
- Events present in both (matched by `WatchEvent.id`) → cloud version wins (newer
  `watchedAt` timestamp takes precedence).

**R3.3** The initial sync runs in the background after sign-in. A subtle loading
indicator (not a blocking modal) on the Profile screen shows "Syncing…" while active.

**R3.4** If the initial sync fails (network loss mid-way), a pending-sync flag
`@filmsort:sync_pending` is stored. On the next app launch while signed in,
the sync is retried automatically.

---

### R4 — Ongoing real-time sync

**R4.1** After the initial sync completes, every new `WatchEvent` written by
`watchHistoryService.recordCompletion()` is also written to Firestore if the user is
signed in. The Firestore write is fire-and-forget — local write always completes first.

**R4.2** A Firestore real-time listener (`onSnapshot`) is active while the user is
signed in. New events written from another device are merged into local storage
automatically when received.

**R4.3** The real-time listener is started in `App.tsx` after sign-in is confirmed and
torn down (`.unsubscribe()`) when the user signs out or the app is backgrounded for
more than 30 minutes.

**R4.4** The listener must not cause duplicate events in local history. Before inserting
a cloud event locally, check if `WatchEvent.id` already exists in local storage.

---

### R5 — Profile screen: account section

**R5.1** When signed out, the top of the Profile screen shows a "Back up your history"
card with:
- Headline: "Save your progress"
- Body: "Sign in to back up your watch history, badges, and stats across devices."
- "Continue with Google" button (Google branded: white background, Google `G` logo,
  dark text)

**R5.2** When signed in, the top of the Profile screen shows a compact account header:
- Profile photo (circular, 48×48) — or initials avatar if no photo
- Display name (white, bold)
- Email address (`#a1a1aa`, smaller)
- "Synced" status badge with a green dot when last sync was successful, or
  "Sync pending" with an amber dot when `@filmsort:sync_pending` is set
- No sign-in button

**R5.3** The account section sits above the hero stats in the existing ProfileScreen
`ScrollView`. It is the first thing the user sees on the Profile tab.

---

### R6 — Settings: account management

**R6.1** A new "Account" section is added to `SettingsScreen` (between the existing Pro
section and About section).

**R6.2** When signed out: shows a single "Sign in with Google" row with a Google icon.

**R6.3** When signed in: shows:
- Account info row (avatar + name + email, non-interactive display)
- "Sign Out" row (destructive — red text) with a confirmation `Alert`

**R6.4** Sign-out confirmation text: "You will be signed out. Your local watch history
will be kept. You can sign back in at any time."

---

### R7 — Data & privacy

**R7.1** The only data sent to Firestore is the `WatchEvent` array. No library metadata
(file paths, URIs, `localFile` data), no device identifiers, no Pro status, and no scan
cache data is ever uploaded.

**R7.2** The Privacy Policy screen (`PrivacyPolicyScreen.tsx`) must be updated to
disclose the Google account and Firestore data collection before v1.2 ships to the store.

**R7.3** Users who never sign in have zero data sent to any external service (same as v1.1).

---

### R8 — Non-functional requirements

**R8.1** `@react-native-google-signin/google-signin` and `@react-native-firebase/*`
require a native development build. No new Expo Go compatibility is needed for these
packages (they are native-only by design).

**R8.2** All Firestore writes are non-blocking — they must never delay or block a local
write.

**R8.3** The app must handle Firestore being unavailable (offline, quota exceeded) without
crashing. All errors are caught, logged, and surface only as a "Sync pending" status in
the UI.

**R8.4** Firebase project ID, API key, and related config values must be read from
environment variables (via `src/config/env.ts`) for builds, not hardcoded in source.

**R8.5** The entire Google Sign-In and sync stack can be disabled with a single
`ENABLE_CLOUD_SYNC = false` flag in `src/config/env.ts`. When disabled, the app
behaves identically to v1.1.

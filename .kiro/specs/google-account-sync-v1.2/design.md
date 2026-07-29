# Google Account & Cloud Sync — v1.2 Design

## Architecture Overview

The local-first principle from v1.1 is never broken. Every write path hits
AsyncStorage first and Firestore second, asynchronously. If Firestore fails,
the local write is still committed and a sync-pending flag is set.

```
┌──────────────────────────────────────────────────────────────────────┐
│  App.tsx                                                              │
│    ├── AccountProvider     ← new: Google Sign-In state               │
│    └── SyncProvider        ← new: Firestore listener lifecycle       │
└──────────────────────────────────────────────────────────────────────┘

Profile Screen (v1.1 base, extended)
  ├── <AccountHeader />        ← signed-out: CTA card | signed-in: avatar+name
  ├── <HeroStats />            (unchanged from v1.1)
  ├── <GenreChart />           (unchanged)
  ├── <AnimeBlock />           (unchanged)
  ├── <BadgeSection />         (unchanged)
  └── <RecentlyWatchedList />  (unchanged)

Settings Screen (v1.1 Data section extended)
  └── new "Account" section → sign-in row OR account info + sign-out

Write path (recordCompletion):
  watchHistoryService.recordCompletion()    ← AsyncStorage, unchanged
       └──► syncService.pushEvent(event)    ← Firestore, fire-and-forget

Read path (initial sync on sign-in):
  syncService.initialSync(uid)
       └──► merge local ↔ cloud events
       └──► write merged result to AsyncStorage
       └──► batch-upload local-only events to Firestore
```

---

## New Packages

Two new native packages are required. Both need a development build (`expo run:android`
or an EAS build — they do not work in Expo Go).

```json
"@react-native-google-signin/google-signin": "^13.x",
"@react-native-firebase/app": "^21.x",
"@react-native-firebase/firestore": "^21.x",
"@react-native-firebase/auth": "^21.x"
```

The `expo-build-properties` plugin in `app.json` must be configured to include the
native Firebase gradle/cocoapods dependencies.

`google-services.json` (Android) and `GoogleService-Info.plist` (iOS) must be placed
at the project root and added to `.gitignore`.

---

## New Files

### `src/services/authService.ts`

Thin wrapper around Google Sign-In and Firebase Auth. No UI here.

```typescript
export interface FilmSortAccount {
  uid: string;
  displayName: string;
  email: string;
  photoUrl?: string;
}

export const authService = {
  async signInWithGoogle(): Promise<FilmSortAccount>,
  async signOut(): Promise<void>,
  async getStoredAccount(): Promise<FilmSortAccount | null>,   // reads @filmsort:account
  async getCurrentFirebaseUser(): Promise<FirebaseUser | null>,
  onAuthStateChanged(cb: (account: FilmSortAccount | null) => void): () => void,
};
```

`signInWithGoogle()` flow:
1. `GoogleSignin.configure()` with the web client ID from `src/config/env.ts`
2. `await GoogleSignin.signIn()` → get `idToken`
3. `firebase.auth().signInWithCredential(GoogleAuthProvider.credential(idToken))`
4. Build `FilmSortAccount` from Firebase user object
5. Persist to `@filmsort:account` via `AsyncStorage.setItem`
6. Return the account

`signOut()` flow:
1. `GoogleSignin.signOut()`
2. `firebase.auth().signOut()`
3. `AsyncStorage.removeItem('@filmsort:account')`

---

### `src/services/syncService.ts`

All Firestore read/write logic lives here. `authService` and `watchHistoryService`
are its only dependencies.

```typescript
export const syncService = {
  /**
   * Called once after sign-in.
   * Merges local ↔ cloud events, resolves conflicts by watchedAt timestamp.
   * Sets @filmsort:sync_pending on failure.
   */
  async initialSync(uid: string): Promise<void>,

  /**
   * Upload a single new event to Firestore.
   * Fire-and-forget — called by watchHistoryService after local write.
   * Silently sets @filmsort:sync_pending on failure.
   */
  async pushEvent(uid: string, event: WatchEvent): Promise<void>,

  /**
   * Start a Firestore onSnapshot listener on users/{uid}/watchHistory.
   * Merges incoming events into local storage (deduplicates by id).
   * Returns the unsubscribe function.
   */
  startListener(uid: string): () => void,

  /**
   * Retry any pending sync. Called on app launch when @filmsort:sync_pending is set.
   */
  async retryPendingSync(uid: string): Promise<void>,
};
```

**Initial sync merge algorithm:**
```
localEvents  = await watchHistoryService.getHistory()
cloudSnapshot = await firestore.collection('users/{uid}/watchHistory').get()
cloudEvents   = cloudSnapshot.docs.map(d => d.data() as WatchEvent)

localById  = Map(localEvents.map(e => [e.id, e]))
cloudById  = Map(cloudEvents.map(e => [e.id, e]))

// Events only in cloud → add to local
toAddLocally = cloudEvents.filter(e => !localById.has(e.id))

// Events in both → keep the one with newer watchedAt
conflicts = cloudEvents.filter(e => localById.has(e.id))
for conflict in conflicts:
  local = localById.get(conflict.id)
  winner = conflict.watchedAt > local.watchedAt ? conflict : local
  localById.set(conflict.id, winner)

// Events only in local → upload to cloud (batch write, 500 per batch)
toUpload = localEvents.filter(e => !cloudById.has(e.id))

// Write merged set back to AsyncStorage
merged = [...toAddLocally, ...Array.from(localById.values())]
         .sort((a,b) => b.watchedAt.localeCompare(a.watchedAt))  // newest first
await watchHistoryService._replaceAll(merged)

// Upload missing events to Firestore
await batchWrite(uid, toUpload)
```

`batchWrite` splits `toUpload` into chunks of 500 and runs each as a `WriteBatch`.

---

### `src/context/AccountContext.tsx`

Global account state. Mirrors `ProContext` pattern.

```typescript
export interface AccountContextValue {
  loaded: boolean;
  account: FilmSortAccount | null;
  isSyncing: boolean;
  syncPending: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
}

export function AccountProvider({ children }): JSX.Element
export function useAccount(): AccountContextValue
```

`AccountProvider` lifecycle:
1. On mount: reads `@filmsort:account` from storage → sets `account` state
2. Calls `authService.onAuthStateChanged` to stay in sync with Firebase's own auth state
3. If account is set and `@filmsort:sync_pending` is set → calls `syncService.retryPendingSync`
4. `signIn()`: calls `authService.signInWithGoogle()`, sets account state, starts
   `syncService.initialSync` (non-blocking), then `syncService.startListener`
5. `signOut()`: tears down Firestore listener, calls `authService.signOut()`, clears state

The Firestore listener unsubscribe function is held in a `useRef` inside the provider
and called in the `signOut` flow and the `useEffect` cleanup.

---

### `src/components/AccountHeader.tsx`

Stateless presentational component. Receives props from `ProfileScreen`.

```
Signed-out state:
┌─────────────────────────────────────────────┐
│  💾  Save your progress                     │
│  Sign in to back up your watch history,     │
│  badges, and stats across devices.          │
│                                             │
│  [G  Continue with Google]                  │
│  (error message line, hidden unless error)  │
└─────────────────────────────────────────────┘

Signed-in state:
┌─────────────────────────────────────────────┐
│  [photo]  Display Name          ● Synced    │
│           email@gmail.com                   │
└─────────────────────────────────────────────┘
```

The Google button is styled per Google's branding guidelines:
- White background (`#ffffff`)
- `borderRadius: 12`
- Google `G` SVG icon (included as a local asset) + "Continue with Google" in dark text
- Height: 50

Props:
```typescript
interface AccountHeaderProps {
  account: FilmSortAccount | null;
  isSyncing: boolean;
  syncPending: boolean;
  signingIn: boolean;
  signInError: string | null;
  onSignIn: () => void;
}
```

---

## Modified Files

### `src/storage/watchHistoryService.ts` (v1.1 file, extended)

Add one new internal method (not exported in the public API):
```typescript
// Internal: used by syncService.initialSync only
_replaceAll(events: WatchEvent[]): Promise<void>
```

Add an optional hook that `syncService` registers:
```typescript
// After recordCompletion writes locally, call this if registered
let _onEventWritten: ((event: WatchEvent) => void) | null = null;

export function setOnEventWritten(cb: ((event: WatchEvent) => void) | null): void {
  _onEventWritten = cb;
}
```

`AccountProvider` calls `setOnEventWritten` with a function that calls
`syncService.pushEvent(uid, event)` when the user is signed in.
This keeps `watchHistoryService` free of any Firestore dependency.

### `src/screens/ProfileScreen.tsx` (v1.1 file, extended)

- Import `useAccount`
- Insert `<AccountHeader />` as the first element inside the `ScrollView`, before `<HeroStats />`
- Pass `account`, `isSyncing`, `syncPending`, `signingIn`, `signInError`, and `onSignIn` as props
- The rest of the screen (stats, badges, history) is unchanged

### `src/screens/SettingsScreen.tsx` (v1.1 file, extended)

Add an "Account" section between the existing Pro section and About section:

```tsx
<Animated.View entering={FadeInDown.delay(20).duration(340)}>
  <SectionHeader label="Account" />
  {account ? (
    <View style={styles.card}>
      <AccountInfoRow account={account} />
      <View style={styles.divider} />
      <DestructiveRow
        icon={<LogOut size={16} color="#f87171" />}
        label="Sign Out"
        onPress={handleSignOut}
      />
    </View>
  ) : (
    <View style={styles.card}>
      <NavRow
        icon={<GoogleIcon />}
        label="Sign in with Google"
        subtitle="Back up your history and badges"
        onPress={handleSignIn}
        tint="#4285F4"
      />
    </View>
  )}
</Animated.View>
```

`handleSignOut` shows a confirmation `Alert` then calls `signOut()` from `useAccount`.

### `src/navigation/RootNavigator.tsx`

No changes needed. The Profile tab is already part of `TabNavigator` from v1.1.

### `App.tsx`

Wrap the existing provider tree with `AccountProvider`:
```tsx
<AccountProvider>
  <ProProvider>
    ...
  </ProProvider>
</AccountProvider>
```

`AccountProvider` is outermost because `ProProvider` doesn't depend on account state,
but future features might. The sync listener and retry logic live inside `AccountProvider`.

### `app.json` — new plugins

```json
"plugins": [
  "expo-iap",
  "@react-native-google-signin/google-signin",
  "@react-native-firebase/app",
  "expo-video",
  ...
]
```

### `src/config/env.ts` (existing file, extended)

Add:
```typescript
export const GOOGLE_WEB_CLIENT_ID   = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
export const FIREBASE_PROJECT_ID    = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '';
export const ENABLE_CLOUD_SYNC      = process.env.EXPO_PUBLIC_ENABLE_CLOUD_SYNC !== 'false';
```

### `firestore.rules` (new file at project root)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

---

## AsyncStorage Key Summary (v1.2 additions)

| Key                       | Owner           | Format                              |
|---------------------------|-----------------|-------------------------------------|
| `@filmsort:account`       | authService     | `FilmSortAccount` JSON              |
| `@filmsort:sync_pending`  | syncService     | `"1"` string (presence = pending)   |

All v1.1 keys (`@filmsort:watch_history`, `@filmsort:pro_unlocked`, etc.) are unchanged.

---

## Error Handling Strategy

| Scenario | Behaviour |
|---|---|
| Google Sign-In cancelled by user | `signIn()` returns without error, no state change |
| Google Play Services unavailable | Inline error in `AccountHeader`: "Google Sign-In is not available on this device." |
| Firebase Auth fails | Inline error in `AccountHeader`: "Sign-in failed. Please try again." |
| Firestore write fails (pushEvent) | Set `@filmsort:sync_pending`, log warning, no crash |
| Initial sync fails mid-way | Set `@filmsort:sync_pending`, local data intact, retry on next launch |
| onSnapshot listener disconnects | Silently reconnects (Firestore SDK handles this automatically) |
| User is offline | App runs fully locally; sync pending flag set when online writes fail |

---

## Setup Steps (outside of code — documented here for the implementer)

These steps are manual and must be done before the feature can work:

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Add Android app with package `app.filmsorter.filmsort` → download `google-services.json` to project root
3. Add iOS app with bundle ID `app.filmsorter.filmsort` → download `GoogleService-Info.plist` to project root
4. Enable **Google Sign-In** under Firebase Authentication → Sign-in methods
5. Create Firestore database in production mode
6. Apply `firestore.rules` from the project root
7. Copy the **Web Client ID** from Google Cloud Console → OAuth 2.0 credentials → Web client (auto-created by Firebase) → set as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `.env`
8. Add `google-services.json` and `GoogleService-Info.plist` to `.gitignore`
9. Run `expo prebuild --clean` then `expo run:android` / `expo run:ios`

---

## Phase 3 Hooks (not in v1.2, design leaves room)

- `WatchEvent` shape is already Firestore-document-ready. A "Share Profile" feature
  in v1.3 could make `users/{uid}/profile` public-readable without changing the
  watch history security rules.
- The `FilmSortAccount.uid` can be the foreign key for a future friends/leaderboard
  feature without any migration.
- The `ENABLE_CLOUD_SYNC = false` flag makes A/B testing the sync feature trivial
  before full rollout.

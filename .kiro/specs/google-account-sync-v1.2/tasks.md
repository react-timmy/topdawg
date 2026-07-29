# Google Account & Cloud Sync — v1.2 Tasks

**Prerequisite:** All 10 tasks from `watch-history-v1` must be completed and shipped
before starting any task here.

---

## Task 1 — Install and configure native packages

Install the three new native packages and update `app.json`, `.gitignore`, and
`src/config/env.ts`. No new application code in this task — setup only.

- Add to `package.json` dependencies:
  - `@react-native-google-signin/google-signin` (latest stable, pin exact version)
  - `@react-native-firebase/app` (latest stable, pin exact version)
  - `@react-native-firebase/firestore` (same major as app)
  - `@react-native-firebase/auth` (same major as app)
- Add to `app.json` plugins array:
  ```json
  "@react-native-google-signin/google-signin",
  "@react-native-firebase/app"
  ```
  Place them before `expo-iap`.
- Extend `src/config/env.ts` with:
  ```typescript
  export const GOOGLE_WEB_CLIENT_ID  = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
  export const FIREBASE_PROJECT_ID   = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '';
  export const ENABLE_CLOUD_SYNC     = process.env.EXPO_PUBLIC_ENABLE_CLOUD_SYNC !== 'false';
  ```
- Add to `.gitignore`:
  ```
  google-services.json
  GoogleService-Info.plist
  ```
- Add `firestore.rules` to the project root with the security rules from design.md.
- Add placeholder `.env.example` with the required keys (no real values):
  ```
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
  EXPO_PUBLIC_FIREBASE_PROJECT_ID=
  EXPO_PUBLIC_ENABLE_CLOUD_SYNC=true
  ```
- Do NOT run `npm install` or `expo prebuild` — just write the config files. The user
  will run the native build manually.

Sub-tasks:
- [ ] Read `src/config/env.ts` to understand existing pattern, then extend it
- [ ] Add new dependencies to `package.json` (no install)
- [ ] Add plugins to `app.json`
- [ ] Update `.gitignore`
- [ ] Create `firestore.rules`
- [ ] Create `.env.example`

---

## Task 2 — `authService.ts`

Create `src/services/authService.ts`.

Implement the full Google Sign-In + Firebase Auth flow as specified in design.md.

- Import `GoogleSignin`, `statusCodes` from `@react-native-google-signin/google-signin`
- Import `auth` from `@react-native-firebase/auth`
- Use `GOOGLE_WEB_CLIENT_ID` and `ENABLE_CLOUD_SYNC` from `src/config/env.ts`
- Guard all exports: if `ENABLE_CLOUD_SYNC` is false, every method is a no-op or returns `null`
- `signInWithGoogle()`:
  1. Call `GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID })`
  2. `await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })`
  3. `const userInfo = await GoogleSignin.signIn()`
  4. Build `GoogleAuthProvider.credential(userInfo.data.idToken)`
  5. `await auth().signInWithCredential(credential)`
  6. Build `FilmSortAccount` from Firebase user
  7. Persist to `@filmsort:account`
  8. Return the account
  - Handle `statusCodes.SIGN_IN_CANCELLED` → return `null` (not an error)
  - Handle `statusCodes.PLAY_SERVICES_NOT_AVAILABLE` → throw with message "Google Play Services is not available on this device."
  - All other errors → rethrow as-is
- `signOut()`:
  1. `await GoogleSignin.signOut()`
  2. `await auth().signOut()`
  3. `await AsyncStorage.removeItem('@filmsort:account')`
- `getStoredAccount()`: reads and JSON-parses `@filmsort:account`, returns null on error
- `getCurrentFirebaseUser()`: returns `auth().currentUser`
- `onAuthStateChanged(cb)`: wraps `auth().onAuthStateChanged`, maps `FirebaseAuthTypes.User | null` to `FilmSortAccount | null`, returns unsubscribe

Sub-tasks:
- [ ] Define `FilmSortAccount` interface and export it
- [ ] Implement `signInWithGoogle` with all error cases
- [ ] Implement `signOut`
- [ ] Implement `getStoredAccount` and `getCurrentFirebaseUser`
- [ ] Implement `onAuthStateChanged`
- [ ] Add `ENABLE_CLOUD_SYNC` guard to all methods

---

## Task 3 — Extend `watchHistoryService.ts`

Modify the existing `src/storage/watchHistoryService.ts` (built in v1.1 Task 1).

Add two new exports without changing any existing public API:

- `_replaceAll(events: WatchEvent[]): Promise<void>` — overwrites the entire history
  array in AsyncStorage. Used only by `syncService.initialSync`. Prefixed `_` to
  signal it is internal.
- `setOnEventWritten(cb: ((event: WatchEvent) => void) | null): void` — registers a
  callback invoked after every successful `recordCompletion` write. `AccountProvider`
  uses this to push new events to Firestore without creating a direct dependency from
  watchHistoryService to Firestore.

In `recordCompletion`, after the `await writeAll(...)` line, add:
```typescript
if (_onEventWritten) {
  _onEventWritten(newEvent);
}
```

Sub-tasks:
- [ ] Read the current `watchHistoryService.ts` to locate the `writeAll` call in `recordCompletion`
- [ ] Add module-level `_onEventWritten` variable
- [ ] Export `setOnEventWritten`
- [ ] Call `_onEventWritten` after successful write in `recordCompletion`
- [ ] Implement and export `_replaceAll`

---

## Task 4 — `syncService.ts`

Create `src/services/syncService.ts`.

- Import `firestore` from `@react-native-firebase/firestore`
- Import `watchHistoryService` from `../storage/watchHistoryService`
- Import `ENABLE_CLOUD_SYNC` from `../config/env.ts`
- Guard all exports with `ENABLE_CLOUD_SYNC`

Implement `initialSync(uid)`:
- Fetch local history and Firestore snapshot concurrently with `Promise.all`
- Apply the merge algorithm from design.md exactly
- Call `watchHistoryService._replaceAll(merged)` with the merged result
- Batch-upload local-only events using `WriteBatch` (500 per batch)
- On any error: `await AsyncStorage.setItem('@filmsort:sync_pending', '1')` then rethrow
- On success: `await AsyncStorage.removeItem('@filmsort:sync_pending')`

Implement `pushEvent(uid, event)`:
- Write `event` to `firestore().collection('users').doc(uid).collection('watchHistory').doc(event.id).set(event)`
- On error: `AsyncStorage.setItem('@filmsort:sync_pending', '1')` and `console.warn` — do NOT rethrow

Implement `startListener(uid)`:
- `firestore().collection('users').doc(uid).collection('watchHistory').onSnapshot(snapshot => { ... })`
- For each `DocumentChange` of type `'added'`, check if the event ID exists locally. If not, prepend it to local history via `watchHistoryService._replaceAll`.
- Return the unsubscribe function

Implement `retryPendingSync(uid)`:
- Check if `@filmsort:sync_pending` is set
- If yes, call `initialSync(uid)` again
- If no, return immediately

Sub-tasks:
- [ ] Implement `initialSync` with merge algorithm and batch write
- [ ] Implement `pushEvent` (fire-and-forget with pending flag on error)
- [ ] Implement `startListener` with deduplication
- [ ] Implement `retryPendingSync`
- [ ] Add `ENABLE_CLOUD_SYNC` guard to all methods

---

## Task 5 — `AccountContext.tsx`

Create `src/context/AccountContext.tsx`.

Follow the exact structure of `ProContext.tsx` as the pattern (same file layout,
same hook export shape).

```typescript
interface AccountContextValue {
  loaded: boolean;
  account: FilmSortAccount | null;
  isSyncing: boolean;
  syncPending: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
}
```

Provider lifecycle (inside `AccountProvider`):
1. On mount:
   - Read stored account via `authService.getStoredAccount()` → set state
   - Subscribe to `authService.onAuthStateChanged` → update `account` state
   - If account loaded and `@filmsort:sync_pending === '1'`, call `syncService.retryPendingSync(account.uid)` in background
   - Call `setOnEventWritten` from `watchHistoryService` with a function that calls `syncService.pushEvent(account.uid, event)` when `account !== null`
2. `signIn()`:
   - Set `isSyncing = true`
   - Call `authService.signInWithGoogle()` — if it returns `null`, do nothing (user cancelled)
   - On success: set `account` state, call `syncService.initialSync(uid)` (non-blocking, updates `isSyncing` when done), start `syncService.startListener(uid)`, store unsubscribe in ref
   - On error: set `signInError` state (surfaced via `signIn` throwing, caught in `AccountHeader`)
3. `signOut()`:
   - Call unsubscribe ref (Firestore listener)
   - Call `authService.signOut()`
   - Call `setOnEventWritten(null)`
   - Clear `account` and `syncPending` state
4. Cleanup (`useEffect` return): call unsubscribe ref
5. `refreshAccount()`: re-reads `@filmsort:account` from storage and updates state

Sub-tasks:
- [ ] Define context, default value, and types
- [ ] Implement mount effect (read stored account, auth state subscription, pending sync retry)
- [ ] Implement `signIn` with isSyncing state management
- [ ] Implement `signOut` with listener cleanup
- [ ] Implement `refreshAccount`
- [ ] Export `AccountProvider` and `useAccount` hook

---

## Task 6 — `AccountHeader` component

Create `src/components/AccountHeader.tsx`.

**Signed-out card:**
- Background: `rgba(255,255,255,0.04)`, border: `rgba(255,255,255,0.07)`, `borderRadius: 16`
- Top row: cloud/save icon (48×48 ring, same style as ProContext icon rings) + "Save your progress" heading
- Body text: "Sign in to back up your watch history, badges, and stats across devices."
- Google button:
  - White background (`#ffffff`), `borderRadius: 12`, height 50, full width
  - Left: `G` letter in Google blue (`#4285F4`) as `Text` with `fontWeight: '800'` — no SVG asset needed
  - Label: "Continue with Google" in `#1a1a1a`, `fontWeight: '700'`
  - Shows `ActivityIndicator` (black) when `signingIn === true`
- Error line: `#f87171` text below the button, hidden when `signInError === null`

**Signed-in card:**
- Single-row layout: avatar | name+email | sync badge
- Avatar: 48×48 circle, `borderRadius: 24`
  - If `account.photoUrl`: `<Image source={{ uri: account.photoUrl }} />`
  - Else: circle with `backgroundColor: '#27272a'` and initials (first letter of display name) in white
- Name: `#ffffff`, `fontSize: 15`, `fontWeight: '700'`
- Email: `#71717a`, `fontSize: 12`
- Sync badge (right side):
  - `isSyncing === true`: small `ActivityIndicator` + "Syncing…" in `#a1a1aa`
  - `syncPending === true`: amber dot (`#f59e0b`) + "Sync pending"
  - Otherwise: green dot (`#4ade80`) + "Synced"

Props interface:
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

Sub-tasks:
- [ ] Signed-out card layout and Google button
- [ ] Signed-in card layout with avatar (photo + initials fallback)
- [ ] Sync status badge (syncing / pending / synced states)
- [ ] Error message line below Google button
- [ ] StyleSheet

---

## Task 7 — Update `ProfileScreen.tsx`

Modify `src/screens/ProfileScreen.tsx` (built in v1.1 Tasks 4–6).

- Import `useAccount` from `../context/AccountContext`
- Import `AccountHeader` from `../components/AccountHeader`
- Add state: `const [signingIn, setSigningIn] = useState(false)` and `const [signInError, setSignInError] = useState<string | null>(null)`
- Destructure `account`, `isSyncing`, `syncPending`, `signIn` from `useAccount()`
- Insert `<AccountHeader />` as the **first** child of the `ScrollView`, before the existing `HeroStats` block:
  ```tsx
  <AccountHeader
    account={account}
    isSyncing={isSyncing}
    syncPending={syncPending}
    signingIn={signingIn}
    signInError={signInError}
    onSignIn={async () => {
      setSigningIn(true);
      setSignInError(null);
      try {
        await signIn();
      } catch (err: unknown) {
        setSignInError(
          String((err as any)?.message ?? 'Sign-in failed. Please try again.')
        );
      } finally {
        setSigningIn(false);
      }
    }}
  />
  ```
- Everything else (stats, badges, history) is untouched.

Sub-tasks:
- [ ] Read ProfileScreen.tsx to locate the ScrollView and first child
- [ ] Add `useAccount` hook and new local state
- [ ] Insert `<AccountHeader />` with all props
- [ ] Verify no TypeScript errors

---

## Task 8 — Update `SettingsScreen.tsx`

Modify `src/screens/SettingsScreen.tsx`.

- Import `useAccount` and `FilmSortAccount` from `../context/AccountContext`
- Destructure `account`, `signIn`, `signOut` from `useAccount()`
- Add local state: `signingIn`, `signingOut`
- Add `handleSettingsSignIn` and `handleSettingsSignOut` handlers:
  - `handleSettingsSignOut`: shows `Alert.alert('Sign Out', '...confirmation text...', [{text: 'Cancel'}, {text: 'Sign Out', style: 'destructive', onPress: doSignOut}])`
  - `doSignOut`: set `signingOut = true`, call `signOut()`, set `signingOut = false`
- Insert a new "Account" `<Animated.View>` block between the Pro section and the About section, with `entering={FadeInDown.delay(20).duration(340)}`:
  - Signed-out: a card with a single `NavRow` — icon: Google `G` text icon, label "Sign in with Google", subtitle "Back up your history and badges", `onPress: handleSettingsSignIn`
  - Signed-in: a card with `AccountInfoRow` (non-interactive display row: avatar + name + email) + divider + `DestructiveRow` "Sign Out"
- Add `AccountInfoRow` as a local component in the file:
  - Shows a 36×36 circular avatar (photo or initials), display name in white, email in `#52525b`
  - Not pressable, no chevron

Sub-tasks:
- [ ] Read SettingsScreen.tsx to find the insertion point between Pro and About
- [ ] Add `useAccount` and sign-in/sign-out handlers
- [ ] Add Account section JSX (signed-out and signed-in states)
- [ ] Add `AccountInfoRow` local component
- [ ] Verify the existing Pro section and Data section are untouched

---

## Task 9 — Wire `AccountProvider` into `App.tsx`

Modify `src/App.tsx` (the project root `App.tsx`).

- Import `AccountProvider` from `./src/context/AccountContext`
- Wrap the existing provider tree:
  ```tsx
  <AccountProvider>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider ...>
        ...
        <NotificationProvider>
          <ProProvider>
            ...
          </ProProvider>
        </NotificationProvider>
        ...
      </SafeAreaProvider>
    </GestureHandlerRootView>
  </AccountProvider>
  ```
  `AccountProvider` wraps everything. `GestureHandlerRootView` must remain outermost
  within `AccountProvider`.

Sub-tasks:
- [ ] Read App.tsx to locate the existing provider nesting
- [ ] Import `AccountProvider`
- [ ] Wrap at the correct level (outside `GestureHandlerRootView` is wrong — wrap inside it, wrapping `NotificationProvider` and `ProProvider`)
- [ ] Verify no TypeScript errors on the JSX tree

---

## Task 10 — Update Privacy Policy content

Modify `src/legal/legalContent.ts` to add a cloud sync and Google Sign-In data
collection disclosure.

- Read the current file to understand its structure
- Add a new section to the privacy policy content covering:
  1. What data is collected (display name, email, UID, watch history events — no file paths, no device identifiers)
  2. Where it is stored (Google Firebase / Firestore, hosted by Google)
  3. That sign-in is optional and the app works without it
  4. How to delete it (sign in, go to Settings → Account → Sign Out, then email support for full deletion)
  5. Link to Google's privacy policy: `https://policies.google.com/privacy`
- The new section should use the same format (same heading style, same string concatenation
  or template literal pattern) as the existing sections.
- Do NOT change any existing section content — only append the new section.

Sub-tasks:
- [ ] Read `src/legal/legalContent.ts` to understand the content format
- [ ] Write the new "Cloud Account & Data Sync" section
- [ ] Append it without modifying existing content

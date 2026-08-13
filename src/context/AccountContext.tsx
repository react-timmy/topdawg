/**
 * AccountContext.tsx
 *
 * Global account state for the v1.2 Google Sign-In + cloud sync feature.
 * Mirrors the ProContext pattern: provider wraps the app, hook exposes state.
 *
 * Lifecycle:
 *  1. Mount: reads stored account, subscribes to Firebase auth state.
 *  2. If account + sync_pending → retryPendingSync in background.
 *  3. Registers push hooks:
 *       - setOnEventWritten    → pushes every new WatchEvent to Firestore
 *       - setOnProfileSaved    → pushes profile edits to Firestore
 *       - setOnPosterResolved  → pushes poster cache entries to Firestore
 *       - setOnWatchlistChanged → pushes watchlist add/remove to Firestore
 *       - setOnStarChanged     → pushes starred/unstarred library items to Firestore
 *  4. signIn(): Google Sign-In → initialSync (profile + memories + watchlist + history) → startListener.
 *  5. signOut(): tears down listener, clears account, removes all push hooks.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService, FilmSortAccount } from '../services/authService';
import { syncService, PosterEntry } from '../services/syncService';
import { setPro } from '../storage/proStatusService';
import { setOnEventWritten, setOnPosterResolved } from '../storage/watchHistoryService';
import { setOnProfileSaved, profileService } from '../storage/profileService';
import { setOnWatchlistChanged } from '../storage/watchlistService';
import { setOnStarChanged } from '../storage/asyncStorage';
import { cloudStarredService } from '../storage/cloudStarredService';
import { ENABLE_CLOUD_SYNC } from '../config/env';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AccountContextValue {
  /** True once the initial AsyncStorage read has completed. */
  loaded: boolean;
  account: FilmSortAccount | null;
  /** True while initialSync is running after sign-in. */
  isSyncing: boolean;
  /** True when @filmsort:sync_pending is set (a previous sync failed). */
  syncPending: boolean;
  /** Timestamp of last successful sync (ISO string), or null if never synced. */
  lastSyncedAt: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  /** Triggers a full sync if more than 30 minutes have passed since last sync. */
  syncIfNeeded: () => Promise<void>;
}

const SYNC_PENDING_KEY = '@filmsort:sync_pending';
const LAST_SYNCED_AT_KEY = '@filmsort:last_synced_at';
const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// ─── Context ──────────────────────────────────────────────────────────────────

const AccountContext = createContext<AccountContextValue>({
  loaded: false,
  account: null,
  isSyncing: false,
  syncPending: false,
  lastSyncedAt: null,
  signIn: async () => {},
  signOut: async () => {},
  refreshAccount: async () => {},
  syncIfNeeded: async () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [account, setAccount] = useState<FilmSortAccount | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // Holds the Firestore listener unsubscribe fn — torn down on sign-out
  const listenerUnsubRef = useRef<(() => void) | null>(null);

  // ── Register / deregister the event push hook ───────────────────────────────
  const registerEventHook = useCallback((uid: string | null) => {
    if (!ENABLE_CLOUD_SYNC || !uid) {
      setOnEventWritten(null);
      return;
    }
    setOnEventWritten((event) => {
      void syncService.pushEvent(uid, event);
    });
  }, []);

  // ── Register / deregister the profile push hook ──────────────────────────────
  const registerProfileHook = useCallback((uid: string | null) => {
    if (!ENABLE_CLOUD_SYNC || !uid) {
      setOnProfileSaved(null);
      return;
    }
    setOnProfileSaved((profile) => {
      void syncService.pushProfile(uid, profile);
    });
  }, []);

  // ── Register / deregister the poster push hook ──────────────────────────────
  const registerPosterHook = useCallback((uid: string | null) => {
    if (!ENABLE_CLOUD_SYNC || !uid) {
      setOnPosterResolved(null);
      return;
    }
    setOnPosterResolved((event) => {
      if (!event.posterUrl) return;
      const entry: PosterEntry = {
        mediaId: event.mediaId,
        title: event.title,
        type: event.type,
        posterUrl: event.posterUrl,
        firstWatchedAt: event.watchedAt,
        updatedAt: event.watchedAt,
      };
      void syncService.pushPoster(uid, entry);
    });
  }, []);

  // ── Register / deregister the watchlist push hook ────────────────────────────
  const registerWatchlistHook = useCallback((uid: string | null) => {
    if (!ENABLE_CLOUD_SYNC || !uid) {
      setOnWatchlistChanged(null);
      return;
    }
    setOnWatchlistChanged((event) => {
      if (event.action === 'add') {
        void syncService.pushWatchlistAdd(uid, event.item);
      } else {
        void syncService.pushWatchlistRemove(uid, event.id);
      }
    });
  }, []);

  // ── Register / deregister the starred push hook ──────────────────────────────
  const registerStarHook = useCallback((uid: string | null) => {
    if (!ENABLE_CLOUD_SYNC || !uid) {
      setOnStarChanged(null);
      return;
    }
    setOnStarChanged((event) => {
      if (event.action === 'starred') {
        void syncService.pushStarred(uid, event.item);
      } else {
        void syncService.pushUnstarred(uid, event.id);
      }
    });
  }, []);

  // ── Mount: read stored account + subscribe to Firebase auth state ───────────
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const stored = await authService.getStoredAccount();
      if (cancelled) return;

      setAccount(stored);
      setLoaded(true);

      if (stored) {
        registerEventHook(stored.uid);
        registerProfileHook(stored.uid);
        registerPosterHook(stored.uid);
        registerWatchlistHook(stored.uid);
        registerStarHook(stored.uid);

        // Restore last synced timestamp
        const storedSyncedAt = await AsyncStorage.getItem(LAST_SYNCED_AT_KEY);
        if (storedSyncedAt && !cancelled) setLastSyncedAt(storedSyncedAt);

        // Check for pending sync from last session
        const pending = await AsyncStorage.getItem(SYNC_PENDING_KEY);
        if (pending === '1') {
          setSyncPending(true);
          void syncService.retryPendingSync(stored.uid).then(() => {
            if (!cancelled) setSyncPending(false);
          });
        }

        // Start real-time listener
        listenerUnsubRef.current = syncService.startListener(stored.uid);
      }
    };

    void init();

    // Firebase auth state keeps account in sync with the native session
    const unsubAuth = authService.onAuthStateChanged((firebaseAccount) => {
      if (cancelled) return;
      if (!firebaseAccount) {
        // Firebase session expired — clear local state
        setAccount(null);
        registerEventHook(null);
        registerProfileHook(null);
        registerPosterHook(null);
        registerWatchlistHook(null);
        registerStarHook(null);
        void cloudStarredService.clear();
        listenerUnsubRef.current?.();
        listenerUnsubRef.current = null;
      }
    });

    return () => {
      cancelled = true;
      unsubAuth();
      listenerUnsubRef.current?.();
      listenerUnsubRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── signIn ─────────────────────────────────────────────────────────────────
  const signIn = useCallback(async () => {
    if (!ENABLE_CLOUD_SYNC) return;

    const newAccount = await authService.signInWithGoogle();
    if (!newAccount) return; // user cancelled — no error

    setAccount(newAccount);
    registerEventHook(newAccount.uid);
    registerProfileHook(newAccount.uid);
    registerPosterHook(newAccount.uid);
    registerWatchlistHook(newAccount.uid);
    registerStarHook(newAccount.uid);

    // If the user has never set a profile, seed it from their Google account
    // so "FilmSort User" never reaches Firestore as their display name.
    const hasProfile = await profileService.hasProfile();
    if (!hasProfile) {
      await profileService.save({ displayName: newAccount.displayName });
    }

    // Initial sync — non-blocking; update isSyncing around it
    setIsSyncing(true);
    syncService.initialSync(newAccount.uid)
      .then(async () => {
        setSyncPending(false);
        const now = new Date().toISOString();
        setLastSyncedAt(now);
        await AsyncStorage.setItem(LAST_SYNCED_AT_KEY, now);

        // If the cloud profile indicates Pro (redeemed code attached), make
        // this device act Pro for the signed-in session. Also check for a local
        // account→code mapping created at redeem time as a fallback.
        try {
          const profile = await profileService.get();
          const p = profile as unknown as Record<string, unknown>;
          if (p.proCode || p.proGrantedAt) {
            await setPro();
          } else {
            // Check local account→pro mapping
            try {
              const accountPro = await AsyncStorage.getItem('@filmsort:account_pro:' + newAccount.uid);
              if (accountPro) await setPro();
            } catch (e) {
              // ignore
            }
          }
        } catch (e) {
          console.warn('[AccountProvider] checking pro profile failed:', e);
        }
      })
      .catch(() => {
        setSyncPending(true);
      })
      .finally(() => {
        setIsSyncing(false);
      });

    // Start real-time listener
    listenerUnsubRef.current?.();
    listenerUnsubRef.current = syncService.startListener(newAccount.uid);
  }, [registerEventHook, registerProfileHook, registerPosterHook, registerWatchlistHook, registerStarHook]);

  // ── signOut ────────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    // Tear down listener first
    listenerUnsubRef.current?.();
    listenerUnsubRef.current = null;

    // Remove all push hooks
    setOnEventWritten(null);
    setOnProfileSaved(null);
    setOnPosterResolved(null);
    setOnWatchlistChanged(null);
    setOnStarChanged(null);

    // Firebase + Google sign-out + clear stored account
    await authService.signOut();

    // Clear cloud-only starred entries so they don't show for the next user
    await cloudStarredService.clear();

    setAccount(null);
    setSyncPending(false);
    setIsSyncing(false);
    setLastSyncedAt(null);
  }, []);

  // ── syncIfNeeded ───────────────────────────────────────────────────────────
  // Called when the profile screen focuses. Skips sync if last sync was within
  // 30 minutes to avoid hammering Firestore on every tab switch.
  const syncIfNeeded = useCallback(async () => {
    if (!ENABLE_CLOUD_SYNC || !account) return;
    if (isSyncing) return;

    const storedAt = await AsyncStorage.getItem(LAST_SYNCED_AT_KEY);
    if (storedAt) {
      const elapsed = Date.now() - new Date(storedAt).getTime();
      if (elapsed < SYNC_INTERVAL_MS) return; // still fresh — skip
    }

    setIsSyncing(true);
    try {
      await syncService.initialSync(account.uid);
      setSyncPending(false);
      const now = new Date().toISOString();
      setLastSyncedAt(now);
      await AsyncStorage.setItem(LAST_SYNCED_AT_KEY, now);
    } catch {
      setSyncPending(true);
    } finally {
      setIsSyncing(false);
    }
  }, [account, isSyncing]);

  // ── refreshAccount ─────────────────────────────────────────────────────────
  const refreshAccount = useCallback(async () => {
    const stored = await authService.getStoredAccount();
    setAccount(stored);
  }, []);

  return (
    <AccountContext.Provider
      value={{ loaded, account, isSyncing, syncPending, lastSyncedAt, signIn, signOut, refreshAccount, syncIfNeeded }}
    >
      {children}
    </AccountContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAccount(): AccountContextValue {
  return useContext(AccountContext);
}

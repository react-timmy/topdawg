/**
 * AccountContext.tsx
 *
 * Global account state for the v1.2 Google Sign-In + cloud sync feature.
 * Mirrors the ProContext pattern: provider wraps the app, hook exposes state.
 *
 * Lifecycle:
 *  1. Mount: reads stored account, subscribes to Firebase auth state.
 *  2. If account + sync_pending → retryPendingSync in background.
 *  3. Registers setOnEventWritten so every local watch event is pushed to Firestore.
 *  4. signIn(): Google Sign-In → initialSync (non-blocking) → startListener.
 *  5. signOut(): tears down listener, clears account, removes event hook.
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
import { syncService } from '../services/syncService';
import { setOnEventWritten } from '../storage/watchHistoryService';
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
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
}

const SYNC_PENDING_KEY = '@filmsort:sync_pending';

// ─── Context ──────────────────────────────────────────────────────────────────

const AccountContext = createContext<AccountContextValue>({
  loaded: false,
  account: null,
  isSyncing: false,
  syncPending: false,
  signIn: async () => {},
  signOut: async () => {},
  refreshAccount: async () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [account, setAccount] = useState<FilmSortAccount | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncPending, setSyncPending] = useState(false);

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

    // Initial sync — non-blocking; update isSyncing around it
    setIsSyncing(true);
    syncService.initialSync(newAccount.uid)
      .then(() => {
        setSyncPending(false);
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
  }, [registerEventHook]);

  // ── signOut ────────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    // Tear down listener first
    listenerUnsubRef.current?.();
    listenerUnsubRef.current = null;

    // Remove event push hook
    setOnEventWritten(null);

    // Firebase + Google sign-out + clear stored account
    await authService.signOut();

    setAccount(null);
    setSyncPending(false);
    setIsSyncing(false);
  }, []);

  // ── refreshAccount ─────────────────────────────────────────────────────────
  const refreshAccount = useCallback(async () => {
    const stored = await authService.getStoredAccount();
    setAccount(stored);
  }, []);

  return (
    <AccountContext.Provider
      value={{ loaded, account, isSyncing, syncPending, signIn, signOut, refreshAccount }}
    >
      {children}
    </AccountContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAccount(): AccountContextValue {
  return useContext(AccountContext);
}

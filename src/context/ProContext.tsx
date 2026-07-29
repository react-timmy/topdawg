/**
 * ProContext
 *
 * Provides Pro status and monthly scan usage to any component in the tree.
 * Call `refreshPro()` after unlocking Pro to propagate the change.
 *
 * Usage:
 *   const { isPro, scansUsed, scansRemaining, refreshPro } = usePro();
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  FREE_SCAN_LIMIT,
  getScansUsedThisMonth,
  isProUser,
} from '../storage/proStatusService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProContextValue {
  /** True once the initial async load has completed. */
  loaded: boolean;
  /** Whether the user has an active Pro unlock. */
  isPro: boolean;
  /** AI-parsed files consumed this month (always 0 for Pro). */
  scansUsed: number;
  /** Files remaining before hitting the free limit. */
  scansRemaining: number;
  /** Re-read Pro status from storage (call after unlock). */
  refreshPro: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ProContext = createContext<ProContextValue>({
  loaded: false,
  isPro: false,
  scansUsed: 0,
  scansRemaining: FREE_SCAN_LIMIT,
  refreshPro: async () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ProProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [scansUsed, setScansUsed] = useState(0);

  const refreshPro = useCallback(async () => {
    const [pro, used] = await Promise.all([isProUser(), getScansUsedThisMonth()]);
    setIsPro(pro);
    setScansUsed(pro ? 0 : used);
    setLoaded(true);
  }, []);

  useEffect(() => {
    refreshPro();
  }, [refreshPro]);

  const scansRemaining = isPro
    ? FREE_SCAN_LIMIT
    : Math.max(0, FREE_SCAN_LIMIT - scansUsed);

  return (
    <ProContext.Provider value={{ loaded, isPro, scansUsed, scansRemaining, refreshPro }}>
      {children}
    </ProContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePro(): ProContextValue {
  return useContext(ProContext);
}

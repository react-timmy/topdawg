/**
 * BadgeUnlockContext
 *
 * Flow:
 *  1. checkForNewBadges() detects newly earned badges and adds them to pendingQueue.
 *  2. A floating gift box appears (BadgeUnlockOverlay phase 1).
 *  3. User taps the gift box → full reveal animation plays.
 *  4. User taps X / dismisses → badge goes into savedBadges (persisted) for later.
 *  5. savedBadges are surfaced in Notifications and ProfileScreen.
 *  6. openSaved(id) plays the reveal for a saved badge and removes it from the saved list.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WatchEvent } from '../storage/watchHistoryService';
import { computeStats } from '../utils/statsEngine';
import { evaluateBadges, BadgeResult } from '../utils/badgeEngine';

const EARNED_KEY = '@filmsort:earned_badges';
const SAVED_KEY  = '@filmsort:saved_badge_unlocks';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OverlayPhase =
  | 'hidden'        // nothing showing
  | 'floating'      // small gift box floating — waiting for user tap
  | 'reveal';       // full animation playing

interface BadgeUnlockContextValue {
  /** Call this after recordCompletion to detect newly earned badges. */
  checkForNewBadges: (history: WatchEvent[]) => Promise<void>;
  /** Current overlay phase. */
  phase: OverlayPhase;
  /** The badge associated with the current floating/reveal state. */
  currentUnlock: BadgeResult | null;
  /** User tapped the floating gift box — start the full reveal. */
  openGiftBox: () => void;
  /** User dismissed without opening — save for later and move to next. */
  snooze: () => void;
  /** Dismiss after reveal is complete. */
  dismissReveal: () => void;
  /** Badges that were snoozed and are waiting to be opened. */
  savedBadges: BadgeResult[];
  /** Open a saved badge reveal from Notifications / Profile. */
  openSaved: (badgeId: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const BadgeUnlockContext = createContext<BadgeUnlockContextValue>({
  checkForNewBadges: async () => {},
  phase: 'hidden',
  currentUnlock: null,
  openGiftBox: () => {},
  snooze: () => {},
  dismissReveal: () => {},
  savedBadges: [],
  openSaved: () => {},
});

export function useBadgeUnlock() {
  return useContext(BadgeUnlockContext);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadEarnedIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(EARNED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

async function saveEarnedIds(ids: Set<string>): Promise<void> {
  try { await AsyncStorage.setItem(EARNED_KEY, JSON.stringify([...ids])); } catch {}
}

async function loadSaved(): Promise<BadgeResult[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

async function persistSaved(badges: BadgeResult[]): Promise<void> {
  try { await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(badges)); } catch {}
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function BadgeUnlockProvider({ children }: { children: React.ReactNode }) {
  // Queue of badges waiting to float
  const pendingQueue = useRef<BadgeResult[]>([]);
  const checking = useRef(false);

  const [phase, setPhase]               = useState<OverlayPhase>('hidden');
  const [currentUnlock, setCurrentUnlock] = useState<BadgeResult | null>(null);
  const [savedBadges, setSavedBadges]   = useState<BadgeResult[]>([]);

  // Load saved badges once on mount
  React.useEffect(() => {
    loadSaved().then(setSavedBadges);
  }, []);

  // ── Show next pending badge as floating gift box ───────────────────────────
  const showNextPending = useCallback(() => {
    const next = pendingQueue.current.shift();
    if (!next) { setPhase('hidden'); setCurrentUnlock(null); return; }
    setCurrentUnlock(next);
    setPhase('floating');
  }, []);

  // ── checkForNewBadges ──────────────────────────────────────────────────────
  const checkForNewBadges = useCallback(async (history: WatchEvent[]) => {
    if (checking.current) return;
    checking.current = true;
    try {
      const stats      = computeStats(history);
      const badges     = evaluateBadges(history, stats);
      const earnedNow  = badges.filter((b) => b.earned);
      const previousIds = await loadEarnedIds();
      const newlyEarned = earnedNow.filter((b) => !previousIds.has(b.id));
      if (newlyEarned.length === 0) return;

      const updatedIds = new Set([...previousIds, ...newlyEarned.map((b) => b.id)]);
      await saveEarnedIds(updatedIds);

      pendingQueue.current = [...pendingQueue.current, ...newlyEarned];

      // Only start the chain if nothing is currently showing
      if (phase === 'hidden') showNextPending();
    } finally {
      checking.current = false;
    }
  }, [phase, showNextPending]);

  // ── User taps floating gift box → play full reveal ─────────────────────────
  const openGiftBox = useCallback(() => {
    setPhase('reveal');
  }, []);

  // ── User dismisses floating box without opening → save for later ───────────
  const snooze = useCallback(() => {
    if (!currentUnlock) { showNextPending(); return; }
    const badge = currentUnlock;
    setSavedBadges((prev) => {
      // Avoid duplicates
      if (prev.some((b) => b.id === badge.id)) return prev;
      const updated = [badge, ...prev];
      void persistSaved(updated);
      return updated;
    });
    showNextPending();
  }, [currentUnlock, showNextPending]);

  // ── Dismiss after full reveal ──────────────────────────────────────────────
  const dismissReveal = useCallback(() => {
    showNextPending();
  }, [showNextPending]);

  // ── Open a saved badge (from Notifications / Profile) ─────────────────────
  const openSaved = useCallback((badgeId: string) => {
    setSavedBadges((prev) => {
      const badge = prev.find((b) => b.id === badgeId);
      if (!badge) return prev;
      const updated = prev.filter((b) => b.id !== badgeId);
      void persistSaved(updated);
      // Show it immediately — push to front of pending queue
      pendingQueue.current = [badge, ...pendingQueue.current];
      // Kick off display (force hidden → floating)
      setPhase('hidden');
      setTimeout(() => {
        const next = pendingQueue.current.shift();
        if (next) { setCurrentUnlock(next); setPhase('floating'); }
      }, 50);
      return updated;
    });
  }, []);

  return (
    <BadgeUnlockContext.Provider value={{
      checkForNewBadges, phase, currentUnlock,
      openGiftBox, snooze, dismissReveal,
      savedBadges, openSaved,
    }}>
      {children}
    </BadgeUnlockContext.Provider>
  );
}

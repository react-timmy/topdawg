import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Constants ────────────────────────────────────────────────────────────────

const HISTORY_KEY = '@filmsort:watch_history';
const MAX_EVENTS  = 5000;
const PRUNE_TO    = 4500;
/** Minimum gap between two events for the same file before deduplication kicks in (ms). */
const DEDUP_WINDOW_MS = 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WatchEvent {
  id: string;              // `${mediaId}::${Date.now()}`
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

// ─── Sync hook (v1.2) ─────────────────────────────────────────────────────────
// AccountProvider registers a callback here so that every local write is also
// pushed to Firestore — without creating a direct dependency on Firestore here.

let _onEventWritten: ((event: WatchEvent) => void) | null = null;

/**
 * Register (or deregister) a callback invoked after every successful
 * recordCompletion write. Pass null to remove the hook (on sign-out).
 */
export function setOnEventWritten(
  cb: ((event: WatchEvent) => void) | null,
): void {
  _onEventWritten = cb;
}

/**
 * Poster-resolved hook — fired after recordCompletion when the new event
 * carries a posterUrl. AccountProvider uses this to push the poster entry
 * to Firestore without creating a direct dependency here.
 */
let _onPosterResolved: ((event: WatchEvent) => void) | null = null;

/**
 * Register (or deregister) a callback invoked after every successful
 * recordCompletion write where the event has a non-empty posterUrl.
 * Pass null to remove the hook (on sign-out).
 */
export function setOnPosterResolved(
  cb: ((event: WatchEvent) => void) | null,
): void {
  _onPosterResolved = cb;
}

/**
 * Streak-reminder hook — fired after recordCompletion so the notification
 * service can handle watch events (cancel today's reminder, reschedule tomorrow's).
 */
let _onStreakUpdate: (() => void) | null = null;

/**
 * Register (or deregister) a callback invoked after every successful
 * recordCompletion write. Used by streak notification service to handle
 * watch events. Pass null to remove the hook.
 */
export function setOnStreakUpdate(
  cb: (() => void) | null,
): void {
  _onStreakUpdate = cb;
}

/**
 * General history-change hook — fired after any write to the local history
 * store (AsyncStorage). Components can register to refresh UI immediately
 * when history changes locally.
 */
let _onHistoryChanged: (() => void) | null = null;

export function setOnHistoryChanged(cb: (() => void) | null): void {
  _onHistoryChanged = cb;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readAll(): Promise<WatchEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(events: WatchEvent[]): Promise<void> {
  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(events));
    // Lightweight debug log for smoke-testing — safe to leave in (dev-only noise)
    try {
      // Log number of events and most recent id so it's easy to verify writes in device logs
      // eslint-disable-next-line no-console
      console.debug(`[WatchHistory] wrote ${events.length} events; newest=${events[0]?.id ?? 'none'}`);
    } catch (_) {}

    // Notify listeners that local history changed
    try {
      if (_onHistoryChanged) _onHistoryChanged();
    } catch (e) {
      // swallow listener errors — never fail the write path
    }
  } catch (err) {
    console.warn('[WatchHistory] write failed', err);
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const watchHistoryService = {
  /**
   * Read and return all watch events, newest first.
   * Returns empty array on any error.
   */
  async getHistory(): Promise<WatchEvent[]> {
    return readAll();
  },

  /**
   * Append a new completion event.
   * Deduplicates within a 60-second window for the same file, then prunes
   * to MAX_EVENTS if the store grows too large.
   */
  async recordCompletion(
    event: Omit<WatchEvent, 'id' | 'watchedAt'>,
  ): Promise<void> {
    const history = await readAll();
    const now = Date.now();

    // ── Deduplication ─────────────────────────────────────────────────────────
    const isDuplicate = history.some((e) => {
      if (e.mediaId !== event.mediaId) return false;
      // For TV, also match season + episode
      if (event.type === 'tv') {
        if (e.seasonNumber !== event.seasonNumber) return false;
        if (e.episodeNumber !== event.episodeNumber) return false;
      }
      const age = now - new Date(e.watchedAt).getTime();
      return age < DEDUP_WINDOW_MS;
    });

    if (isDuplicate) return;

    // ── Build event ───────────────────────────────────────────────────────────
    const newEvent: WatchEvent = {
      ...event,
      id: `${event.mediaId}::${now}`,
      watchedAt: new Date(now).toISOString(),
      isAnime:
        event.isAnime ??
        (event.genres.includes('Animation') && event.type === 'tv'),
    };

    // Newest first
    let updated = [newEvent, ...history];

    // ── Prune ─────────────────────────────────────────────────────────────────
    if (updated.length > MAX_EVENTS) {
      updated = updated.slice(0, PRUNE_TO);
    }

    await writeAll(updated);

    // ── v1.2: notify sync layer ───────────────────────────────────────────────
    if (_onEventWritten) {
      _onEventWritten(newEvent);
    }

    // Notify poster-sync layer if this event carries a poster URL
    if (_onPosterResolved && newEvent.posterUrl) {
      _onPosterResolved(newEvent);
    }

    // Notify streak reminder service that user watched something
    if (_onStreakUpdate) {
      _onStreakUpdate();
    }
  },

  /**
   * Returns true if any completion event exists for the given mediaId.
   */
  async hasWatched(mediaId: string): Promise<boolean> {
    const history = await readAll();
    return history.some((e) => e.mediaId === mediaId);
  },

  /**
   * Wipe the entire watch history. Used from Settings and future account-sync flows.
   */
  async clearHistory(): Promise<void> {
    try {
      await AsyncStorage.removeItem(HISTORY_KEY);
    } catch {
      // silently fail
    }
  },

  /**
   * Internal: replace the entire history array with a pre-merged set.
   * Used exclusively by syncService.initialSync — not part of the public API.
   * Prefixed _ to signal intent.
   */
  async _replaceAll(events: WatchEvent[]): Promise<void> {
    await writeAll(events);
  },

  /**
   * Internal: patch posterUrls onto existing local WatchEvents for the given
   * mediaIds. Used by syncService.syncMemories to apply cloud poster data to
   * events that were synced without a poster (e.g. from an older app version).
   *
   * Only updates events that currently lack a posterUrl — existing posters are
   * left untouched to avoid unnecessary writes.
   */
  async _patchPosters(
    patches: Array<{ mediaId: string; posterUrl: string }>,
  ): Promise<void> {
    if (patches.length === 0) return;

    const patchMap = new Map(patches.map((p) => [p.mediaId, p.posterUrl]));
    const history = await readAll();

    let changed = false;
    const updated = history.map((e) => {
      if (e.posterUrl) return e; // already has a poster — leave it
      const url = patchMap.get(e.mediaId);
      if (!url) return e;
      changed = true;
      return { ...e, posterUrl: url };
    });

    if (changed) {
      await writeAll(updated);
    }
  },
};

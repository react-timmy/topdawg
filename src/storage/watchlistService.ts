import AsyncStorage from '@react-native-async-storage/async-storage';
import { MediaItem } from '../types';

const STORAGE_KEY = '@watchlist_items';

// ─── Sync hook (v1.2) ─────────────────────────────────────────────────────────
// AccountProvider registers a callback here so every local add/remove is also
// pushed to Firestore — without creating a direct dependency on Firestore here.

type WatchlistAction =
  | { action: 'add'; item: MediaItem }
  | { action: 'remove'; id: string };

let _onWatchlistChanged: ((event: WatchlistAction) => void) | null = null;

/**
 * Register (or deregister) a callback invoked after every successful
 * addToWatchlist / removeFromWatchlist write.
 * Pass null to remove the hook (on sign-out).
 */
export function setOnWatchlistChanged(
  cb: ((event: WatchlistAction) => void) | null,
): void {
  _onWatchlistChanged = cb;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const watchlistService = {
  async getWatchlist(): Promise<MediaItem[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as MediaItem[]) : [];
    } catch {
      return [];
    }
  },

  async addToWatchlist(item: MediaItem): Promise<void> {
    try {
      const current = await watchlistService.getWatchlist();
      const exists = current.some((i) => i.id === item.id);
      if (exists) return;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([item, ...current]));

      // v1.2: notify sync layer
      _onWatchlistChanged?.({ action: 'add', item });
    } catch {
      // silently fail — not critical
    }
  },

  async removeFromWatchlist(id: string): Promise<void> {
    try {
      const current = await watchlistService.getWatchlist();
      const updated = current.filter((i) => i.id !== id);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

      // v1.2: notify sync layer
      _onWatchlistChanged?.({ action: 'remove', id });
    } catch {
      // silently fail
    }
  },

  async isInWatchlist(id: string): Promise<boolean> {
    const current = await watchlistService.getWatchlist();
    return current.some((i) => i.id === id);
  },

  async clearWatchlist(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // silently fail
    }
  },

  /**
   * Internal: replace the entire watchlist with a pre-merged set.
   * Used exclusively by syncService.syncWatchlist — not part of the public API.
   */
  async _replaceAll(items: MediaItem[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      console.warn('[WatchlistService] _replaceAll failed', err);
    }
  },
};

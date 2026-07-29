import AsyncStorage from '@react-native-async-storage/async-storage';
import { MediaItem } from '../types';

const STORAGE_KEY = '@watchlist_items';

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
    } catch {
      // silently fail — not critical
    }
  },

  async removeFromWatchlist(id: string): Promise<void> {
    try {
      const current = await watchlistService.getWatchlist();
      const updated = current.filter((i) => i.id !== id);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
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
};

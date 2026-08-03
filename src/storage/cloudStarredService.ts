/**
 * cloudStarredService.ts
 *
 * Persists starred entries that came from the cloud but have no matching
 * item in the local library (e.g. a fresh install, or an item scanned on
 * another device).
 *
 * These entries are surfaced in the Library → Starred tab as info-only
 * cards (no local file, no play button). They are updated in real-time
 * by the syncService starred listener and on every initialSync.
 *
 * Storage key: @filmsort:cloud_starred
 * Shape: StarredEntry[]  (imported from syncService via re-export here
 *         to avoid a circular dep — the type is defined inline below)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@filmsort:cloud_starred';

// ─── Type (mirrors StarredEntry in syncService — kept here to avoid circular dep)

export interface CloudStarredEntry {
  mediaId: string;
  title: string;
  type: 'movie' | 'tv';
  posterUrl?: string;
  backdropUrl?: string;
  rating?: number;
  releaseDate?: string;
  genres?: string[];
  description?: string;
  numberOfSeasons?: number;
  lastEpisode?: { seasonNumber: number; episodeNumber: number };
  updatedAt: string; // ISO-8601
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readAll(): Promise<CloudStarredEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(entries: CloudStarredEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    console.warn('[CloudStarred] write failed', err);
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const cloudStarredService = {
  /** Return all persisted cloud-starred entries. */
  async getAll(): Promise<CloudStarredEntry[]> {
    return readAll();
  },

  /**
   * Insert or update a single entry (upsert by mediaId).
   * Called by the syncService listener when a starred doc arrives from
   * Firestore and has no matching local library item.
   */
  async upsert(entry: CloudStarredEntry): Promise<void> {
    const all = await readAll();
    const idx = all.findIndex((e) => e.mediaId === entry.mediaId);
    if (idx > -1) {
      // Last-write-wins: only overwrite if the incoming entry is newer
      if (entry.updatedAt >= all[idx].updatedAt) {
        all[idx] = entry;
      }
    } else {
      all.unshift(entry); // newest first
    }
    await writeAll(all);
  },

  /** Remove a single entry when the item is un-starred on any device. */
  async remove(mediaId: string): Promise<void> {
    const all = await readAll();
    const updated = all.filter((e) => e.mediaId !== mediaId);
    if (updated.length !== all.length) {
      await writeAll(updated);
    }
  },

  /**
   * Replace the entire list atomically.
   * Used by syncService.syncStarred during initialSync to apply the
   * authoritative cloud state in one shot.
   */
  async replaceAll(entries: CloudStarredEntry[]): Promise<void> {
    await writeAll(entries);
  },

  /** Wipe everything — called on sign-out so the next user starts clean. */
  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // silently fail
    }
  },
};

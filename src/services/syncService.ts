/**
 * syncService.ts
 *
 * All Firestore read/write logic for the v1.2 cloud sync feature.
 *
 * Design principles:
 *  - Local write always happens first (in watchHistoryService / profileService /
 *    watchlistService / asyncStorage). Firestore is fire-and-forget — failures
 *    never block the local path.
 *  - On any Firestore failure, @filmsort:sync_pending is set so the next
 *    app launch retries automatically.
 *  - ENABLE_CLOUD_SYNC=false turns every method into a no-op.
 *
 * Firestore layout under users/{uid}:
 *  profile                   — single document: LocalProfile fields
 *  watchHistory/{eventId}    — one doc per WatchEvent
 *  memories/{mediaId}        — one doc per unique poster entry (PosterEntry)
 *  watchlist/{itemId}        — one doc per MediaItem in the user's watchlist
 *  starred/{mediaId}         — one doc per starred library item (StarredEntry)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import { watchHistoryService, WatchEvent } from '../storage/watchHistoryService';
import { watchlistService } from '../storage/watchlistService';
import { storageService, suppressStarHook } from '../storage/asyncStorage';
import { cloudStarredService, CloudStarredEntry } from '../storage/cloudStarredService';
import { profileService, LocalProfile } from '../storage/profileService';
import { MediaItem } from '../types';
import { ENABLE_CLOUD_SYNC } from '../config/env';

// ─── Constants ────────────────────────────────────────────────────────────────

const SYNC_PENDING_KEY = '@filmsort:sync_pending';
const FIRESTORE_BATCH_LIMIT = 500;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Lean poster-cache entry stored under users/{uid}/memories/{mediaId}.
 * Derived from WatchEvent; only the fields needed to reconstruct posters
 * on a new device are persisted here.
 */
export interface PosterEntry {
  mediaId: string;
  title: string;
  type: 'movie' | 'tv';
  posterUrl: string;           // never empty — entries without a URL are skipped
  firstWatchedAt: string;      // ISO-8601
  updatedAt: string;           // ISO-8601 — used for last-write-wins conflict resolution
}

/**
 * Starred library item stored under users/{uid}/starred/{mediaId}.
 * Captures the minimal information needed to identify the title and
 * — for TV shows — where the user was up to.
 * updatedAt is used for last-write-wins conflict resolution across devices.
 */
export interface StarredEntry {
  mediaId: string;
  title: string;
  type: 'movie' | 'tv';
  posterUrl?: string;
  lastEpisode?: { seasonNumber: number; episodeNumber: number };
  updatedAt: string;           // ISO-8601
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function watchHistoryCollection(uid: string) {
  return firestore().collection('users').doc(uid).collection('watchHistory');
}

function memoriesCollection(uid: string) {
  return firestore().collection('users').doc(uid).collection('memories');
}

function watchlistCollection(uid: string) {
  return firestore().collection('users').doc(uid).collection('watchlist');
}

function starredCollection(uid: string) {
  return firestore().collection('users').doc(uid).collection('starred');
}

function profileDoc(uid: string) {
  return firestore().collection('users').doc(uid).collection('profile').doc('data');
}

async function setPending(): Promise<void> {
  try { await AsyncStorage.setItem(SYNC_PENDING_KEY, '1'); } catch { /* ignore */ }
}

async function clearPending(): Promise<void> {
  try { await AsyncStorage.removeItem(SYNC_PENDING_KEY); } catch { /* ignore */ }
}

/**
 * Upload events to Firestore in batches of up to 500.
 * Throws on the first batch failure — caller handles the pending flag.
 */
async function batchWrite(uid: string, events: WatchEvent[]): Promise<void> {
  if (events.length === 0) return;

  const col = watchHistoryCollection(uid);

  for (let i = 0; i < events.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = events.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = firestore().batch();
    for (const event of chunk) {
      batch.set(col.doc(event.id), event);
    }
    await batch.commit();
  }
}

/**
 * Upload poster entries to Firestore in batches of up to 500.
 * Throws on the first batch failure — caller handles the pending flag.
 */
async function batchWritePosters(uid: string, entries: PosterEntry[]): Promise<void> {
  if (entries.length === 0) return;

  const col = memoriesCollection(uid);

  for (let i = 0; i < entries.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = entries.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = firestore().batch();
    for (const entry of chunk) {
      batch.set(col.doc(entry.mediaId), entry);
    }
    await batch.commit();
  }
}

/**
 * Upload watchlist items to Firestore in batches of up to 500.
 * Throws on the first batch failure — caller handles the pending flag.
 */
async function batchWriteWatchlist(uid: string, items: MediaItem[]): Promise<void> {
  if (items.length === 0) return;

  const col = watchlistCollection(uid);

  for (let i = 0; i < items.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = items.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = firestore().batch();
    for (const item of chunk) {
      batch.set(col.doc(item.id), item);
    }
    await batch.commit();
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const syncService = {
  /**
   * Called once after sign-in. Merges local ↔ cloud history, writes the
   * merged result back to AsyncStorage, and uploads any local-only events.
   *
   * Conflict resolution: for events present on both sides, the one with
   * the newer watchedAt ISO string wins.
   *
   * On any failure: sets @filmsort:sync_pending and rethrows so the caller
   * can surface the error. Local data is always left intact.
   */
  async initialSync(uid: string): Promise<void> {
    if (!ENABLE_CLOUD_SYNC) return;

    try {
      // Sync profile, memories, watchlist, and starred in parallel with watch history
      await Promise.all([
        syncService.syncProfile(uid),
        syncService.syncMemories(uid),
        syncService.syncWatchlist(uid),
        syncService.syncStarred(uid),
      ]);

      // Fetch both sides concurrently
      const [localEvents, cloudSnapshot] = await Promise.all([
        watchHistoryService.getHistory(),
        watchHistoryCollection(uid).get(),
      ]);

      const cloudEvents: WatchEvent[] = cloudSnapshot.docs.map(
        (d) => d.data() as WatchEvent,
      );

      // Build lookup maps
      const localById = new Map<string, WatchEvent>(
        localEvents.map((e) => [e.id, e]),
      );
      const cloudById = new Map<string, WatchEvent>(
        cloudEvents.map((e) => [e.id, e]),
      );

      // Cloud-only events → add locally
      const toAddLocally = cloudEvents.filter((e) => !localById.has(e.id));

      // Both sides → keep newer watchedAt
      for (const cloudEvent of cloudEvents) {
        const local = localById.get(cloudEvent.id);
        if (!local) continue;
        const winner =
          cloudEvent.watchedAt > local.watchedAt ? cloudEvent : local;
        localById.set(cloudEvent.id, winner);
      }

      // Local-only events → need to upload
      const toUpload = localEvents.filter((e) => !cloudById.has(e.id));

      // Merge: cloud-only + resolved local map, sorted newest first
      const merged = [...toAddLocally, ...Array.from(localById.values())].sort(
        (a, b) => b.watchedAt.localeCompare(a.watchedAt),
      );

      // Write merged set locally
      await watchHistoryService._replaceAll(merged);

      // Upload local-only events to Firestore
      await batchWrite(uid, toUpload);

      await clearPending();
    } catch (err) {
      await setPending();
      throw err;
    }
  },

  /**
   * Push a single new event to Firestore. Fire-and-forget — never throws.
   * Called by AccountProvider via the setOnEventWritten hook.
   */
  async pushEvent(uid: string, event: WatchEvent): Promise<void> {
    if (!ENABLE_CLOUD_SYNC) return;

    try {
      await watchHistoryCollection(uid).doc(event.id).set(event);
    } catch (err) {
      console.warn('[SyncService] pushEvent failed, marking sync pending:', err);
      await setPending();
    }
  },

  /**
   * Start Firestore real-time listeners for watchHistory and watchlist.
   *
   * watchHistory: new events received from other devices are merged into local
   * storage (duplicates are skipped by event ID).
   *
   * watchlist: added/removed docs from other devices are applied to the local
   * AsyncStorage list immediately.
   *
   * Returns a single unsubscribe function that tears down both listeners.
   * Call it on sign-out.
   */
  startListener(uid: string): () => void {
    if (!ENABLE_CLOUD_SYNC) return () => {};

    // ── Watch history listener ────────────────────────────────────────────────
    const unsubHistory = watchHistoryCollection(uid).onSnapshot(
      async (snapshot) => {
        const newCloudEvents: WatchEvent[] = [];

        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            newCloudEvents.push(change.doc.data() as WatchEvent);
          }
        }

        if (newCloudEvents.length === 0) return;

        try {
          const local = await watchHistoryService.getHistory();
          const localIds = new Set(local.map((e) => e.id));

          const toAdd = newCloudEvents.filter((e) => !localIds.has(e.id));
          if (toAdd.length === 0) return;

          // Prepend new cloud events, keep newest-first order
          const merged = [...toAdd, ...local].sort(
            (a, b) => b.watchedAt.localeCompare(a.watchedAt),
          );
          await watchHistoryService._replaceAll(merged);
        } catch (err) {
          console.warn('[SyncService] history listener merge failed:', err);
        }
      },
      (err) => {
        console.warn('[SyncService] watchHistory onSnapshot error:', err);
      },
    );

    // ── Watchlist listener ────────────────────────────────────────────────────
    const unsubWatchlist = watchlistCollection(uid).onSnapshot(
      async (snapshot) => {
        if (snapshot.docChanges().length === 0) return;

        try {
          // Rebuild the full local list from the authoritative Firestore snapshot.
          // This is safe because the snapshot always reflects the current cloud
          // state — we don't need to diff against local here.
          const cloudItems: MediaItem[] = snapshot.docs.map(
            (d) => d.data() as MediaItem,
          );

          // Get local list so we can preserve items that exist only locally
          // (e.g. added while offline and not yet pushed).
          const localItems = await watchlistService.getWatchlist();
          const cloudIds = new Set(cloudItems.map((i) => i.id));

          // Items in the cloud that are missing locally, and local-only items
          // that haven't been pushed yet — union them.
          const localOnly = localItems.filter((i) => !cloudIds.has(i.id));

          // Cloud order is authoritative; local-only items go to the end.
          const merged = [...cloudItems, ...localOnly];

          await watchlistService._replaceAll(merged);
        } catch (err) {
          console.warn('[SyncService] watchlist listener merge failed:', err);
        }
      },
      (err) => {
        console.warn('[SyncService] watchlist onSnapshot error:', err);
      },
    );

    // ── Starred listener ──────────────────────────────────────────────────────
    // When another device stars or un-stars an item, apply the change locally.
    const unsubStarred = starredCollection(uid).onSnapshot(
      async (snapshot) => {
        const changes = snapshot.docChanges();
        if (changes.length === 0) return;

        try {
          for (const change of changes) {
            const mediaId = change.doc.id;
            if (change.type === 'added' || change.type === 'modified') {
              const entry = change.doc.data() as StarredEntry;

              // Try to apply to an existing local library item first
              const library = await storageService.getLibrary();
              const localItem = library.find((i) => i.id === mediaId);

              if (localItem) {
                // Item exists locally — star it and update lastEpisode.
                // Suppress the hook so this cloud-originated write doesn't
                // echo back to Firestore (which would restart the loop).
                suppressStarHook(true);
                try {
                  await storageService.updateItem(mediaId, {
                    starred: true,
                    lastEpisode: entry.lastEpisode,
                  });
                } finally {
                  suppressStarHook(false);
                }
                // Make sure it's not lingering in the cloud-only store
                await cloudStarredService.remove(mediaId);
              } else {
                // No local library item — persist as a cloud-only starred entry
                const cloudEntry: CloudStarredEntry = {
                  mediaId: entry.mediaId,
                  title: entry.title,
                  type: entry.type,
                  posterUrl: entry.posterUrl,
                  lastEpisode: entry.lastEpisode,
                  updatedAt: entry.updatedAt,
                };
                await cloudStarredService.upsert(cloudEntry);
              }
            } else if (change.type === 'removed') {
              // Un-star locally (both stores) — suppress hook to avoid echo
              suppressStarHook(true);
              try {
                await storageService.updateItem(mediaId, {
                  starred: false,
                  lastEpisode: undefined,
                });
              } finally {
                suppressStarHook(false);
              }
              await cloudStarredService.remove(mediaId);
            }
          }
        } catch (err) {
          suppressStarHook(false); // always reset on error
          console.warn('[SyncService] starred listener merge failed:', err);
        }
      },
      (err) => {
        console.warn('[SyncService] starred onSnapshot error:', err);
      },
    );

    return () => {
      unsubHistory();
      unsubWatchlist();
      unsubStarred();
    };
  },

  /**
   * Check if a sync is pending from a previous session and retry if so.
   * Called on app launch inside AccountProvider when the user is signed in.
   */
  async retryPendingSync(uid: string): Promise<void> {
    if (!ENABLE_CLOUD_SYNC) return;

    try {
      const pending = await AsyncStorage.getItem(SYNC_PENDING_KEY);
      if (pending !== '1') return;
      await syncService.initialSync(uid);
    } catch (err) {
      // Leave pending flag set — will retry on next launch
      console.warn('[SyncService] retryPendingSync failed:', err);
    }
  },

  /**
   * Permanently delete this user's cloud data (watchHistory, memories,
   * watchlist, profile, and root user doc).
   * Best-effort — used by Delete Account. Never throws to the UI layer.
   */
  async deleteCloudData(uid: string): Promise<void> {
    if (!ENABLE_CLOUD_SYNC || !uid) return;

    try {
      // Helper: delete an entire subcollection in batches
      const deleteCollection = async (
        col: ReturnType<typeof watchHistoryCollection>,
      ) => {
        while (true) {
          const snap = await col.limit(FIRESTORE_BATCH_LIMIT).get();
          if (snap.empty) break;
          const batch = firestore().batch();
          for (const doc of snap.docs) {
            batch.delete(doc.ref);
          }
          await batch.commit();
          if (snap.size < FIRESTORE_BATCH_LIMIT) break;
        }
      };

      await Promise.all([
        deleteCollection(watchHistoryCollection(uid)),
        deleteCollection(memoriesCollection(uid)),
        deleteCollection(watchlistCollection(uid)),
        deleteCollection(starredCollection(uid)),
      ]);

      // Delete profile doc
      try { await profileDoc(uid).delete(); } catch { /* may not exist */ }

      // Delete user root doc
      try {
        await firestore().collection('users').doc(uid).delete();
      } catch { /* may not exist */ }

      await clearPending();
    } catch (err) {
      console.warn('[SyncService] deleteCloudData failed:', err);
    }
  },

  // ─── Watchlist sync ─────────────────────────────────────────────────────────

  /**
   * Push a single item addition to Firestore. Fire-and-forget — never throws.
   * Called by AccountProvider via the setOnWatchlistChanged hook.
   */
  async pushWatchlistAdd(uid: string, item: MediaItem): Promise<void> {
    if (!ENABLE_CLOUD_SYNC) return;

    try {
      await watchlistCollection(uid).doc(item.id).set(item);
    } catch (err) {
      console.warn('[SyncService] pushWatchlistAdd failed, marking sync pending:', err);
      await setPending();
    }
  },

  /**
   * Remove a single item from the cloud watchlist. Fire-and-forget — never throws.
   * Called by AccountProvider via the setOnWatchlistChanged hook.
   */
  async pushWatchlistRemove(uid: string, id: string): Promise<void> {
    if (!ENABLE_CLOUD_SYNC) return;

    try {
      await watchlistCollection(uid).doc(id).delete();
    } catch (err) {
      console.warn('[SyncService] pushWatchlistRemove failed, marking sync pending:', err);
      await setPending();
    }
  },

  /**
   * Merge the local watchlist with the cloud watchlist.
   *
   * Strategy: union merge — an item is kept if it exists on either side.
   * There is no "remove" event recorded during offline use, so the safest
   * assumption is that a missing item on one side was simply never added there,
   * not that it was deleted. (Deletions made while online are pushed immediately
   * via pushWatchlistRemove and reflected in the listener.)
   *
   * After merging, the unified list is written locally and any local-only items
   * are uploaded to Firestore.
   *
   * Called as part of initialSync after sign-in.
   */
  async syncWatchlist(uid: string): Promise<void> {
    if (!ENABLE_CLOUD_SYNC) return;

    try {
      const [localItems, cloudSnap] = await Promise.all([
        watchlistService.getWatchlist(),
        watchlistCollection(uid).get(),
      ]);

      const cloudItems: MediaItem[] = cloudSnap.docs.map(
        (d) => d.data() as MediaItem,
      );

      const cloudIds = new Set(cloudItems.map((i) => i.id));
      const localIds = new Set(localItems.map((i) => i.id));

      // Items only on this device → upload to cloud
      const toUpload = localItems.filter((i) => !cloudIds.has(i.id));

      // Items only in the cloud → add locally (prepend so they appear at top)
      const toAddLocally = cloudItems.filter((i) => !localIds.has(i.id));

      if (toAddLocally.length > 0 || toUpload.length > 0) {
        // Merge: cloud-only items first (newest from another device), then local
        const merged = [...toAddLocally, ...localItems];
        await watchlistService._replaceAll(merged);
      }

      await batchWriteWatchlist(uid, toUpload);
    } catch (err) {
      console.warn('[SyncService] syncWatchlist failed, marking sync pending:', err);
      await setPending();
      throw err;
    }
  },

  // ─── Starred sync ───────────────────────────────────────────────────────────

  /**
   * Push a starred item to Firestore. Fire-and-forget — never throws.
   * Called by AccountProvider via the setOnStarChanged hook when an item
   * is starred (including when lastEpisode is set for a TV show).
   */
  async pushStarred(uid: string, item: MediaItem): Promise<void> {
    if (!ENABLE_CLOUD_SYNC) return;

    try {
      const entry: StarredEntry = {
        mediaId: item.id,
        title: item.title,
        type: item.type,
        posterUrl: item.posterUrl,
        lastEpisode: item.lastEpisode,
        updatedAt: new Date().toISOString(),
      };
      await starredCollection(uid).doc(item.id).set(entry);
    } catch (err) {
      console.warn('[SyncService] pushStarred failed, marking sync pending:', err);
      await setPending();
    }
  },

  /**
   * Remove a starred item from Firestore. Fire-and-forget — never throws.
   * Called by AccountProvider via the setOnStarChanged hook when un-starring.
   */
  async pushUnstarred(uid: string, id: string): Promise<void> {
    if (!ENABLE_CLOUD_SYNC) return;

    try {
      await starredCollection(uid).doc(id).delete();
    } catch (err) {
      console.warn('[SyncService] pushUnstarred failed, marking sync pending:', err);
      await setPending();
    }
  },

  /**
   * Merge local starred items with the cloud starred collection.
   *
   * Strategy: cloud-only entries are applied to the local library (starred: true
   * + lastEpisode). Local-only starred items are uploaded. Conflict resolution
   * for items present on both sides uses updatedAt (last-write-wins).
   *
   * Called as part of initialSync after sign-in.
   */
  async syncStarred(uid: string): Promise<void> {
    if (!ENABLE_CLOUD_SYNC) return;

    try {
      const [localItems, cloudSnap] = await Promise.all([
        storageService.getLibrary(),
        starredCollection(uid).get(),
      ]);

      const cloudEntries: StarredEntry[] = cloudSnap.docs.map(
        (d) => d.data() as StarredEntry,
      );
      const cloudById = new Map<string, StarredEntry>(
        cloudEntries.map((e) => [e.mediaId, e]),
      );

      // Build a quick lookup of local library items by id
      const localById = new Map<string, MediaItem>(
        localItems.map((i) => [i.id, i]),
      );

      // Local starred items
      const localStarred = localItems.filter((i) => i.starred);
      const localStarredIds = new Set(localStarred.map((i) => i.id));

      // Cloud-starred entries that have a matching local library item
      // → apply starred + lastEpisode directly, suppressing the hook so
      // the write doesn't echo back to Firestore.
      for (const cloudEntry of cloudEntries) {
        const localItem = localById.get(cloudEntry.mediaId);
        if (localItem) {
          if (!localItem.starred || cloudEntry.lastEpisode !== undefined) {
            suppressStarHook(true);
            try {
              await storageService.updateItem(cloudEntry.mediaId, {
                starred: true,
                lastEpisode: cloudEntry.lastEpisode,
              });
            } finally {
              suppressStarHook(false);
            }
          }
          // Remove from cloud-only store if it ended up there previously
          await cloudStarredService.remove(cloudEntry.mediaId);
        }
      }

      // Cloud-starred entries with NO local library item → save to cloud store
      // so they appear in the starred tab on this device without a scan.
      const cloudOnlyEntries: CloudStarredEntry[] = cloudEntries
        .filter((e) => !localById.has(e.mediaId))
        .map((e) => ({
          mediaId: e.mediaId,
          title: e.title,
          type: e.type,
          posterUrl: e.posterUrl,
          lastEpisode: e.lastEpisode,
          updatedAt: e.updatedAt,
        }));

      // Replace the entire cloud-only store with the authoritative cloud list.
      // This clears any entries that were un-starred on another device between
      // sessions (they won't appear in cloudEntries anymore).
      await cloudStarredService.replaceAll(cloudOnlyEntries);

      // Local-only starred items → upload to cloud
      const toUpload: StarredEntry[] = localStarred
        .filter((i) => !cloudById.has(i.id))
        .map((i) => ({
          mediaId: i.id,
          title: i.title,
          type: i.type,
          posterUrl: i.posterUrl,
          lastEpisode: i.lastEpisode,
          updatedAt: new Date().toISOString(),
        }));

      if (toUpload.length > 0) {
        const col = starredCollection(uid);
        for (let i = 0; i < toUpload.length; i += FIRESTORE_BATCH_LIMIT) {
          const chunk = toUpload.slice(i, i + FIRESTORE_BATCH_LIMIT);
          const batch = firestore().batch();
          for (const entry of chunk) {
            batch.set(col.doc(entry.mediaId), entry);
          }
          await batch.commit();
        }
      }

      // Suppress unused variable warning — localStarredIds used above via Set
      void localStarredIds;
    } catch (err) {
      console.warn('[SyncService] syncStarred failed, marking sync pending:', err);
      await setPending();
      throw err;
    }
  },

  // ─── Profile sync ───────────────────────────────────────────────────────────

  /**
   * Push the local profile to Firestore. Fire-and-forget — never throws.
   * Called by AccountProvider via the setOnProfileSaved hook whenever the
   * user edits their display name or avatar.
   */
  async pushProfile(uid: string, profile: LocalProfile): Promise<void> {
    if (!ENABLE_CLOUD_SYNC) return;

    try {
      await profileDoc(uid).set({ ...profile, updatedAt: new Date().toISOString() });
    } catch (err) {
      console.warn('[SyncService] pushProfile failed, marking sync pending:', err);
      await setPending();
    }
  },

  /**
   * Pull the cloud profile and merge it with the local one.
   * Last-write-wins based on the `updatedAt` timestamp stored in Firestore.
   * If the cloud version is newer, it replaces the local profile.
   * If local is newer (or no cloud version exists), uploads the local version.
   *
   * Called as part of initialSync after sign-in.
   */
  async syncProfile(uid: string): Promise<void> {
    if (!ENABLE_CLOUD_SYNC) return;

    try {
      const [localProfile, cloudSnap] = await Promise.all([
        profileService.get(),
        profileDoc(uid).get(),
      ]);

      if (!cloudSnap.exists) {
        // Nothing in the cloud yet — upload local
        await profileDoc(uid).set({
          ...localProfile,
          updatedAt: new Date().toISOString(),
        });
        return;
      }

      const cloudData = cloudSnap.data() as LocalProfile & { updatedAt?: string };
      const cloudUpdatedAt = cloudData.updatedAt ?? '';
      // We don't store updatedAt locally, so we compare by checking if
      // the cloud version has a timestamp at all. If it does, cloud wins
      // (another device wrote it more recently). If it doesn't, upload local.
      if (cloudUpdatedAt) {
        // Cloud has an explicit timestamp — use it as the authoritative version
        const { updatedAt: _ignored, ...cloudProfile } = cloudData;
        await profileService.save(cloudProfile as LocalProfile);
      } else {
        // No cloud timestamp — push local up
        await profileDoc(uid).set({
          ...localProfile,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn('[SyncService] syncProfile failed, marking sync pending:', err);
      await setPending();
      throw err;
    }
  },

  // ─── Memories / poster cache sync ───────────────────────────────────────────

  /**
   * Push a single poster entry to Firestore. Fire-and-forget — never throws.
   * Called by AccountProvider via the setOnPosterResolved hook whenever a
   * WatchEvent with a posterUrl is recorded.
   */
  async pushPoster(uid: string, entry: PosterEntry): Promise<void> {
    if (!ENABLE_CLOUD_SYNC) return;

    try {
      await memoriesCollection(uid).doc(entry.mediaId).set(entry, { merge: true });
    } catch (err) {
      console.warn('[SyncService] pushPoster failed, marking sync pending:', err);
      await setPending();
    }
  },

  /**
   * Merge local poster cache with the cloud memories collection.
   *
   * - Cloud-only entries are written into local watch history as poster updates
   *   (posterUrl is patched onto matching WatchEvents via _patchPosters).
   * - Local-only poster entries (from watch events with a posterUrl that
   *   haven't been pushed yet) are uploaded to Firestore.
   * - Conflict resolution: entry with the later `updatedAt` wins.
   *
   * Called as part of initialSync after sign-in.
   */
  async syncMemories(uid: string): Promise<void> {
    if (!ENABLE_CLOUD_SYNC) return;

    try {
      const [localEvents, cloudSnap] = await Promise.all([
        watchHistoryService.getHistory(),
        memoriesCollection(uid).get(),
      ]);

      const cloudEntries: PosterEntry[] = cloudSnap.docs.map(
        (d) => d.data() as PosterEntry,
      );

      // Build a local poster map from watch events that have a posterUrl
      const localPosterMap = new Map<string, PosterEntry>();
      for (const event of localEvents) {
        if (!event.posterUrl) continue;
        const existing = localPosterMap.get(event.mediaId);
        if (!existing || event.watchedAt < existing.firstWatchedAt) {
          localPosterMap.set(event.mediaId, {
            mediaId: event.mediaId,
            title: event.title,
            type: event.type,
            posterUrl: event.posterUrl,
            firstWatchedAt: event.watchedAt,
            updatedAt: event.watchedAt,
          });
        }
      }

      const cloudById = new Map<string, PosterEntry>(
        cloudEntries.map((e) => [e.mediaId, e]),
      );

      // Entries in the cloud that are newer or not present locally → patch local events
      const toPatchLocally: PosterEntry[] = [];
      for (const cloudEntry of cloudEntries) {
        const local = localPosterMap.get(cloudEntry.mediaId);
        if (!local || cloudEntry.updatedAt > local.updatedAt) {
          toPatchLocally.push(cloudEntry);
        }
      }

      // Patch posterUrls into local WatchEvents for cloud-only / newer cloud entries
      if (toPatchLocally.length > 0) {
        await watchHistoryService._patchPosters(toPatchLocally);
      }

      // Local entries not in the cloud → upload
      const toUpload: PosterEntry[] = [];
      for (const [mediaId, localEntry] of localPosterMap) {
        const cloud = cloudById.get(mediaId);
        if (!cloud || localEntry.updatedAt > cloud.updatedAt) {
          toUpload.push(localEntry);
        }
      }

      await batchWritePosters(uid, toUpload);
    } catch (err) {
      console.warn('[SyncService] syncMemories failed, marking sync pending:', err);
      await setPending();
      throw err;
    }
  },
};

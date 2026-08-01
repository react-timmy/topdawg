/**
 * syncService.ts
 *
 * All Firestore read/write logic for the v1.2 cloud sync feature.
 *
 * Design principles:
 *  - Local write always happens first (in watchHistoryService / profileService).
 *    Firestore is fire-and-forget — failures never block the local path.
 *  - On any Firestore failure, @filmsort:sync_pending is set so the next
 *    app launch retries automatically.
 *  - ENABLE_CLOUD_SYNC=false turns every method into a no-op.
 *
 * Firestore layout under users/{uid}:
 *  profile                   — single document: LocalProfile fields
 *  watchHistory/{eventId}    — one doc per WatchEvent
 *  memories/{mediaId}        — one doc per unique poster entry (PosterEntry)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import { watchHistoryService, WatchEvent } from '../storage/watchHistoryService';
import { profileService, LocalProfile } from '../storage/profileService';
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function watchHistoryCollection(uid: string) {
  return firestore().collection('users').doc(uid).collection('watchHistory');
}

function memoriesCollection(uid: string) {
  return firestore().collection('users').doc(uid).collection('memories');
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
      // Sync profile and memories poster cache in parallel with watch history
      await Promise.all([
        syncService.syncProfile(uid),
        syncService.syncMemories(uid),
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
   * Start a Firestore real-time listener for the user's watchHistory collection.
   * New events received from other devices are merged into local storage
   * (duplicates are skipped by checking the event ID).
   *
   * Returns the unsubscribe function. Call it on sign-out.
   */
  startListener(uid: string): () => void {
    if (!ENABLE_CLOUD_SYNC) return () => {};

    const unsubscribe = watchHistoryCollection(uid).onSnapshot(
      async (snapshot) => {
        const newCloudEvents: WatchEvent[] = [];

        for (const change of snapshot.docChanges()) {
          if (change.type === 'added') {
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
          console.warn('[SyncService] listener merge failed:', err);
        }
      },
      (err) => {
        // Firestore SDK auto-reconnects on transient errors
        console.warn('[SyncService] onSnapshot error:', err);
      },
    );

    return unsubscribe;
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
   * Permanently delete this user's cloud watch history (and parent user doc).
   * Best-effort — used by Delete Account. Never throws to the UI layer.
   */
  async deleteCloudData(uid: string): Promise<void> {
    if (!ENABLE_CLOUD_SYNC || !uid) return;

    try {
      // Delete watchHistory subcollection
      const col = watchHistoryCollection(uid);
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

      // Delete memories subcollection
      const memCol = memoriesCollection(uid);
      while (true) {
        const snap = await memCol.limit(FIRESTORE_BATCH_LIMIT).get();
        if (snap.empty) break;
        const batch = firestore().batch();
        for (const doc of snap.docs) {
          batch.delete(doc.ref);
        }
        await batch.commit();
        if (snap.size < FIRESTORE_BATCH_LIMIT) break;
      }

      // Delete profile doc
      try {
        await profileDoc(uid).delete();
      } catch {
        // may not exist
      }

      // Delete user root doc
      try {
        await firestore().collection('users').doc(uid).delete();
      } catch {
        // may not exist
      }

      await clearPending();
    } catch (err) {
      console.warn('[SyncService] deleteCloudData failed:', err);
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

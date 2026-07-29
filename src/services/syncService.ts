/**
 * syncService.ts
 *
 * All Firestore read/write logic for the v1.2 cloud sync feature.
 *
 * Design principles:
 *  - Local write always happens first in watchHistoryService. Firestore is
 *    fire-and-forget here — failures never block the local path.
 *  - On any Firestore failure, @filmsort:sync_pending is set so the next
 *    app launch retries automatically.
 *  - ENABLE_CLOUD_SYNC=false turns every method into a no-op.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import { watchHistoryService, WatchEvent } from '../storage/watchHistoryService';
import { ENABLE_CLOUD_SYNC } from '../config/env';

// ─── Constants ────────────────────────────────────────────────────────────────

const SYNC_PENDING_KEY = '@filmsort:sync_pending';
const FIRESTORE_BATCH_LIMIT = 500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function watchHistoryCollection(uid: string) {
  return firestore().collection('users').doc(uid).collection('watchHistory');
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
      const col = watchHistoryCollection(uid);
      // Page through history docs and batch-delete
      // eslint-disable-next-line no-constant-condition
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
      try {
        await firestore().collection('users').doc(uid).delete();
      } catch {
        // parent doc may not exist
      }
      await clearPending();
    } catch (err) {
      console.warn('[SyncService] deleteCloudData failed:', err);
    }
  },
};

/**
 * collectionsService.ts
 *
 * Manages user Collections (curated named groups of movies/TV shows).
 * Collections support:
 *  - Local AsyncStorage (always)
 *  - Cloud backup to Firestore (Pro users only, opt-in via three-dot menu)
 *  - Items verified via quiz OR from user's library
 *
 * Storage keys:
 *  @filmsort:collections — array of Collection objects
 *
 * Sync hook (v1.2):
 *  AccountProvider registers a callback so every collection change can be
 *  pushed to Firestore (Pro users only, when backedUp flag is true).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Collection, CollectionItem } from '../types';
import uuid from 'react-native-uuid';
const uuidv4 = () => uuid.v4() as string;

const STORAGE_KEY = '@filmsort:collections';

// ─── Sync hook (v1.2) ─────────────────────────────────────────────────────────
// AccountProvider registers a callback here so backed-up collection changes
// are pushed to Firestore (Pro users only).

export type CollectionChangedEvent =
  | { action: 'created'; collection: Collection }
  | { action: 'updated'; collection: Collection }
  | { action: 'deleted'; id: string }
  | { action: 'item_added'; collectionId: string; item: CollectionItem }
  | { action: 'item_removed'; collectionId: string; itemId: string };

let _onCollectionChanged: ((event: CollectionChangedEvent) => void) | null = null;

/**
 * Register (or deregister) a callback invoked after any local write that
 * changes a collection (for Pro users with backedUp=true).
 * Pass null to remove the hook (on sign-out).
 */
export function setOnCollectionChanged(
  cb: ((event: CollectionChangedEvent) => void) | null,
): void {
  _onCollectionChanged = cb;
}

/**
 * When true, collection writes will NOT fire _onCollectionChanged.
 * Set this before writes that originate from the cloud listener or
 * initialSync to prevent the local write from echoing back to Firestore.
 */
let _suppressCollectionHook = false;

export function suppressCollectionHook(suppress: boolean): void {
  _suppressCollectionHook = suppress;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readAll(): Promise<Collection[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(collections: Collection[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(collections));
  } catch (err) {
    console.error('[CollectionsService] writeAll failed:', err);
    throw err;
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const collectionsService = {
  /**
   * Get all collections (both 'collection' and 'list' types).
   * Filter by listType if needed in the UI layer.
   */
  async getAll(): Promise<Collection[]> {
    return readAll();
  },

  /**
   * Get collections only (exclude lists).
   */
  async getCollections(): Promise<Collection[]> {
    const all = await readAll();
    return all.filter((c) => c.listType === 'collection');
  },

  /**
   * Get lists only (exclude collections).
   */
  async getLists(): Promise<Collection[]> {
    const all = await readAll();
    return all.filter((c) => c.listType === 'list');
  },

  /**
   * Get a single collection by ID.
   */
  async getById(id: string): Promise<Collection | null> {
    const all = await readAll();
    return all.find((c) => c.id === id) ?? null;
  },

  /**
   * Create a new collection or list.
   */
  async create(
    name: string,
    listType: 'collection' | 'list' = 'collection',
  ): Promise<Collection> {
    const now = new Date().toISOString();
    const newCollection: Collection = {
      id: uuidv4() as string,
      name,
      listType,
      items: [],
      createdAt: now,
      updatedAt: now,
      backedUp: false,
    };

    const all = await readAll();
    const updated = [newCollection, ...all];
    await writeAll(updated);

    // Notify sync layer (only if backedUp=true, but it's false initially)
    if (!_suppressCollectionHook && newCollection.backedUp) {
      _onCollectionChanged?.({ action: 'created', collection: newCollection });
    }

    return newCollection;
  },

  /**
   * Update collection metadata (name, backedUp flag).
   */
  async update(id: string, patch: Partial<Collection>): Promise<Collection | null> {
    const all = await readAll();
    const index = all.findIndex((c) => c.id === id);
    if (index === -1) return null;

    const updated = {
      ...all[index],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    all[index] = updated;
    await writeAll(all);

    // Notify sync layer (only if backedUp=true)
    if (!_suppressCollectionHook && updated.backedUp) {
      _onCollectionChanged?.({ action: 'updated', collection: updated });
    }

    return updated;
  },

  /**
   * Delete a collection or list.
   */
  async delete(id: string): Promise<void> {
    const all = await readAll();
    const target = all.find((c) => c.id === id);
    const filtered = all.filter((c) => c.id !== id);
    await writeAll(filtered);

    // Notify sync layer (only if backedUp=true)
    if (!_suppressCollectionHook && target?.backedUp) {
      _onCollectionChanged?.({ action: 'deleted', id });
    }
  },

  /**
   * Add an item to a collection.
   */
  async addItem(collectionId: string, item: CollectionItem): Promise<Collection | null> {
    const all = await readAll();
    const index = all.findIndex((c) => c.id === collectionId);
    if (index === -1) return null;

    const collection = all[index];

    // Prevent duplicates
    if (collection.items.some((i) => i.id === item.id)) {
      return collection;
    }

    const updatedCollection = {
      ...collection,
      items: [...collection.items, item],
      updatedAt: new Date().toISOString(),
    };
    all[index] = updatedCollection;
    await writeAll(all);

    // Notify sync layer (only if backedUp=true)
    if (!_suppressCollectionHook && updatedCollection.backedUp) {
      _onCollectionChanged?.({
        action: 'item_added',
        collectionId,
        item,
      });
    }

    return updatedCollection;
  },

  /**
   * Remove an item from a collection.
   */
  async removeItem(collectionId: string, itemId: string): Promise<Collection | null> {
    const all = await readAll();
    const index = all.findIndex((c) => c.id === collectionId);
    if (index === -1) return null;

    const collection = all[index];
    const updatedCollection = {
      ...collection,
      items: collection.items.filter((i) => i.id !== itemId),
      updatedAt: new Date().toISOString(),
    };
    all[index] = updatedCollection;
    await writeAll(all);

    // Notify sync layer (only if backedUp=true)
    if (!_suppressCollectionHook && updatedCollection.backedUp) {
      _onCollectionChanged?.({
        action: 'item_removed',
        collectionId,
        itemId,
      });
    }

    return updatedCollection;
  },

  /**
   * Toggle the backedUp flag for Pro users.
   * When set to true, the collection will be synced to Firestore.
   */
  async toggleBackup(id: string, backedUp: boolean): Promise<Collection | null> {
    return this.update(id, { backedUp });
  },

  /**
   * Reorder items within a collection.
   */
  async reorderItems(collectionId: string, items: CollectionItem[]): Promise<Collection | null> {
    const all = await readAll();
    const index = all.findIndex((c) => c.id === collectionId);
    if (index === -1) return null;

    const updatedCollection = {
      ...all[index],
      items,
      updatedAt: new Date().toISOString(),
    };
    all[index] = updatedCollection;
    await writeAll(all);

    // Notify sync layer (only if backedUp=true)
    if (!_suppressCollectionHook && updatedCollection.backedUp) {
      _onCollectionChanged?.({ action: 'updated', collection: updatedCollection });
    }

    return updatedCollection;
  },

  /**
   * Internal: replace the entire collections list with a pre-merged set.
   * Used exclusively by syncService during initialSync — not part of the public API.
   */
  async _replaceAll(collections: Collection[]): Promise<void> {
    try {
      await writeAll(collections);
    } catch (err) {
      console.warn('[CollectionsService] _replaceAll failed', err);
    }
  },

  /**
   * Clear all collections (used on account deletion or debug).
   */
  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // silently fail
    }
  },
};

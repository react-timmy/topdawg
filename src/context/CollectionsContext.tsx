/**
 * CollectionsContext.tsx
 *
 * Global context for Collections feature.
 * Manages collection sync hooks registration with AccountContext.
 * Provides easy access to collections state across the app.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  collectionsService,
  setOnCollectionChanged,
  CollectionChangedEvent,
} from '../storage/collectionsService';
import { syncService } from '../services/syncService';
import { useAccount } from './AccountContext';
import { Collection } from '../types';
import { ENABLE_CLOUD_SYNC } from '../config/env';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CollectionsContextValue {
  /** True once the initial load has completed. */
  loaded: boolean;
  /** All collections. */
  collections: Collection[];
  /** Refresh collections from storage. */
  refresh: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const CollectionsContext = createContext<CollectionsContextValue>({
  loaded: false,
  collections: [],
  refresh: async () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function CollectionsProvider({ children }: { children: React.ReactNode }) {
  const { account } = useAccount();
  const [loaded, setLoaded] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);

  // ── Load collections ──────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const collectionsData = await collectionsService.getCollections();
      setCollections(collectionsData);
      setLoaded(true);
    } catch (err) {
      console.warn('[CollectionsContext] Failed to load data:', err);
      setLoaded(true);
    }
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Register collection sync hook ─────────────────────────────────────────
  useEffect(() => {
    if (!ENABLE_CLOUD_SYNC || !account) {
      setOnCollectionChanged(null);
      return;
    }

    const handleCollectionChange = (event: CollectionChangedEvent) => {
      const { uid } = account;

      switch (event.action) {
        case 'created':
        case 'updated':
          if (event.collection.backedUp) {
            // Push to Firestore (Pro users only)
            void syncService.pushCollection(uid, event.collection);
          }
          break;

        case 'deleted':
          // Always push deletions (removes from cloud if it was backed up)
          void syncService.pushCollectionDelete(uid, event.id);
          break;

        case 'item_added':
        case 'item_removed':
          // Item changes trigger an 'updated' event, handled above
          break;
      }

      // Refresh local state to reflect changes
      void refresh();
    };

    setOnCollectionChanged(handleCollectionChange);

    return () => {
      setOnCollectionChanged(null);
    };
  }, [account, refresh]);

  return (
    <CollectionsContext.Provider value={{ loaded, collections, refresh }}>
      {children}
    </CollectionsContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCollections(): CollectionsContextValue {
  return useContext(CollectionsContext);
}

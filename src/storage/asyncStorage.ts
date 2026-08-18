import AsyncStorage from '@react-native-async-storage/async-storage';
import { MediaItem, LocalFile } from '../types';

const LIBRARY_KEY = '@cinescan:library';
const RECENTLY_MATCHED_KEY = '@cinescan:recently_matched';
/** Cap so the list cannot grow without bound across many scans. */
const RECENTLY_MATCHED_MAX = 200;


// Add scan status key and hook definitions after exports (module-scoped)
const SCAN_STATUS_KEY = '@cinescan:scan_status';
let _scanStatusListeners = new Set<(s: string) => void>();

export function setOnScanStatusChanged(cb: ((s: string) => void) | null) {
  if (cb) _scanStatusListeners.add(cb);
}

export function removeOnScanStatusChanged(cb: (s: string) => void) {
  _scanStatusListeners.delete(cb);
}

// Scan FAB visibility key + hook
const SCAN_FAB_VISIBLE_KEY = '@cinescan:scan_fab_visible';
let _scanFabVisibilityListeners = new Set<(v: boolean) => void>();
let lastSavedVisibility: boolean | null = null;

export function setOnScanFabVisibilityChanged(cb: ((v: boolean) => void) | null) {
  if (cb) _scanFabVisibilityListeners.add(cb);
}

export function removeOnScanFabVisibilityChanged(cb: (v: boolean) => void) {
  _scanFabVisibilityListeners.delete(cb);
}

// ── Last scan summary persistence ───────────────────────────────────────────
const LAST_SCAN_KEY = '@cinescan:last_scan_result';

export type LastScanResult = {
  timestamp: string;
  progress?: {
    total?: number;
    processed?: number;
    scanned?: number;
    matched?: number;
    added?: number;
    skipped?: number;
    phase?: string;
  };
  matched?: Array<{ id?: string; title?: string; posterUrl?: string; filename?: string }>;
  unmatched?: Array<{ uri?: string; filename?: string }>;
};

export async function saveLastScanResult(result: LastScanResult | null): Promise<void> {
  try {
    if (result === null) {
      await AsyncStorage.removeItem(LAST_SCAN_KEY);
      return;
    }
    await AsyncStorage.setItem(LAST_SCAN_KEY, JSON.stringify(result));
  } catch (err) {
    console.error('[Storage] saveLastScanResult failed:', err);
  }
}

export async function getLastScanResult(): Promise<LastScanResult | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SCAN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastScanResult;
  } catch (err) {
    return null;
  }
}

export async function clearLastScanResult(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LAST_SCAN_KEY);
  } catch (err) {
  }
}

// ─── Sync hook (v1.2) ─────────────────────────────────────────────────────────
// AccountProvider registers a callback here so every starred/unstarred change
// (and any update that touches starred or lastEpisode) is also pushed to
// Firestore — without creating a direct dependency on Firestore here.

export type StarChangedEvent =
  | { action: 'starred'; item: MediaItem }   // item now has starred: true
  | { action: 'unstarred'; id: string };     // item was un-starred

let _onStarChanged: ((event: StarChangedEvent) => void) | null = null;

/**
 * Register (or deregister) a callback invoked after any local write that
 * changes a library item's starred state or lastEpisode.
 * Pass null to remove the hook (on sign-out).
 */
export function setOnStarChanged(
  cb: ((event: StarChangedEvent) => void) | null,
): void {
  _onStarChanged = cb;
}

/**
 * When true, updateItem and toggleStar will NOT fire _onStarChanged.
 * Set this before writes that originate from the cloud listener or
 * initialSync to prevent the local write from echoing back to Firestore.
 */
let _suppressStarHook = false;

export function suppressStarHook(suppress: boolean): void {
  _suppressStarHook = suppress;
}


/** Migrate legacy bare-numeric ids → `movie:123` / `tv:123`. */
function normalizeItemId(item: MediaItem): MediaItem {
  if (item.id.includes(':')) return item;
  return { ...item, id: `${item.type}:${item.id}` };
}

function filesOf(item: MediaItem): LocalFile[] {
  return item.localFiles ?? (item.localFile ? [item.localFile] : []);
}

function fileKey(f: LocalFile): string {
  return `${f.uri}::${f.filename}`;
}

function mergeFiles(existing: LocalFile[], incoming: LocalFile[]): LocalFile[] {
  const seen = new Set(existing.map(fileKey));
  const merged = [...existing];
  for (const f of incoming) {
    const k = fileKey(f);
    if (!seen.has(k)) {
      seen.add(k);
      merged.push(f);
    }
  }
  return merged;
}

/** Merge `item` into an in-memory library array (no I/O). */
function mergeItemInto(library: MediaItem[], item: MediaItem): MediaItem[] {
  const normalized = normalizeItemId(item);
  const incomingFiles = filesOf(normalized);
  const existingIndex = library.findIndex((i) => i.id === normalized.id);

  if (existingIndex > -1) {
    const existing = library[existingIndex];
    const updatedFiles = mergeFiles(filesOf(existing), incomingFiles);
    const next = [...library];
    next[existingIndex] = {
      ...existing,
      // Prefer fresher metadata from the new match while keeping stars
      ...normalized,
      starred: existing.starred,
      localFiles: updatedFiles,
      localFile: updatedFiles[updatedFiles.length - 1] ?? existing.localFile,
    };
    return next;
  }

  return [
    {
      ...normalized,
      localFiles: incomingFiles,
      localFile: incomingFiles[0] ?? normalized.localFile,
    },
    ...library,
  ];
}

const INDEX_KEY = '@cinescan:library_index';
const MEDIA_PREFIX = '@cinescan:media:';

async function migrateIfNecessary(): Promise<void> {
  try {
    const oldRaw = await AsyncStorage.getItem(LIBRARY_KEY);
    if (oldRaw) {
      const items = JSON.parse(oldRaw) as MediaItem[];
      const normalized = items.map(normalizeItemId);
      const ids = normalized.map(i => i.id);
      
      const chunks: [string, string][][] = [];
      let currentChunk: [string, string][] = [[INDEX_KEY, JSON.stringify(ids)]];
      for (const item of normalized) {
        currentChunk.push([`${MEDIA_PREFIX}${item.id}`, JSON.stringify(item)]);
        if (currentChunk.length >= 200) {
          chunks.push(currentChunk);
          currentChunk = [];
        }
      }
      if (currentChunk.length > 0) chunks.push(currentChunk);
      
      for (const chunk of chunks) {
        await AsyncStorage.multiSet(chunk);
      }
      await AsyncStorage.removeItem(LIBRARY_KEY);
    }
  } catch (err) {
    console.error('[Storage] Migration failed:', err);
  }
}

export const storageService = {
  async getLibrary(): Promise<MediaItem[]> {
    try {
      await migrateIfNecessary();
      
      const indexRaw = await AsyncStorage.getItem(INDEX_KEY);
      if (!indexRaw) return [];
      const ids = JSON.parse(indexRaw) as string[];
      if (ids.length === 0) return [];
      
      const keys = ids.map(id => `${MEDIA_PREFIX}${id}`);
      const results: [string, string | null][] = [];
      for (let i = 0; i < keys.length; i += 300) {
        const batch = await AsyncStorage.multiGet(keys.slice(i, i + 300));
        results.push(...batch);
      }
      
      const items: MediaItem[] = [];
      for (const [k, v] of results) {
        if (v) items.push(normalizeItemId(JSON.parse(v)));
      }
      
      const itemMap = new Map(items.map(i => [i.id, i]));
      return ids.map(id => itemMap.get(id)).filter(Boolean) as MediaItem[];
    } catch {
      return [];
    }
  },

  async saveLibrary(items: MediaItem[]): Promise<void> {
    try {
      const normalized = items.map(normalizeItemId);
      const ids = normalized.map(i => i.id);
      
      const oldIndexRaw = await AsyncStorage.getItem(INDEX_KEY);
      const oldIds = oldIndexRaw ? JSON.parse(oldIndexRaw) as string[] : [];
      const removedIds = oldIds.filter(id => !ids.includes(id));
      
      if (removedIds.length > 0) {
        await AsyncStorage.multiRemove(removedIds.map(id => `${MEDIA_PREFIX}${id}`));
      }
      
      const chunks: [string, string][][] = [];
      let currentChunk: [string, string][] = [[INDEX_KEY, JSON.stringify(ids)]];
      for (const item of normalized) {
        currentChunk.push([`${MEDIA_PREFIX}${item.id}`, JSON.stringify(item)]);
        if (currentChunk.length >= 200) {
          chunks.push(currentChunk);
          currentChunk = [];
        }
      }
      if (currentChunk.length > 0) chunks.push(currentChunk);
      
      for (const chunk of chunks) {
        await AsyncStorage.multiSet(chunk);
      }
    } catch (err) {
      console.error('[Storage] saveLibrary failed:', err);
      throw err;
    }
  },

  async addItem(item: MediaItem): Promise<MediaItem[]> {
    const current = await storageService.getLibrary();
    const updated = mergeItemInto(current, item);
    
    const normalized = normalizeItemId(item);
    const updatedItem = updated.find(i => i.id === normalized.id);
    if (updatedItem) {
      await AsyncStorage.multiSet([
        [INDEX_KEY, JSON.stringify(updated.map(i => i.id))],
        [`${MEDIA_PREFIX}${updatedItem.id}`, JSON.stringify(updatedItem)]
      ]);
    }
    return updated;
  },

  async addItems(items: MediaItem[]): Promise<MediaItem[]> {
    if (items.length === 0) return storageService.getLibrary();

    let current = await storageService.getLibrary();
    const pairs: [string, string][] = [];
    
    for (const item of items) {
      current = mergeItemInto(current, item);
      const normalized = normalizeItemId(item);
      const updatedItem = current.find(i => i.id === normalized.id);
      if (updatedItem) {
        pairs.push([`${MEDIA_PREFIX}${updatedItem.id}`, JSON.stringify(updatedItem)]);
      }
    }
    
    pairs.push([INDEX_KEY, JSON.stringify(current.map(i => i.id))]);
    
    const chunks: [string, string][][] = [];
    for (let i = 0; i < pairs.length; i += 200) {
      chunks.push(pairs.slice(i, i + 200));
    }
    for (const chunk of chunks) {
      await AsyncStorage.multiSet(chunk);
    }
    
    console.log(`[Storage] addItems: wrote ${items.length} match(es) → library now ${current.length} title(s)`);
    return current;
  },

  async removeItem(id: string): Promise<MediaItem[]> {
    const current = await storageService.getLibrary();
    const updated = current.filter((i) => i.id !== id);
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(updated.map(i => i.id)));
    await AsyncStorage.removeItem(`${MEDIA_PREFIX}${id}`);
    return updated;
  },

  async toggleStar(id: string): Promise<MediaItem[]> {
    const current = await storageService.getLibrary();
    const itemIndex = current.findIndex(i => i.id === id);
    if (itemIndex > -1) {
      const item = current[itemIndex];
      item.starred = !item.starred;
      await AsyncStorage.setItem(`${MEDIA_PREFIX}${item.id}`, JSON.stringify(item));
      
      if (!_suppressStarHook) {
        if (item.starred) _onStarChanged?.({ action: 'starred', item });
        else _onStarChanged?.({ action: 'unstarred', id });
      }
    }
    return current;
  },

  async updateItem(id: string, patch: Partial<MediaItem>): Promise<MediaItem[]> {
    const current = await storageService.getLibrary();
    const itemIndex = current.findIndex((i) => i.id === id);
    if (itemIndex > -1) {
      const item = { ...current[itemIndex], ...patch };
      current[itemIndex] = item;
      await AsyncStorage.setItem(`${MEDIA_PREFIX}${item.id}`, JSON.stringify(item));

      if (!_suppressStarHook && ('starred' in patch || 'lastEpisode' in patch)) {
        if (item.starred) _onStarChanged?.({ action: 'starred', item });
        else if ('starred' in patch && !item.starred) _onStarChanged?.({ action: 'unstarred', id });
      }
    }
    return current;
  },

  async rematchItem(oldItem: MediaItem, newItem: MediaItem): Promise<MediaItem[]> {
    let current = await storageService.getLibrary();
    const targetFile = oldItem.localFile;
    if (!targetFile) return current;

    const oldId = normalizeItemId(oldItem).id;
    const oldItemIndex = current.findIndex((i) => i.id === oldId || i.id === oldItem.id);
    let itemRemoved = false;
    
    if (oldItemIndex > -1) {
      const existingItem = current[oldItemIndex];
      const existingFiles = filesOf(existingItem);
      const updatedFiles = existingFiles.filter(
        (f) => f.uri !== targetFile.uri && f.filename !== targetFile.filename,
      );

      if (updatedFiles.length === 0) {
        current = current.filter((_, idx) => idx !== oldItemIndex);
        await AsyncStorage.removeItem(`${MEDIA_PREFIX}${oldId}`);
        itemRemoved = true;
      } else {
        const updatedOldItem = {
          ...existingItem,
          localFiles: updatedFiles,
          localFile: updatedFiles[0],
        };
        current[oldItemIndex] = updatedOldItem;
        await AsyncStorage.setItem(`${MEDIA_PREFIX}${oldId}`, JSON.stringify(updatedOldItem));
      }
    }

    if (itemRemoved) {
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(current.map(i => i.id)));
    }
    
    return await storageService.addItem(newItem);
  },

  async clearLibrary(): Promise<void> {
    try {
      const indexRaw = await AsyncStorage.getItem(INDEX_KEY);
      if (indexRaw) {
        const ids = JSON.parse(indexRaw) as string[];
        const keys = ids.map(id => `${MEDIA_PREFIX}${id}`);
        keys.push(INDEX_KEY);
        
        for (let i = 0; i < keys.length; i += 300) {
          await AsyncStorage.multiRemove(keys.slice(i, i + 300));
        }
      }
      await AsyncStorage.removeItem(LIBRARY_KEY); // just in case
    } catch {
      // silently fail
    }
  },

  // ── Recently matched (scanner screen history) ──────────────────────────────

  async getRecentlyMatched(): Promise<MediaItem[]> {
    try {
      const raw = await AsyncStorage.getItem(RECENTLY_MATCHED_KEY);
      if (!raw) return [];
      const items = JSON.parse(raw) as MediaItem[];
      return Array.isArray(items) ? items.map(normalizeItemId) : [];
    } catch {
      return [];
    }
  },

  async saveRecentlyMatched(items: MediaItem[]): Promise<void> {
    try {
      const trimmed = items.slice(0, RECENTLY_MATCHED_MAX).map(normalizeItemId);
      await AsyncStorage.setItem(RECENTLY_MATCHED_KEY, JSON.stringify(trimmed));
    } catch (err) {
      console.error('[Storage] saveRecentlyMatched failed:', err);
    }
  },

  async clearRecentlyMatched(): Promise<void> {
    try {
      await AsyncStorage.removeItem(RECENTLY_MATCHED_KEY);
    } catch {
      // silently fail
    }
  },

  // ── Scan status (for UI indicators) ───────────────────────────────────────
  async getScanStatus(): Promise<string | null> {
    try {
      const raw = await AsyncStorage.getItem(SCAN_STATUS_KEY);
      return raw;
    } catch {
      return null;
    }
  },

  async saveScanStatus(status: string): Promise<void> {
    try {
      await AsyncStorage.setItem(SCAN_STATUS_KEY, status);
      // notify hook if set
      for (const cb of _scanStatusListeners) {
        try { cb(status); } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.error('[Storage] saveScanStatus failed:', err);
    }
  },

  async clearScanStatus(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SCAN_STATUS_KEY);
      for (const cb of _scanStatusListeners) {
        try { cb('idle'); } catch (e) { /* ignore */ }
      }
    } catch {
      // silently fail
    }
  },

  // ── Scan FAB visibility (shared between Movies/TV screens)
  async getScanFabVisibility(): Promise<boolean> {
    if (lastSavedVisibility !== null) {
      return lastSavedVisibility;
    }
    try {
      const raw = await AsyncStorage.getItem(SCAN_FAB_VISIBLE_KEY);
      const val = raw === null ? true : raw === '1';
      lastSavedVisibility = val;
      return val;
    } catch {
      return true;
    }
  },

  async saveScanFabVisibility(visible: boolean): Promise<void> {
    if (lastSavedVisibility === visible) {
      return;
    }
    lastSavedVisibility = visible;
    try {
      await AsyncStorage.setItem(SCAN_FAB_VISIBLE_KEY, visible ? '1' : '0');
      for (const cb of _scanFabVisibilityListeners) {
        try { cb(visible); } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.error('[Storage] saveScanFabVisibility failed:', err);
    }
  },

  saveLastScanResult,
  getLastScanResult,
  clearLastScanResult,
  setOnScanFabVisibilityChanged,
};




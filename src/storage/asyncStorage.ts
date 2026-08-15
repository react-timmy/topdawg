import AsyncStorage from '@react-native-async-storage/async-storage';
import { MediaItem, LocalFile } from '../types';

const LIBRARY_KEY = '@cinescan:library';
const RECENTLY_MATCHED_KEY = '@cinescan:recently_matched';
/** Cap so the list cannot grow without bound across many scans. */
const RECENTLY_MATCHED_MAX = 200;

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

export const storageService = {
  async getLibrary(): Promise<MediaItem[]> {
    try {
      const raw = await AsyncStorage.getItem(LIBRARY_KEY);
      if (!raw) return [];
      const items = JSON.parse(raw) as MediaItem[];
      // Lazily migrate legacy ids in memory (persisted on next write)
      return items.map(normalizeItemId);
    } catch {
      return [];
    }
  },

  async saveLibrary(items: MediaItem[]): Promise<void> {
    try {
      await AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(items.map(normalizeItemId)));
    } catch (err) {
      console.error('[Storage] saveLibrary failed:', err);
      throw err;
    }
  },

  async addItem(item: MediaItem): Promise<MediaItem[]> {
    const current = await storageService.getLibrary();
    const updated = mergeItemInto(current, item);
    await storageService.saveLibrary(updated);
    return updated;
  },

  /**
   * Add many matched items in one read/modify/write cycle.
   * Critical for scans: sequential addItem was fine, but this is faster and
   * guarantees every file from the same show is merged into localFiles.
   */
  async addItems(items: MediaItem[]): Promise<MediaItem[]> {
    if (items.length === 0) return storageService.getLibrary();

    let current = await storageService.getLibrary();
    for (const item of items) {
      current = mergeItemInto(current, item);
    }
    await storageService.saveLibrary(current);
    console.log(
      `[Storage] addItems: wrote ${items.length} match(es) → library now ${current.length} title(s)`,
    );
    return current;
  },

  async removeItem(id: string): Promise<MediaItem[]> {
    const current = await storageService.getLibrary();
    // getLibrary already normalizes ids; exact match is enough
    const updated = current.filter((i) => i.id !== id);
    await storageService.saveLibrary(updated);
    return updated;
  },

  async toggleStar(id: string): Promise<MediaItem[]> {
    const current = await storageService.getLibrary();
    const updated = current.map((i) =>
      i.id === id ? { ...i, starred: !i.starred } : i,
    );
    await storageService.saveLibrary(updated);

    // v1.2: notify sync layer (skip if this write came from the cloud listener)
    if (!_suppressStarHook) {
      const changed = updated.find((i) => i.id === id);
      if (changed) {
        if (changed.starred) {
          _onStarChanged?.({ action: 'starred', item: changed });
        } else {
          _onStarChanged?.({ action: 'unstarred', id });
        }
      }
    }

    return updated;
  },

  async updateItem(id: string, patch: Partial<MediaItem>): Promise<MediaItem[]> {
    const current = await storageService.getLibrary();
    const updated = current.map((i) =>
      i.id === id ? { ...i, ...patch } : i,
    );
    await storageService.saveLibrary(updated);

    // v1.2: notify sync layer if starred state or lastEpisode changed
    // Skip if this write came from the cloud listener to prevent echo loops.
    if (!_suppressStarHook && ('starred' in patch || 'lastEpisode' in patch)) {
      const changed = updated.find((i) => i.id === id);
      if (changed) {
        if (changed.starred) {
          _onStarChanged?.({ action: 'starred', item: changed });
        } else if ('starred' in patch && !changed.starred) {
          _onStarChanged?.({ action: 'unstarred', id });
        }
      }
    }

    return updated;
  },

  async rematchItem(oldItem: MediaItem, newItem: MediaItem): Promise<MediaItem[]> {
    let current = await storageService.getLibrary();
    const targetFile = oldItem.localFile;
    if (!targetFile) return current;

    const oldId = normalizeItemId(oldItem).id;
    const oldItemIndex = current.findIndex((i) => i.id === oldId || i.id === oldItem.id);
    if (oldItemIndex > -1) {
      const existingItem = current[oldItemIndex];
      const existingFiles = filesOf(existingItem);
      const updatedFiles = existingFiles.filter(
        (f) => f.uri !== targetFile.uri && f.filename !== targetFile.filename,
      );

      if (updatedFiles.length === 0) {
        current = current.filter((_, idx) => idx !== oldItemIndex);
      } else {
        current[oldItemIndex] = {
          ...existingItem,
          localFiles: updatedFiles,
          localFile: updatedFiles[0],
        };
      }
    }

    await storageService.saveLibrary(current);
    return await storageService.addItem(newItem);
  },

  async clearLibrary(): Promise<void> {
    try {
      await AsyncStorage.removeItem(LIBRARY_KEY);
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
      try { _onScanStatusChanged?.(status); } catch (e) { /* ignore */ }
    } catch (err) {
      console.error('[Storage] saveScanStatus failed:', err);
    }
  },

  async clearScanStatus(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SCAN_STATUS_KEY);
      try { _onScanStatusChanged?.('idle'); } catch (e) { /* ignore */ }
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
      try { _onScanFabVisibilityChanged?.(visible); } catch (e) { /* ignore */ }
    } catch (err) {
      console.error('[Storage] saveScanFabVisibility failed:', err);
    }
  },
};

// Add scan status key and hook definitions after exports (module-scoped)
const SCAN_STATUS_KEY = '@cinescan:scan_status';
let _onScanStatusChanged: ((s: string) => void) | null = null;

export function setOnScanStatusChanged(cb: ((s: string) => void) | null) {
  _onScanStatusChanged = cb;
}

// Scan FAB visibility key + hook
const SCAN_FAB_VISIBLE_KEY = '@cinescan:scan_fab_visible';
let _onScanFabVisibilityChanged: ((v: boolean) => void) | null = null;
let lastSavedVisibility: boolean | null = null;

export function setOnScanFabVisibilityChanged(cb: ((v: boolean) => void) | null) {
  _onScanFabVisibilityChanged = cb;
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
    // ignore
  }
}

// Attach helpers onto storageService for convenience
try {
  // @ts-ignore - dynamic augmentation
  storageService.saveLastScanResult = saveLastScanResult;
  // @ts-ignore
  storageService.getLastScanResult = getLastScanResult;
  // @ts-ignore
  storageService.clearLastScanResult = clearLastScanResult;
  // Attach FAB visibility hook for compatibility (allows storageService.setOnScanFabVisibilityChanged(...))
  try {
    // @ts-ignore
    storageService.setOnScanFabVisibilityChanged = setOnScanFabVisibilityChanged;
  } catch (err) {
    // ignore
  }
} catch (e) {
  // ignore
}


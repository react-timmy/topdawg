/**
 * Library Export (SAF) — Pro "Folder Magic" on disk
 *
 * Android: user picks a destination folder via Storage Access Framework.
 * We create Movies/ and TV Shows/... trees and copy each video with a
 * clean Plex-style name.
 *
 * iOS: no SAF directory picker; we write under the app Documents folder
 * (visible in the Files app as On My iPhone → FilmSort).
 *
 * IMPORTANT (Android large files):
 *   Expo JS APIs (File.bytes / base64 / File.open) either OOM or reject SAF
 *   content:// destinations. The correct path is a **native stream copy**:
 *   ContentResolver InputStream → OutputStream with a fixed buffer
 *   (see modules/filmsort-saf-copy). Never load multi‑hundred‑MB videos
 *   into the JS heap.
 *
 *   Library playback URIs are never rewritten — FilmSort keeps the originals.
 *
 * Default mode is **copy** (safe). Optional "move" only deletes the source
 * after a size-verified successful export — MediaStore originals often
 * cannot be deleted.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { copyUriStreaming } from 'filmsort-saf-copy';
import { LocalFile, MediaItem } from '../types';
import { storageService } from '../storage/asyncStorage';
import {
  applyOrganizeLibrary,
  buildCleanDisplayName,
  buildFolderPath,
} from './fileOrganizeService';

const { StorageAccessFramework, documentDirectory, cacheDirectory } = FileSystem;

/** Persisted map of already-exported sources → destination (avoids duplicate copies). */
const EXPORT_LEDGER_KEY = '@filmsort:export_ledger_v1';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ExportProgress = {
  phase: 'picking' | 'preparing' | 'copying' | 'done' | 'cancelled' | 'error';
  message: string;
  current?: number;
  total?: number;
  currentFile?: string;
};

export type ExportMode = 'copy' | 'move';

export type ExportOptions = {
  mode?: ExportMode;
  /** Apply in-app displayName / folderPath before export. Default true. */
  organizeLabels?: boolean;
  /**
   * When true, re-copy even if the organized file already exists / was exported.
   * Default false — skip known exports to avoid Movies/Title (1).mp4 duplicates.
   */
  force?: boolean;
  onProgress?: (p: ExportProgress) => void;
};

export type ExportFileResult = {
  title: string;
  from: string;
  toRelative: string;
  ok: boolean;
  /** True when we skipped because the file was already in the destination. */
  skipped?: boolean;
  error?: string;
  deletedOriginal?: boolean;
};

export type ExportResult = {
  cancelled: boolean;
  rootUri: string | null;
  /** Human-readable where to look (Files app path hint). */
  rootHint: string;
  mode: ExportMode;
  copied: number;
  /** Already present in the destination tree (or recorded in the export ledger). */
  skipped: number;
  failed: number;
  deletedOriginals: number;
  results: ExportFileResult[];
};

type ExportLedgerEntry = {
  sourceUri: string;
  sourceFilename: string;
  rootUri: string;
  relativePath: string;
  displayName: string;
  destUri?: string;
  bytesWritten?: number;
  exportedAt: number;
};

type ExportLedger = Record<string, ExportLedgerEntry>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function filesOf(item: MediaItem): LocalFile[] {
  return item.localFiles ?? (item.localFile ? [item.localFile] : []);
}

function report(
  onProgress: ExportOptions['onProgress'],
  p: ExportProgress,
) {
  onProgress?.(p);
}

function splitName(displayName: string): { base: string; ext: string } {
  const m = displayName.match(/^(.*)(\.[A-Za-z0-9]{1,8})$/);
  if (m) return { base: m[1], ext: m[2].toLowerCase() };
  return { base: displayName, ext: '' };
}

function mimeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.mp4':
    case '.m4v':
      return 'video/mp4';
    case '.mkv':
      return 'video/x-matroska';
    case '.webm':
      return 'video/webm';
    case '.mov':
      return 'video/quicktime';
    case '.avi':
      return 'video/x-msvideo';
    case '.ts':
    case '.mts':
      return 'video/mp2t';
    case '.mpg':
    case '.mpeg':
      return 'video/mpeg';
    case '.wmv':
      return 'video/x-ms-wmv';
    case '.3gp':
      return 'video/3gpp';
    default:
      return 'video/*';
  }
}

function uriEndsWithName(uri: string, name: string): boolean {
  try {
    const decoded = decodeURIComponent(uri);
    return (
      decoded.endsWith(`/${name}`) ||
      decoded.endsWith(`/${name}/`) ||
      decoded.endsWith(name)
    );
  } catch {
    return uri.endsWith(name);
  }
}

/** Stable identity for a library source file. */
function sourceKey(file: Pick<LocalFile, 'uri' | 'filename'>): string {
  return file.uri;
}

/** Ledger key ties a source file to a specific export root folder. */
function ledgerKey(rootUri: string, sourceUri: string): string {
  return `${rootUri}::${sourceUri}`;
}

async function loadExportLedger(): Promise<ExportLedger> {
  try {
    const raw = await AsyncStorage.getItem(EXPORT_LEDGER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ExportLedger;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveExportLedger(ledger: ExportLedger): Promise<void> {
  try {
    await AsyncStorage.setItem(EXPORT_LEDGER_KEY, JSON.stringify(ledger));
  } catch (err) {
    console.warn('[Export] Failed to persist export ledger:', err);
  }
}

/**
 * Find a child file in a parent folder by display name (with extension).
 * Used to detect prior exports even if the in-app ledger was cleared.
 */
async function findChildByDisplayName(
  parentUri: string,
  displayName: string,
  useSaf: boolean,
): Promise<string | null> {
  if (useSaf) {
    try {
      const children = await StorageAccessFramework.readDirectoryAsync(parentUri);
      return children.find((c) => uriEndsWithName(c, displayName)) ?? null;
    } catch {
      return null;
    }
  }

  const path = parentUri.endsWith('/')
    ? `${parentUri}${displayName}`
    : `${parentUri}/${displayName}`;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists && !info.isDirectory) return path;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * True only when we found a real file in the destination tree (not a stale
 * ledger URI). Size 0 = broken stub → re-export. Unreadable size after a
 * successful directory match still counts as present.
 */
async function isUsableOnDiskExport(
  destUri: string | null | undefined,
  /** Must be true: URI came from listing/stat of the live destination folder */
  foundInDestinationTree: boolean,
): Promise<boolean> {
  if (!destUri || !foundInDestinationTree) return false;
  const size = await fileSizeBytes(destUri);
  if (size === 0) return false; // empty stub from a failed export
  // size null → SAF often can't report size; file was listed so treat as present
  return true;
}

/**
 * Walk / create nested folders under a SAF (or file://) root.
 * Caches intermediate URIs so we don't recreate every file.
 */
async function ensureFolderPath(
  rootUri: string,
  relativePath: string,
  cache: Map<string, string>,
  useSaf: boolean,
): Promise<string> {
  const parts = relativePath.split('/').filter(Boolean);
  if (parts.length === 0) return rootUri;

  let current = rootUri;
  let built = '';

  for (const part of parts) {
    built = built ? `${built}/${part}` : part;
    const cached = cache.get(built);
    if (cached) {
      current = cached;
      continue;
    }

    if (useSaf) {
      let next: string | null = null;
      try {
        const children = await StorageAccessFramework.readDirectoryAsync(current);
        next = children.find((c) => uriEndsWithName(c, part)) ?? null;
      } catch {
        /* empty or unreadable */
      }
      if (!next) {
        next = await StorageAccessFramework.makeDirectoryAsync(current, part);
      }
      cache.set(built, next);
      current = next;
    } else {
      // file:// under app documents
      const next = current.endsWith('/') ? `${current}${part}/` : `${current}/${part}/`;
      await FileSystem.makeDirectoryAsync(next, { intermediates: true });
      cache.set(built, next);
      current = next;
    }
  }

  return current;
}

/**
 * MediaDocumentsProvider content:// URIs cannot be opened with a plain
 * ContentResolver stream — Android requires ACTION_OPEN_DOCUMENT grants.
 * expo-media-library can still resolve a real localUri via the asset id.
 */
function extractMediaAssetIdCandidates(uri: string): string[] {
  const ids: string[] = [];
  const mediaStore = uri.match(
    /\/(?:video|images|audio|file)\/media\/(\d+)/i,
  );
  if (mediaStore?.[1]) ids.push(mediaStore[1]);

  try {
    const decoded = decodeURIComponent(uri);
    const docNum = decoded.match(
      /\/document\/(?:video|image|audio):(\d+)/i,
    );
    if (docNum?.[1]) ids.push(docNum[1]);
    const docFull = decoded.match(
      /\/document\/((?:video|image|audio):\d+)/i,
    );
    if (docFull?.[1]) ids.push(docFull[1]);
  } catch {
    /* ignore */
  }

  // Some devices put the MediaStore id at the end of the path
  const tail = uri.match(/\/(\d+)(?:\?.*)?$/);
  if (tail?.[1]) ids.push(tail[1]);

  return [...new Set(ids)];
}

async function ensureMediaLibraryPermission(): Promise<boolean> {
  try {
    const cur = await MediaLibrary.getPermissionsAsync();
    if (cur.granted) return true;
    const req = await MediaLibrary.requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}

/**
 * Turn a library/document URI into something we can actually stream
 * (prefer file:// localUri from MediaLibrary).
 */
async function resolveReadableSourceUri(
  sourceUri: string,
  opts?: { mediaAssetId?: string; filename?: string },
): Promise<string> {
  if (sourceUri.startsWith('file://')) {
    try {
      const info = await FileSystem.getInfoAsync(sourceUri);
      if (info.exists && !info.isDirectory) return sourceUri;
    } catch {
      /* fall through */
    }
  }

  const permitted = await ensureMediaLibraryPermission();
  if (!permitted) {
    console.warn('[Export] Media library permission not granted — export may fail');
    return sourceUri;
  }

  const idCandidates = [
    ...(opts?.mediaAssetId ? [opts.mediaAssetId] : []),
    ...extractMediaAssetIdCandidates(sourceUri),
  ];

  for (const id of idCandidates) {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(id);
      if (info.localUri) {
        console.log(
          `[Export] Resolved asset ${id} → localUri (${info.localUri.slice(0, 64)}…)`,
        );
        return info.localUri;
      }
      if (info.uri?.startsWith('file://')) return info.uri;
    } catch {
      /* try next candidate */
    }
  }

  // Fallback: find asset by exact uri or original filename (older library entries)
  try {
    let cursor: string | undefined;
    for (let page = 0; page < 40; page++) {
      const batch = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.video,
        first: 100,
        after: cursor,
      });
      const hit = batch.assets.find(
        (a) =>
          a.uri === sourceUri ||
          (!!opts?.filename && a.filename === opts.filename),
      );
      if (hit) {
        try {
          const info = await MediaLibrary.getAssetInfoAsync(hit.id);
          if (info.localUri) {
            console.log(
              `[Export] Matched library video "${hit.filename}" → localUri`,
            );
            return info.localUri;
          }
        } catch {
          if (hit.uri.startsWith('file://')) return hit.uri;
        }
        break;
      }
      if (!batch.hasNextPage) break;
      cursor = batch.endCursor;
    }
  } catch (e) {
    console.warn('[Export] MediaLibrary scan for source failed:', e);
  }

  return sourceUri;
}

/**
 * Materialize any content:// / ph:// / file:// source into a local file://
 * path that we can stream-read. Resolves MediaLibrary first.
 */
async function materializeToCacheFile(
  sourceUri: string,
  ext: string,
  jobIndex: number,
  opts?: { mediaAssetId?: string; filename?: string },
): Promise<{ path: string; cleanup: boolean }> {
  const readable = await resolveReadableSourceUri(sourceUri, opts);

  if (readable.startsWith('file://')) {
    const info = await FileSystem.getInfoAsync(readable);
    if (info.exists && !info.isDirectory) {
      return { path: readable, cleanup: false };
    }
  }

  if (!cacheDirectory) {
    throw new Error('Cache directory unavailable — cannot stage video for export.');
  }

  const safeExt = ext || '.mp4';
  const tempPath = `${cacheDirectory}filmsort-export-${Date.now()}-${jobIndex}${safeExt}`;

  // This is the only direction copyAsync is reliable for: * → file://
  await FileSystem.copyAsync({ from: readable, to: tempPath });

  const staged = await FileSystem.getInfoAsync(tempPath);
  if (!staged.exists || staged.isDirectory) {
    throw new Error('Failed to stage source video into app cache.');
  }
  const size = typeof staged.size === 'number' ? staged.size : 0;
  if (size <= 0) {
    try {
      await FileSystem.deleteAsync(tempPath, { idempotent: true });
    } catch {
      /* ignore */
    }
    throw new Error('Staged video is empty (0 bytes) — source may be unreadable.');
  }

  return { path: tempPath, cleanup: true };
}

/**
 * Write binary into a destination URI without loading the whole file into JS.
 *
 * Priority:
 *   1) Native 256 KiB stream (filmsort-saf-copy) — works for SAF content://
 *   2) file:// → file:// via legacy copyAsync (also streamed natively)
 *
 * Deliberately NO File.bytes() / base64 paths — they OOM on ~600MB+ videos.
 */
async function writeBinaryToUri(fromUri: string, toUri: string): Promise<number> {
  // Prefer native stream for everything on Android (handles content→SAF, file→SAF, etc.)
  if (Platform.OS === 'android') {
    try {
      const written = await copyUriStreaming(fromUri, toUri);
      if (!written || written <= 0) {
        throw new Error('Native stream copy wrote 0 bytes');
      }
      console.log(`[Export] Native stream copy: ${written} bytes → ${toUri.slice(0, 80)}…`);
      return written;
    } catch (err) {
      // Only fall through for pure file:// destinations
      console.warn('[Export] Native stream copy failed:', err);
      if (!toUri.startsWith('file://') || !fromUri.startsWith('file://')) {
        throw err;
      }
    }
  }

  // iOS / file→file fallback
  if (toUri.startsWith('file://')) {
    await FileSystem.copyAsync({ from: fromUri, to: toUri });
    const out = await fileSizeBytes(toUri);
    if (out == null || out <= 0) {
      throw new Error('Export wrote an empty file.');
    }
    return out;
  }

  throw new Error(
    'Cannot write to this destination without native SAF streaming. Rebuild the Android app after installing filmsort-saf-copy.',
  );
}

async function fileSizeBytes(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && typeof info.size === 'number') return info.size;
  } catch {
    /* fall through */
  }
  try {
    const f = new File(uri);
    if (f.exists && typeof f.size === 'number') return f.size;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Create destination + stream video bytes into it.
 * On Android, streams **directly** source → SAF (no full-file cache stage).
 * Staging is only a fallback if the native module is missing.
 *
 * If `existingDestUri` is set (force re-export into a known path), we overwrite
 * that document instead of createFileAsync (which would create "Name (1).mp4").
 */
async function copyToDestination(params: {
  fromUri: string;
  parentDirUri: string;
  displayName: string;
  useSaf: boolean;
  jobIndex: number;
  /** When set, stream into this existing document (overwrite). */
  existingDestUri?: string | null;
  mediaAssetId?: string;
  sourceFilename?: string;
}): Promise<{ destUri: string; bytesWritten: number }> {
  const {
    fromUri,
    parentDirUri,
    displayName,
    useSaf,
    jobIndex,
    existingDestUri,
    mediaAssetId,
    sourceFilename,
  } = params;
  const { base, ext } = splitName(displayName);
  const mime = mimeForExt(ext);
  const sourceOpts = { mediaAssetId, filename: sourceFilename };

  // Resolve MediaDocumentsProvider / MediaStore URIs to a readable local path first
  const readableFrom = await resolveReadableSourceUri(fromUri, sourceOpts);

  let destUri: string | null = existingDestUri ?? null;
  let createdNewSaf = false;
  let stagedPath: string | null = null;

  try {
    if (useSaf) {
      if (!destUri) {
        // createFileAsync name is WITHOUT extension (Android adds it from MIME)
        destUri = await StorageAccessFramework.createFileAsync(parentDirUri, base, mime);
        createdNewSaf = true;
      }

      try {
        // Stream resolved source → SAF (no JS heap)
        const written = await writeBinaryToUri(readableFrom, destUri);
        return { destUri, bytesWritten: written };
      } catch (directErr) {
        console.warn(
          '[Export] Direct stream failed, staging via cache then retrying:',
          directErr,
        );
        // Fallback: materialize to cache, then stream to SAF
        const staged = await materializeToCacheFile(
          fromUri,
          ext,
          jobIndex,
          sourceOpts,
        );
        stagedPath = staged.cleanup ? staged.path : null;
        const written = await writeBinaryToUri(staged.path, destUri);
        return { destUri, bytesWritten: written };
      }
    }

    // iOS / app documents: file:// destination
    const destPath =
      existingDestUri ||
      (parentDirUri.endsWith('/')
        ? `${parentDirUri}${displayName}`
        : `${parentDirUri}/${displayName}`);
    try {
      const size = await writeBinaryToUri(readableFrom, destPath);
      return { destUri: destPath, bytesWritten: size };
    } catch {
      const staged = await materializeToCacheFile(
        fromUri,
        ext,
        jobIndex,
        sourceOpts,
      );
      stagedPath = staged.cleanup ? staged.path : null;
      const size = await writeBinaryToUri(staged.path, destPath);
      return { destUri: destPath, bytesWritten: size };
    }
  } catch (err) {
    // Remove empty/partial SAF stub so the user doesn't keep a 0-byte "video"
    // Only delete if we just created it — never delete a prior good export.
    if (destUri && useSaf && createdNewSaf) {
      try {
        await StorageAccessFramework.deleteAsync(destUri, { idempotent: true });
      } catch {
        try {
          await FileSystem.deleteAsync(destUri, { idempotent: true });
        } catch {
          /* ignore */
        }
      }
    }
    throw err;
  } finally {
    if (stagedPath) {
      try {
        await FileSystem.deleteAsync(stagedPath, { idempotent: true });
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Only delete originals after a verified export. Never touch library URIs.
 * MediaStore content:// deletes usually fail (and that's fine).
 */
async function tryDeleteOriginal(uri: string): Promise<boolean> {
  // Refuse to delete MediaStore / provider URIs — they break the library
  // and often the only remaining playable copy FilmSort knows about.
  if (
    uri.startsWith('content://media/') ||
    uri.startsWith('ph://') ||
    uri.includes('com.android.providers.media')
  ) {
    console.warn('[Export] Skipping delete of MediaStore URI (keeps FilmSort playback working).');
    return false;
  }

  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    return true;
  } catch {
    return false;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Export the library into an organized folder tree on disk.
 * Android prompts for a folder; iOS uses app Documents.
 *
 * Skip only when the organized file is **actually present** in the destination
 * folder (live directory listing). Deleting Movies/TV Shows on the device
 * causes a re-export. The in-app ledger never overrides a missing file.
 * Use `force: true` to overwrite files that are still on disk.
 */
export async function exportOrganizedLibrary(
  options: ExportOptions = {},
): Promise<ExportResult> {
  const mode: ExportMode = options.mode ?? 'copy';
  const onProgress = options.onProgress;
  const organizeLabels = options.organizeLabels !== false;
  const force = options.force === true;

  report(onProgress, {
    phase: 'preparing',
    message: 'Preparing library…',
  });

  // Ensure clean names/paths exist on every file first
  let library: MediaItem[];
  if (organizeLabels) {
    const organized = await applyOrganizeLibrary();
    library = organized.library;
  } else {
    library = await storageService.getLibrary();
  }

  const jobs: {
    item: MediaItem;
    file: LocalFile;
    displayName: string;
    folderPath: string;
    relative: string;
  }[] = [];

  for (const item of library) {
    for (const file of filesOf(item)) {
      if (!file.uri) continue;
      const displayName = file.displayName || buildCleanDisplayName(item, file);
      const folderPath = file.folderPath || buildFolderPath(item, file);
      jobs.push({
        item,
        file,
        displayName,
        folderPath,
        relative: `${folderPath}/${displayName}`,
      });
    }
  }

  if (jobs.length === 0) {
    return {
      cancelled: false,
      rootUri: null,
      rootHint: '',
      mode,
      copied: 0,
      skipped: 0,
      failed: 0,
      deletedOriginals: 0,
      results: [],
    };
  }

  const useSaf = Platform.OS === 'android';
  let rootUri: string;
  let rootHint: string;

  if (useSaf) {
    report(onProgress, {
      phase: 'picking',
      message: 'Choose a destination folder…',
    });
    const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perm.granted) {
      report(onProgress, {
        phase: 'cancelled',
        message: 'Folder permission cancelled',
      });
      return {
        cancelled: true,
        rootUri: null,
        rootHint: '',
        mode,
        copied: 0,
        skipped: 0,
        failed: 0,
        deletedOriginals: 0,
        results: [],
      };
    }
    rootUri = perm.directoryUri;
    rootHint =
      'Open the Files app and open the folder you just granted FilmSort access to. Look for Movies/ and TV Shows/.';
  } else {
    if (!documentDirectory) {
      throw new Error('App document directory is not available on this device.');
    }
    rootUri = `${documentDirectory}FilmSort Library/`;
    await FileSystem.makeDirectoryAsync(rootUri, { intermediates: true });
    rootHint =
      'Open the Files app → On My iPhone/iPad → FilmSort → FilmSort Library. Look for Movies/ and TV Shows/.';
  }

  const ledger = await loadExportLedger();
  const dirCache = new Map<string, string>();
  // Cache per-folder directory listings so we don't re-read SAF for every file
  const childCache = new Map<string, string[] | null>();
  const results: ExportFileResult[] = [];
  let copied = 0;
  let skipped = 0;
  let failed = 0;
  let deletedOriginals = 0;
  let ledgerDirty = false;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    report(onProgress, {
      phase: 'copying',
      message: force
        ? `Exporting ${i + 1}/${jobs.length}`
        : `Checking ${i + 1}/${jobs.length}`,
      current: i + 1,
      total: jobs.length,
      currentFile: job.relative,
    });

    try {
      const parent = await ensureFolderPath(
        rootUri,
        job.folderPath,
        dirCache,
        useSaf,
      );

      const lKey = ledgerKey(rootUri, sourceKey(job.file));
      const prior = ledger[lKey];

      // ── Disk is source of truth ─────────────────────────────────────────
      // Always list the live destination folder. Never skip based only on
      // the in-app ledger — user may have deleted Movies/TV Shows on device.
      let existingOnDisk: string | null = null;
      if (useSaf) {
        if (!childCache.has(parent)) {
          try {
            childCache.set(
              parent,
              await StorageAccessFramework.readDirectoryAsync(parent),
            );
          } catch {
            childCache.set(parent, null);
          }
        }
        const children = childCache.get(parent);
        if (children) {
          existingOnDisk =
            children.find((c) => uriEndsWithName(c, job.displayName)) ?? null;
        } else {
          existingOnDisk = await findChildByDisplayName(
            parent,
            job.displayName,
            useSaf,
          );
        }
      } else {
        existingOnDisk = await findChildByDisplayName(
          parent,
          job.displayName,
          useSaf,
        );
      }

      const diskStillGood = await isUsableOnDiskExport(existingOnDisk, !!existingOnDisk);

      // Stale ledger: we thought it was exported, but the file is gone → re-export
      if (prior && !diskStillGood) {
        delete ledger[lKey];
        ledgerDirty = true;
        console.log(
          `[Export] Ledger stale (missing on disk), will re-export: ${job.relative}`,
        );
      }

      // ── Skip only if the file is actually in the destination folder ─────
      if (!force && diskStillGood) {
        skipped += 1;
        ledger[lKey] = {
          sourceUri: job.file.uri,
          sourceFilename: job.file.filename,
          rootUri,
          relativePath: job.relative,
          displayName: job.displayName,
          destUri: existingOnDisk ?? undefined,
          bytesWritten: prior?.bytesWritten,
          exportedAt: prior?.exportedAt ?? Date.now(),
        };
        ledgerDirty = true;
        console.log(`[Export] Skip (found on disk): ${job.relative}`);
        results.push({
          title: job.item.title,
          from: job.file.filename,
          toRelative: job.relative,
          ok: true,
          skipped: true,
        });
        continue;
      }

      report(onProgress, {
        phase: 'copying',
        message: `Copying ${i + 1}/${jobs.length}`,
        current: i + 1,
        total: jobs.length,
        currentFile: job.relative,
      });

      // Overwrite only a live destination doc (force or empty stub) — never a
      // stale ledger URI that no longer exists after the user deleted the folder.
      const overwriteUri =
        existingOnDisk && (force || !diskStillGood) ? existingOnDisk : null;

      const { destUri, bytesWritten } = await copyToDestination({
        fromUri: job.file.uri,
        parentDirUri: parent,
        displayName: job.displayName,
        useSaf,
        jobIndex: i,
        existingDestUri: overwriteUri,
        mediaAssetId: job.file.mediaAssetId,
        sourceFilename: job.file.filename,
      });

      // Invalidate folder listing cache after create
      childCache.delete(parent);

      console.log(
        `[Export] Wrote ${bytesWritten} bytes → ${job.relative} (library uri unchanged)`,
      );

      ledger[lKey] = {
        sourceUri: job.file.uri,
        sourceFilename: job.file.filename,
        rootUri,
        relativePath: job.relative,
        displayName: job.displayName,
        destUri,
        bytesWritten,
        exportedAt: Date.now(),
      };
      ledgerDirty = true;

      let deletedOriginal = false;
      if (mode === 'move' && bytesWritten > 0) {
        deletedOriginal = await tryDeleteOriginal(job.file.uri);
        if (deletedOriginal) deletedOriginals += 1;
      }

      copied += 1;
      results.push({
        title: job.item.title,
        from: job.file.filename,
        toRelative: job.relative,
        ok: true,
        deletedOriginal,
      });
    } catch (e: unknown) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[Export] Failed ${job.relative}:`, msg);
      results.push({
        title: job.item.title,
        from: job.file.filename,
        toRelative: job.relative,
        ok: false,
        error: msg,
      });
    }
  }

  if (ledgerDirty) {
    await saveExportLedger(ledger);
  }

  report(onProgress, {
    phase: 'done',
    message:
      skipped > 0
        ? `Exported ${copied} new, skipped ${skipped} already organized`
        : `Exported ${copied}/${jobs.length} file(s)`,
    current: jobs.length,
    total: jobs.length,
  });

  return {
    cancelled: false,
    rootUri,
    rootHint,
    mode,
    copied,
    skipped,
    failed,
    deletedOriginals,
    results,
  };
}

/** Clear the in-app export history (does not delete files on disk). */
export async function clearExportLedger(): Promise<void> {
  try {
    await AsyncStorage.removeItem(EXPORT_LEDGER_KEY);
  } catch {
    /* ignore */
  }
}

export const libraryExportService = {
  exportOrganizedLibrary,
  clearExportLedger,
};

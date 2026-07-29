import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocalFile, WatchProgress } from '../types';

const PROGRESS_KEY = '@cinescan:watch_progress';

/** Minimum seconds watched before we treat it as resumable. */
export const MIN_RESUME_SECONDS = 30;
/** If watched past this fraction of duration, treat as finished (no continue). */
export const COMPLETED_FRACTION = 0.92;

function fileKey(f: Pick<LocalFile, 'uri' | 'filename'>): string {
  return `${f.uri}::${f.filename}`;
}

export function progressKey(mediaId: string, file: Pick<LocalFile, 'uri' | 'filename'>): string {
  return `${mediaId}::${fileKey(file)}`;
}

export function isResumable(p: WatchProgress | null | undefined): boolean {
  if (!p) return false;
  if (p.positionSeconds < MIN_RESUME_SECONDS) return false;
  if (p.durationSeconds > 0 && p.positionSeconds / p.durationSeconds >= COMPLETED_FRACTION) {
    return false;
  }
  return true;
}

async function readAll(): Promise<Record<string, WatchProgress>> {
  try {
    const raw = await AsyncStorage.getItem(PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, WatchProgress>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeAll(map: Record<string, WatchProgress>): Promise<void> {
  try {
    await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('[WatchProgress] save failed', err);
  }
}

export const watchProgressService = {
  async get(mediaId: string, file: Pick<LocalFile, 'uri' | 'filename'>): Promise<WatchProgress | null> {
    const all = await readAll();
    return all[progressKey(mediaId, file)] ?? null;
  },

  /** Best resumable progress for a title (any of its local files). Prefer most recently updated. */
  async getForMedia(
    mediaId: string,
    files: LocalFile[],
  ): Promise<{ progress: WatchProgress; file: LocalFile } | null> {
    if (files.length === 0) return null;
    const all = await readAll();
    let best: { progress: WatchProgress; file: LocalFile } | null = null;

    for (const file of files) {
      const p = all[progressKey(mediaId, file)];
      if (!isResumable(p)) continue;
      if (!best || p.updatedAt > best.progress.updatedAt) {
        best = { progress: p, file };
      }
    }
    return best;
  },

  async save(progress: Omit<WatchProgress, 'updatedAt'>): Promise<void> {
    const all = await readAll();
    const key = progressKey(progress.mediaId, {
      uri: progress.fileUri,
      filename: progress.filename,
    });

    // Clear finished titles so Play shows again
    if (
      progress.durationSeconds > 0 &&
      progress.positionSeconds / progress.durationSeconds >= COMPLETED_FRACTION
    ) {
      delete all[key];
      await writeAll(all);
      return;
    }

    // Don't store tiny positions
    if (progress.positionSeconds < MIN_RESUME_SECONDS) {
      return;
    }

    all[key] = {
      ...progress,
      updatedAt: new Date().toISOString(),
    };
    await writeAll(all);
  },

  async clear(mediaId: string, file: Pick<LocalFile, 'uri' | 'filename'>): Promise<void> {
    const all = await readAll();
    delete all[progressKey(mediaId, file)];
    await writeAll(all);
  },
};

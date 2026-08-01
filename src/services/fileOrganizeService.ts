/**
 * Auto-Renaming & Folder Magic (Pro) — in-app labels
 *
 * Applies Plex/Jellyfin-style clean names + virtual folder paths on each
 * LocalFile while keeping `uri` + original `filename` for playback and
 * progress keys.
 *
 * To write real folders on disk (user-picked SAF directory), use
 * `libraryExportService.exportOrganizedLibrary`.
 */

import { LocalFile, MediaItem } from '../types';
import { storageService } from '../storage/asyncStorage';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function filesOf(item: MediaItem): LocalFile[] {
  return item.localFiles ?? (item.localFile ? [item.localFile] : []);
}

function extensionOf(filename: string): string {
  const m = filename.match(/(\.[A-Za-z0-9]{1,8})$/);
  return m ? m[1].toLowerCase() : '';
}

/** Strip characters illegal on common filesystems / path segments. */
export function sanitizeNamePart(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function yearFromItem(item: MediaItem): string | null {
  if (!item.releaseDate) return null;
  const y = item.releaseDate.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : null;
}

// ─── Naming rules ────────────────────────────────────────────────────────────

/**
 * Clean display filename for a library file.
 * Movies:  `Title (Year).ext`
 * TV:      `Show - S01E02 - Episode Name.ext` (episode name optional)
 */
export function buildCleanDisplayName(item: MediaItem, file: LocalFile): string {
  const ext = extensionOf(file.filename) || extensionOf(file.displayName ?? '') || '';
  const title = sanitizeNamePart(item.title) || 'Unknown';

  if (item.type === 'movie') {
    const year = yearFromItem(item);
    return year ? `${title} (${year})${ext}` : `${title}${ext}`;
  }

  const season = file.seasonNumber ?? 1;
  const episode = file.episodeNumber ?? 1;
  const se = `S${pad2(season)}E${pad2(episode)}`;
  const epName = file.episodeName ? sanitizeNamePart(file.episodeName) : '';
  if (epName) {
    return `${title} - ${se} - ${epName}${ext}`;
  }
  return `${title} - ${se}${ext}`;
}

/**
 * Virtual folder path (Folder Magic).
 * Movies → `Movies`
 * TV     → `TV Shows/{Show}/Season NN`
 */
export function buildFolderPath(item: MediaItem, file: LocalFile): string {
  if (item.type === 'movie') {
    return 'Movies';
  }
  const show = sanitizeNamePart(item.title) || 'Unknown Show';
  const season = file.seasonNumber ?? 1;
  return `TV Shows/${show}/Season ${pad2(season)}`;
}

/** Full virtual path: folder + clean name (for previews / export later). */
export function buildVirtualPath(item: MediaItem, file: LocalFile): string {
  return `${buildFolderPath(item, file)}/${buildCleanDisplayName(item, file)}`;
}

export function fileLabel(file: LocalFile): string {
  return file.displayName || file.filename;
}

// ─── Library apply ───────────────────────────────────────────────────────────

export type OrganizePreviewSample = {
  title: string;
  from: string;
  to: string;
  folder: string;
};

export type OrganizePreview = {
  totalFiles: number;
  wouldChange: number;
  samples: OrganizePreviewSample[];
};

export type OrganizeResult = {
  titlesTouched: number;
  filesRenamed: number;
  library: MediaItem[];
};

function organizeFile(item: MediaItem, file: LocalFile): LocalFile {
  const displayName = buildCleanDisplayName(item, file);
  const folderPath = buildFolderPath(item, file);
  if (file.displayName === displayName && file.folderPath === folderPath) {
    return file;
  }
  return { ...file, displayName, folderPath };
}

export function previewOrganize(library: MediaItem[]): OrganizePreview {
  let totalFiles = 0;
  let wouldChange = 0;
  const samples: OrganizePreviewSample[] = [];

  for (const item of library) {
    for (const file of filesOf(item)) {
      totalFiles += 1;
      const next = organizeFile(item, file);
      if (next !== file) {
        wouldChange += 1;
        if (samples.length < 8) {
          samples.push({
            title: item.title,
            from: file.displayName || file.filename,
            to: next.displayName!,
            folder: next.folderPath!,
          });
        }
      }
    }
  }

  return { totalFiles, wouldChange, samples };
}

/**
 * Apply clean names + virtual folders across the whole library and persist.
 */
export async function applyOrganizeLibrary(): Promise<OrganizeResult> {
  const library = await storageService.getLibrary();
  let filesRenamed = 0;
  let titlesTouched = 0;

  const nextLibrary = library.map((item) => {
    const files = filesOf(item);
    if (files.length === 0) return item;

    let touched = false;
    const nextFiles = files.map((f) => {
      const organized = organizeFile(item, f);
      if (organized !== f) {
        filesRenamed += 1;
        touched = true;
      }
      return organized;
    });

    if (!touched) return item;
    titlesTouched += 1;
    return {
      ...item,
      localFiles: nextFiles,
      localFile: nextFiles[0],
    };
  });

  if (filesRenamed > 0) {
    await storageService.saveLibrary(nextLibrary);
  }

  console.log(
    `[Organize] Renamed ${filesRenamed} file(s) across ${titlesTouched} title(s)`,
  );

  return { titlesTouched, filesRenamed, library: nextLibrary };
}

/**
 * Organize a single title’s local files (e.g. after a rematch).
 */
export function organizeItemFiles(item: MediaItem): MediaItem {
  const files = filesOf(item);
  if (files.length === 0) return item;
  const nextFiles = files.map((f) => organizeFile(item, f));
  return {
    ...item,
    localFiles: nextFiles,
    localFile: nextFiles[0],
  };
}

export const fileOrganizeService = {
  sanitizeNamePart,
  buildCleanDisplayName,
  buildFolderPath,
  buildVirtualPath,
  fileLabel,
  previewOrganize,
  applyOrganizeLibrary,
  organizeItemFiles,
};

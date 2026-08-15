/**
 * subtitleStorageService
 *
 * Persists the SRT file URI + filename associated with each video file so the
 * player can auto-load subtitles the next time that file is played.
 *
 * Storage key format:
 *   @filmsort:subtitle:<fileUri>   →  { srtUri: string; filename: string }
 *
 * The SRT file is always referenced by its original device URI (which stays
 * stable for files chosen via expo-document-picker with copyToCacheDirectory).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

interface SubtitleRecord {
  /** URI to the SRT file on device (cache dir copy) */
  srtUri: string;
  /** Display filename, e.g. "Movie.srt" */
  filename: string;
}

function key(videoFileUri: string): string {
  return `@filmsort:subtitle:${videoFileUri}`;
}

export const subtitleStorageService = {
  /** Save the subtitle association for a video file. */
  async save(videoFileUri: string, srtUri: string, filename: string): Promise<void> {
    try {
      const record: SubtitleRecord = { srtUri, filename };
      await AsyncStorage.setItem(key(videoFileUri), JSON.stringify(record));
    } catch (e) {
      console.warn('[subtitleStorage] save failed:', e);
    }
  },

  /** Load the saved subtitle record for a video file, or null if none saved. */
  async load(videoFileUri: string): Promise<SubtitleRecord | null> {
    try {
      const raw = await AsyncStorage.getItem(key(videoFileUri));
      if (!raw) return null;
      return JSON.parse(raw) as SubtitleRecord;
    } catch {
      return null;
    }
  },

  /** Remove the subtitle association (called when user hits "Remove subtitles"). */
  async clear(videoFileUri: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key(videoFileUri));
    } catch {
      // silently ignore
    }
  },
};

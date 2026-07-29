/**
 * profileService.ts
 *
 * Persists the user's local profile (display name + avatar) in AsyncStorage.
 * The avatar is represented as a { color, emoji } pair — no image uploads needed.
 *
 * This is separate from the Firebase account (FilmSortAccount) which holds
 * the Google-authenticated identity. The local profile is what shows on the
 * profile picker screen and can be freely edited.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_KEY = '@filmsort:local_profile';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LocalProfile {
  displayName: string;
  avatarEmoji: string;
  avatarColor: string; // hex background colour for the avatar circle
}

// ─── Avatar presets — user picks one of these ────────────────────────────────

export const AVATAR_PRESETS: { emoji: string; color: string }[] = [
  { emoji: '🎬', color: '#e50914' },
  { emoji: '🍿', color: '#f97316' },
  { emoji: '🎭', color: '#a855f7' },
  { emoji: '🦊', color: '#f59e0b' },
  { emoji: '🐺', color: '#6366f1' },
  { emoji: '🐉', color: '#10b981' },
  { emoji: '🌙', color: '#3b82f6' },
  { emoji: '⚡', color: '#eab308' },
  { emoji: '🔥', color: '#ef4444' },
  { emoji: '🌸', color: '#ec4899' },
  { emoji: '🎮', color: '#8b5cf6' },
  { emoji: '🎵', color: '#14b8a6' },
];

export const DEFAULT_PROFILE: LocalProfile = {
  displayName: 'FilmSort User',
  avatarEmoji: '🎬',
  avatarColor: '#e50914',
};

// ─── Service ──────────────────────────────────────────────────────────────────

export const profileService = {
  /**
   * Read the stored local profile. Returns DEFAULT_PROFILE if none saved yet.
   */
  async get(): Promise<LocalProfile> {
    try {
      const raw = await AsyncStorage.getItem(PROFILE_KEY);
      if (!raw) return { ...DEFAULT_PROFILE };
      return { ...DEFAULT_PROFILE, ...JSON.parse(raw) } as LocalProfile;
    } catch {
      return { ...DEFAULT_PROFILE };
    }
  },

  /**
   * Save (full or partial) profile updates.
   */
  async save(updates: Partial<LocalProfile>): Promise<void> {
    try {
      const current = await profileService.get();
      const next: LocalProfile = { ...current, ...updates };
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(next));
    } catch {
      // silently fail — non-critical
    }
  },

  /**
   * Check whether the user has saved a profile at least once.
   * Used to decide whether to show the Edit nudge on first open.
   */
  async hasProfile(): Promise<boolean> {
    try {
      const raw = await AsyncStorage.getItem(PROFILE_KEY);
      return raw !== null;
    } catch {
      return false;
    }
  },

  /**
   * Clear the stored profile. Useful if the user signs out and we want
   * to reset the picker.
   */
  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(PROFILE_KEY);
    } catch {
      // ignore
    }
  },
};

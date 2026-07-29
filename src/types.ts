// ─── Navigation ───────────────────────────────────────────────────────────────

export type RootStackParamList = {
  ProfilePicker: undefined;
  MainTabs: undefined;
  Search: undefined;
  Details: { item: MediaItem };
  Notifications: { initialTab?: 'inbox' | 'upcoming' } | undefined;
  VideoPlayer: { item: MediaItem; startPosition?: number };
  PrivacyPolicy: undefined;
  TermsOfUse: undefined;
  Settings: undefined;
};


export type TabParamList = {
  Movies: undefined;
  TV: undefined;
  Library: undefined;
  Profile: undefined;
  Scan: undefined;
};

// ─── Media ────────────────────────────────────────────────────────────────────

export interface MediaItem {
  id: string;
  title: string;
  type: 'movie' | 'tv';
  description: string;
  posterUrl?: string;
  backdropUrl?: string;
  logoUrl?: string;
  rating: number;
  releaseDate?: string;
  runtime?: number;
  numberOfSeasons?: number;
  genres?: string[];
  genre_ids?: number[];
  tagline?: string;
  starred?: boolean;
  localFile?: LocalFile;
  localFiles?: LocalFile[];
}

export interface LocalFile {
  uri: string;
  filename: string;
  duration?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeName?: string;
  stillUrl?: string;
}

export interface EpisodeInfo {
  id: string;
  episodeNumber: number;
  seasonNumber: number;
  name: string;
  overview?: string;
  stillUrl?: string;
  airDate?: string;
  runtime?: number;
}

// ─── Scanner ─────────────────────────────────────────────────────────────────

export interface MediaScanProgress {
  phase?: string;
  current?: number;
  total: number;
  processed?: number;
  scanned?: number;
  matched?: number;
  added?: number;
  skipped?: number;
  currentFile?: string;
}

export interface MediaScanResult {
  matched: MediaItem[];
  unmatched: LocalFile[];
}

// ─── Upcoming ────────────────────────────────────────────────────────────────

export interface UpcomingItem {
  id: string;
  type: 'movie' | 'episode';
  title: string;
  sourceTitle: string;
  releaseDate: string;
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  episodeName?: string;
  episodeNumber?: number;
  seasonNumber?: number;
  /** TMDB movie/tv id used to look up streaming providers */
  tmdbId?: string;
  mediaType?: 'movie' | 'tv';
  isAnime?: boolean;
  /** Supported platforms available on release (filled when online) */
  watchProviders?: WatchProvider[];
}

// ─── Streaming / watch progress ──────────────────────────────────────────────

/** Platforms we surface for "Where to Watch" (others are ignored). */
export type SupportedPlatform =
  | 'netflix'
  | 'hulu'
  | 'prime'
  | 'crunchyroll'
  | 'netflix_anime';

export interface WatchProvider {
  id: SupportedPlatform;
  name: string;
  logoUrl?: string;
  /** Deep link / web URL to open the title on that platform */
  url: string;
}

export interface WatchProgress {
  mediaId: string;
  fileUri: string;
  filename: string;
  positionSeconds: number;
  durationSeconds: number;
  seasonNumber?: number;
  episodeNumber?: number;
  updatedAt: string;
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export type RootStackParamList = {
  ProfilePicker: undefined;
  MainTabs: undefined;
  Search: undefined;
  Details: { item: MediaItem };
  Notifications: { initialTab?: 'inbox' | 'upcoming' } | undefined;
  VideoPlayer: { item: MediaItem; startPosition?: number; watchPartyRoomId?: string };
  PrivacyPolicy: undefined;
  TermsOfUse: undefined;
  Settings: undefined;
  WatchParty: { roomId: string; item: MediaItem };
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
  /**
   * For TV shows: the last episode the user was at when they starred the item.
   * Stored locally and synced to Firestore so other devices know where to continue.
   */
  lastEpisode?: { seasonNumber: number; episodeNumber: number };
  localFile?: LocalFile;
  localFiles?: LocalFile[];
}

export interface LocalFile {
  uri: string;
  /** Original device filename — identity key with `uri` (do not rewrite). */
  filename: string;
  /**
   * expo-media-library asset id when the file came from a library scan.
   * Used to resolve a readable localUri for export (MediaDocumentsProvider
   * content:// URIs cannot be opened without ACTION_OPEN_DOCUMENT grants).
   */
  mediaAssetId?: string;
  /**
   * Pro Auto-Rename clean name (e.g. `The Matrix (1999).mkv`).
   * Playback still uses `uri`; this is for display / export paths.
   */
  displayName?: string;
  /**
   * Virtual folder path from Folder Magic
   * (e.g. `Movies` or `TV Shows/Breaking Bad/Season 01`).
   */
  folderPath?: string;
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
  lastPlayedAt?: string;
}

// ─── Cast ─────────────────────────────────────────────────────────────────────

/** Which casting technology is active. */
export type CastTechnology = 'chromecast' | 'airplay';

export type CastSessionState =
  | 'idle'          // no cast session
  | 'connecting'    // attempting to connect to a device
  | 'connected'     // cast session active, media may or may not be loaded
  | 'disconnecting';

export interface CastDevice {
  deviceId: string;
  friendlyName: string;
  technology: CastTechnology;
  modelName?: string;
}

export interface CastState {
  sessionState: CastSessionState;
  connectedDevice: CastDevice | null;
  /** 0–1, mirrors what's playing on the cast receiver */
  remotePosition: number;
  remoteDuration: number;
  remoteIsPlaying: boolean;
}

// ─── Watch Party ──────────────────────────────────────────────────────────────

export type WatchPartyRole = 'host' | 'guest';

export type WatchPartyStatus = 'lobby' | 'playing' | 'paused' | 'ended';

/** A single member inside a watch party room. */
export interface WatchPartyMember {
  uid: string;
  displayName: string;
  photoUrl?: string;
  role: WatchPartyRole;
  joinedAt: string;    // ISO-8601
  /** True while the member's client is buffering / seeking */
  isBuffering: boolean;
  /** Last-known heartbeat ISO-8601 — used to detect disconnected members */
  lastSeen: string;
}

/** A chat message inside a watch party room. */
export interface WatchPartyMessage {
  id: string;
  uid: string;
  displayName: string;
  photoUrl?: string;
  text: string;
  sentAt: string;      // ISO-8601
}

/**
 * Shared playback state written by the host and read by all guests.
 * Guests apply it when the delta exceeds SYNC_TOLERANCE_S.
 */
export interface WatchPartyPlaybackState {
  /** Playhead position in seconds at the moment the host wrote this. */
  positionSeconds: number;
  /** Wall-clock ISO-8601 when the host wrote the state — used to compensate for latency. */
  updatedAt: string;
  isPlaying: boolean;
  /** Set when the host seeks — causes guests to hard-seek. */
  seekGeneration: number;
}

/**
 * Root document stored at /watchParties/{roomId} in Firestore.
 */
export interface WatchPartyRoom {
  roomId: string;
  hostUid: string;
  hostDisplayName: string;
  status: WatchPartyStatus;
  item: MediaItem;
  /** The file the host is playing (null for stream-only items). */
  activeFileUri?: string | null;
  playback: WatchPartyPlaybackState;
  /** ISO-8601 — when the room was created. */
  createdAt: string;
  /** ISO-8601 — auto-cleaned after this time by a Cloud Function (or client). */
  expiresAt: string;
  /** Max 8 members */
  memberCount: number;
}

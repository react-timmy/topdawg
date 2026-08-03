/**
 * CastContext.tsx
 *
 * Manages Chromecast (via react-native-google-cast) and AirPlay sessions.
 *
 * Architecture:
 *  - Chromecast: react-native-google-cast hooks give us real device state.
 *    We wrap them here so the rest of the app only imports from CastContext.
 *  - AirPlay: iOS AVRoutePickerView is shown natively via a thin wrapper in
 *    CastButton.tsx; we track whether an AirPlay route is active by listening
 *    to the expo-video player's externalPlaybackActive event.
 *  - On Android AirPlay is simply hidden; only Chromecast is available.
 *
 * The context exposes:
 *   - castState          — current CastState snapshot
 *   - castMedia()        — send a MediaItem + position to the cast receiver
 *   - seekRemote()       — seek the remote player
 *   - playRemote()       — play/pause the remote player
 *   - endSession()       — disconnect from cast device
 *   - isAirPlayActive    — true while iOS AirPlay route is chosen
 *   - notifyAirPlay()    — called by the player when externalPlaybackActive changes
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import {
  useCastSession,
  useRemoteMediaClient,
  useDevices,
  CastState as GCastState,
  useCastState,
  MediaLoadRequest,
  MediaInfo,
} from 'react-native-google-cast';

import { CastDevice, CastState, CastSessionState } from '../types';
import { MediaItem } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CastContextValue {
  castState: CastState;
  /** True on iOS while an AirPlay route (not the iPhone speaker) is active. */
  isAirPlayActive: boolean;
  /**
   * Load a MediaItem onto the connected cast receiver.
   * Pass the local file URI (for a message to the user) and the
   * TMDB backdrop/poster as the stream thumbnail.
   */
  castMedia: (item: MediaItem, positionSeconds?: number) => Promise<void>;
  /** Seek the remote player to `positionSeconds`. */
  seekRemote: (positionSeconds: number) => Promise<void>;
  /** Toggle play/pause on the remote player. */
  playRemote: (play: boolean) => Promise<void>;
  /** Gracefully end the cast session. */
  endSession: () => Promise<void>;
  /**
   * Called by the VideoPlayerScreen when `externalPlaybackActive` changes
   * so the context can reflect AirPlay state without needing native events.
   */
  notifyAirPlay: (active: boolean) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gCastStateToSessionState(state: GCastState): CastSessionState {
  switch (state) {
    case GCastState.CONNECTING:
      return 'connecting';
    case GCastState.CONNECTED:
      return 'connected';
    case GCastState.NOT_CONNECTED:
    case GCastState.NO_DEVICES_AVAILABLE:
    default:
      return 'idle';
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const DEFAULT_CAST_STATE: CastState = {
  sessionState: 'idle',
  connectedDevice: null,
  remotePosition: 0,
  remoteDuration: 0,
  remoteIsPlaying: false,
};

const CastContext = createContext<CastContextValue>({
  castState: DEFAULT_CAST_STATE,
  isAirPlayActive: false,
  castMedia: async () => {},
  seekRemote: async () => {},
  playRemote: async () => {},
  endSession: async () => {},
  notifyAirPlay: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function CastProvider({ children }: { children: React.ReactNode }) {
  // ── react-native-google-cast hooks ────────────────────────────────────────
  const gCastState = useCastState();       // GCastState enum
  const castSession = useCastSession();    // active CastSession | null
  const remoteClient = useRemoteMediaClient();
  const devices = useDevices();            // discovered CastDevice[] (RNGGC type)

  // ── Local state ───────────────────────────────────────────────────────────
  const [castState, setCastState] = useState<CastState>(DEFAULT_CAST_STATE);
  const [isAirPlayActive, setIsAirPlayActive] = useState(false);
  const positionInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Sync cast state from RNGC hooks ───────────────────────────────────────
  useEffect(() => {
    const sessionState = gCastStateToSessionState(gCastState ?? GCastState.NOT_CONNECTED);

    // Find the connected device by matching the session's device ID
    let connectedDevice: CastDevice | null = null;
    if (castSession?.client) {
      const dev = (devices ?? []).find(
        (d) => d.deviceId === (castSession as any).device?.deviceId,
      );
      if (dev) {
        connectedDevice = {
          deviceId: dev.deviceId,
          friendlyName: dev.friendlyName,
          technology: 'chromecast',
          modelName: (dev as any).modelName,
        };
      } else if (castSession) {
        // Fallback: session exists but device list hasn't resolved yet
        connectedDevice = {
          deviceId: (castSession as any).device?.deviceId ?? 'unknown',
          friendlyName: (castSession as any).device?.friendlyName ?? 'Chromecast',
          technology: 'chromecast',
        };
      }
    }

    setCastState((prev) => ({ ...prev, sessionState, connectedDevice }));
  }, [gCastState, castSession, devices]);

  // ── Poll remote position while connected ──────────────────────────────────
  useEffect(() => {
    if (!remoteClient) {
      if (positionInterval.current) {
        clearInterval(positionInterval.current);
        positionInterval.current = null;
      }
      return;
    }

    positionInterval.current = setInterval(async () => {
      try {
        const status = await remoteClient.getMediaStatus();
        if (!status) return;
        const pos = status.streamPosition ?? 0;
        const dur = status.mediaInfo?.streamDuration ?? 0;
        const playing = status.playerState === 'playing';
        setCastState((prev) => ({
          ...prev,
          remotePosition: pos,
          remoteDuration: dur,
          remoteIsPlaying: playing,
        }));
      } catch {
        // Ignore — device may have disconnected
      }
    }, 1000);

    return () => {
      if (positionInterval.current) {
        clearInterval(positionInterval.current);
        positionInterval.current = null;
      }
    };
  }, [remoteClient]);

  // ── castMedia ─────────────────────────────────────────────────────────────
  const castMedia = useCallback(
    async (item: MediaItem, positionSeconds = 0) => {
      if (!remoteClient) return;

      // FilmSort plays local device files, which a Chromecast receiver cannot
      // access directly. We surface the item's TMDB metadata and backdrop as
      // the cast receiver media; the receiver displays a "playing from device"
      // screen while audio/video continue via AirPlay or a local cast solution.
      //
      // For a full implementation with a custom receiver, swap contentUrl for
      // a signed streaming URL from your own backend.
      const mediaInfo: MediaInfo = {
        contentUrl: item.backdropUrl ?? item.posterUrl ?? '',
        contentType: 'image/jpeg', // placeholder; custom receiver handles real video
        metadata: {
          type: item.type === 'movie' ? 'movie' : 'tvShow',
          title: item.title,
          images: item.posterUrl ? [{ url: item.posterUrl }] : [],
          ...(item.releaseDate ? { releaseDate: item.releaseDate } : {}),
        },
        streamDuration: (item.runtime ?? 0) * 60,
      };

      const request: MediaLoadRequest = {
        mediaInfo,
        startTime: positionSeconds,
        autoplay: true,
      };

      await remoteClient.loadMedia(request);
    },
    [remoteClient],
  );

  // ── seekRemote ────────────────────────────────────────────────────────────
  const seekRemote = useCallback(
    async (positionSeconds: number) => {
      if (!remoteClient) return;
      await remoteClient.seek({ position: positionSeconds });
    },
    [remoteClient],
  );

  // ── playRemote ────────────────────────────────────────────────────────────
  const playRemote = useCallback(
    async (play: boolean) => {
      if (!remoteClient) return;
      if (play) {
        await remoteClient.play();
      } else {
        await remoteClient.pause();
      }
    },
    [remoteClient],
  );

  // ── endSession ────────────────────────────────────────────────────────────
  const endSession = useCallback(async () => {
    if (!castSession) return;
    setCastState((prev) => ({ ...prev, sessionState: 'disconnecting' }));
    await castSession.endSession(true);
    setCastState(DEFAULT_CAST_STATE);
  }, [castSession]);

  // ── notifyAirPlay ─────────────────────────────────────────────────────────
  const notifyAirPlay = useCallback((active: boolean) => {
    if (Platform.OS !== 'ios') return;
    setIsAirPlayActive(active);
    if (active) {
      setCastState((prev) => ({
        ...prev,
        sessionState: 'connected',
        connectedDevice: {
          deviceId: 'airplay',
          friendlyName: 'AirPlay',
          technology: 'airplay',
        },
      }));
    } else {
      // Only reset if Chromecast is also not connected
      setCastState((prev) =>
        prev.connectedDevice?.technology === 'airplay'
          ? DEFAULT_CAST_STATE
          : prev,
      );
    }
  }, []);

  return (
    <CastContext.Provider
      value={{
        castState,
        isAirPlayActive,
        castMedia,
        seekRemote,
        playRemote,
        endSession,
        notifyAirPlay,
      }}
    >
      {children}
    </CastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCast(): CastContextValue {
  return useContext(CastContext);
}

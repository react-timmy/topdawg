/**
 * WatchPartyContext.tsx
 *
 * Real-time watch party state for the active session.
 *
 * Responsibilities:
 *  - Create / join / leave rooms via watchPartyService.
 *  - Subscribe to room doc, members, and chat in real-time.
 *  - Host: throttle-push playback state every PUSH_INTERVAL_MS.
 *  - Guest: apply host playback state when drift > SYNC_TOLERANCE_S.
 *  - Both: send heartbeats every HEARTBEAT_INTERVAL_MS.
 *  - Expose a ref callback so VideoPlayerScreen can register its player
 *    without the context needing to import expo-video directly.
 *
 * Usage:
 *   const party = useWatchParty();
 *   party.createParty(item, fileUri);    // host
 *   party.joinParty(roomId);             // guest
 *   party.notifyPlayback(pos, dur, playing, buffering);  // called by player
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import {
  WatchPartyRoom,
  WatchPartyMember,
  WatchPartyMessage,
  WatchPartyPlaybackState,
  MediaItem,
} from '../types';
import { watchPartyService, MEMBER_TIMEOUT_MS } from '../services/watchPartyService';
import { useAccount } from './AccountContext';

// ─── Constants ────────────────────────────────────────────────────────────────

/** How often the host pushes playback state (ms). */
const PUSH_INTERVAL_MS = 2_000;
/** How often all members send a heartbeat (ms). */
const HEARTBEAT_INTERVAL_MS = 10_000;
/** Guests resync if drift exceeds this many seconds. */
const SYNC_TOLERANCE_S = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlayerBridge {
  /** Current playhead position in seconds. */
  getPosition: () => number;
  /** Current duration in seconds. */
  getDuration: () => number;
  /** Seek to position. */
  seek: (positionSeconds: number) => void;
  /** Set play/pause. */
  setPlaying: (play: boolean) => void;
}

export interface WatchPartyContextValue {
  /** Null when not in a party. */
  room: WatchPartyRoom | null;
  members: WatchPartyMember[];
  messages: WatchPartyMessage[];
  isInParty: boolean;
  isHost: boolean;
  /** True while create/join is in flight. */
  isLoading: boolean;
  error: string | null;

  /** Host: create a new party for the given item. */
  createParty: (item: MediaItem, activeFileUri?: string | null) => Promise<string>;
  /** Guest: join an existing party by room ID. */
  joinParty: (roomId: string, item: MediaItem) => Promise<void>;
  /** Leave (or end if host) the current party. */
  leaveParty: () => Promise<void>;
  /** Send a chat message. */
  sendMessage: (text: string) => Promise<void>;
  /** Clear any error. */
  clearError: () => void;

  /**
   * Register the VideoPlayer's bridge so the context can seek/play/pause
   * on behalf of the guest sync logic.
   */
  registerPlayer: (bridge: PlayerBridge | null) => void;

  /**
   * Called by the VideoPlayerScreen on every tick so the context has fresh
   * playback state without polling.
   */
  notifyPlayback: (
    positionSeconds: number,
    durationSeconds: number,
    isPlaying: boolean,
    isBuffering: boolean,
  ) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const WatchPartyContext = createContext<WatchPartyContextValue>({
  room: null,
  members: [],
  messages: [],
  isInParty: false,
  isHost: false,
  isLoading: false,
  error: null,
  createParty: async () => '',
  joinParty: async () => {},
  leaveParty: async () => {},
  sendMessage: async () => {},
  clearError: () => {},
  registerPlayer: () => {},
  notifyPlayback: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function WatchPartyProvider({ children }: { children: React.ReactNode }) {
  const { account } = useAccount();

  const [room, setRoom] = useState<WatchPartyRoom | null>(null);
  const [members, setMembers] = useState<WatchPartyMember[]>([]);
  const [messages, setMessages] = useState<WatchPartyMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs that don't need to trigger re-renders
  const playerRef = useRef<PlayerBridge | null>(null);
  const playbackRef = useRef({ positionSeconds: 0, durationSeconds: 0, isPlaying: false, isBuffering: false });
  const lastSeekGenRef = useRef(0);
  const pushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubRoomRef = useRef<(() => void) | null>(null);
  const unsubMembersRef = useRef<(() => void) | null>(null);
  const unsubMessagesRef = useRef<(() => void) | null>(null);

  const isHost = !!room && room.hostUid === account?.uid;
  const isInParty = room !== null;

  // ── Teardown helpers ───────────────────────────────────────────────────────

  const stopTimers = useCallback(() => {
    if (pushTimerRef.current) { clearInterval(pushTimerRef.current); pushTimerRef.current = null; }
    if (heartbeatTimerRef.current) { clearInterval(heartbeatTimerRef.current); heartbeatTimerRef.current = null; }
  }, []);

  const stopListeners = useCallback(() => {
    unsubRoomRef.current?.(); unsubRoomRef.current = null;
    unsubMembersRef.current?.(); unsubMembersRef.current = null;
    unsubMessagesRef.current?.(); unsubMessagesRef.current = null;
  }, []);

  const teardown = useCallback(() => {
    stopTimers();
    stopListeners();
    setRoom(null);
    setMembers([]);
    setMessages([]);
  }, [stopTimers, stopListeners]);

  // ── Start listeners ────────────────────────────────────────────────────────

  const startListeners = useCallback((roomId: string) => {
    stopListeners();

    unsubRoomRef.current = watchPartyService.onRoom(roomId, (r) => {
      if (!r || r.status === 'ended') {
        teardown();
        return;
      }
      setRoom(r);
    });

    unsubMembersRef.current = watchPartyService.onMembers(roomId, setMembers);
    unsubMessagesRef.current = watchPartyService.onMessages(roomId, 100, setMessages);
  }, [stopListeners, teardown]);

  // ── Host push timer ────────────────────────────────────────────────────────

  const startHostPush = useCallback((roomId: string) => {
    if (pushTimerRef.current) clearInterval(pushTimerRef.current);
    pushTimerRef.current = setInterval(async () => {
      const { positionSeconds, isPlaying } = playbackRef.current;
      try {
        await watchPartyService.pushPlayback(roomId, {
          positionSeconds,
          isPlaying,
          seekGeneration: lastSeekGenRef.current,
        });
      } catch {
        // Non-fatal — next tick will retry
      }
    }, PUSH_INTERVAL_MS);
  }, []);

  // ── Heartbeat timer ────────────────────────────────────────────────────────

  const startHeartbeat = useCallback((roomId: string, uid: string) => {
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    heartbeatTimerRef.current = setInterval(() => {
      void watchPartyService.heartbeat(roomId, uid, playbackRef.current.isBuffering);
    }, HEARTBEAT_INTERVAL_MS);
  }, []);

  // ── Guest sync: apply host playback when room doc updates ─────────────────

  useEffect(() => {
    if (!room || isHost || !playerRef.current) return;

    const pb: WatchPartyPlaybackState = room.playback;
    const player = playerRef.current;

    // Compensate for network latency: estimate how far the host has advanced
    // since they wrote the state.
    const latencyS = (Date.now() - new Date(pb.updatedAt).getTime()) / 1000;
    const targetPos = pb.isPlaying
      ? pb.positionSeconds + latencyS
      : pb.positionSeconds;

    // Seek if the host sent a new seek generation or drift is too large
    const seekNeeded = pb.seekGeneration > lastSeekGenRef.current;
    const drift = Math.abs(player.getPosition() - targetPos);

    if (seekNeeded || drift > SYNC_TOLERANCE_S) {
      lastSeekGenRef.current = pb.seekGeneration;
      player.seek(targetPos);
    }

    // Mirror play/pause state
    player.setPlaying(pb.isPlaying);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.playback]);

  // ── Pause on app background ────────────────────────────────────────────────

  useEffect(() => {
    if (!isInParty) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        // Stop pushing / pause player — resume handled on foreground
        if (pushTimerRef.current) {
          clearInterval(pushTimerRef.current);
          pushTimerRef.current = null;
        }
      } else if (state === 'active' && isHost && room) {
        startHostPush(room.roomId);
      }
    });
    return () => sub.remove();
  }, [isInParty, isHost, room, startHostPush]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => () => { teardown(); }, [teardown]);

  // ── Public API ─────────────────────────────────────────────────────────────

  const createParty = useCallback(async (
    item: MediaItem,
    activeFileUri?: string | null,
  ): Promise<string> => {
    if (!account) throw new Error('You must be signed in to host a watch party.');
    setIsLoading(true);
    setError(null);
    try {
      const newRoom = await watchPartyService.createRoom({
        hostUid: account.uid,
        hostDisplayName: account.displayName ?? 'Host',
        hostPhotoUrl: account.photoUrl ?? undefined,
        item,
        activeFileUri,
      });
      setRoom(newRoom);
      startListeners(newRoom.roomId);
      startHostPush(newRoom.roomId);
      startHeartbeat(newRoom.roomId, account.uid);
      return newRoom.roomId;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create party.';
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [account, startListeners, startHostPush, startHeartbeat]);

  const joinParty = useCallback(async (roomId: string, item: MediaItem): Promise<void> => {
    if (!account) throw new Error('You must be signed in to join a watch party.');
    setIsLoading(true);
    setError(null);
    try {
      const joinedRoom = await watchPartyService.joinRoom({
        roomId,
        uid: account.uid,
        displayName: account.displayName ?? 'Guest',
        photoUrl: account.photoUrl ?? undefined,
      });
      setRoom(joinedRoom);
      startListeners(roomId);
      startHeartbeat(roomId, account.uid);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to join party.';
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [account, startListeners, startHeartbeat]);

  const leaveParty = useCallback(async (): Promise<void> => {
    if (!room || !account) return;
    const roomId = room.roomId;
    const host = isHost;
    teardown();
    try {
      await watchPartyService.leaveRoom(roomId, account.uid, host);
    } catch {
      // Best-effort — room already torn down locally
    }
  }, [room, account, isHost, teardown]);

  const sendMessage = useCallback(async (text: string): Promise<void> => {
    if (!room || !account || !text.trim()) return;
    await watchPartyService.sendMessage({
      roomId: room.roomId,
      uid: account.uid,
      displayName: account.displayName ?? 'User',
      photoUrl: account.photoUrl ?? undefined,
      text,
    });
  }, [room, account]);

  const clearError = useCallback(() => setError(null), []);

  const registerPlayer = useCallback((bridge: PlayerBridge | null) => {
    playerRef.current = bridge;
  }, []);

  const notifyPlayback = useCallback((
    positionSeconds: number,
    durationSeconds: number,
    isPlaying: boolean,
    isBuffering: boolean,
  ) => {
    playbackRef.current = { positionSeconds, durationSeconds, isPlaying, isBuffering };
  }, []);

  return (
    <WatchPartyContext.Provider
      value={{
        room,
        members,
        messages,
        isInParty,
        isHost,
        isLoading,
        error,
        createParty,
        joinParty,
        leaveParty,
        sendMessage,
        clearError,
        registerPlayer,
        notifyPlayback,
      }}
    >
      {children}
    </WatchPartyContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWatchParty(): WatchPartyContextValue {
  return useContext(WatchPartyContext);
}

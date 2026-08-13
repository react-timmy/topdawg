/**
 * watchPartyService.ts
 *
 * All Firestore read/write operations for the Social Watch Party feature.
 *
 * Firestore layout:
 *
 *   watchParties/{roomId}                  — WatchPartyRoom document
 *   watchParties/{roomId}/members/{uid}    — WatchPartyMember per user
 *   watchParties/{roomId}/messages/{msgId} — WatchPartyMessage (chat)
 *
 * Design rules:
 *  - Only the host writes to watchParties/{roomId}.playback.
 *  - All members (incl. host) write their own member doc (heartbeat, buffering).
 *  - Chat messages are written by any member; ordered by sentAt ascending.
 *  - Rooms auto-expire after ROOM_TTL_HOURS; client checks expiresAt on join.
 *  - Max 8 members enforced with a Firestore transaction on join.
 */

import firestore from '@react-native-firebase/firestore';
import { nanoid } from '../utils/nanoid';
import {
  WatchPartyRoom,
  WatchPartyMember,
  WatchPartyMessage,
  WatchPartyPlaybackState,
  MediaItem,
} from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROOM_TTL_HOURS = 6;
const MAX_MEMBERS = 15; // Upgraded from 8
/** How long (ms) without a heartbeat before a member is considered disconnected. */
export const MEMBER_TIMEOUT_MS = 30_000;
/** Inactivity timeout: 10 minutes */
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
/** Host disconnect grace period: 5 minutes */
const HOST_DISCONNECT_GRACE_MS = 5 * 60 * 1000;

// ─── Firestore helpers ────────────────────────────────────────────────────────

/**
 * Recursively strip keys whose value is `undefined` from a plain object.
 * Firestore rejects `undefined` as an "unsupported field value"; every
 * optional field in MediaItem (localFile, localFiles, seasons, posterUrl, …)
 * must be omitted rather than set to undefined before writing to Firestore.
 */
function stripUndefined<T extends object>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_key, value) =>
    value === undefined ? undefined : value
  )) as T;
}

// ─── Collection helpers ───────────────────────────────────────────────────────

function roomDoc(roomId: string) {
  return firestore().collection('watchParties').doc(roomId);
}

function membersCol(roomId: string) {
  return roomDoc(roomId).collection('members');
}

function messagesCol(roomId: string) {
  return roomDoc(roomId).collection('messages');
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const watchPartyService: any = {

  // ── Create room ────────────────────────────────────────────────────────────

  /**
   * Create a new watch party room and add the host as the first member.
   * Returns the full WatchPartyRoom document.
   */
  async createRoom(params: {
    hostUid: string;
    hostDisplayName: string;
    hostPhotoUrl?: string;
    item: MediaItem;
    activeFileUri?: string | null;
    roomName?: string;
  }): Promise<WatchPartyRoom> {
    const roomId = nanoid(10);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ROOM_TTL_HOURS * 3_600_000).toISOString();

    const initialPlayback: WatchPartyPlaybackState = {
      positionSeconds: 0,
      updatedAt: now,
      isPlaying: false,
      seekGeneration: 0,
    };

    const room: WatchPartyRoom = {
      roomId,
      hostUid: params.hostUid,
      hostDisplayName: params.hostDisplayName,
      status: 'lobby',
      // Strip undefined fields from the item — Firestore rejects undefined values
      // on optional fields like localFile, localFiles, seasons, posterUrl, etc.
      item: stripUndefined(params.item),
      activeFileUri: params.activeFileUri ?? null,
      playback: initialPlayback,
      createdAt: now,
      expiresAt,
      memberCount: 1,
      // roomName may be undefined when the user left it blank — omit it rather
      // than writing undefined into Firestore.
      ...(params.roomName ? { roomName: params.roomName } : {}),
      lastActivityAt: now,
      hostConnected: true,
      hostDisconnectedAt: null,
    };

    const hostMember: WatchPartyMember = {
      uid: params.hostUid,
      displayName: params.hostDisplayName,
      // photoUrl may be undefined — omit rather than write undefined.
      ...(params.hostPhotoUrl ? { photoUrl: params.hostPhotoUrl } : {}),
      role: 'host',
      joinedAt: now,
      isBuffering: false,
      lastSeen: now,
    };

    const batch = firestore().batch();
    // stripUndefined as a final safety net before any Firestore write.
    batch.set(roomDoc(roomId), stripUndefined(room));
    batch.set(membersCol(roomId).doc(params.hostUid), stripUndefined(hostMember));
    await batch.commit();

    return room;
  },

  // ── Join room ──────────────────────────────────────────────────────────────

  /**
   * Join an existing room as a guest.
   * Enforces MAX_MEMBERS cap via a Firestore transaction.
   * Throws a user-readable Error on failure.
   */
  async joinRoom(params: {
    roomId: string;
    uid: string;
    displayName: string;
    photoUrl?: string;
  }): Promise<WatchPartyRoom> {
    const ref = roomDoc(params.roomId);

    return firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('Room not found. The link may be invalid.');

      const room = snap.data() as WatchPartyRoom;

      if (room.status === 'ended') {
        throw new Error('This watch party has already ended.');
      }
      if (new Date(room.expiresAt) < new Date()) {
        throw new Error('This watch party link has expired.');
      }
      if (room.memberCount >= MAX_MEMBERS) {
        throw new Error(`Watch parties are limited to ${MAX_MEMBERS} people.`);
      }

      const memberRef = membersCol(params.roomId).doc(params.uid);
      const memberSnap = await tx.get(memberRef);

      if (memberSnap.exists) {
        // Reconnecting — just refresh lastSeen
        tx.update(memberRef, { lastSeen: new Date().toISOString() });
        return room;
      }

      const now = new Date().toISOString();
      const member: WatchPartyMember = {
        uid: params.uid,
        displayName: params.displayName,
        ...(params.photoUrl ? { photoUrl: params.photoUrl } : {}),
        role: 'guest',
        joinedAt: now,
        isBuffering: false,
        lastSeen: now,
      };

      tx.set(memberRef, stripUndefined(member));
      tx.update(ref, { memberCount: firestore.FieldValue.increment(1) });

      return room;
    });
  },

  // ── Leave / end room ───────────────────────────────────────────────────────

  async leaveRoom(roomId: string, uid: string, isHost: boolean): Promise<void> {
    const batch = firestore().batch();
    batch.delete(membersCol(roomId).doc(uid));

    if (isHost) {
      // Host leaving ends the party for everyone
      batch.update(roomDoc(roomId), { status: 'ended' });
    } else {
      batch.update(roomDoc(roomId), {
        memberCount: firestore.FieldValue.increment(-1),
      });
    }

    await batch.commit();
  },

  async endRoom(roomId: string): Promise<void> {
    await roomDoc(roomId).update({ status: 'ended' });
  },

  // ── Start countdown (host only) ────────────────────────────────────────────

  /**
   * Start a 3-second countdown before the video plays.
   * Status: lobby → countdown, then countdown → playing after 3s
   */
  async startCountdown(roomId: string): Promise<void> {
    await roomDoc(roomId).update({
      status: 'countdown',
      countdownStartedAt: new Date().toISOString(),
    });
  },

  // ── Playback sync (host only) ──────────────────────────────────────────────

  /**
   * Push the host's current playback state to Firestore.
   * Only the host should call this; guests read it via onRoom().
   */
  async pushPlayback(
    roomId: string,
    state: Omit<WatchPartyPlaybackState, 'updatedAt'>,
  ): Promise<void> {
    const playback: WatchPartyPlaybackState = {
      ...state,
      updatedAt: new Date().toISOString(),
    };
    await roomDoc(roomId).update({
      playback,
      status: state.isPlaying ? 'playing' : 'paused',
    });
  },

  // ── Member heartbeat ───────────────────────────────────────────────────────

  async heartbeat(roomId: string, uid: string, isBuffering: boolean): Promise<void> {
    try {
      await membersCol(roomId).doc(uid).update({
        lastSeen: new Date().toISOString(),
        isBuffering,
      });
    } catch {
      // Non-fatal — network hiccup
    }
  },

  // ── Chat ──────────────────────────────────────────────────────────────────

  async sendMessage(params: {
    roomId: string;
    uid: string;
    displayName: string;
    photoUrl?: string;
    text: string;
  }): Promise<void> {
    const msg: WatchPartyMessage = {
      id: nanoid(16),
      uid: params.uid,
      displayName: params.displayName,
      ...(params.photoUrl ? { photoUrl: params.photoUrl } : {}),
      text: params.text.trim(),
      sentAt: new Date().toISOString(),
    };
    await messagesCol(params.roomId).doc(msg.id).set(stripUndefined(msg));
  },

  // ── Real-time listeners ───────────────────────────────────────────────────

  /** Subscribe to the room document. Returns an unsubscribe fn. */
  onRoom(
    roomId: string,
    callback: (room: WatchPartyRoom | null) => void,
  ): () => void {
    return roomDoc(roomId).onSnapshot(
      (snap) => callback(snap.exists ? (snap.data() as WatchPartyRoom) : null),
      () => callback(null),
    );
  },

  /** Subscribe to the members sub-collection. Returns an unsubscribe fn. */
  onMembers(
    roomId: string,
    callback: (members: WatchPartyMember[]) => void,
  ): () => void {
    return membersCol(roomId).onSnapshot(
      (snap) => callback(snap.docs.map((d) => d.data() as WatchPartyMember)),
      () => callback([]),
    );
  },

  /**
   * Subscribe to the latest 100 chat messages ordered by sentAt ascending.
   * Returns an unsubscribe fn.
   */
  onMessages(
    roomId: string,
    callback: (messages: WatchPartyMessage[]) => void,
  ): () => void {
    return messagesCol(roomId)
      .orderBy('sentAt', 'asc')
      .limitToLast(100)
      .onSnapshot(
        (snap) => callback(snap.docs.map((d) => d.data() as WatchPartyMessage)),
        () => callback([]),
      );
  },

  // ── Fetch ─────────────────────────────────────────────────────────────────

  async getRoom(roomId: string): Promise<WatchPartyRoom | null> {
    const snap = await roomDoc(roomId).get();
    return snap.exists ? (snap.data() as WatchPartyRoom) : null;
  },

  async getMembers(roomId: string): Promise<WatchPartyMember[]> {
    const snap = await membersCol(roomId).get();
    return snap.docs.map((d) => d.data() as WatchPartyMember);
  },
};

// ─── Extended functionality for Watch Party++ ────────────────────────────────

export const watchPartyExtensions = {
  /**
   * Fetch all active rooms where the user is a member.
   * Used for the Party Hub screen to show active parties.
   */
  async getUserActiveRooms(uid: string): Promise<WatchPartyRoom[]> {
    try {
      // Query rooms where user is a member (need to check members subcollection)
      // Since Firestore doesn't support cross-collection queries easily,
      // we'll use a collection group query on members
      const memberSnap = await firestore()
        .collectionGroup('members')
        .where('uid', '==', uid)
        .get();

      const roomIds = new Set<string>();
      memberSnap.forEach((doc) => {
        // Extract roomId from path: watchParties/{roomId}/members/{uid}
        const pathParts = doc.ref.path.split('/');
        if (pathParts.length >= 2 && pathParts[0] === 'watchParties') {
          roomIds.add(pathParts[1]);
        }
      });

      if (roomIds.size === 0) return [];

      // Fetch all room documents
      const rooms: WatchPartyRoom[] = [];
      for (const roomId of Array.from(roomIds)) {
        const roomSnap = await firestore().collection('watchParties').doc(roomId).get();
        if (roomSnap.exists) {
          const room = roomSnap.data() as WatchPartyRoom;
          // Only include active rooms (not ended and not expired)
          if (room.status !== 'ended' && new Date(room.expiresAt) > new Date()) {
            rooms.push(room);
          }
        }
      }

      // Sort by most recent first
      return rooms.sort((a, b) => 
        new Date(b.lastActivityAt || b.createdAt).getTime() - 
        new Date(a.lastActivityAt || a.createdAt).getTime()
      );
    } catch (err) {
      console.error('Failed to fetch user rooms:', err);
      return [];
    }
  },

  /**
   * Update room's last activity timestamp.
   * Called on messages, playback changes, etc.
   */
  async updateActivity(roomId: string): Promise<void> {
    try {
      await firestore().collection('watchParties').doc(roomId).update({
        lastActivityAt: new Date().toISOString(),
      });
    } catch {
      // Non-fatal
    }
  },

  /**
   * Update host connection status.
   * Called when host connects/disconnects.
   */
  async updateHostConnection(roomId: string, connected: boolean): Promise<void> {
    const update: Partial<WatchPartyRoom> = {
      hostConnected: connected,
    };
    
    if (!connected) {
      update.hostDisconnectedAt = new Date().toISOString();
    } else {
      update.hostDisconnectedAt = null;
    }

    await firestore().collection('watchParties').doc(roomId).update(update);
  },

  /**
   * Check if room should be disbanded due to inactivity or host disconnect.
   * Returns true if room should end.
   */
  shouldDisbandRoom(room: WatchPartyRoom): boolean {
    const now = Date.now();
    
    // Check inactivity timeout (10 minutes)
    const lastActivity = new Date(room.lastActivityAt || room.createdAt).getTime();
    if (now - lastActivity > INACTIVITY_TIMEOUT_MS) {
      return true;
    }

    // Check host disconnect grace period (5 minutes)
    if (!room.hostConnected && room.hostDisconnectedAt) {
      const disconnectTime = new Date(room.hostDisconnectedAt).getTime();
      if (now - disconnectTime > HOST_DISCONNECT_GRACE_MS) {
        return true;
      }
    }

    return false;
  },
};

// Merge extensions into main service
Object.assign(watchPartyService, watchPartyExtensions);

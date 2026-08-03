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
const MAX_MEMBERS = 8;
/** How long (ms) without a heartbeat before a member is considered disconnected. */
export const MEMBER_TIMEOUT_MS = 30_000;

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

export const watchPartyService = {

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
      item: params.item,
      activeFileUri: params.activeFileUri ?? null,
      playback: initialPlayback,
      createdAt: now,
      expiresAt,
      memberCount: 1,
    };

    const hostMember: WatchPartyMember = {
      uid: params.hostUid,
      displayName: params.hostDisplayName,
      photoUrl: params.hostPhotoUrl,
      role: 'host',
      joinedAt: now,
      isBuffering: false,
      lastSeen: now,
    };

    const batch = firestore().batch();
    batch.set(roomDoc(roomId), room);
    batch.set(membersCol(roomId).doc(params.hostUid), hostMember);
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
        photoUrl: params.photoUrl,
        role: 'guest',
        joinedAt: now,
        isBuffering: false,
        lastSeen: now,
      };

      tx.set(memberRef, member);
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
      photoUrl: params.photoUrl,
      text: params.text.trim(),
      sentAt: new Date().toISOString(),
    };
    await messagesCol(params.roomId).doc(msg.id).set(msg);
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

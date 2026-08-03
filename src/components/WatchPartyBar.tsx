/**
 * WatchPartyBar.tsx
 *
 * Compact in-player overlay shown while a watch party is active.
 * Sits just below the top controls bar (zIndex 6 → same layer as controls).
 *
 * Displays:
 *  - Stacked member avatars (up to 5, then "+N more")
 *  - Sync status: "In sync" / "Syncing…" / "Buffering (N)"
 *  - "Party" label with NF_RED dot
 *  - Tap → opens WatchPartyScreen for chat / full member list
 *
 * The bar is hidden when showControls is false (matches the rest of the player UI).
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Users, Wifi, Loader } from 'lucide-react-native';

import { useWatchParty } from '../context/WatchPartyContext';
import { WatchPartyMember } from '../types';
import { MEMBER_TIMEOUT_MS } from '../services/watchPartyService';

// ─── Constants ────────────────────────────────────────────────────────────────

const NF_RED = '#E50914';
const MAX_AVATARS = 5;
const AVATAR_SIZE = 26;
const AVATAR_OVERLAP = 10;

// ─── Props ────────────────────────────────────────────────────────────────────

interface WatchPartyBarProps {
  visible: boolean;
  onPress?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isOnline(m: WatchPartyMember): boolean {
  return Date.now() - new Date(m.lastSeen).getTime() < MEMBER_TIMEOUT_MS;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ─── Avatar stack ─────────────────────────────────────────────────────────────

function AvatarStack({ members }: { members: WatchPartyMember[] }) {
  const visible = members.slice(0, MAX_AVATARS);
  const overflow = members.length - MAX_AVATARS;

  return (
    <View style={[styles.avatarStack, { width: visible.length * (AVATAR_SIZE - AVATAR_OVERLAP) + AVATAR_OVERLAP + (overflow > 0 ? AVATAR_SIZE : 0) }]}>
      {visible.map((m, i) => (
        <View
          key={m.uid}
          style={[
            styles.avatarWrap,
            { left: i * (AVATAR_SIZE - AVATAR_OVERLAP), zIndex: visible.length - i },
          ]}
        >
          {m.photoUrl ? (
            <Image
              source={{ uri: m.photoUrl }}
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitials}>{initials(m.displayName)}</Text>
            </View>
          )}
          {/* Online dot */}
          <View
            style={[
              styles.onlineDot,
              { backgroundColor: isOnline(m) ? '#22c55e' : '#555' },
            ]}
          />
        </View>
      ))}
      {overflow > 0 && (
        <View
          style={[
            styles.avatarWrap,
            styles.avatar,
            styles.overflowBadge,
            { left: visible.length * (AVATAR_SIZE - AVATAR_OVERLAP), zIndex: 0 },
          ]}
        >
          <Text style={styles.overflowText}>+{overflow}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WatchPartyBar({ visible, onPress }: WatchPartyBarProps) {
  const { isInParty, members, room } = useWatchParty();

  const bufferingCount = useMemo(
    () => members.filter((m) => m.isBuffering && isOnline(m)).length,
    [members],
  );

  const onlineCount = useMemo(
    () => members.filter(isOnline).length,
    [members],
  );

  if (!isInParty || !visible) return null;

  const syncLabel =
    bufferingCount > 0
      ? `Syncing… (${bufferingCount} buffering)`
      : 'In sync';

  const syncColor = bufferingCount > 0 ? '#f59e0b' : '#22c55e';

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.bar}
      pointerEvents="box-none"
    >
      <Pressable style={styles.inner} onPress={onPress} hitSlop={6}>
        {/* Party dot + label */}
        <View style={styles.partyLabel}>
          <View style={styles.redDot} />
          <Text style={styles.partyText}>Party</Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Avatar stack */}
        <AvatarStack members={members} />

        {/* Member count */}
        <Text style={styles.countText}>{onlineCount}</Text>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Sync status */}
        {bufferingCount > 0 ? (
          <Loader size={12} color={syncColor} />
        ) : (
          <Wifi size={12} color={syncColor} />
        )}
        <Text style={[styles.syncText, { color: syncColor }]}>{syncLabel}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 56, // below the top control row
    alignSelf: 'center',
    zIndex: 6,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  partyLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  redDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: NF_RED },
  partyText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  divider: { width: 1, height: 14, backgroundColor: 'rgba(255,255,255,0.18)' },

  avatarStack: { height: AVATAR_SIZE, position: 'relative' },
  avatarWrap: { position: 'absolute', top: 0 },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.8)' },
  avatarFallback: { backgroundColor: '#2a2a2a', justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { color: '#fff', fontSize: 9, fontWeight: '700' },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 7, height: 7, borderRadius: 3.5, borderWidth: 1, borderColor: 'rgba(0,0,0,0.8)' },
  overflowBadge: { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  overflowText: { color: '#fff', fontSize: 8, fontWeight: '700' },

  countText: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },

  syncText: { fontSize: 11, fontWeight: '500' },
});

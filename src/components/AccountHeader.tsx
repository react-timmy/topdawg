/**
 * AccountHeader.tsx
 *
 * Compact identity strip for the Profile hero card (not a standalone card).
 *
 * Signed-out: slim "Save progress" row with Google sign-in.
 * Signed-in: avatar + name/email + sync status badge.
 */

import React from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { CloudUpload } from 'lucide-react-native';
import { FilmSortAccount } from '../services/authService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AccountHeaderProps {
  account: FilmSortAccount | null;
  isSyncing: boolean;
  syncPending: boolean;
  signingIn: boolean;
  signInError: string | null;
  onSignIn: () => void;
  /** When true, omit outer spacing — parent card provides padding. */
  embedded?: boolean;
}

// ─── Sync status badge ────────────────────────────────────────────────────────

function SyncBadge({
  isSyncing,
  syncPending,
}: {
  isSyncing: boolean;
  syncPending: boolean;
}) {
  if (isSyncing) {
    return (
      <View style={styles.syncBadge}>
        <ActivityIndicator size={10} color="#a1a1aa" />
        <Text style={styles.syncBadgeText}>Syncing…</Text>
      </View>
    );
  }
  if (syncPending) {
    return (
      <View style={styles.syncBadge}>
        <View style={[styles.syncDot, { backgroundColor: '#f59e0b' }]} />
        <Text style={[styles.syncBadgeText, { color: '#f59e0b' }]}>Sync pending</Text>
      </View>
    );
  }
  return (
    <View style={styles.syncBadge}>
      <View style={[styles.syncDot, { backgroundColor: '#4ade80' }]} />
      <Text style={[styles.syncBadgeText, { color: '#4ade80' }]}>Synced</Text>
    </View>
  );
}

// ─── Avatar (photo or initials fallback) ──────────────────────────────────────

function Avatar({ account }: { account: FilmSortAccount }) {
  const initial = (account.displayName?.[0] ?? account.email?.[0] ?? '?').toUpperCase();

  if (account.photoUrl) {
    return (
      <Image
        source={{ uri: account.photoUrl }}
        style={styles.avatar}
      />
    );
  }

  return (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarInitial}>{initial}</Text>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AccountHeader({
  account,
  isSyncing,
  syncPending,
  signingIn,
  signInError,
  onSignIn,
  embedded = false,
}: AccountHeaderProps) {
  // ── Signed-in ──────────────────────────────────────────────────────────────
  if (account) {
    return (
      <View style={[styles.signedInRow, embedded && styles.embedded]}>
        <Avatar account={account} />
        <View style={styles.accountInfo}>
          <Text style={styles.displayName} numberOfLines={1}>
            {account.displayName}
          </Text>
          <Text style={styles.email} numberOfLines={1}>
            {account.email}
          </Text>
        </View>
        <SyncBadge isSyncing={isSyncing} syncPending={syncPending} />
      </View>
    );
  }

  // ── Signed-out ─────────────────────────────────────────────────────────────
  return (
    <View style={[styles.signedOutWrap, embedded && styles.embedded]}>
      <View style={styles.signedOutRow}>
        <View style={styles.iconRing}>
          <CloudUpload size={16} color="#a78bfa" strokeWidth={2} />
        </View>
        <View style={styles.signedOutCopy}>
          <Text style={styles.signedOutHeading}>Save your progress</Text>
          <Text style={styles.signedOutBody} numberOfLines={2}>
            Back up history, badges & stats across devices
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.googleBtn,
            (pressed || signingIn) && styles.googleBtnPressed,
          ]}
          onPress={onSignIn}
          disabled={signingIn}
        >
          {signingIn ? (
            <ActivityIndicator size="small" color="#1a1a1a" />
          ) : (
            <>
              <Text style={styles.googleG}>G</Text>
              <Text style={styles.googleBtnText}>Google</Text>
            </>
          )}
        </Pressable>
      </View>
      {signInError ? (
        <Text style={styles.errorText}>{signInError}</Text>
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  embedded: {
    marginBottom: 0,
  },

  // ── Signed-in ──────────────────────────────────────────────────────────────
  signedInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    flexShrink: 0,
  },
  avatarFallback: {
    backgroundColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  accountInfo: {
    flex: 1,
    gap: 1,
  },
  displayName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  email: {
    color: '#71717a',
    fontSize: 11,
  },

  // ── Sync badge ─────────────────────────────────────────────────────────────
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  syncDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  syncBadgeText: {
    color: '#a1a1aa',
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Signed-out ─────────────────────────────────────────────────────────────
  signedOutWrap: {
    gap: 8,
  },
  signedOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconRing: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.22)',
    flexShrink: 0,
  },
  signedOutCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  signedOutHeading: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  signedOutBody: {
    color: '#71717a',
    fontSize: 11,
    lineHeight: 15,
  },

  // ── Google button (compact) ────────────────────────────────────────────────
  googleBtn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexShrink: 0,
  },
  googleBtnPressed: {
    opacity: 0.85,
  },
  googleG: {
    color: '#4285F4',
    fontSize: 14,
    fontWeight: '800',
  },
  googleBtnText: {
    color: '#1a1a1a',
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Error message ──────────────────────────────────────────────────────────
  errorText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});

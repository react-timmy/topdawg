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

const SYNC_FRESH_MS = 30 * 60 * 1000; // 30 minutes

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AccountHeaderProps {
  account: FilmSortAccount | null;
  isSyncing: boolean;
  syncPending: boolean;
  /** ISO timestamp of the last successful sync, or null if never synced. */
  lastSyncedAt: string | null;
  signingIn: boolean;
  signInError: string | null;
  onSignIn: () => void;
  onSignOut?: () => void;
  signOutPending?: boolean;
  onRedeemPro?: () => void;
  displayNameOverride?: string;
  avatarFallback?: {
    emoji: string;
    color: string;
  };
  preferAvatarFallback?: boolean;
  /** When true, omit outer spacing — parent card provides padding. */
  embedded?: boolean;
  /** When true, hides Sign Out / Redeem Pro action buttons (e.g. on Profile screen where Settings has them). */
  hideActions?: boolean;
}

// ─── Sync status badge ────────────────────────────────────────────────────────

function SyncBadge({
  isSyncing,
  syncPending,
  lastSyncedAt,
}: {
  isSyncing: boolean;
  syncPending: boolean;
  lastSyncedAt: string | null;
}) {
  if (isSyncing) {
    return (
      <View style={styles.syncBadge}>
        <ActivityIndicator size={10} color="#a1a1aa" />
        <Text style={styles.syncBadgeText}>Syncing…</Text>
      </View>
    );
  }

  // Yellow: sync has failed, never happened, or is overdue (>30 min ago)
  const isStale = !lastSyncedAt
    || (Date.now() - new Date(lastSyncedAt).getTime()) > SYNC_FRESH_MS;

  if (syncPending || isStale) {
    const label = syncPending ? 'Sync pending' : 'Not synced';
    return (
      <View style={styles.syncBadge}>
        <View style={[styles.syncDot, { backgroundColor: '#f59e0b' }]} />
        <Text style={[styles.syncBadgeText, { color: '#f59e0b' }]}>{label}</Text>
      </View>
    );
  }

  // Green: synced within the last 30 minutes
  return (
    <View style={styles.syncBadge}>
      <View style={[styles.syncDot, { backgroundColor: '#4ade80' }]} />
      <Text style={[styles.syncBadgeText, { color: '#4ade80' }]}>Synced</Text>
    </View>
  );
}

// ─── Avatar (photo, custom fallback, or initials) ─────────────────────────────

function Avatar({
  account,
  avatarFallback,
  preferAvatarFallback = false,
}: {
  account: FilmSortAccount;
  avatarFallback?: {
    emoji: string;
    color: string;
  };
  preferAvatarFallback?: boolean;
}) {
  const initial = (account.displayName?.[0] ?? account.email?.[0] ?? '?').toUpperCase();

  if (preferAvatarFallback && avatarFallback) {
    return (
      <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: avatarFallback.color }]}>
        <Text style={styles.avatarEmoji}>{avatarFallback.emoji}</Text>
      </View>
    );
  }

  if (account.photoUrl) {
    return (
      <Image
        source={{ uri: account.photoUrl }}
        style={styles.avatar}
      />
    );
  }

  if (avatarFallback) {
    return (
      <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: avatarFallback.color }]}>
        <Text style={styles.avatarEmoji}>{avatarFallback.emoji}</Text>
      </View>
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
  lastSyncedAt,
  signingIn,
  signInError,
  onSignIn,
  onSignOut,
  signOutPending = false,
  onRedeemPro,
  displayNameOverride,
  avatarFallback,
  preferAvatarFallback = false,
  embedded = false,
  hideActions = false,
}: AccountHeaderProps) {
  // ── Signed-in ──────────────────────────────────────────────────────────────
  if (account) {
    return (
      <View style={[styles.signedInWrap, embedded && styles.embedded]}>
        <View style={styles.signedInRow}>
          <Avatar
            account={account}
            avatarFallback={avatarFallback}
            preferAvatarFallback={preferAvatarFallback}
          />
          <View style={styles.accountInfo}>
            <Text style={styles.displayName} numberOfLines={1}>
              {displayNameOverride ?? account.displayName}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {account.email}
            </Text>
          </View>
          <SyncBadge
            isSyncing={isSyncing}
            syncPending={syncPending}
            lastSyncedAt={lastSyncedAt}
          />
        </View>

        {!hideActions && (
          <View style={styles.actionRail}>
            <Pressable
              style={({ pressed }) => [
                styles.railBtn,
                styles.railBtnGhost,
                (!onSignOut && styles.railBtnDisabled),
                (pressed && onSignOut && !signOutPending) && styles.railBtnPressed,
              ]}
              onPress={onSignOut}
              disabled={!onSignOut || signOutPending}
            >
              <Text style={styles.railBtnText}>{signOutPending ? 'Signing out…' : 'Sign Out'}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.railBtn,
                styles.railBtnAccent,
                (!onRedeemPro && styles.railBtnDisabled),
                pressed && onRedeemPro && styles.railBtnPressed,
              ]}
              onPress={onRedeemPro}
              disabled={!onRedeemPro}
            >
              <Text style={[styles.railBtnText, styles.railBtnAccentText]}>Redeem Pro</Text>
            </Pressable>
          </View>
        )}
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
  signedInWrap: {
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
  avatarEmoji: {
    fontSize: 16,
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

  actionRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  railBtn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 10,
  },
  railBtnGhost: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  railBtnAccent: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  railBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  railBtnAccentText: {
    color: '#000000',
  },
  railBtnPressed: {
    opacity: 0.82,
  },
  railBtnDisabled: {
    opacity: 0.5,
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

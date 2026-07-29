/**
 * SettingsScreen
 *
 * Sections:
 *  0. Pro — status card, scan usage, unlock / restore
 *  1. Account
 *  2. Security — 4-digit PIN for destructive data actions
 *  3. About / Legal / Attributions
 *  4. Data — Clear library, metadata, watch history (PIN-gated)
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  StatusBar,
  Alert,
  ActivityIndicator,
  Linking,
  Image,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronRight,
  Shield,
  FileText,
  Info,
  Database,
  Trash2,
  Film,
  ExternalLink,
  Sparkles,
  Crown,
  LogOut,
  Lock,
  KeyRound,
  ShieldOff,
  UserX,
} from 'lucide-react-native';
import Constants from 'expo-constants';
import Animated, { FadeInDown } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { storageService } from '../storage/asyncStorage';
import { APP_NAME } from '../legal/legalContent';
import { usePro } from '../context/ProContext';
import { setPro, FREE_SCAN_LIMIT } from '../storage/proStatusService';
import { ProPaywallModal } from '../components/ProPaywallModal';
import { PinPadModal, PinPadMode } from '../components/PinPadModal';
import { pinService } from '../storage/pinService';
import { profileService } from '../storage/profileService';
import { watchHistoryService } from '../storage/watchHistoryService';
import { watchlistService } from '../storage/watchlistService';
import { clearParseCache } from '../storage/aiParseCache';
import { useAccount } from '../context/AccountContext';
import { authService, FilmSortAccount } from '../services/authService';
import { syncService } from '../services/syncService';

// ─── App version — read from app.json via expo-constants so it never drifts ──
const APP_VERSION: string =
  Constants.expoConfig?.version ?? Constants.manifest?.version ?? '—';
const APP_BUILD: string =
  (Constants.expoConfig?.ios?.buildNumber as string | undefined) ??
  (Constants.expoConfig?.android?.versionCode?.toString()) ??
  (Constants.manifest?.ios?.buildNumber as string | undefined) ??
  '—';

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <Text style={styles.sectionHeader}>{label}</Text>
  );
}

// ─── Row variants ─────────────────────────────────────────────────────────────

function NavRow({
  icon,
  label,
  subtitle,
  onPress,
  tint = '#a1a1aa',
}: {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  onPress: () => void;
  tint?: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: `${tint}18` }]}>
        {icon}
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      <ChevronRight size={16} color="#3f3f46" strokeWidth={2.2} />
    </Pressable>
  );
}

function DestructiveRow({
  icon,
  label,
  subtitle,
  onPress,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      disabled={loading}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: 'rgba(248,113,113,0.1)' }]}>
        {icon}
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, { color: '#f87171' }]}>{label}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {loading
        ? <ActivityIndicator size="small" color="#f87171" />
        : <ChevronRight size={16} color="#3f3f46" strokeWidth={2.2} />}
    </Pressable>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function AccountAvatar({ account, size = 32 }: { account: FilmSortAccount; size?: number }) {
  const initial = (account.displayName?.[0] ?? account.email?.[0] ?? '?').toUpperCase();
  const dim = { width: size, height: size, borderRadius: size / 2 };
  if (account.photoUrl) {
    return <Image source={{ uri: account.photoUrl }} style={dim} />;
  }
  return (
    <View style={[dim, styles.accountAvatarFallback]}>
      <Text style={[styles.accountAvatarInitial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

type PendingClear = 'library' | 'cache' | 'history' | 'account' | null;

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [clearingLibrary, setClearingLibrary] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const { isPro, scansUsed, scansRemaining, refreshPro } = usePro();
  const { account, signIn, signOut, refreshAccount } = useAccount();
  const [showPaywall, setShowPaywall] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // ── PIN lock ─────────────────────────────────────────────────────────────
  const [hasPin, setHasPin] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinMode, setPinMode] = useState<PinPadMode>('set');
  const [pendingClear, setPendingClear] = useState<PendingClear>(null);

  const refreshPinState = useCallback(async () => {
    setHasPin(await pinService.hasPin());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshPinState();
    }, [refreshPinState]),
  );

  const openPin = (mode: PinPadMode, clear?: PendingClear) => {
    setPinMode(mode);
    setPendingClear(clear ?? null);
    setPinModalVisible(true);
  };

  const closePin = () => {
    setPinModalVisible(false);
    setPendingClear(null);
  };

  /** Run a clear action only after PIN verify (or immediately if no PIN). */
  const requirePinThen = async (clearKind: PendingClear, run: () => void) => {
    const locked = await pinService.hasPin();
    if (locked) {
      openPin('verify', clearKind);
      return;
    }
    run();
  };

  const executeClear = async (kind: PendingClear) => {
    if (kind === 'library') {
      setClearingLibrary(true);
      try {
        await storageService.clearLibrary();
        await storageService.clearRecentlyMatched();
        Alert.alert('Done', 'Your library has been cleared.');
      } catch {
        Alert.alert('Error', 'Failed to clear library. Please try again.');
      } finally {
        setClearingLibrary(false);
      }
      return;
    }
    if (kind === 'cache') {
      setClearingCache(true);
      try {
        const allKeys = await AsyncStorage.getAllKeys();
        const cacheKeys = allKeys.filter((k) => k.startsWith('@cinescan:cache:'));
        if (cacheKeys.length > 0) {
          await AsyncStorage.multiRemove(cacheKeys);
        }
        Alert.alert('Done', `Cleared ${cacheKeys.length} cached item(s).`);
      } catch {
        Alert.alert('Error', 'Failed to clear cache. Please try again.');
      } finally {
        setClearingCache(false);
      }
      return;
    }
    if (kind === 'history') {
      setClearingHistory(true);
      try {
        await watchHistoryService.clearHistory();
        Alert.alert('Done', 'Watch history cleared.');
      } catch {
        Alert.alert('Error', 'Failed to clear watch history. Please try again.');
      } finally {
        setClearingHistory(false);
      }
      return;
    }

    if (kind === 'account') {
      setDeletingAccount(true);
      try {
        const uid = account?.uid;

        // Cloud first (while still authenticated)
        if (uid) {
          await syncService.deleteCloudData(uid);
          await authService.deleteAccount();
          // Keep AccountContext in sync without relying only on auth listener
          await signOut().catch(() => {});
          await refreshAccount();
        }

        // Wipe local app data (video files on device are never touched)
        await storageService.clearLibrary();
        await storageService.clearRecentlyMatched();
        await watchHistoryService.clearHistory();
        await watchlistService.clearWatchlist().catch(() => {});
        await profileService.clear();
        await pinService.clearPin();
        await clearParseCache().catch(() => {});
        try {
          const allKeys = await AsyncStorage.getAllKeys();
          const wipeKeys = allKeys.filter(
            (k) =>
              k.startsWith('@cinescan:cache:') ||
              k.startsWith('@filmsort:') ||
              k.startsWith('@cinescan:'),
          );
          if (wipeKeys.length > 0) await AsyncStorage.multiRemove(wipeKeys);
        } catch {
          /* ignore */
        }

        await refreshPinState();
        Alert.alert(
          'Account deleted',
          uid
            ? 'Your FilmSort account and local app data have been removed. Video files on your device were not deleted.'
            : 'All local FilmSort data has been wiped. Video files on your device were not deleted.',
        );
      } catch {
        Alert.alert('Error', 'Could not fully delete the account. Please try again.');
      } finally {
        setDeletingAccount(false);
      }
    }
  };

  const handlePinSuccess = async () => {
    const kind = pendingClear;
    const mode = pinMode;
    closePin();

    if (mode === 'set') {
      await refreshPinState();
      Alert.alert(
        'PIN set',
        'You will need this PIN before clearing data or deleting your account.',
      );
      return;
    }
    if (mode === 'change') {
      await refreshPinState();
      Alert.alert('PIN updated', 'Your new PIN is active.');
      return;
    }
    if (mode === 'remove') {
      await refreshPinState();
      Alert.alert('PIN removed', 'Destructive actions no longer require a PIN.');
      return;
    }
    // verify for a pending clear — then show the usual confirm dialog
    if (mode === 'verify' && kind) {
      if (kind === 'library') {
        Alert.alert(
          'Clear Library',
          'This will remove all scanned titles from your library. Your video files will not be deleted. This cannot be undone.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Clear Library',
              style: 'destructive',
              onPress: () => void executeClear('library'),
            },
          ],
        );
      } else if (kind === 'cache') {
        Alert.alert(
          'Clear Metadata Cache',
          'Cached poster art and metadata will be removed. They will be re-fetched the next time you view your library.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Clear Cache',
              style: 'destructive',
              onPress: () => void executeClear('cache'),
            },
          ],
        );
      } else if (kind === 'history') {
        Alert.alert(
          'Clear Watch History',
          'This will permanently delete your watch history and reset all badges. This cannot be undone.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Clear History',
              style: 'destructive',
              onPress: () => void executeClear('history'),
            },
          ],
        );
      } else if (kind === 'account') {
        confirmDeleteAccount();
      }
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      account
        ? 'This permanently removes your FilmSort account, cloud sync data, library, history, PIN, and local settings. Video files on your device are not deleted. This cannot be undone.'
        : 'This permanently wipes all local FilmSort data (library, history, profile, PIN, caches). Video files on your device are not deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: () => void executeClear('account'),
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    void requirePinThen('account', confirmDeleteAccount);
  };

  // ── Account: sign in ─────────────────────────────────────────────────────
  const handleSettingsSignIn = async () => {
    setSigningIn(true);
    try {
      await signIn();
    } catch (err: unknown) {
      Alert.alert(
        'Sign-in Failed',
        String((err as any)?.message ?? 'Please try again.'),
      );
    } finally {
      setSigningIn(false);
    }
  };

  // ── Account: sign out ────────────────────────────────────────────────────
  const handleSettingsSignOut = () => {
    Alert.alert(
      'Sign Out',
      'You will be signed out. Your local watch history will be kept. You can sign back in at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            try { await signOut(); } finally { setSigningOut(false); }
          },
        },
      ],
    );
  };

  // ── Pro unlock (local entitlement — no Play / App Store IAP) ─────────────
  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      await setPro();
      await refreshPro();
      Alert.alert('Pro Unlocked!', 'Enjoy unlimited AI scanning.');
    } catch (err: unknown) {
      const msg = String((err as any)?.message ?? '');
      Alert.alert('Error', msg || 'Something went wrong. Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  // ── Clear library ──────────────────────────────────────────────────────────
  const handleClearLibrary = () => {
    void requirePinThen('library', () => {
      Alert.alert(
        'Clear Library',
        'This will remove all scanned titles from your library. Your video files will not be deleted. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear Library',
            style: 'destructive',
            onPress: () => void executeClear('library'),
          },
        ],
      );
    });
  };

  // ── Clear TMDB cache ───────────────────────────────────────────────────────
  const handleClearCache = () => {
    void requirePinThen('cache', () => {
      Alert.alert(
        'Clear Metadata Cache',
        'Cached poster art and metadata will be removed. They will be re-fetched the next time you view your library. This is useful if posters appear incorrect.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear Cache',
            style: 'destructive',
            onPress: () => void executeClear('cache'),
          },
        ],
      );
    });
  };

  // ── Clear watch history ────────────────────────────────────────────────────
  const handleClearHistory = () => {
    void requirePinThen('history', () => {
      Alert.alert(
        'Clear Watch History',
        'This will permanently delete your watch history and reset all badges. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear History',
            style: 'destructive',
            onPress: () => void executeClear('history'),
          },
        ],
      );
    });
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Top bar ── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <ChevronLeft size={22} color="#ffffff" strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.topBarTitle}>Settings</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Unified Account hub (Pro · Google · PIN) ── */}
        <Animated.View entering={FadeInDown.delay(0).duration(340)}>
          <View style={styles.hub}>
            {/* Accent top edge */}
            <View style={[styles.hubAccent, isPro && styles.hubAccentPro]} />

            {/* ── Account ── */}
            <View style={styles.hubSection}>
              <Text style={styles.hubLabel}>Account</Text>
              {account ? (
                <View style={styles.hubRow}>
                  <AccountAvatar account={account} size={36} />
                  <View style={styles.hubBody}>
                    <Text style={styles.hubTitle} numberOfLines={1}>
                      {account.displayName}
                    </Text>
                    <Text style={styles.hubSub} numberOfLines={1}>
                      {account.email}
                    </Text>
                  </View>
                  <Pressable
                    style={[styles.hubAction, signingOut && styles.btnDisabled]}
                    onPress={handleSettingsSignOut}
                    disabled={signingOut}
                  >
                    {signingOut ? (
                      <ActivityIndicator size="small" color="#f87171" />
                    ) : (
                      <>
                        <LogOut size={13} color="#f87171" strokeWidth={2.2} />
                        <Text style={styles.hubActionDanger}>Sign out</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.hubRow, pressed && styles.hubRowPressed]}
                  onPress={handleSettingsSignIn}
                  disabled={signingIn}
                >
                  <View style={[styles.hubIcon, styles.hubIconGoogle]}>
                    <Text style={styles.googleG}>G</Text>
                  </View>
                  <View style={styles.hubBody}>
                    <Text style={styles.hubTitle}>Connect Google</Text>
                    <Text style={styles.hubSub} numberOfLines={1}>
                      Back up history, badges & stats
                    </Text>
                  </View>
                  {signingIn ? (
                    <ActivityIndicator size="small" color="#a1a1aa" />
                  ) : (
                    <View style={styles.hubCtaSecondary}>
                      <Text style={styles.hubCtaSecondaryText}>Sign in</Text>
                    </View>
                  )}
                </Pressable>
              )}
            </View>

            <View style={styles.hubDivider} />

            {/* ── Security ── */}
            <View style={styles.hubSection}>
              <Text style={styles.hubLabel}>Security</Text>
              {hasPin ? (
                <View style={styles.hubRow}>
                  <View style={[styles.hubIcon, styles.hubIconPro]}>
                    <Lock size={16} color="#c4b5fd" strokeWidth={2.1} />
                  </View>
                  <View style={styles.hubBody}>
                    <View style={styles.hubTitleRow}>
                      <Text style={styles.hubTitle}>PIN protection</Text>
                      <View style={[styles.hubBadge, styles.hubBadgeOn]}>
                        <Text style={[styles.hubBadgeText, styles.hubBadgeTextOn]}>On</Text>
                      </View>
                    </View>
                    <Text style={styles.hubSub} numberOfLines={1}>
                      Required to clear library, cache & history
                    </Text>
                  </View>
                  <View style={styles.hubActionGroup}>
                    <Pressable style={styles.hubAction} onPress={() => openPin('change')}>
                      <KeyRound size={13} color="#a1a1aa" strokeWidth={2.2} />
                      <Text style={styles.hubActionText}>Edit</Text>
                    </Pressable>
                    <Pressable style={styles.hubAction} onPress={() => openPin('remove')}>
                      <ShieldOff size={13} color="#f87171" strokeWidth={2.2} />
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.hubRow, pressed && styles.hubRowPressed]}
                  onPress={() => openPin('set')}
                >
                  <View style={[styles.hubIcon, styles.hubIconPro]}>
                    <Lock size={16} color="#c4b5fd" strokeWidth={2.1} />
                  </View>
                  <View style={styles.hubBody}>
                    <Text style={styles.hubTitle}>Set a 4-digit PIN</Text>
                    <Text style={styles.hubSub} numberOfLines={1}>
                      Protect destructive data actions
                    </Text>
                  </View>
                  <ChevronRight size={16} color="#3f3f46" strokeWidth={2.2} />
                </Pressable>
              )}
            </View>

            <View style={styles.hubDivider} />

            {/* ── Plan ── */}
            <View style={styles.hubSection}>
              <Text style={styles.hubLabel}>Plan</Text>
              <View style={styles.hubRow}>
                <View style={[styles.hubIcon, isPro ? styles.hubIconPro : styles.hubIconFree]}>
                  {isPro
                    ? <Crown size={16} color="#c4b5fd" strokeWidth={2.1} />
                    : <Sparkles size={16} color="#facc15" strokeWidth={2.1} />}
                </View>
                <View style={styles.hubBody}>
                  <View style={styles.hubTitleRow}>
                    <Text style={styles.hubTitle}>
                      {isPro ? 'FilmSort Pro' : 'Free'}
                    </Text>
                    <View style={[styles.hubBadge, isPro ? styles.hubBadgeOn : styles.hubBadgeMuted]}>
                      <Text style={[styles.hubBadgeText, isPro ? styles.hubBadgeTextOn : styles.hubBadgeTextMuted]}>
                        {isPro ? 'Active' : `${scansRemaining}/${FREE_SCAN_LIMIT}`}
                      </Text>
                    </View>
                  </View>
                  {isPro ? (
                    <Text style={styles.hubSub} numberOfLines={1}>
                      Unlimited AI scanning · all features
                    </Text>
                  ) : (
                    <>
                      <Text style={styles.hubSub} numberOfLines={1}>
                        {scansRemaining > 0
                          ? 'AI scans left this month'
                          : 'Monthly scan limit reached'}
                      </Text>
                      <View style={styles.hubTrack}>
                        <View
                          style={[
                            styles.hubFill,
                            {
                              width: `${Math.min(100, (scansUsed / FREE_SCAN_LIMIT) * 100)}%`,
                              backgroundColor: scansRemaining === 0 ? '#f87171' : '#a78bfa',
                            },
                          ]}
                        />
                      </View>
                    </>
                  )}
                </View>
                {!isPro && (
                  <Pressable
                    style={[styles.hubCta, purchasing && styles.btnDisabled]}
                    onPress={handlePurchase}
                    disabled={purchasing}
                  >
                    {purchasing ? (
                      <ActivityIndicator color="#0a0a0a" size="small" />
                    ) : (
                      <Text style={styles.hubCtaText}>Upgrade</Text>
                    )}
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        </Animated.View>

        {/* ── About ── */}
        <Animated.View entering={FadeInDown.delay(40).duration(340)}>
          <SectionHeader label="About" />
          <View style={styles.card}>
            <InfoRow label="App" value={APP_NAME} />
            <View style={styles.divider} />
            <InfoRow label="Version" value={`${APP_VERSION} (${APP_BUILD})`} />
            <View style={styles.divider} />
            <InfoRow label="Package" value="app.filmsorter.filmsort" />
          </View>
        </Animated.View>

        {/* ── Legal ── */}
        <Animated.View entering={FadeInDown.delay(80).duration(340)}>
          <SectionHeader label="Legal" />
          <View style={styles.card}>
            <NavRow
              icon={<Shield size={16} color="#60a5fa" strokeWidth={2} />}
              label="Privacy Policy"
              subtitle="How we handle your data"
              tint="#60a5fa"
              onPress={() => navigation.navigate('PrivacyPolicy')}
            />
            <View style={styles.divider} />
            <NavRow
              icon={<FileText size={16} color="#a78bfa" strokeWidth={2} />}
              label="Terms of Use"
              subtitle="Rules for using FilmSort"
              tint="#a78bfa"
              onPress={() => navigation.navigate('TermsOfUse')}
            />
          </View>
        </Animated.View>

        {/* ── Attributions ── */}
        <Animated.View entering={FadeInDown.delay(120).duration(340)}>
          <SectionHeader label="Attributions" />
          <View style={styles.card}>
            <NavRow
              icon={<Film size={16} color="#facc15" strokeWidth={2} />}
              label="The Movie Database (TMDB)"
              subtitle="Poster art, ratings, and metadata"
              tint="#facc15"
              onPress={() => Linking.openURL('https://www.themoviedb.org').catch(() => {})}
            />
            <View style={styles.divider} />
            <NavRow
              icon={<ExternalLink size={16} color="#34d399" strokeWidth={2} />}
              label="Jikan / MyAnimeList"
              subtitle="Anime metadata and episode data"
              tint="#34d399"
              onPress={() => Linking.openURL('https://jikan.moe').catch(() => {})}
            />
          </View>

          {/* Mandatory TMDB disclaimer */}
          <View style={styles.tmdbDisclaimer}>
            <Info size={13} color="#52525b" strokeWidth={2} style={{ marginTop: 1 }} />
            <Text style={styles.tmdbDisclaimerText}>
              This product uses the TMDB API but is not endorsed or certified by TMDB.
            </Text>
          </View>
        </Animated.View>

        {/* ── Data ── */}
        <Animated.View entering={FadeInDown.delay(160).duration(340)}>
          <SectionHeader label="Data" />
          <View style={styles.card}>
            <DestructiveRow
              icon={<Database size={16} color="#f87171" strokeWidth={2} />}
              label="Clear Metadata Cache"
              subtitle={hasPin ? 'PIN required · Re-fetch posters & metadata' : 'Re-fetch posters and metadata'}
              onPress={handleClearCache}
              loading={clearingCache}
            />
            <View style={styles.divider} />
            <DestructiveRow
              icon={<Trash2 size={16} color="#f87171" strokeWidth={2} />}
              label="Clear Library"
              subtitle={hasPin ? 'PIN required · Removes scanned titles only' : 'Removes all scanned titles — not your video files'}
              onPress={handleClearLibrary}
              loading={clearingLibrary}
            />
            <View style={styles.divider} />
            <DestructiveRow
              icon={<Trash2 size={16} color="#f87171" strokeWidth={2} />}
              label="Clear Watch History"
              subtitle={hasPin ? 'PIN required · Resets history & badges' : 'Deletes history and resets all badges'}
              onPress={handleClearHistory}
              loading={clearingHistory}
            />
            <View style={styles.divider} />
            <DestructiveRow
              icon={<UserX size={16} color="#f87171" strokeWidth={2} />}
              label="Delete Account"
              subtitle={
                hasPin
                  ? 'PIN required · Wipe account & all FilmSort data'
                  : account
                    ? 'Remove account, cloud data & local app data'
                    : 'Wipe all local FilmSort data'
              }
              onPress={handleDeleteAccount}
              loading={deletingAccount}
            />
          </View>
        </Animated.View>
      </ScrollView>

      <ProPaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onPurchaseSuccess={async () => {
          await refreshPro();
          setShowPaywall(false);
        }}
      />

      <PinPadModal
        visible={pinModalVisible}
        mode={pinMode}
        onSuccess={() => void handlePinSuccess()}
        onCancel={closePin}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    backgroundColor: '#000000',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },

  scroll: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },

  sectionHeader: {
    color: '#52525b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 22,
    paddingHorizontal: 4,
  },

  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 16,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowPressed: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  rowIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    color: '#e4e4e7',
    fontSize: 15,
    fontWeight: '600',
  },
  rowSubtitle: {
    color: '#52525b',
    fontSize: 12,
  },
  rowValue: {
    color: '#52525b',
    fontSize: 14,
    fontWeight: '500',
  },

  accountAvatarFallback: {
    backgroundColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountAvatarInitial: {
    color: '#ffffff',
    fontWeight: '800',
  },

  tmdbDisclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  tmdbDisclaimerText: {
    flex: 1,
    color: '#3f3f46',
    fontSize: 12,
    lineHeight: 18,
  },

  // ─── Unified Account hub ──────────────────────────────────────────────────
  hub: {
    marginTop: 6,
    backgroundColor: '#0e0e11',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    overflow: 'hidden',
  },
  hubAccent: {
    height: 2,
    backgroundColor: 'rgba(250,204,21,0.55)',
  },
  hubAccentPro: {
    backgroundColor: 'rgba(167,139,250,0.75)',
  },
  hubSection: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 13,
    gap: 8,
  },
  hubLabel: {
    color: '#52525b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  hubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hubRowPressed: {
    opacity: 0.82,
  },
  hubIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  hubIconPro: {
    backgroundColor: 'rgba(167,139,250,0.14)',
    borderColor: 'rgba(167,139,250,0.28)',
  },
  hubIconFree: {
    backgroundColor: 'rgba(250,204,21,0.1)',
    borderColor: 'rgba(250,204,21,0.22)',
  },
  hubIconGoogle: {
    backgroundColor: 'rgba(66,133,244,0.12)',
    borderColor: 'rgba(66,133,244,0.28)',
  },
  googleG: {
    color: '#4285F4',
    fontSize: 15,
    fontWeight: '800',
  },
  hubBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  hubTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  hubTitle: {
    color: '#fafafa',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  hubSub: {
    color: '#71717a',
    fontSize: 11.5,
    fontWeight: '500',
    lineHeight: 15,
  },
  hubBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
  },
  hubBadgeOn: {
    backgroundColor: 'rgba(74,222,128,0.1)',
    borderColor: 'rgba(74,222,128,0.28)',
  },
  hubBadgeMuted: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  hubBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  hubBadgeTextOn: {
    color: '#4ade80',
    textTransform: 'uppercase',
  },
  hubBadgeTextMuted: {
    color: '#a1a1aa',
  },
  hubTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
    marginTop: 4,
  },
  hubFill: {
    height: '100%',
    borderRadius: 2,
  },
  hubDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 14,
  },
  hubCta: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  hubCtaText: {
    color: '#0a0a0a',
    fontSize: 12,
    fontWeight: '800',
  },
  hubCtaSecondary: {
    backgroundColor: 'rgba(96,165,250,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.28)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexShrink: 0,
  },
  hubCtaSecondaryText: {
    color: '#60a5fa',
    fontSize: 12,
    fontWeight: '800',
  },
  hubAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  hubActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  hubActionText: {
    color: '#a1a1aa',
    fontSize: 11,
    fontWeight: '700',
  },
  hubActionDanger: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.55,
  },
});

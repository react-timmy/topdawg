/**
 * ProfileScreen — Watch history, stats, badges, streak, memories.
 * Redesigned with: streak chip, settings shortcut, badge glow on earned,
 * earned/total badge count, week comparison, inline Pro CTA, MemoriesCard.
 */
import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Play, Film, Tv, Zap, Star, Sparkles, Heart, Eye, Moon,
  Trophy, Clock, Clapperboard, Lock, User, Settings,
  Flame, TrendingUp, TrendingDown, Minus, Crown,
} from 'lucide-react-native';

import { MediaItem } from '../types';
import { watchHistoryService, WatchEvent } from '../storage/watchHistoryService';
import { storageService } from '../storage/asyncStorage';
import { computeStats, WatchStats } from '../utils/statsEngine';
import { usePro } from '../context/ProContext';
import { profileService, setOnProfileSaved } from '../storage/profileService';
import { FREE_SCAN_LIMIT } from '../storage/proStatusService';
import { MemoriesCard } from '../components/MemoriesCard';
import { useAccount } from '../context/AccountContext';
import { AccountHeader } from '../components/AccountHeader';
import { FilmSortAccount } from '../services/authService';

const CARD_PADDING = 16;


// ─── Date formatter ───────────────────────────────────────────────────────────

function formatWatchedAt(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(date, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(date, yesterday)) return 'Yesterday';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

// ─── InlineProCTA ──────────────────────────────────────────────────────────────

function InlineProCTA({ scansUsed, scansRemaining }: { scansUsed: number; scansRemaining: number }) {
  const navigation = useNavigation<any>();
  const handlePress = () => navigation.navigate('Settings');
  return (
    <Animated.View entering={FadeInDown.delay(20).duration(340)}>
      <Pressable
        style={({ pressed }) => [styles.proCtaCard, pressed && { opacity: 0.85 }]}
        onPress={handlePress}
      >
        <View style={styles.proCtaIconRing}>
          <Crown size={18} color="#a78bfa" strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.proCtaTitle}>
            {scansRemaining > 0
              ? `You've used ${scansUsed}/${FREE_SCAN_LIMIT} free AI scans`
              : `Monthly scan limit reached`}
          </Text>
          <Text style={styles.proCtaSubtitle}>
            Tap to unlock unlimited Pro scanning
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── HeroStats ─────────────────────────────────────────────────────────────────
// Single hero card: account identity + total watch time + films/episodes.

type HeroAccountProps = {
  account: FilmSortAccount | null;
  isSyncing: boolean;
  syncPending: boolean;
  signingIn: boolean;
  signInError: string | null;
  onSignIn: () => void;
  displayNameOverride?: string;
  hideActions?: boolean;
};

function HeroStats({ stats, accountProps }: { stats: WatchStats; accountProps: HeroAccountProps }) {
  const hoursLabel = stats.totalMinutes === 0
    ? `${stats.totalHours}h`
    : `${Math.floor(stats.totalHours)}h ${stats.totalMinutes}m`;
  const weekDiff = stats.thisWeekCount - stats.lastWeekCount;
  const weekIcon = weekDiff > 0 ? TrendingUp : weekDiff < 0 ? TrendingDown : Minus;
  const weekColor = weekDiff > 0 ? '#34d399' : weekDiff < 0 ? '#f87171' : '#52525b';
  return (
    <Animated.View entering={FadeInDown.delay(40).duration(340)} style={styles.heroCard}>
      <View style={styles.heroDividerLine} />

      {/* Streak pill */}
      {stats.currentStreak > 0 && (
        <View style={styles.streakPill}>
          <Flame size={13} color="#f59e0b" strokeWidth={2.5} fill="#f59e0b" />
          <Text style={styles.streakText}>{stats.currentStreak} day streak</Text>
        </View>
      )}
      <Text style={styles.heroHoursLabel}>Total Watch Time</Text>
      <Text style={styles.heroHours}>{hoursLabel}</Text>
      {stats.watchingSince < new Date().getFullYear() && (
        <Text style={styles.watchingSince}>Watching since {stats.watchingSince}</Text>
      )}
      <View style={styles.heroRow}>
        <View style={styles.heroStatCell}>
          <Film size={18} color="#f59e0b" strokeWidth={2} />
          <Text style={styles.heroStatValue}>{stats.moviesWatched}</Text>
          <Text style={styles.heroStatLabel}>Films</Text>
        </View>
        <View style={styles.heroDivider} />
        <View style={styles.heroStatCell}>
          <Tv size={18} color="#60a5fa" strokeWidth={2} />
          <Text style={styles.heroStatValue}>{stats.episodesWatched}</Text>
          <Text style={styles.heroStatLabel}>Episodes</Text>
        </View>
      </View>
      {/* Week comparison row */}
      {stats.thisWeekCount > 0 && (
        <View style={styles.weekRow}>
          <Text style={styles.weekLabel}>This week: {stats.thisWeekCount}</Text>
          <View style={styles.weekDiffPill}>
            {React.createElement(weekIcon, { size: 11, color: weekColor, strokeWidth: 2.5 })}
            <Text style={[styles.weekDiffText, { color: weekColor }]}>
              {weekDiff > 0 ? `+${weekDiff}` : weekDiff}
            </Text>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

// ─── GenreChart ───────────────────────────────────────────────────────────────

const GENRE_COLORS: Record<string, string> = {
  Drama: '#f97316',
  Comedy: '#f59e0b',
  Action: '#ef4444',
  Adventure: '#60a5fa',
  Romance: '#ec4899',
  Horror: '#7c3aed',
  Thriller: '#ef4444',
  Animation: '#14b8a6',
  Documentary: '#a78bfa',
  Family: '#fbbf24',
  'Music': '#e11d48',
  'Sci-Fi': '#06b6d4',
  'Fantasy': '#8b5cf6',
  Crime: '#374151',
  Mystery: '#0ea5a4',
  Western: '#c084fc',
};

function getGenreColor(name: string) {
  // Normalize genre string to match keys loosely
  const key = Object.keys(GENRE_COLORS).find((k) =>
    name.toLowerCase().includes(k.toLowerCase()),
  );
  return key ? GENRE_COLORS[key] : '#ffffff';
}

function GenreChart({ genres }: { genres: { genre: string; count: number }[] }) {
  if (!genres || genres.length === 0) return null;
  const maxCount = genres[0].count || 1;
  const display = genres.slice(0, 5);
  return (
    <Animated.View entering={FadeInDown.delay(80).duration(340)} style={styles.card}>
      <Text style={styles.sectionTitle}>Top Genres</Text>
      {display.map((g, i) => {
        const pct = Math.round((g.count / maxCount) * 100);
        const color = getGenreColor(g.genre);
        return (
          <View key={g.genre} style={styles.genreRow}>
            <Text style={styles.genreRank}>{i + 1}</Text>
            <View style={styles.genreBarWrap}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.genreName}>{g.genre}</Text>
                <Text style={styles.genreCount}>{g.count}</Text>
              </View>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.min(100, pct)}%`, backgroundColor: color },
                  ]}
                />
              </View>
            </View>
          </View>
        );
      })}
    </Animated.View>
  );
}


// ─── RecentlyWatchedRow ───────────────────────────────────────────────────────

function RecentlyWatchedRow({ event, onPress }: { event: WatchEvent; onPress: () => void }) {
  const episodeLabel = event.seasonNumber != null && event.episodeNumber != null
    ? `S${String(event.seasonNumber).padStart(2, '0')}E${String(event.episodeNumber).padStart(2, '0')}`
    : null;
  return (
    <Pressable
      style={({ pressed }) => [styles.historyRow, pressed && styles.historyRowPressed]}
      onPress={onPress}
    >
      {event.posterUrl ? (
        <Image source={{ uri: event.posterUrl }} style={styles.historyPoster} resizeMode="cover" />
      ) : (
        <View style={[styles.historyPoster, styles.historyPosterPlaceholder]}>
          {event.type === 'tv' ? <Tv size={16} color="#3f3f46" /> : <Film size={16} color="#3f3f46" />}
        </View>
      )}
      <View style={styles.historyInfo}>
        <Text style={styles.historyTitle} numberOfLines={1}>{event.title}</Text>
        <View style={styles.historyMeta}>
          <View style={[styles.typePill, event.type === 'tv' ? styles.typePillTv : styles.typePillMovie]}>
            <Text style={styles.typePillText}>{event.type === 'tv' ? 'TV' : 'Movie'}</Text>
          </View>
          {episodeLabel ? <Text style={styles.historyEp}>{episodeLabel}</Text> : null}
        </View>
      </View>
      <Text style={styles.historyDate}>{formatWatchedAt(event.watchedAt)}</Text>
    </Pressable>
  );
}

// ─── RecentlyWatchedList ──────────────────────────────────────────────────────

function RecentlyWatchedEmpty() {
  return (
    <View style={styles.emptyWrap}>
      <Clock size={32} color="#3f3f46" strokeWidth={1.5} />
      <Text style={styles.emptyTitle}>Nothing watched yet.</Text>
      <Text style={styles.emptySubtitle}>Play a file to build your history.</Text>
    </View>
  );
}

function RecentlyWatchedList({
  history,
  onPressItem,
}: {
  history: WatchEvent[];
  onPressItem: (event: WatchEvent) => void;
}) {
  const recent = history.slice(0, 5);
  return (
    <Animated.View entering={FadeInDown.delay(200).duration(340)} style={styles.card}>
      <Text style={styles.sectionTitle}>Recently Watched</Text>
      {recent.length === 0 ? (
        <RecentlyWatchedEmpty />
      ) : (
        recent.map((event) => (
          <RecentlyWatchedRow key={event.id} event={event} onPress={() => onPressItem(event)} />
        ))
      )}
    </Animated.View>
  );
}

// ─── PlayButtonBadge ──────────────────────────────────────────────────────────
// ─── ProfileScreen ────────────────────────────────────────────────────────────

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { isPro, scansUsed, scansRemaining } = usePro();
  const { account, isSyncing, syncPending, signIn } = useAccount();
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<WatchEvent[]>([]);
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [stats, setStats] = useState<WatchStats>(() => computeStats([]));
  const [headerH, setHeaderH] = useState(0);

  // Header image URI and first name (keeps updated from account or local profile)
  const [headerImageUri, setHeaderImageUri] = useState<string | null>(account?.photoUrl ?? null);
  const [headerFirstName, setHeaderFirstName] = useState<string>(() => {
    const name = account?.displayName ?? '';
    return name ? name.split(' ')[0] : 'Profile';
  });

  useEffect(() => {
    // Update from account when it changes
    setHeaderImageUri(account?.photoUrl ?? null);
    const name = account?.displayName ?? '';
    setHeaderFirstName(name ? name.split(' ')[0] : 'Profile');
  }, [account]);

  // Update when local profile is saved (ProfilePicker edits)
  useEffect(() => {
    const cb = (p: any) => {
      if (p?.displayName) setHeaderFirstName(String(p.displayName).split(' ')[0] ?? p.displayName);
    };
    setOnProfileSaved(cb);
    // Also seed from local profile when mounted
    (async () => {
      try {
        const p = await profileService.get();
        if (p?.displayName && !account?.displayName) {
          setHeaderFirstName(p.displayName.split(' ')[0]);
        }
      } catch {}
    })();
    return () => setOnProfileSaved(null);
  }, [account]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      Promise.all([
        watchHistoryService.getHistory(),
        storageService.getLibrary(),
      ]).then(([h, lib]) => {
        if (cancelled) return;
        const s = computeStats(h);
        setHistory(h);
        setLibrary(lib);
        setStats(s);
        setLoading(false);
      });
      return () => { cancelled = true; };
    }, []),
  );

  const handlePressHistoryItem = useCallback(async (event: WatchEvent) => {
    try {
      const library = await storageService.getLibrary();
      const found = library.find((item) => item.id === event.mediaId);
      if (found) navigation.navigate('Details', { item: found });
    } catch {}
  }, [navigation]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  const headerTopPad = insets.top + 14;

  return (
    <View style={styles.root}>
      <View
        style={[styles.header, { paddingTop: headerTopPad }]}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerIconRing}>
            {headerImageUri ? (
              <Image source={{ uri: headerImageUri }} style={styles.headerSmallAvatar} />
            ) : (
              <User size={18} color="#a1a1aa" strokeWidth={2} />
            )}
            {/* Small padlock badge — signals Memories is a Pro feature */}
            <View style={styles.headerIconLockBadge}>
            {/* Sync status dot: green = synced, yellow = syncing/pending */}
            <View style={[styles.headerSyncDot, { backgroundColor: (isSyncing || syncPending) ? '#f59e0b' : '#4ade80' }]} />
            </View>
          </View>

          <View>
            <Text style={styles.headerTitle}>{headerFirstName}</Text>
            <Text style={styles.headerSubtitle}>Your watch stats & history</Text>
          </View>

          <Pressable
            onPress={() => navigation.navigate('Settings')}
            hitSlop={12}
            style={styles.settingsBtn}
          >
            <Settings size={20} color="#71717a" strokeWidth={2} />
          </Pressable>
        </View>

        <View style={styles.headerBorder} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: headerH + 8, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <HeroStats
          stats={stats}
          accountProps={{
            account,
            isSyncing,
            syncPending,
            signingIn,
            signInError,
            onSignIn: async () => {
              setSigningIn(true);
              setSignInError(null);
              try {
                await signIn();
              } catch (err: unknown) {
                setSignInError(
                  String((err as any)?.message ?? 'Sign-in failed. Please try again.'),
                );
              } finally {
                setSigningIn(false);
              }
            },
            // Profile screen: override display name to first name and hide action buttons
            displayNameOverride: headerFirstName,
            hideActions: true,
          }}
        />
        <GenreChart genres={stats.genreBreakdown} />
        <MemoriesCard history={history} library={library} animDelay={220} />
        <RecentlyWatchedList history={history} onPressItem={handlePressHistoryItem} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CARD_BG     = 'rgba(255,255,255,0.03)';
const CARD_BORDER = 'rgba(255,255,255,0.06)';
const BAR_TRACK   = 'rgba(255,255,255,0.06)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  centered: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },

  // ── Header ──
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
    backgroundColor: '#000000',
    paddingHorizontal: CARD_PADDING + 8,
    paddingBottom: 14,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIconRing: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  headerIconLockBadge: {
    position: 'absolute',
    bottom: -3, right: -3,
    width: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  headerSyncDot: {
    width: 10, height: 10, borderRadius: 7,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)'
  },

  headerTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.4, color: '#ffffff' },
  headerSubtitle: { fontSize: 11, color: '#52525b', marginTop: 1 },
  settingsBtn: {
    marginLeft: 'auto', width: 38, height: 38,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 19,
  },
  headerBorder: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.04)' },

  headerSmallAvatar: {
    width: 38, height: 38, borderRadius: 19, overflow: 'hidden',
  },

  // ── Scroll ──
  scroll: { paddingHorizontal: CARD_PADDING, gap: 16 },

  // ── Card ──
  card: {
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: CARD_BORDER,
    borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#ffffff', marginBottom: 16, letterSpacing: 0.2 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sectionTitleInRow: { fontSize: 16, fontWeight: '800', color: '#ffffff', letterSpacing: 0.2 },

  // ── Pro CTA ──
  proCtaCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(167,139,250,0.08)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)',
    borderRadius: 20, padding: 18,
    shadowColor: '#a78bfa', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  proCtaIconRing: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(167,139,250,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  proCtaTitle: { fontSize: 14, fontWeight: '800', color: '#f3e8ff' },
  proCtaSubtitle: { fontSize: 12, color: '#a78bfa', marginTop: 4, fontWeight: '500' },

  // ── HeroStats (identity + watch time) ──
  heroCard: {
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: CARD_BORDER,
    borderRadius: 24, padding: 24, gap: 0,
    shadowColor: '#000000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5, shadowRadius: 24, elevation: 12,
  },
  heroDividerLine: {
    height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 20,
  },
  heroHoursLabel: {
    fontSize: 12, fontWeight: '800', color: '#a1a1aa',
    textTransform: 'uppercase', letterSpacing: 2, textAlign: 'center', marginBottom: 6,
  },
  heroHours: {
    fontSize: 56, fontWeight: '900', color: '#ffffff',
    textAlign: 'center', letterSpacing: -2, marginBottom: 8,
    textShadowColor: 'rgba(255,255,255,0.15)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 16,
  },
  watchingSince: { fontSize: 12, color: '#71717a', textAlign: 'center', marginBottom: 24, fontWeight: '600', letterSpacing: 0.5 },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  heroStatCell: { flex: 1, alignItems: 'center', gap: 6 },
  heroStatValue: { fontSize: 32, fontWeight: '900', color: '#ffffff', letterSpacing: -1 },
  heroStatLabel: {
    fontSize: 12, color: '#a1a1aa', fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 1.2,
  },
  heroDivider: { width: 1, height: 48, backgroundColor: 'rgba(255,255,255,0.05)' },
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center',
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
    borderRadius: 24, paddingHorizontal: 14, paddingVertical: 6,
    marginBottom: 18,
    shadowColor: '#f59e0b', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 8,
  },
  streakText: { fontSize: 13, fontWeight: '800', color: '#fbbf24', letterSpacing: 0.5 },
  weekRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: CARD_BORDER,
  },
  weekLabel: { fontSize: 12, color: '#71717a', fontWeight: '600', flex: 1 },
  weekDiffPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  weekDiffText: { fontSize: 11, fontWeight: '700' },

  // ── StreakCard ──
  streakCard: { borderColor: 'rgba(245,158,11,0.15)' },

  // ── GenreChart ──
  genreRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  genreRank: { fontSize: 13, color: '#52525b', fontWeight: '700', width: 16, textAlign: 'right' },
  genreBarWrap: { flex: 1, gap: 4 },
  genreName: { fontSize: 13, color: '#d4d4d8', fontWeight: '600' },
  barTrack: { height: 4, backgroundColor: BAR_TRACK, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#ffffff', borderRadius: 2 },
  genreCount: { fontSize: 12, color: '#71717a', fontWeight: '600', minWidth: 24, textAlign: 'right' },

  // ── AnimeBlock ──
  animeCard: { borderColor: 'rgba(232,121,249,0.18)' },
  animeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  animeTitle: { marginBottom: 0, color: '#e879f9' },
  animeGenres: { fontSize: 12, color: '#71717a', marginTop: 12, textAlign: 'center' },

  // ── Badges ──
  badgeCountPill: {
    marginLeft: 'auto',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
  },
  badgeCountText: { fontSize: 11, fontWeight: '700', color: '#71717a' },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  badgeCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: CARD_BORDER,
    borderRadius: 10, padding: 10,
    alignItems: 'center', gap: 4, minHeight: 100,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  badgeCardLocked: { opacity: 0.55 },
  badgeCardPlaceholder: { flex: 1 },
  badgeIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4, position: 'relative',
  },
  lockOverlay: {
    position: 'absolute', bottom: -2, right: -2,
    backgroundColor: '#1a1a1a', borderRadius: 8, padding: 2,
  },
  badgeName: { fontSize: 11, fontWeight: '700', color: '#ffffff', textAlign: 'center', lineHeight: 14 },
  badgeNameLocked: { color: '#52525b' },
  badgeDesc: { fontSize: 9, color: '#a1a1aa', textAlign: 'center', lineHeight: 12 },
  badgeProgress: { fontSize: 10, color: '#52525b', fontWeight: '600' },
  badgeBarTrack: {
    width: '100%', height: 3, backgroundColor: BAR_TRACK,
    borderRadius: 2, overflow: 'hidden', marginTop: 4,
  },
  badgeBarFill: { height: '100%', backgroundColor: '#4f4f4f', borderRadius: 2 },

  // ── History list ──
  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: CARD_BORDER,
  },
  historyRowPressed: { opacity: 0.6 },
  historyPoster: { width: 40, height: 60, borderRadius: 4, backgroundColor: '#1a1a1a' },
  historyPosterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  historyInfo: { flex: 1, gap: 6 },
  historyTitle: { fontSize: 14, fontWeight: '600', color: '#ffffff' },
  historyMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typePillMovie: { backgroundColor: 'rgba(245,158,11,0.2)' },
  typePillTv: { backgroundColor: 'rgba(96,165,250,0.2)' },
  typePillText: {
    fontSize: 10, fontWeight: '700', color: '#a1a1aa',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  historyEp: { fontSize: 11, color: '#71717a', fontWeight: '600' },
  historyDate: { fontSize: 11, color: '#52525b', fontWeight: '500' },

  // ── Pending badges ──
  pendingCard: { borderColor: 'rgba(245,158,11,0.22)' },
  pendingBadge: {
    marginLeft: 'auto', backgroundColor: '#f59e0b',
    borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2,
  },
  pendingBadgeText: { fontSize: 11, fontWeight: '800', color: '#000000' },
  pendingHint: { fontSize: 12, color: '#71717a', marginBottom: 14, marginTop: -6 },
  pendingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pendingItem: { alignItems: 'center', gap: 6, width: 64 },
  pendingIconWrap: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 6,
  },
  pendingItemName: { fontSize: 10, fontWeight: '700', color: '#a1a1aa', textAlign: 'center' },

  // ── Empty state ──
  emptyWrap: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#3f3f46' },
  emptySubtitle: { fontSize: 13, color: '#3f3f46', textAlign: 'center', lineHeight: 18 },
});

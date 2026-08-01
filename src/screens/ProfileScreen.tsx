/**
 * ProfileScreen — Watch history, stats, badges, streak, memories.
 * Redesigned with: streak chip, settings shortcut, badge glow on earned,
 * earned/total badge count, week comparison, inline Pro CTA, MemoriesCard.
 */
import React, { useCallback, useState } from 'react';
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
  Trophy, Clock, Clapperboard, Lock, User, Gift, Settings,
  Flame, TrendingUp, TrendingDown, Minus, Crown,
} from 'lucide-react-native';

import { MediaItem } from '../types';
import { watchHistoryService, WatchEvent } from '../storage/watchHistoryService';
import { storageService } from '../storage/asyncStorage';
import { computeStats, WatchStats } from '../utils/statsEngine';
import { evaluateBadges, BadgeResult } from '../utils/badgeEngine';
import { useBadgeUnlock } from '../context/BadgeUnlockContext';
import { usePro } from '../context/ProContext';
import { FREE_SCAN_LIMIT } from '../storage/proStatusService';
import { MemoriesCard } from '../components/MemoriesCard';
import { useAccount } from '../context/AccountContext';
import { AccountHeader } from '../components/AccountHeader';
import { FilmSortAccount } from '../services/authService';

const CARD_PADDING = 16;

// ─── Icon resolver ────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ size: number; color: string; strokeWidth?: number }>> = {
  Play, Film, Tv, Zap, Star, Sparkles, Heart, Eye, Moon, Trophy, Clock, Clapperboard,
};

function BadgeIcon({ name, size, color }: { name: string; size: number; color: string }) {
  const Icon = ICON_MAP[name] ?? Star;
  const nudge = name === 'Play' ? { marginLeft: 3 } : undefined;
  return (
    <View style={nudge}>
      <Icon size={size} color={color} strokeWidth={2} />
    </View>
  );
}

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

// ─── PendingBadgesSection ─────────────────────────────────────────────────────

function PendingBadgesSection() {
  const { savedBadges, openSaved } = useBadgeUnlock();
  if (savedBadges.length === 0) return null;
  return (
    <Animated.View entering={FadeInDown.delay(0).duration(340)} style={[styles.card, styles.pendingCard]}>
      <View style={styles.sectionTitleRow}>
        <Gift size={16} color="#f59e0b" strokeWidth={2} />
        <Text style={[styles.sectionTitleInRow, { color: '#f59e0b' }]}>Unclaimed Badges</Text>
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingBadgeText}>{savedBadges.length}</Text>
        </View>
      </View>
      <Text style={styles.pendingHint}>You closed these before opening them. Tap to claim!</Text>
      <View style={styles.pendingRow}>
        {savedBadges.map((badge) => (
          <Pressable
            key={badge.id}
            style={({ pressed }) => [styles.pendingItem, pressed && { opacity: 0.7 }]}
            onPress={() => openSaved(badge.id)}
          >
            <View style={[styles.pendingIconWrap, { borderColor: badge.color, shadowColor: badge.color }]}>
              <BadgeIcon name={badge.icon} size={22} color={badge.color} />
            </View>
            <Text style={styles.pendingItemName} numberOfLines={1}>{badge.name}</Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
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
      {/* Identity strip (Google account / save progress) */}
      <AccountHeader
        account={accountProps.account}
        isSyncing={accountProps.isSyncing}
        syncPending={accountProps.syncPending}
        signingIn={accountProps.signingIn}
        signInError={accountProps.signInError}
        onSignIn={accountProps.onSignIn}
        embedded
      />

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

function GenreChart({ genres }: { genres: { genre: string; count: number }[] }) {
  if (genres.length === 0) return null;
  const maxCount = genres[0].count;
  const display = genres.slice(0, 5);
  return (
    <Animated.View entering={FadeInDown.delay(80).duration(340)} style={styles.card}>
      <Text style={styles.sectionTitle}>Top Genres</Text>
      {display.map((g, i) => (
        <View key={g.genre} style={styles.genreRow}>
          <Text style={styles.genreRank}>{i + 1}</Text>
          <View style={styles.genreBarWrap}>
            <Text style={styles.genreName}>{g.genre}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.round((g.count / maxCount) * 100)}%` }]} />
            </View>
          </View>
          <Text style={styles.genreCount}>{g.count}</Text>
        </View>
      ))}
    </Animated.View>
  );
}

// ─── AnimeBlock ───────────────────────────────────────────────────────────────

function AnimeBlock({ stats }: { stats: WatchStats }) {
  if (stats.animeEpisodes === 0) return null;
  const hoursLabel = stats.animeHours < 1
    ? `${Math.round(stats.animeHours * 60)}m`
    : `${stats.animeHours}h`;
  const topAnimeGenres = stats.animeGenres.slice(0, 3).map((g) => g.genre).join(' · ');
  return (
    <Animated.View entering={FadeInDown.delay(100).duration(340)} style={[styles.card, styles.animeCard]}>
      <View style={styles.animeTitleRow}>
        <Star size={16} color="#e879f9" strokeWidth={2} fill="#e879f9" />
        <Text style={[styles.sectionTitle, styles.animeTitle]}>Anime</Text>
      </View>
      <View style={styles.heroRow}>
        <View style={styles.heroStatCell}>
          <Text style={styles.heroStatValue}>{stats.animeEpisodes}</Text>
          <Text style={styles.heroStatLabel}>Episodes</Text>
        </View>
        <View style={styles.heroDivider} />
        <View style={styles.heroStatCell}>
          <Text style={styles.heroStatValue}>{hoursLabel}</Text>
          <Text style={styles.heroStatLabel}>Watched</Text>
        </View>
      </View>
      {topAnimeGenres ? <Text style={styles.animeGenres}>{topAnimeGenres}</Text> : null}
    </Animated.View>
  );
}

// ─── StreakCard ────────────────────────────────────────────────────────────────

function StreakCard({ stats }: { stats: WatchStats }) {
  if (stats.currentStreak === 0 && stats.longestStreak === 0) return null;
  return (
    <Animated.View entering={FadeInDown.delay(120).duration(340)} style={[styles.card, styles.streakCard]}>
      <View style={styles.sectionTitleRow}>
        <Flame size={16} color="#f59e0b" strokeWidth={2} fill="#f59e0b" />
        <Text style={[styles.sectionTitleInRow, { color: '#f59e0b' }]}>Watch Streak</Text>
      </View>
      <View style={styles.heroRow}>
        <View style={styles.heroStatCell}>
          <Text style={[styles.heroStatValue, { color: '#f59e0b' }]}>{stats.currentStreak}</Text>
          <Text style={styles.heroStatLabel}>Current</Text>
        </View>
        <View style={styles.heroDivider} />
        <View style={styles.heroStatCell}>
          <Text style={styles.heroStatValue}>{stats.longestStreak}</Text>
          <Text style={styles.heroStatLabel}>Best streak</Text>
        </View>
        <View style={styles.heroDivider} />
        <View style={styles.heroStatCell}>
          <Text style={styles.heroStatValue}>{stats.uniqueTitles}</Text>
          <Text style={styles.heroStatLabel}>Unique titles</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── BadgeCard ────────────────────────────────────────────────────────────────

function BadgeCard({ badge }: { badge: BadgeResult }) {
  return (
    <View style={[
      styles.badgeCard,
      !badge.earned && styles.badgeCardLocked,
      // Earned: colored border glow
      badge.earned && { borderColor: badge.color + '55', shadowColor: badge.color },
    ]}>
      <View style={[
        styles.badgeIconWrap,
        badge.earned && { backgroundColor: badge.color + '22', borderColor: badge.color + '55', borderWidth: 1 },
      ]}>
        <BadgeIcon
          name={badge.icon}
          size={22}
          color={badge.earned ? badge.color : 'rgba(255,255,255,0.2)'}
        />
        {!badge.earned && (
          <View style={styles.lockOverlay}>
            <Lock size={10} color="rgba(255,255,255,0.35)" strokeWidth={2.5} />
          </View>
        )}
      </View>
      <Text style={[styles.badgeName, !badge.earned && styles.badgeNameLocked]} numberOfLines={2}>
        {badge.name}
      </Text>
      {badge.earned ? (
        <Text style={styles.badgeDesc} numberOfLines={2}>{badge.description}</Text>
      ) : (
        <Text style={styles.badgeProgress}>{badge.current} / {badge.target}</Text>
      )}
      {!badge.earned && (
        <View style={styles.badgeBarTrack}>
          <View style={[styles.badgeBarFill, { width: `${Math.round(badge.progress * 100)}%` }]} />
        </View>
      )}
    </View>
  );
}

// ─── BadgeSection ─────────────────────────────────────────────────────────────

function BadgeSection({ badges }: { badges: BadgeResult[] }) {
  const earned = badges.filter((b) => b.earned).length;
  const rows: BadgeResult[][] = [];
  for (let i = 0; i < badges.length; i += 3) rows.push(badges.slice(i, i + 3));
  return (
    <Animated.View entering={FadeInDown.delay(160).duration(340)} style={styles.card}>
      <View style={styles.sectionTitleRow}>
        <Trophy size={16} color="#fbbf24" strokeWidth={2} />
        <Text style={styles.sectionTitleInRow}>Badges</Text>
        <View style={styles.badgeCountPill}>
          <Text style={styles.badgeCountText}>{earned} / {badges.length}</Text>
        </View>
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.badgeRow}>
          {row.map((badge) => <BadgeCard key={badge.id} badge={badge} />)}
          {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
            <View key={`empty-${i}`} style={styles.badgeCardPlaceholder} />
          ))}
        </View>
      ))}
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
  const recent = history.slice(0, 20);
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
  const [badges, setBadges] = useState<BadgeResult[]>(() => evaluateBadges([], computeStats([])));
  const [headerH, setHeaderH] = useState(0);

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
        const b = evaluateBadges(h, s);
        setHistory(h);
        setLibrary(lib);
        setStats(s);
        setBadges(b);
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
            <User size={18} color="#a1a1aa" strokeWidth={2} />
            {/* Small padlock badge — signals Memories is a Pro feature */}
            <View style={styles.headerIconLockBadge}>
              <Lock size={8} color="#a78bfa" strokeWidth={3} />
            </View>
          </View>
          <View>
            <Text style={styles.headerTitle}>Profile</Text>
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
          }}
        />
        <PendingBadgesSection />
        {!isPro && <InlineProCTA scansUsed={scansUsed} scansRemaining={scansRemaining} />}
        <StreakCard stats={stats} />
        <GenreChart genres={stats.genreBreakdown} />
        <AnimeBlock stats={stats} />
        <BadgeSection badges={badges} />
        <MemoriesCard history={history} library={library} animDelay={220} />
        <RecentlyWatchedList history={history} onPressItem={handlePressHistoryItem} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CARD_BG     = 'rgba(255,255,255,0.04)';
const CARD_BORDER = 'rgba(255,255,255,0.07)';
const BAR_TRACK   = 'rgba(255,255,255,0.12)';

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
    bottom: -1,
    right: -1,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.40)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.4, color: '#ffffff' },
  headerSubtitle: { fontSize: 12, color: '#52525b', marginTop: 1 },
  settingsBtn: {
    marginLeft: 'auto', width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  headerBorder: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, backgroundColor: CARD_BORDER },

  // ── Scroll ──
  scroll: { paddingHorizontal: CARD_PADDING, gap: 12 },

  // ── Card ──
  card: {
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: CARD_BORDER,
    borderRadius: 12, padding: 16,
  },
  // Used as a standalone heading — keeps its own bottom margin
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#ffffff', marginBottom: 14, letterSpacing: 0.1 },
  // Used when an icon sits beside the title — margin lives on the ROW, not the text
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  // Title text variant for use inside sectionTitleRow — no bottom margin so it
  // aligns vertically with the icon rather than being pushed down by it
  sectionTitleInRow: { fontSize: 15, fontWeight: '700', color: '#ffffff', letterSpacing: 0.1 },

  // ── Pro CTA ──
  proCtaCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(167,139,250,0.08)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.22)',
    borderRadius: 12, padding: 14,
  },
  proCtaIconRing: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(167,139,250,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  proCtaTitle: { fontSize: 13, fontWeight: '700', color: '#e4e4e7' },
  proCtaSubtitle: { fontSize: 11, color: '#71717a', marginTop: 2 },

  // ── HeroStats (identity + watch time) ──
  heroCard: {
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: CARD_BORDER,
    borderRadius: 16, padding: 16, gap: 0,
  },
  heroDividerLine: {
    height: 1, backgroundColor: CARD_BORDER, marginVertical: 16,
  },
  heroHoursLabel: {
    fontSize: 11, fontWeight: '600', color: '#52525b',
    textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginBottom: 4,
  },
  heroHours: {
    fontSize: 44, fontWeight: '800', color: '#ffffff',
    textAlign: 'center', letterSpacing: -1, marginBottom: 6,
  },
  watchingSince: { fontSize: 11, color: '#3f3f46', textAlign: 'center', marginBottom: 16, fontWeight: '600' },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  heroStatCell: { flex: 1, alignItems: 'center', gap: 4 },
  heroStatValue: { fontSize: 26, fontWeight: '800', color: '#ffffff', letterSpacing: -0.5 },
  heroStatLabel: {
    fontSize: 11, color: '#71717a', fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  heroDivider: { width: 1, height: 40, backgroundColor: CARD_BORDER },
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'center',
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
    marginBottom: 12,
  },
  streakText: { fontSize: 12, fontWeight: '700', color: '#f59e0b' },
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

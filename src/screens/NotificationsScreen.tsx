import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList , UpcomingItem } from '../types';
import { BlurView } from 'expo-blur';
import {
  ChevronLeft,
  Bell,
  Sparkles,
  Tv,
  CheckCheck,
  Inbox,
  Flame,
  CalendarClock,
  BellOff,
  Clapperboard,
  Gift,
} from 'lucide-react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  InAppNotification,
  NotificationTag,
  useNotifications,
} from '../context/NotificationContext';
import { UpcomingCard } from '../components/UpcomingCard';
import { storageService } from '../storage/asyncStorage';
import { tmdbService } from '../services/tmdbService';
import { useBadgeUnlock } from '../context/BadgeUnlockContext';

type TabKey = 'inbox' | 'upcoming';

// ─── Tag config ───────────────────────────────────────────────────────────────

const TAG: Record<NotificationTag, { label: string; color: string; icon: any }> = {
  NEW_ARRIVAL: { label: 'New Arrival', color: '#a78bfa', icon: Sparkles },
  NEW_EPISODE: { label: 'New Episode', color: '#60a5fa', icon: Tv },
  NEW_SEASON: { label: 'New Season', color: '#34d399', icon: Tv },
  NOW_AVAILABLE: { label: 'Now Available', color: '#facc15', icon: Flame },
  DONT_MISS: { label: "Don't Miss", color: '#f87171', icon: Flame },
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Plain notification row ───────────────────────────────────────────────────

function NotificationRow({ item, index }: { item: InAppNotification; index: number }) {
  const tag = item.tag ? TAG[item.tag] : null;
  const accent = item.accentColor ?? tag?.color ?? '#60a5fa';
  const Icon = tag?.icon ?? (item.type === 'added' ? Sparkles : Bell);

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 35).duration(260)} style={styles.rowWrap}>
      <View style={[styles.rowIcon, { backgroundColor: `${accent}18` }]}>
        <Icon size={17} color={accent} />
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text style={styles.rowLabel}>
            {tag?.label ?? (item.type === 'added' ? 'Library' : 'Notification')}
          </Text>
          <Text style={styles.rowTime}>{timeAgo(item.timestamp)}</Text>
        </View>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.mediaTitle ? (
          <Text style={styles.rowMedia} numberOfLines={1}>
            {item.mediaTitle}
          </Text>
        ) : null}
        <Text style={styles.rowBody} numberOfLines={2}>
          {item.body}
        </Text>
      </View>
      {!item.read && <View style={[styles.rowUnread, { backgroundColor: accent }]} />}
    </Animated.View>
  );
}

// ─── Empty states ─────────────────────────────────────────────────────────────

function InboxEmpty() {
  return (
    <Animated.View entering={FadeIn.duration(500)} style={styles.emptyWrap}>
      <View style={styles.emptyIconInner}>
        <BellOff size={34} color="#52525b" />
      </View>
      <Text style={styles.emptyTitle}>All caught up</Text>
      <Text style={styles.emptySubtitle}>
        Your inbox is clear. Scan videos or set release reminders to get alerts here.
      </Text>
      <View style={styles.emptyHintsList}>
        {[
          { color: '#a78bfa', text: 'Scan videos to build your library' },
          { color: '#60a5fa', text: 'Switch to Upcoming for air dates' },
          { color: '#34d399', text: 'Tap Remind Me on any upcoming card' },
        ].map((h, i) => (
          <View key={i} style={styles.emptyHintItem}>
            <View style={[styles.emptyHintBullet, { backgroundColor: h.color }]} />
            <Text style={styles.emptyHintText}>{h.text}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

function UpcomingEmpty({ hasLibrary }: { hasLibrary: boolean }) {
  return (
    <Animated.View entering={FadeIn.duration(500)} style={styles.emptyWrap}>
      <View style={styles.emptyIconInner}>
        <CalendarClock size={34} color="#52525b" />
      </View>
      <Text style={styles.emptyTitle}>
        {hasLibrary ? 'Nothing upcoming' : 'No library yet'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {hasLibrary
          ? 'None of your scanned shows have a confirmed next episode or sequel date right now.'
          : 'Scan movies and TV shows into your library — we’ll surface their next releases here.'}
      </Text>
      {!hasLibrary && (
        <View style={styles.emptyHintsList}>
          <View style={styles.emptyHintItem}>
            <View style={[styles.emptyHintBullet, { backgroundColor: '#a78bfa' }]} />
            <Text style={styles.emptyHintText}>Use Scanner → Select files or Media library</Text>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

// ─── Segmented control ────────────────────────────────────────────────────────

function TabSwitch({
  tab,
  onChange,
  inboxCount,
  upcomingCount,
}: {
  tab: TabKey;
  onChange: (t: TabKey) => void;
  inboxCount: number;
  upcomingCount: number;
}) {
  return (
    <View style={styles.tabSwitch}>
      <Pressable
        style={[styles.tabBtn, tab === 'inbox' && styles.tabBtnActive]}
        onPress={() => onChange('inbox')}
      >
        <Inbox size={14} color={tab === 'inbox' ? '#000000' : '#a1a1aa'} />
        <Text style={[styles.tabBtnText, tab === 'inbox' && styles.tabBtnTextActive]}>
          Inbox
        </Text>
        {inboxCount > 0 && (
          <View style={[styles.tabBadge, tab === 'inbox' && styles.tabBadgeActive]}>
            <Text style={[styles.tabBadgeText, tab === 'inbox' && styles.tabBadgeTextActive]}>
              {inboxCount > 99 ? '99+' : inboxCount}
            </Text>
          </View>
        )}
      </Pressable>

      <Pressable
        style={[styles.tabBtn, tab === 'upcoming' && styles.tabBtnActive]}
        onPress={() => onChange('upcoming')}
      >
        <Clapperboard size={14} color={tab === 'upcoming' ? '#000000' : '#a1a1aa'} />
        <Text style={[styles.tabBtnText, tab === 'upcoming' && styles.tabBtnTextActive]}>
          Upcoming
        </Text>
        {upcomingCount > 0 && (
          <View style={[styles.tabBadge, tab === 'upcoming' && styles.tabBadgeActive]}>
            <Text
              style={[styles.tabBadgeText, tab === 'upcoming' && styles.tabBadgeTextActive]}
            >
              {upcomingCount > 99 ? '99+' : upcomingCount}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

function TopBar({
  insets,
  onBack,
  onMarkRead,
  hasUnread,
  scrollY,
  title,
}: {
  insets: { top: number };
  onBack: () => void;
  onMarkRead: () => void;
  hasUnread: boolean;
  scrollY: SharedValue<number>;
  title: string;
}) {
  const bgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [50, 130], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
      <Animated.View style={[StyleSheet.absoluteFillObject, bgStyle, styles.topBarBg]}>
        <View style={styles.topBarBorder} />
      </Animated.View>

      <View style={styles.topBarRow}>
        <Pressable style={styles.topBarBtn} onPress={onBack} hitSlop={10}>
          <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFillObject} />
          <ChevronLeft size={22} color="#ffffff" />
        </Pressable>

        <Text style={styles.topBarTitle}>{title}</Text>

        <View style={styles.topBarActions}>
          {hasUnread && (
            <Pressable style={styles.topBarBtn} onPress={onMarkRead} hitSlop={8}>
              <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFillObject} />
              <CheckCheck size={17} color="#60a5fa" />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'Notifications'>>();
  const insets = useSafeAreaInsets();
  const { notifications, markAllRead } = useNotifications();
  const { savedBadges, openSaved } = useBadgeUnlock();

  const [tab, setTab] = useState<TabKey>(route.params?.initialTab ?? 'inbox');

  // Deep link from release notification → Upcoming tab
  useEffect(() => {
    if (route.params?.initialTab) {
      setTab(route.params.initialTab);
    }
  }, [route.params?.initialTab]);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [libraryCount, setLibraryCount] = useState(0);
  const [loadingUpcoming, setLoadingUpcoming] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [upcomingLoaded, setUpcomingLoaded] = useState(false);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const unread = notifications.filter((n) => !n.read).length;

  // Mark inbox read when viewing inbox
  useEffect(() => {
    if (tab === 'inbox') markAllRead();
  }, [tab, markAllRead]);

  const loadUpcoming = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoadingUpcoming(true);
    try {
      const library = await storageService.getLibrary();
      setLibraryCount(library.length);
      if (library.length === 0) {
        setUpcoming([]);
        return;
      }
      const items = await tmdbService.getUpcomingForLibrary(library);
      setUpcoming(items);
    } catch (err) {
      console.error('[Notifications] Failed to load upcoming:', err);
    } finally {
      setLoadingUpcoming(false);
      setRefreshing(false);
      setUpcomingLoaded(true);
    }
  }, []);

  // Prefetch once on focus; refresh when user opens Upcoming
  useFocusEffect(
    useCallback(() => {
      if (!upcomingLoaded) {
        loadUpcoming();
      }
    }, [upcomingLoaded, loadUpcoming]),
  );

  useEffect(() => {
    if (tab === 'upcoming') {
      loadUpcoming();
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const headerTitle = tab === 'inbox' ? 'Inbox' : 'Upcoming';
  const headerSubtitle =
    tab === 'inbox'
      ? notifications.length === 0
        ? 'No alerts yet — start by scanning your videos.'
        : 'Library matches and release reminders'
      : libraryCount === 0
        ? 'Based on titles in your library'
        : `From ${libraryCount} title${libraryCount === 1 ? '' : 's'} in your library`;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <TopBar
        insets={insets}
        onBack={() => navigation.goBack()}
        onMarkRead={markAllRead}
        hasUnread={unread > 0 && tab === 'inbox'}
        scrollY={scrollY}
        title={tab === 'inbox' ? 'Notifications' : 'Upcoming'}
      />

      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 64,
          paddingBottom: insets.bottom + 56,
        }}
        refreshControl={
          tab === 'upcoming' ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadUpcoming(true)}
              tintColor="#60a5fa"
            />
          ) : undefined
        }
      >
        {/* Header + tab switch */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.headerBlock}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>{headerTitle}</Text>
            {tab === 'inbox' && notifications.length > 0 && (
              <View style={styles.headerCount}>
                <Text style={styles.headerCountText}>{notifications.length}</Text>
              </View>
            )}
            {tab === 'upcoming' && upcoming.length > 0 && (
              <View style={styles.headerCount}>
                <Text style={styles.headerCountText}>{upcoming.length}</Text>
              </View>
            )}
          </View>
          <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>

          <TabSwitch
            tab={tab}
            onChange={setTab}
            inboxCount={notifications.length}
            upcomingCount={upcoming.length}
          />
        </Animated.View>

        {/* ── Inbox ─────────────────────────────────────────────────── */}
        {tab === 'inbox' && (
          <>
            {/* Saved (snoozed) badge gifts */}
            {savedBadges.length > 0 && (
              <Animated.View entering={FadeInDown.delay(0).duration(280)} style={styles.badgeGiftsCard}>
                <View style={styles.badgeGiftsHeader}>
                  <Gift size={15} color="#f59e0b" strokeWidth={2} />
                  <Text style={styles.badgeGiftsTitle}>Unclaimed Badges</Text>
                  <View style={styles.badgeGiftsPill}>
                    <Text style={styles.badgeGiftsPillText}>{savedBadges.length}</Text>
                  </View>
                </View>
                <Text style={styles.badgeGiftsHint}>Tap a gift to open your achievement</Text>
                <View style={styles.badgeGiftsRow}>
                  {savedBadges.map((badge) => (
                    <Pressable
                      key={badge.id}
                      style={({ pressed }) => [styles.badgeGiftItem, pressed && { opacity: 0.65 }]}
                      onPress={() => openSaved(badge.id)}
                    >
                      <View style={[styles.badgeGiftIcon, { borderColor: badge.color, shadowColor: badge.color }]}>
                        <Gift size={22} color={badge.color} strokeWidth={1.8} />
                      </View>
                      <Text style={styles.badgeGiftLabel} numberOfLines={1}>{badge.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </Animated.View>
            )}

            {notifications.length === 0 ? (
              <InboxEmpty />
            ) : (
              <View style={styles.sectionBlock}>
                <View style={styles.plainList}>
                  {notifications.map((n, i) => (
                    <NotificationRow key={n.id} item={n} index={i} />
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {/* ── Upcoming (library-driven UpcomingCard design) ─────────── */}
        {tab === 'upcoming' && (
          <View style={styles.upcomingSection}>
            {loadingUpcoming && !refreshing ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color="#60a5fa" size="large" />
                <Text style={styles.loadingText}>Checking your library releases…</Text>
              </View>
            ) : upcoming.length === 0 ? (
              <UpcomingEmpty hasLibrary={libraryCount > 0} />
            ) : (
              <View style={styles.upcomingList}>
                <Text style={styles.upcomingHint}>
                  Because you watch these — next episodes & sequels
                </Text>
                {upcoming.map((item) => (
                  <UpcomingCard key={item.id} item={item} />
                ))}
              </View>
            )}
          </View>
        )}
      </Animated.ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  topBarBg: {
    backgroundColor: '#000000',
  },
  topBarBorder: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  topBarActions: {
    flexDirection: 'row',
    gap: 8,
    minWidth: 38,
  },
  topBarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },

  headerBlock: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 10,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -0.9,
  },
  headerCount: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginTop: 8,
  },
  headerCountText: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#71717a',
    fontSize: 14,
    marginTop: 6,
    lineHeight: 20,
    marginBottom: 16,
  },

  tabSwitch: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 11,
  },
  tabBtnActive: {
    backgroundColor: '#ffffff',
  },
  tabBtnText: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '800',
  },
  tabBtnTextActive: {
    color: '#000000',
  },
  tabBadge: {
    minWidth: 20,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  tabBadgeText: {
    color: '#a1a1aa',
    fontSize: 10,
    fontWeight: '800',
  },
  tabBadgeTextActive: {
    color: '#000000',
  },

  sectionBlock: {
    marginBottom: 24,
  },
  plainList: {
    paddingHorizontal: 22,
  },
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  rowContent: {
    flex: 1,
    gap: 3,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowLabel: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '700',
  },
  rowTime: {
    color: '#52525b',
    fontSize: 11,
    fontWeight: '600',
  },
  rowTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  rowMedia: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '600',
  },
  rowBody: {
    color: '#71717a',
    fontSize: 12,
    lineHeight: 17,
  },
  rowUnread: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
  },

  upcomingSection: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  upcomingList: {
    gap: 4,
  },
  upcomingHint: {
    color: '#52525b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 14,
    marginLeft: 4,
  },
  loadingWrap: {
    alignItems: 'center',
    paddingTop: 48,
    gap: 14,
  },
  loadingText: {
    color: '#71717a',
    fontSize: 13,
    fontWeight: '600',
  },

  emptyWrap: {
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 32,
  },
  emptyIconInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 20,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#71717a',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  emptyHintsList: {
    width: '100%',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 14,
  },
  emptyHintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emptyHintBullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  emptyHintText: {
    color: '#52525b',
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Saved badge gifts strip ──
  badgeGiftsCard: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: 'rgba(245,158,11,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.20)',
    borderRadius: 14,
    padding: 14,
  },
  badgeGiftsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  badgeGiftsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f59e0b',
  },
  badgeGiftsPill: {
    marginLeft: 'auto',
    backgroundColor: '#f59e0b',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeGiftsPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#000000',
  },
  badgeGiftsHint: {
    fontSize: 11,
    color: '#a1a1aa',
    marginBottom: 12,
  },
  badgeGiftsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  badgeGiftItem: {
    alignItems: 'center',
    gap: 5,
    width: 60,
  },
  badgeGiftIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  badgeGiftLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#a1a1aa',
    textAlign: 'center',
  },
});

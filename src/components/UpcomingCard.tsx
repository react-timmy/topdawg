import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Dimensions,
  Modal,
  Linking,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar, Info, Bell, X, Globe } from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { UpcomingItem, WatchProvider } from '../types';
import { cancelNotificationsForItem, scheduleUpcomingNotification } from '../services/notificationService';
import { useNotifications } from '../context/NotificationContext';
import { tmdbService } from '../services/tmdbService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const REMINDED_STORAGE_KEY = '@reminded_upcoming_items';

interface UpcomingCardProps {
  item: UpcomingItem;
  onPress?: () => void;
}

function PulsingDot() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.9);

  React.useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.6, { duration: 800 }),
        withTiming(1, { duration: 800 }),
      ),
      -1,
      false,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 800 }),
        withTiming(0.9, { duration: 800 }),
      ),
      -1,
      false,
    );
  }, []);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={styles.dotWrap}>
      <Animated.View style={[styles.dotGlow, dotStyle]} />
      <View style={styles.dot} />
    </View>
  );
}

export function UpcomingCard({ item, onPress }: UpcomingCardProps) {
  const isEpisode = item.type === 'episode';
  const [sheetVisible, setSheetVisible] = useState(false);
  const [reminded, setReminded] = useState(false);
  const [reminderAction, setReminderAction] = useState<'set' | 'cancel'>('set');
  const { addNotification } = useNotifications();
  const [providers, setProviders] = useState<WatchProvider[]>(item.watchProviders ?? []);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providersChecked, setProvidersChecked] = useState(!!item.watchProviders);

  // Load reminded state from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(REMINDED_STORAGE_KEY).then((stored) => {
      if (stored) {
        const remindedIds = JSON.parse(stored);
        setReminded(remindedIds.includes(item.id));
      }
    });
  }, [item.id]);

  // Fetch supported streaming platforms when online (Netflix / Hulu / Prime / Crunchyroll)
  useEffect(() => {
    if (item.watchProviders) {
      setProviders(item.watchProviders);
      setProvidersChecked(true);
      return;
    }
    if (!item.tmdbId || !item.mediaType) {
      setProvidersChecked(true);
      return;
    }

    let cancelled = false;
    setProvidersLoading(true);
    const title = isEpisode ? item.sourceTitle : item.title;
    tmdbService
      .getWatchProviders(item.tmdbId, item.mediaType, title, { isAnime: !!item.isAnime })
      .then((list) => {
        if (!cancelled) {
          setProviders(list);
          setProvidersChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProviders([]);
          setProvidersChecked(true);
        }
      })
      .finally(() => {
        if (!cancelled) setProvidersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item.id, item.tmdbId, item.mediaType, item.isAnime, item.watchProviders, item.title, item.sourceTitle, isEpisode]);

  const formatDate = (dateString: string) => {
    if (!dateString) return 'TBA';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [permDenied, setPermDenied] = useState(false);

  const handleRemind = async () => {
    setReminderAction('set');
    const ids = await scheduleUpcomingNotification(item);
    if (ids.length > 0) {
      setReminded(true);
      // Persist the reminded state
      AsyncStorage.getItem(REMINDED_STORAGE_KEY).then((stored) => {
        const remindedIds = stored ? JSON.parse(stored) : [];
        if (!remindedIds.includes(item.id)) {
          remindedIds.push(item.id);
          AsyncStorage.setItem(REMINDED_STORAGE_KEY, JSON.stringify(remindedIds));
        }
      });
      addNotification({
        type: 'upcoming',
        tag: isEpisode ? 'NEW_EPISODE' : 'NOW_AVAILABLE',
        title: isEpisode ? `New episode of ${item.sourceTitle}` : `${item.title} — reminder set`,
        body: `Dropping ${formatDate(item.releaseDate)}. We'll notify you a few hours before release.`,
        mediaTitle: isEpisode ? item.sourceTitle : item.title,
        posterUrl: item.posterUrl,
        backdropUrl: item.backdropUrl,
        accentColor: isEpisode ? '#60a5fa' : '#a78bfa',
      });
      setConfirmVisible(true);
    } else {
      setPermDenied(true);
      setConfirmVisible(true);
    }
  };

  const handleCancelReminder = async () => {
    setReminderAction('cancel');
    await cancelNotificationsForItem(item.id);
    const stored = await AsyncStorage.getItem(REMINDED_STORAGE_KEY);
    const remindedIds = stored ? JSON.parse(stored) : [];
    const updatedIds = remindedIds.filter((id: string) => id !== item.id);
    await AsyncStorage.setItem(REMINDED_STORAGE_KEY, JSON.stringify(updatedIds));
    setReminded(false);
    setPermDenied(false);
    setConfirmVisible(true);
  };

  const handleOpenProvider = (provider: WatchProvider) => {
    Linking.openURL(provider.url);
  };

  const showWhereToWatch = providersChecked && providers.length > 0;

  return (
    <>
      <Animated.View entering={FadeInDown.duration(600).springify()} style={styles.container}>
        <Pressable onPress={onPress}>
          <View style={styles.card}>
            <Image source={item.backdropUrl ? { uri: item.backdropUrl } : undefined} style={styles.backdrop} />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.92)']}
              style={StyleSheet.absoluteFillObject}
            />

            {/* Top Badges */}
            <View style={styles.topBadges}>
              <View style={styles.typeBadge}>
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />
                <PulsingDot />
                <Text style={styles.typeBadgeText}>
                  {isEpisode ? 'NEXT EPISODE' : 'SEQUEL'}
                </Text>
              </View>
            </View>

            {/* Content */}
            <View style={styles.content}>
              <Text style={styles.sourceText}>Because you watch {item.sourceTitle}</Text>

              <View style={styles.mainInfo}>
                <View style={styles.textGroup}>
                  <Text style={styles.title} numberOfLines={1}>
                    {isEpisode ? item.episodeName : item.title}
                  </Text>
                  {isEpisode && (
                    <Text style={styles.episodeDetails}>
                      S{item.seasonNumber?.toString().padStart(2, '0')}E{item.episodeNumber?.toString().padStart(2, '0')}
                    </Text>
                  )}
                </View>
                <View style={styles.dateBadge}>
                  <Calendar size={12} color="#4ade80" />
                  <Text style={styles.dateText}>{formatDate(item.releaseDate)}</Text>
                </View>
              </View>

              <Text style={styles.overview} numberOfLines={2}>
                {item.overview || 'No overview available for this upcoming release.'}
              </Text>

              {/* Platform buttons — only Netflix / Hulu / Prime / Crunchyroll when available */}
              {showWhereToWatch ? (
                <View style={styles.cardProviderRow}>
                  {providers.map((p) => (
                    <Pressable
                      key={p.id}
                      style={styles.cardProviderBtn}
                      onPress={() => handleOpenProvider(p)}
                    >
                      {p.logoUrl ? (
                        <Image source={{ uri: p.logoUrl }} style={styles.cardProviderLogo} />
                      ) : (
                        <Globe size={12} color="#fff" />
                      )}
                      <Text style={styles.cardProviderText} numberOfLines={1}>
                        {p.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <View style={styles.actions}>
                <Pressable style={styles.actionButton} onPress={() => setSheetVisible(true)}>
                  <Info size={16} color="#ffffff" />
                  <Text style={styles.actionButtonText}>More Info</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, styles.remindButton, reminded && styles.remindButtonActive]}
                  onPress={handleRemind}
                  disabled={reminded}
                >
                  <Bell size={16} color={reminded ? '#4ade80' : '#ffffff'} fill={reminded ? '#4ade80' : 'none'} />
                  <Text style={[styles.actionButtonText, reminded && styles.remindedText]}>
                    {reminded ? 'Reminder Set' : 'Remind Me'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Pressable>
      </Animated.View>

      {/* Reminder Confirmation Sheet */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setConfirmVisible(false)} />
        <Animated.View entering={FadeIn.duration(220)} style={styles.confirmSheet}>
          {item.backdropUrl && (
            <Image source={{ uri: item.backdropUrl }} style={StyleSheet.absoluteFillObject as any} blurRadius={20} />
          )}
          <LinearGradient
            colors={['rgba(10,10,12,0.4)', 'rgba(10,10,12,0.97)']}
            style={StyleSheet.absoluteFillObject}
          />
          {!permDenied ? (
            <View style={styles.confirmInner}>
              <View
                style={[
                  styles.confirmIconRing,
                  reminderAction === 'cancel'
                    ? { borderColor: 'rgba(248,113,113,0.4)', backgroundColor: 'rgba(248,113,113,0.1)' }
                    : null,
                ]}
              >
                <Bell size={26} color={reminderAction === 'cancel' ? '#f87171' : '#4ade80'} fill={reminderAction === 'cancel' ? '#f87171' : '#4ade80'} />
              </View>
              <Text style={[styles.confirmTitle, { color: reminderAction === 'cancel' ? '#f87171' : '#4ade80' }]}>
                {reminderAction === 'cancel' ? 'Reminder Canceled' : 'Reminder Set'}
              </Text>
              <Text style={styles.confirmSubtitle}>
                {isEpisode ? item.episodeName ?? item.sourceTitle : item.title}
              </Text>
              <View style={styles.confirmDateRow}>
                <Calendar size={13} color="#4ade80" />
                <Text style={styles.confirmDate}>{formatDate(item.releaseDate)}</Text>
              </View>
              <Text style={styles.confirmBody}>
                {reminderAction === 'cancel'
                  ? 'This reminder has been removed.'
                  : "We'll notify you a few hours before release. Tap the notification to open Upcoming and see where to watch."}
              </Text>
              <Pressable style={styles.confirmBtn} onPress={() => setConfirmVisible(false)}>
                <Text style={styles.confirmBtnText}>
                  {reminderAction === 'cancel' ? 'Got it' : 'Got it'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.confirmInner}>
              <View style={[styles.confirmIconRing, { borderColor: 'rgba(248,113,113,0.4)', backgroundColor: 'rgba(248,113,113,0.1)' }]}>
                <Bell size={26} color="#f87171" />
              </View>
              <Text style={styles.confirmTitle}>Notifications Off</Text>
              <Text style={styles.confirmBody}>
                Enable notifications in your device Settings to receive release reminders.
              </Text>
              <Pressable style={[styles.confirmBtn, { backgroundColor: 'rgba(248,113,113,0.15)', borderColor: 'rgba(248,113,113,0.3)' }]} onPress={() => setConfirmVisible(false)}>
                <Text style={[styles.confirmBtnText, { color: '#f87171' }]}>Dismiss</Text>
              </Pressable>
            </View>
          )}
        </Animated.View>
      </Modal>

      {/* More Info Bottom Sheet */}
      <Modal visible={sheetVisible} transparent animationType="slide" onRequestClose={() => setSheetVisible(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetVisible(false)} />
        <Animated.View entering={FadeIn.duration(200)} style={styles.sheet}>
          <View style={styles.sheetHandle} />

          {/* Poster + title row */}
          <View style={styles.sheetHeader}>
            {item.posterUrl ? (
              <Image source={{ uri: item.posterUrl }} style={styles.sheetPoster} resizeMode="cover" />
            ) : null}
            <View style={styles.sheetTitleGroup}>
              <Text style={styles.sheetTitle} numberOfLines={2}>
                {isEpisode ? item.episodeName : item.title}
              </Text>
              {isEpisode && (
                <Text style={styles.sheetEpCode}>
                  {item.sourceTitle} · S{item.seasonNumber?.toString().padStart(2,'0')}E{item.episodeNumber?.toString().padStart(2,'0')}
                </Text>
              )}
              <View style={styles.sheetDateRow}>
                <Calendar size={13} color="#4ade80" />
                <Text style={styles.sheetDate}>{formatDate(item.releaseDate)}</Text>
              </View>
            </View>
          </View>

          {/* Overview */}
          <Text style={styles.sheetOverviewLabel}>Overview</Text>
          <Text style={styles.sheetOverview}>
            {item.overview || 'No overview available for this upcoming release.'}
          </Text>

          {/* Source */}
          <Text style={styles.sheetSource}>
            <Text>Recommended because </Text>
            <Text style={styles.sheetSourceBold}>{item.sourceTitle}</Text>
            <Text> is in your library.</Text>
          </Text>

          {/* Where to Watch — only supported platforms when available */}
          {providersLoading ? (
            <View style={styles.providersLoading}>
              <ActivityIndicator color="#60a5fa" size="small" />
              <Text style={styles.providersLoadingText}>Checking where to watch…</Text>
            </View>
          ) : showWhereToWatch ? (
            <View style={styles.whereToWatchBlock}>
              <Text style={styles.sheetOverviewLabel}>Where to Watch</Text>
              <View style={styles.providerRow}>
                {providers.map((p) => (
                  <Pressable
                    key={p.id}
                    style={styles.providerBtn}
                    onPress={() => handleOpenProvider(p)}
                  >
                    {p.logoUrl ? (
                      <Image source={{ uri: p.logoUrl }} style={styles.providerLogo} />
                    ) : (
                      <Globe size={16} color="#fff" />
                    )}
                    <Text style={styles.providerBtnText} numberOfLines={1}>
                      {p.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.sheetActions}>
            <Pressable
              style={reminded ? styles.sheetCancelRemindBtn : styles.sheetRemindBtn}
              onPress={() => {
                setSheetVisible(false);
                if (reminded) {
                  handleCancelReminder();
                } else {
                  handleRemind();
                }
              }}
            >
              <Bell size={16} color={reminded ? '#f87171' : '#ffffff'} />
              <Text style={reminded ? styles.sheetCancelRemindText : styles.sheetRemindText}>
                {reminded ? 'Cancel reminder' : 'Remind Me'}
              </Text>
            </Pressable>
          </View>

          <Pressable style={styles.sheetClose} onPress={() => setSheetVisible(false)}>
            <X size={18} color="#71717a" />
          </Pressable>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  card: {
    height: 260,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  backdrop: { width: '100%', height: '100%', resizeMode: 'cover' },

  // Pulsing dot
  dotWrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  dotGlow: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#60a5fa',
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#93c5fd' },

  topBadges: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.3)',
  },
  typeBadgeText: { color: '#60a5fa', fontSize: 9, fontWeight: '900', letterSpacing: 1 },

  content: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20 },
  sourceText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mainInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  textGroup: { flex: 1, marginRight: 10 },
  title: { color: '#ffffff', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  episodeDetails: { color: '#60a5fa', fontSize: 12, fontWeight: '700', marginTop: 2 },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(74,222,128,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.2)',
  },
  dateText: { color: '#4ade80', fontSize: 11, fontWeight: '700' },
  overview: { color: '#a1a1aa', fontSize: 12, lineHeight: 18, marginBottom: 12 },
  cardProviderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  cardProviderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  cardProviderLogo: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  cardProviderText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    maxWidth: 90,
  },
  actions: { flexDirection: 'row', gap: 12 },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 10,
    borderRadius: 12,
  },
  remindButton: {
    backgroundColor: 'rgba(96,165,250,0.15)',
    borderColor: 'rgba(96,165,250,0.3)',
    borderWidth: 1,
  },
  remindButtonActive: {
    backgroundColor: 'rgba(74,222,128,0.12)',
    borderColor: 'rgba(74,222,128,0.3)',
  },
  actionButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  remindedText: { color: '#4ade80' },

  // Sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: '#111113',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetHeader: { flexDirection: 'row', gap: 16, marginBottom: 20 },
  sheetPoster: { width: 72, height: 108, borderRadius: 12, backgroundColor: '#27272a' },
  sheetTitleGroup: { flex: 1, justifyContent: 'center', gap: 6 },
  sheetTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  sheetEpCode: { color: '#60a5fa', fontSize: 12, fontWeight: '700' },
  sheetDateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sheetDate: { color: '#4ade80', fontSize: 12, fontWeight: '700' },
  sheetOverviewLabel: { color: '#52525b', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  sheetOverview: { color: '#a1a1aa', fontSize: 13, lineHeight: 20, marginBottom: 16 },
  sheetSource: { color: '#52525b', fontSize: 12, marginBottom: 24 },
  sheetSourceBold: { color: '#a1a1aa', fontWeight: '700' },
  whereToWatchBlock: { marginBottom: 18 },
  providersLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  providersLoadingText: { color: '#71717a', fontSize: 12, fontWeight: '600' },
  providerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  providerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  providerLogo: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  providerBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '700', maxWidth: 120 },
  sheetActions: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  sheetRemindBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(96,165,250,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.3)',
    paddingVertical: 13,
    borderRadius: 14,
  },
  sheetRemindText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  sheetCancelRemindBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.3)',
    paddingVertical: 13,
    borderRadius: 14,
  },
  sheetCancelRemindText: { color: '#f87171', fontSize: 14, fontWeight: '700' },
  sheetClose: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Reminder confirmation
  confirmSheet: {
    margin: 24,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'center',
    width: '90%' as any,
    position: 'absolute',
    top: '30%' as any,
  },
  confirmInner: {
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  confirmIconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(74,222,128,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  confirmTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  confirmSubtitle: {
    color: '#a1a1aa',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  confirmDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(74,222,128,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.2)',
  },
  confirmDate: { color: '#4ade80', fontSize: 13, fontWeight: '700' },
  confirmBody: {
    color: '#71717a',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  confirmBtn: {
    marginTop: 4,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  confirmBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
});

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  FlatList,
  Image,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Bell, X, Trash2, CheckCheck, CalendarDays, Sparkles, Tv, Star } from 'lucide-react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { InAppNotification, NotificationTag, useNotifications } from '../context/NotificationContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface NotificationSheetProps {
  visible: boolean;
  onClose: () => void;
}

const TAG_CONFIG: Record<NotificationTag, { label: string; color: string; bg: string }> = {
  NEW_ARRIVAL:  { label: 'New Arrival',   color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  NEW_EPISODE:  { label: 'New Episode',   color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' },
  NEW_SEASON:   { label: 'New Season',    color: '#34d399', bg: 'rgba(52,211,153,0.15)' },
  NOW_AVAILABLE:{ label: 'Now Available', color: '#facc15', bg: 'rgba(250,204,21,0.15)' },
  DONT_MISS:    { label: "Don't Miss",    color: '#f87171', bg: 'rgba(248,113,113,0.15)' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function NotificationCard({ item, index }: { item: InAppNotification; index: number }) {
  const tag = item.tag ? TAG_CONFIG[item.tag] : null;
  const accentColor = item.accentColor ?? (tag?.color ?? '#60a5fa');

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).duration(300)}>
      <View style={[styles.card, !item.read && styles.cardUnread]}>
        {/* Backdrop accent */}
        {item.backdropUrl && (
          <Image source={{ uri: item.backdropUrl }} style={styles.cardBg} blurRadius={22} />
        )}
        <LinearGradient
          colors={['transparent', `${accentColor}18`, 'rgba(10,10,12,0.88)']}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />

        <View style={styles.cardInner}>
          {/* Poster */}
          {item.posterUrl ? (
            <Image source={{ uri: item.posterUrl }} style={styles.poster} resizeMode="cover" />
          ) : (
            <View style={[styles.poster, styles.posterFallback]}>
              {item.type === 'added' ? (
                <Sparkles size={20} color={accentColor} />
              ) : (
                <Tv size={20} color={accentColor} />
              )}
            </View>
          )}

          {/* Info */}
          <View style={styles.info}>
            {/* Tag pill */}
            {tag && (
              <View style={[styles.tagPill, { backgroundColor: tag.bg, borderColor: `${tag.color}40` }]}>
                <Star size={8} color={tag.color} fill={tag.color} />
                <Text style={[styles.tagText, { color: tag.color }]}>{tag.label}</Text>
              </View>
            )}

            <Text style={styles.notifTitle} numberOfLines={2}>{item.title}</Text>

            {item.mediaTitle && (
              <Text style={styles.mediaTitle} numberOfLines={1}>{item.mediaTitle}</Text>
            )}

            <Text style={styles.notifBody} numberOfLines={2}>{item.body}</Text>

            <View style={styles.timeRow}>
              <CalendarDays size={10} color="#52525b" />
              <Text style={styles.timeText}>{timeAgo(item.timestamp)}</Text>
              {!item.read && <View style={[styles.unreadDot, { backgroundColor: accentColor }]} />}
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

function EmptyNotifications() {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.empty}>
      <View style={styles.emptyIconRing}>
        <Bell size={28} color="#52525b" />
      </View>
      <Text style={styles.emptyTitle}>All caught up</Text>
    </Animated.View>
  );
}

export function NotificationSheet({ visible, onClose }: NotificationSheetProps) {
  const { notifications, markAllRead } = useNotifications();
  const insets = useSafeAreaInsets();

  const handleOpen = () => { markAllRead(); };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onShow={handleOpen}
    >
      <View style={styles.root}>
        {/* Tap-outside backdrop */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={styles.sheetInner}>
            {/* Handle */}
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Notifications</Text>
                <Text style={styles.sheetSubtitle}>{notifications.length} total</Text>
              </View>
              <View style={styles.sheetHeaderActions}>
                <Pressable style={styles.iconBtn} onPress={onClose} hitSlop={8}>
                  <X size={18} color="#71717a" />
                </Pressable>
              </View>
            </View>

            {/* List */}
            <FlatList
              data={notifications}
              keyExtractor={(n) => n.id}
              renderItem={({ item, index }) => <NotificationCard item={item} index={index} />}
              ListEmptyComponent={<EmptyNotifications />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sheetInner: { flex: 1 },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginTop: 14,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sheetTitle: { color: '#ffffff', fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  sheetSubtitle: { color: '#52525b', fontSize: 12, marginTop: 2 },
  sheetHeaderActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { padding: 16, paddingBottom: 8 },
  separator: { height: 10 },

  // Notification card
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  cardUnread: {
    borderColor: 'rgba(255,255,255,0.13)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  cardBg: { ...StyleSheet.absoluteFillObject, opacity: 0.25 },
  cardInner: {
    flexDirection: 'row',
    gap: 14,
    padding: 14,
    alignItems: 'flex-start',
  },
  poster: {
    width: 58,
    height: 86,
    borderRadius: 10,
    flexShrink: 0,
  },
  posterFallback: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 5 },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  tagText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  notifTitle: { color: '#ffffff', fontSize: 14, fontWeight: '700', lineHeight: 19 },
  mediaTitle: { color: '#a1a1aa', fontSize: 12, fontWeight: '600' },
  notifBody: { color: '#71717a', fontSize: 12, lineHeight: 17 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  timeText: { color: '#52525b', fontSize: 10 },
  unreadDot: { width: 6, height: 6, borderRadius: 3, marginLeft: 4 },

  // Empty state
  empty: { alignItems: 'center', paddingVertical: 60, gap: 14 },
  emptyIconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { color: '#ffffff', fontSize: 17, fontWeight: '700' },
  emptyBody: { color: '#52525b', fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
});

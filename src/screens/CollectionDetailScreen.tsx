/**
 * CollectionDetailScreen.tsx
 *
 * Detail view for a single collection.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Alert,
  TextInput,
  Animated as RNAnimated,
  Dimensions,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useNavigation,
  useRoute,
  RouteProp,
  useFocusEffect,
} from '@react-navigation/native';
import {
  ArrowLeft,
  Plus,
  MoreVertical,
  Edit2,
  Trash2,
  Share2,
  Sparkles,
  CheckCircle,
  X,
  Film,
  Layers,
  CloudOff,
  Cloud,
} from 'lucide-react-native';
import { RootStackParamList, Collection, CollectionItem } from '../types';
import { collectionsService } from '../storage/collectionsService';
import { usePro } from '../context/ProContext';
import { CollectionItemCard } from '../components/CollectionItemCard';
import { AppSheetModal } from '../components/AppSheetModal';
import type { AppSheetAction } from '../components/AppSheetModal';

type CollectionDetailRouteProp = RouteProp<RootStackParamList, 'CollectionDetail'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_HEIGHT = 240;

type ConfirmSheet = {
  visible: boolean;
  title: string;
  message: string;
  icon?: React.ReactNode;
  iconColor?: string;
  actions?: AppSheetAction[];
  dismissLabel?: string;
};

const HIDDEN_SHEET: ConfirmSheet = {
  visible: false,
  title: '',
  message: '',
};

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Pick the best backdrop from the first few items (prefer items with backdrop). */
function pickHeroImage(items: CollectionItem[]): string | undefined {
  const withBackdrop = items.find((i) => i.backdropUrl);
  return withBackdrop?.backdropUrl ?? items[0]?.posterUrl;
}

// ─── Empty states ─────────────────────────────────────────────────────────────

function CollectionEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={emptyStyles.root}>
      <View style={emptyStyles.iconRing}>
        <Layers size={32} color="#3f3f46" strokeWidth={1.5} />
      </View>
      <Text style={emptyStyles.title}>Nothing here yet</Text>
      <Text style={emptyStyles.hint}>
        Add movies &amp; TV shows to start building your collection.
      </Text>
      <Pressable style={emptyStyles.cta} onPress={onAdd}>
        <Plus size={15} color="#000000" strokeWidth={2.5} />
        <Text style={emptyStyles.ctaText}>Add Items</Text>
      </Pressable>
    </Animated.View>
  );
}

const emptyStyles = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
    gap: 10,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  hint: {
    fontSize: 13,
    color: '#52525b',
    textAlign: 'center',
    lineHeight: 19,
  },
  cta: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#ffffff',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
  },
  ctaText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export function CollectionDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<CollectionDetailRouteProp>();
  const { isPro } = usePro();

  const [collection, setCollection] = useState<Collection | null>(
    route.params.collection,
  );
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(collection?.name ?? '');
  const [menuVisible, setMenuVisible] = useState(false);
  const [confirmSheet, setConfirmSheet] = useState<ConfirmSheet>(HIDDEN_SHEET);

  const accentColor = '#a78bfa';

  const closeConfirmSheet = () => setConfirmSheet(HIDDEN_SHEET);
  const openConfirmSheet = (sheet: Omit<ConfirmSheet, 'visible'>) => {
    setConfirmSheet({ ...sheet, visible: true });
  };

  // Scroll-driven header opacity (for the blurred sticky header)
  const scrollY = useRef(new RNAnimated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({
    inputRange: [HERO_HEIGHT - 80, HERO_HEIGHT - 20],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      const refresh = async () => {
        if (!collection) return;
        const updated = await collectionsService.getById(collection.id);
        if (updated) {
          setCollection(updated);
          setEditName(updated.name);
        } else {
          navigation.goBack();
        }
      };
      refresh();
    }, [collection?.id]),
  );

  // ── actions ────────────────────────────────────────────────────────────────

  const handleSaveName = async () => {
    if (!collection || editName.trim().length === 0) return;
    try {
      await collectionsService.update(collection.id, { name: editName.trim() });
      setCollection({ ...collection, name: editName.trim() });
      setEditing(false);
    } catch {
      Alert.alert('Error', 'Failed to update name');
    }
  };

  const handleCancelEdit = () => {
    setEditName(collection?.name ?? '');
    setEditing(false);
  };

  const handleAddItems = () => {
    if (!collection) return;
    navigation.navigate('AddToCollection', { collectionId: collection.id });
  };

  const handleRemoveItem = (itemId: string) => {
    if (!collection) return;
    const item = collection.items.find((entry) => entry.id === itemId);
    if (!item) return;
    openConfirmSheet({
      title: 'Remove title?',
      message: `Remove "${item.title}" from this collection? You can add it back later.`,
      icon: <Trash2 size={28} color="#3f3f3fff" strokeWidth={2} />,
      iconColor: '#3f3f3fff',
      actions: [
        { label: 'Cancel', variant: 'ghost', onPress: closeConfirmSheet },
        {
          label: 'Remove',
          variant: 'destructive',
          onPress: () => {
            closeConfirmSheet();
            void (async () => {
              try {
                const updated = await collectionsService.removeItem(collection.id, itemId);
                if (updated) setCollection(updated);
              } catch {
                Alert.alert('Error', 'Failed to remove item');
              }
            })();
          },
        },
      ],
    });
  };

  const handleToggleBackup = async () => {
    if (!collection || !isPro) return;
    try {
      const next = !collection.backedUp;
      await collectionsService.toggleBackup(collection.id, next);
      setCollection({ ...collection, backedUp: next });
      setMenuVisible(false);
      Alert.alert(
        next ? 'Backup Enabled' : 'Backup Disabled',
        next
          ? 'This collection will sync to the cloud.'
          : 'This collection will no longer sync.',
      );
    } catch {
      Alert.alert('Error', 'Failed to update backup setting');
    }
  };

  const handleShare = () => {
    if (!collection) return;
    setMenuVisible(false);
    navigation.navigate('ShareCollection', { collection });
  };

  const handleDelete = () => {
    if (!collection) return;
    setMenuVisible(false);
    openConfirmSheet({
      title: 'Delete Collection',
      message: `Delete "${collection.name}"? This cannot be undone.`,
      icon: <Trash2 size={28} color="#3f3f3fff" strokeWidth={2} />,
      iconColor: '#3f3f3fff',
      actions: [
        { label: 'Cancel', variant: 'ghost', onPress: closeConfirmSheet },
        {
          label: 'Delete',
          variant: 'destructive',
          onPress: () => {
            closeConfirmSheet();
            void (async () => {
              try {
                await collectionsService.delete(collection.id);
                navigation.goBack();
              } catch {
                Alert.alert('Error', 'Failed to delete');
              }
            })();
          },
        },
      ],
    });
  };

  if (!collection) {
    return (
      <View style={styles.root}>
        <Text style={styles.errorText}>Collection not found</Text>
      </View>
    );
  }

  const heroImage = pickHeroImage(collection.items);
  const itemCount = collection.items.length;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      {/* ── Floating sticky header (appears on scroll) ──────────────────── */}
      <RNAnimated.View
        style={[
          styles.stickyHeader,
          { paddingTop: insets.top, opacity: headerOpacity },
        ]}
        pointerEvents="none"
      >
        <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.stickyHeaderInner}>
          <Text style={styles.stickyTitle} numberOfLines={1}>
            {collection.name}
          </Text>
          <Text style={styles.stickyCount}>
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </Text>
        </View>
      </RNAnimated.View>

      {/* ── Back + action bar (always on top, transparent bg) ──────────── */}
      <View
        style={[styles.topBar, { paddingTop: insets.top + 8 }]}
        pointerEvents="box-none"
      >
        <Pressable
          style={styles.topBarBtn}
          onPress={() => navigation.goBack()}
          hitSlop={12}
        >
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
          <ArrowLeft size={20} color="#ffffff" strokeWidth={2.5} />
        </Pressable>

        <View style={styles.topBarRight}>
          <Pressable
            style={styles.topBarBtn}
            onPress={handleAddItems}
            hitSlop={12}
          >
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
            <Plus size={20} color={accentColor} strokeWidth={2.5} />
          </Pressable>
          <Pressable
            style={styles.topBarBtn}
            onPress={() => setMenuVisible(!menuVisible)}
            hitSlop={12}
          >
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
            <MoreVertical size={20} color="#ffffff" strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {/* ── Dropdown menu ───────────────────────────────────────────────── */}
      {menuVisible && (
        <Animated.View
          entering={FadeInDown.duration(160)}
          style={[styles.menu, { top: insets.top + 56 }]}
        >
          {isPro && (
            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                pressed && styles.menuItemPressed,
              ]}
              onPress={handleToggleBackup}
            >
              {collection.backedUp ? (
                <CloudOff size={17} color="#a78bfa" strokeWidth={2} />
              ) : (
                <Cloud size={17} color="#a78bfa" strokeWidth={2} />
              )}
              <Text style={styles.menuItemText}>
                {collection.backedUp ? 'Disable Backup' : 'Enable Backup'}
              </Text>
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.menuItem,
              pressed && styles.menuItemPressed,
            ]}
            onPress={handleShare}
          >
            <Share2 size={17} color="#60a5fa" strokeWidth={2} />
            <Text style={styles.menuItemText}>Share</Text>
          </Pressable>

          <View style={styles.menuDivider} />

          <Pressable
            style={({ pressed }) => [
              styles.menuItem,
              pressed && styles.menuItemDangerPressed,
            ]}
            onPress={handleDelete}
          >
            <Trash2 size={17} color="#ef4444" strokeWidth={2} />
            <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>
              Delete
            </Text>
          </Pressable>
        </Animated.View>
      )}

      {/* Dismiss menu on backdrop tap */}
      {menuVisible && (
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={() => setMenuVisible(false)}
        />
      )}

      {/* ── Scrollable body ─────────────────────────────────────────────── */}
      <RNAnimated.ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        onScroll={RNAnimated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
      >
        {/* ── Hero banner ──────────────────────────────────────────────── */}
        <View style={styles.hero}>
          {heroImage ? (
            <Image
              source={{ uri: heroImage }}
              style={styles.heroImage}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={
                ['#1e1b4b', '#0f172a']
              }
              style={styles.heroImage}
            />
          )}

          {/* Cinematic gradient vignette */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.55)', '#000000']}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFillObject}
          />

          {/* Hero content */}
          <View style={styles.heroContent}>
            {/* Collection pill */}
            <View
              style={[
                styles.typePill,
                { borderColor: `${accentColor}40`, backgroundColor: `${accentColor}18` },
              ]}
            >
              <Sparkles size={12} color={accentColor} strokeWidth={2} />
              <Text style={[styles.typePillText, { color: accentColor }]}>
                Collection
              </Text>
              {collection.backedUp && <View style={styles.cloudDot} />}
            </View>

            {/* Title row */}
            {editing ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.editInput}
                  value={editName}
                  onChangeText={setEditName}
                  autoFocus
                  maxLength={50}
                  returnKeyType="done"
                  onSubmitEditing={handleSaveName}
                  selectionColor={accentColor}
                />
                <Pressable onPress={handleSaveName} hitSlop={10}>
                  <CheckCircle size={22} color="#22c55e" strokeWidth={2} />
                </Pressable>
                <Pressable onPress={handleCancelEdit} hitSlop={10}>
                  <X size={22} color="#ef4444" strokeWidth={2} />
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.titleRow} onPress={() => setEditing(true)}>
                <Text style={styles.heroTitle} numberOfLines={2}>
                  {collection.name}
                </Text>
                <Edit2 size={15} color="rgba(255,255,255,0.35)" strokeWidth={2} />
              </Pressable>
            )}

            {/* Stats row */}
            <View style={styles.statsRow}>
              <View style={styles.statBadge}>
                <Film size={12} color="#a1a1aa" strokeWidth={2} />
                <Text style={styles.statText}>
                  {collection.items.filter((i) => i.type === 'movie').length} movies
                </Text>
              </View>
              <View style={styles.statBadge}>
                <Text style={styles.statDot}>·</Text>
                <Text style={styles.statText}>
                  {collection.items.filter((i) => i.type === 'tv').length} shows
                </Text>
              </View>
              {collection.items.some((i) => i.verified) && (
                <View style={styles.statBadge}>
                  <CheckCircle size={12} color="#22c55e" fill="#22c55e" strokeWidth={0} />
                  <Text style={[styles.statText, { color: '#22c55e' }]}>
                    {collection.items.filter((i) => i.verified).length} verified
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── Content area ──────────────────────────────────────────────── */}
        {collection.items.length === 0 ? (
          <CollectionEmpty onAdd={handleAddItems} />
        ) : (
          <View style={styles.gridSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>All Titles</Text>
              <Text style={styles.sectionCount}>{itemCount}</Text>
            </View>
            <View style={styles.grid}>
              {collection.items.map((item, index) => (
                <CollectionItemCard
                  key={`${item.id}-${index}`}
                  item={item}
                  index={index}
                  onLongPress={handleRemoveItem}
                />
              ))}
            </View>
            <Text style={styles.longPressHint}>Long-press a poster to remove it</Text>
          </View>
        )}
      </RNAnimated.ScrollView>

      <AppSheetModal
        visible={confirmSheet.visible}
        onClose={closeConfirmSheet}
        title={confirmSheet.title}
        message={confirmSheet.message}
        icon={confirmSheet.icon}
        iconColor={confirmSheet.iconColor}
        actions={confirmSheet.actions}
        dismissLabel={confirmSheet.dismissLabel}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  errorText: {
    color: '#a1a1aa',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },

  // ── Sticky header ──────────────────────────────────────────────────────────
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 200,
    overflow: 'hidden',
  },
  stickyHeaderInner: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 4,
  },
  stickyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  stickyCount: {
    fontSize: 11,
    color: '#71717a',
    marginTop: 1,
  },

  // ── Top bar (back + actions) ───────────────────────────────────────────────
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 300,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  topBarRight: {
    flexDirection: 'row',
    gap: 8,
  },
  topBarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },

  // ── Dropdown menu ─────────────────────────────────────────────────────────
  menu: {
    position: 'absolute',
    right: 16,
    zIndex: 400,
    backgroundColor: '#1c1c1e',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    minWidth: 190,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 16,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuItemPressed: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  menuItemDangerPressed: {
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  menuDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginHorizontal: 12,
  },
  menuItemText: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: '500',
  },
  menuItemTextDanger: {
    color: '#ef4444',
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroContent: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    gap: 8,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 2,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  cloudDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#a78bfa',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  heroTitle: {
    flex: 1,
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statDot: {
    color: '#3f3f46',
    fontSize: 14,
  },
  statText: {
    fontSize: 12,
    color: '#a1a1aa',
    fontWeight: '500',
  },

  // ── Collection grid ───────────────────────────────────────────────────────
  gridSection: {
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  sectionCount: {
    fontSize: 13,
    color: '#52525b',
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  longPressHint: {
    textAlign: 'center',
    fontSize: 11,
    color: '#3f3f46',
    marginTop: 20,
    marginBottom: 4,
  },

});

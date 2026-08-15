/**
 * PartyHubScreen.tsx
 *
 * Central hub for Watch Party++ feature:
 *  - View active parties you're in
 *  - Create new party rooms
 *  - Join existing parties via room code
 *  - See past party history
 *
 * This replaces the floating watch party button in Movies/TV screens.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Plus,
  Users,
  LogIn,
  Clock,
  Play,
  Crown,
  ChevronRight,
  Sparkles,
} from 'lucide-react-native';

import { RootStackParamList, WatchPartyRoom } from '../types';
import { useAccount } from '../context/AccountContext';
import { watchPartyService } from '../services/watchPartyService';

// ─── Types ────────────────────────────────────────────────────────────────────

type PartyHubNavProp = NativeStackNavigationProp<RootStackParamList>;

interface PartyRoomListItem extends WatchPartyRoom {
  isHost: boolean;
  isActive: boolean;
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const NF_RED = '#E50914';
const BG = '#0a0a0a';
const SURFACE = '#161616';
const BORDER = '#2a2a2a';
const TEXT_PRIMARY = '#ffffff';
const TEXT_SECONDARY = '#8a8a8a';

// ─── Coming Soon Banner ───────────────────────────────────────────────────────

function ComingSoonBanner() {
  return (
    <View style={bannerStyles.wrapper}>
      <LinearGradient
        colors={['rgba(239,68,68,0.14)', 'rgba(167,139,250,0.10)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={bannerStyles.iconWrap}>
        <Sparkles size={16} color="#a78bfa" strokeWidth={2} />
      </View>
      <View style={bannerStyles.textWrap}>
        <Text style={bannerStyles.title}>Coming Soon</Text>
        <Text style={bannerStyles.subtitle}>
          Watch Party is under development. Stay tuned for the full release.
        </Text>
      </View>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textWrap: { flex: 1 },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: '#a78bfa',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: '#71717a',
    lineHeight: 17,
    fontWeight: '500',
  },
});

// ─── PartyHubScreen ───────────────────────────────────────────────────────────

export function PartyHubScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<PartyHubNavProp>();
  const { account } = useAccount();

  const [activeParties, setActiveParties] = useState<PartyRoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Load active parties ────────────────────────────────────────────────────

  const loadParties = useCallback(async () => {
    if (!account) {
      setActiveParties([]);
      setLoading(false);
      return;
    }

    try {
      const rooms = await watchPartyService.getUserActiveRooms(account.uid);

      const items: PartyRoomListItem[] = rooms.map((room: WatchPartyRoom) => ({
        ...room,
        isHost: room.hostUid === account.uid,
        isActive: room.status !== 'ended',
      }));
      setActiveParties(items);
    } catch (err) {
      console.error('Failed to load parties:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [account]);

  useEffect(() => {
    loadParties();
  }, [loadParties]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadParties();
  }, [loadParties]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleCreateParty = useCallback(() => {
    if (!account) {
      Alert.alert('Sign in required', 'Please sign in to create a watch party.');
      return;
    }
    navigation.navigate('CreateParty');
  }, [account, navigation]);

  const handleJoinParty = useCallback(() => {
    navigation.navigate('JoinWatchParty');
  }, [navigation]);

  const handlePartyPress = useCallback((room: PartyRoomListItem) => {
    navigation.navigate('WatchParty', { roomId: room.roomId, item: room.item });
  }, [navigation]);

  // ── Render party card ──────────────────────────────────────────────────────

  const renderPartyCard = useCallback(({ item }: { item: PartyRoomListItem }) => {
    const isPlaying = item.status === 'playing' || item.status === 'countdown';
    const memberText = `${item.memberCount} ${item.memberCount === 1 ? 'member' : 'members'}`;

    return (
      <Pressable
        onPress={() => handlePartyPress(item)}
        style={({ pressed }) => [
          styles.partyCard,
          pressed && styles.partyCardPressed,
        ]}
      >
        {item.item.backdropUrl ? (
          <Image
            source={{ uri: item.item.backdropUrl }}
            style={styles.partyBackdrop}
          />
        ) : (
          <View style={[styles.partyBackdrop, styles.partyBackdropFallback]} />
        )}

        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.9)']}
          style={styles.partyGradient}
        />

        <View style={styles.partyContent}>
          <View style={styles.partyHeader}>
            {item.isHost && (
              <View style={styles.hostBadge}>
                <Crown size={14} color={NF_RED} />
                <Text style={styles.hostText}>Host</Text>
              </View>
            )}
            {isPlaying && (
              <View style={styles.liveBadge}>
                <Play size={12} color={TEXT_PRIMARY} fill={TEXT_PRIMARY} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            )}
          </View>

          <Text style={styles.partyTitle} numberOfLines={1}>
            {item.roomName || item.item.title}
          </Text>

          <View style={styles.partyMeta}>
            <Users size={14} color={TEXT_SECONDARY} />
            <Text style={styles.partyMetaText}>{memberText}</Text>
          </View>
        </View>

        <ChevronRight
          size={20}
          color={TEXT_SECONDARY}
          style={styles.partyChevron}
        />
      </Pressable>
    );
  }, [handlePartyPress]);

  // ── Render empty state ─────────────────────────────────────────────────────

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Users size={48} color={TEXT_SECONDARY} strokeWidth={1.5} />
      </View>
      <Text style={styles.emptyTitle}>No Active Parties</Text>
      <Text style={styles.emptySubtitle}>
        Create a party or join one with a room code
      </Text>
    </View>
  );

  // ── Main render ────────────────────────────────────────────────────────────

  if (!account) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerIconRing}>
              <Users size={18} color="#ef4444" strokeWidth={2} />
            </View>
            <View>
              <Text style={styles.headerTitle}>Watch Party</Text>
              <Text style={styles.headerSubtitle}>Join or create watch parties</Text>
            </View>
          </View>
        </View>
        <ComingSoonBanner />
        <View style={styles.signInContainer}>
          <Users size={64} color={TEXT_SECONDARY} strokeWidth={1.5} />
          <Text style={styles.signInTitle}>Sign in to Party</Text>
          <Text style={styles.signInSubtitle}>
            Create watch parties and invite friends to watch together
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerIconRing}>
            <Users size={18} color="#ef4444" strokeWidth={2} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Watch Party</Text>
            <Text style={styles.headerSubtitle}>Join or create watch parties</Text>
          </View>
        </View>
      </View>

      {/* Coming Soon banner */}
      <ComingSoonBanner />

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <Pressable
          onPress={handleCreateParty}
          style={({ pressed }) => [
            styles.actionButton,
            styles.createButton,
            pressed && styles.actionButtonPressed,
          ]}
        >
          <Plus size={20} color={TEXT_PRIMARY} strokeWidth={2.5} />
          <Text style={styles.actionButtonText}>Create Party</Text>
        </Pressable>

        <Pressable
          onPress={handleJoinParty}
          style={({ pressed }) => [
            styles.actionButton,
            pressed && styles.actionButtonPressed,
          ]}
        >
          <LogIn size={20} color={TEXT_PRIMARY} strokeWidth={2.5} />
          <Text style={styles.actionButtonText}>Join Party</Text>
        </Pressable>
      </View>

      {/* Active parties list */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Active Parties</Text>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={NF_RED} />
          </View>
        ) : (
          <FlatList
            data={activeParties}
            renderItem={renderPartyCard}
            keyExtractor={(item) => item.roomId}
            ListEmptyComponent={renderEmpty}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={NF_RED}
              />
            }
          />
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: BG,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(239,68,68,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.20)',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  createButton: {
    backgroundColor: NF_RED,
    borderColor: NF_RED,
  },
  actionButtonPressed: {
    opacity: 0.7,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  section: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  sectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: NF_RED,
    borderRadius: 10,
  },
  sectionBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: TEXT_PRIMARY,
  },
  listContent: {
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyCard: {
    height: 140,
    backgroundColor: SURFACE,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  partyCardPressed: {
    opacity: 0.8,
  },
  partyBackdrop: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  partyBackdropFallback: {
    backgroundColor: '#1a1a1a',
  },
  partyGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  partyContent: {
    flex: 1,
    padding: 16,
    justifyContent: 'flex-end',
  },
  partyHeader: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  hostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: NF_RED,
  },
  hostText: {
    fontSize: 11,
    fontWeight: '700',
    color: NF_RED,
    textTransform: 'uppercase',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#22c55e',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#22c55e',
  },
  partyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 6,
  },
  partyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  partyMetaText: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    fontWeight: '500',
  },
  partyMetaDot: {
    fontSize: 13,
    color: TEXT_SECONDARY,
  },
  partyChevron: {
    position: 'absolute',
    right: 16,
    top: '50%',
    marginTop: -10,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SURFACE,
    borderRadius: 48,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  signInContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  signInTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginTop: 20,
    marginBottom: 8,
  },
  signInSubtitle: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 22,
  },
});

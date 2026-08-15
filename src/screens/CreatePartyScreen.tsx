/**
 * CreatePartyScreen.tsx
 *
 * Redesigned to match the JoinWatchPartyScreen visual style:
 * - Dark gradient background (#1a0033 → #0a0a0a)
 * - BlurView back button
 * - Icon ring hero
 * - Purple accent (#a78bfa) for inputs / borders
 * - Red (#E50914) primary action button
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  Image,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { ChevronLeft, Search, Users, Film, Tv, Check, X, Sparkles } from 'lucide-react-native';

import { RootStackParamList, MediaItem } from '../types';
import { storageService } from '../storage/asyncStorage';
import { useAccount } from '../context/AccountContext';
import { useWatchParty } from '../context/WatchPartyContext';

type CreatePartyNavProp = NativeStackNavigationProp<RootStackParamList>;

// ─── Colours ──────────────────────────────────────────────────────────────────

const NF_RED   = '#E50914';
const PURPLE   = '#a78bfa';
const BG       = '#000000';
const SURFACE  = 'rgba(255,255,255,0.05)';
const BORDER   = 'rgba(167,139,250,0.25)';
const BORDER_MUTED = 'rgba(255,255,255,0.08)';
const TEXT_PRIMARY   = '#ffffff';
const TEXT_SECONDARY = '#71717a';

// ─── CreatePartyScreen ────────────────────────────────────────────────────────

export function CreatePartyScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<CreatePartyNavProp>();
  const { account } = useAccount();
  const party = useWatchParty();

  const [roomName, setRoomName]           = useState('');
  const [selectedItem, setSelectedItem]   = useState<MediaItem | null>(null);
  const [creating, setCreating]           = useState(false);
  const [library, setLibrary]             = useState<MediaItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [searchQuery, setSearchQuery]     = useState('');

  // Load library on mount
  useEffect(() => {
    let cancelled = false;
    storageService.getLibrary().then((lib) => {
      if (!cancelled) { setLibrary(lib); setLibraryLoading(false); }
    });
    return () => { cancelled = true; };
  }, []);

  const filteredLibrary = searchQuery.trim().length === 0
    ? library
    : library.filter((item) =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase()),
      );

  const handleCreate = useCallback(async () => {
    if (!account) { Alert.alert('Error', 'You must be signed in to create a party.'); return; }
    if (!selectedItem) { Alert.alert('Select content', 'Please select a movie or TV show to watch.'); return; }
    setCreating(true);
    try {
      const roomId = await party.createParty(
        selectedItem,
        selectedItem.localFile?.uri,
        roomName.trim() || undefined,
      );
      navigation.replace('WatchParty', { roomId, item: selectedItem });
    } catch (err: any) {
      Alert.alert('Could not create party', err.message || 'An error occurred.');
    } finally {
      setCreating(false);
    }
  }, [account, selectedItem, roomName, party, navigation]);

  // ── Library card ──────────────────────────────────────────────────────────

  const renderItem = ({ item }: { item: MediaItem }) => {
    const isSelected = selectedItem?.id === item.id;
    return (
      <Pressable
        style={[styles.libItem, isSelected && styles.libItemSelected]}
        onPress={() => setSelectedItem(isSelected ? null : item)}
      >
        {item.posterUrl
          ? <Image source={{ uri: item.posterUrl }} style={styles.libPoster} />
          : (
            <View style={[styles.libPoster, styles.libPosterPlaceholder]}>
              {item.type === 'tv'
                ? <Tv size={20} color={TEXT_SECONDARY} />
                : <Film size={20} color={TEXT_SECONDARY} />}
            </View>
          )
        }
        <View style={styles.libInfo}>
          <Text style={styles.libTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.libMeta}>
            {item.type === 'tv' ? 'TV Show' : 'Movie'}
            {item.releaseDate ? ` · ${item.releaseDate.slice(0, 4)}` : ''}
          </Text>
        </View>
        <View style={[styles.selectDot, isSelected && styles.selectDotActive]}>
          {isSelected && <Check size={12} color="#000" strokeWidth={3.5} />}
        </View>
      </Pressable>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* Background gradient */}
      <LinearGradient
        colors={['#1a0033', '#0a0a0a']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />
          <ChevronLeft size={22} color={TEXT_PRIMARY} />
        </Pressable>
        <Text style={styles.headerTitle}>Create Party</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* ── Hero ── */}
      <View style={styles.hero}>
        <View style={styles.iconRing}>
          <Sparkles size={40} color={PURPLE} strokeWidth={1.8} />
        </View>
        <Text style={styles.heroTitle}>Host a Watch Party</Text>
        <Text style={styles.heroSubtitle}>
          Pick something from your library and invite up to 15 friends
        </Text>
      </View>

      {/* ── Body ── */}
      <View style={styles.body}>

        {/* Party name input */}
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            placeholder="Party name (optional)"
            placeholderTextColor="#52525b"
            value={roomName}
            onChangeText={setRoomName}
            maxLength={50}
          />
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Search size={16} color={TEXT_SECONDARY} style={{ flexShrink: 0 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search your library…"
            placeholderTextColor="#52525b"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <X size={15} color={TEXT_SECONDARY} />
            </Pressable>
          )}
        </View>

        {/* Library list */}
        {libraryLoading ? (
          <ActivityIndicator color={PURPLE} style={{ marginTop: 32 }} />
        ) : filteredLibrary.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {library.length === 0
                ? 'No items in your library yet.'
                : 'No matches found.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredLibrary}
            keyExtractor={(i) => i.id}
            renderItem={renderItem}
            contentContainerStyle={styles.libList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>

      {/* ── Footer ── */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {selectedItem && (
          <View style={styles.selectedBanner}>
            <Check size={14} color={PURPLE} strokeWidth={3} />
            <Text style={styles.selectedBannerText} numberOfLines={1}>
              {selectedItem.title}
            </Text>
          </View>
        )}
        <View style={styles.infoRow}>
          <Users size={14} color={PURPLE} />
          <Text style={styles.infoText}>
            Share the room code once created — up to 15 friends can join!
          </Text>
        </View>
        <Pressable
          onPress={handleCreate}
          disabled={!selectedItem || creating}
          style={({ pressed }) => [
            styles.createBtn,
            (!selectedItem || creating) && styles.createBtnDisabled,
            pressed && { opacity: 0.85 },
          ]}
        >
          {creating
            ? <ActivityIndicator size="small" color={TEXT_PRIMARY} />
            : <Text style={styles.createBtnText}>Create Party</Text>
          }
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  headerTitle: {
    color: TEXT_PRIMARY,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerSpacer: { width: 40 },

  // Hero
  hero: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 8,
    paddingBottom: 24,
  },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(167,139,250,0.10)',
    borderWidth: 2,
    borderColor: 'rgba(167,139,250,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  heroTitle: {
    color: TEXT_PRIMARY,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  heroSubtitle: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },

  // Body
  body: {
    flex: 1,
    paddingHorizontal: 20,
  },

  // Party name input
  inputWrap: {
    marginBottom: 12,
  },
  input: {
    width: '100%',
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '500',
  },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER_MUTED,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: TEXT_PRIMARY,
    fontSize: 14,
  },

  // Library list
  libList: {
    paddingBottom: 12,
    gap: 8,
  },
  libItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: SURFACE,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: BORDER_MUTED,
  },
  libItemSelected: {
    borderColor: PURPLE,
    backgroundColor: 'rgba(167,139,250,0.08)',
  },
  libPoster: {
    width: 44,
    height: 66,
    borderRadius: 6,
    backgroundColor: '#18181b',
  },
  libPosterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  libInfo: { flex: 1 },
  libTitle: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  libMeta: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    marginTop: 3,
  },
  selectDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectDotActive: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
  },

  // Empty
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
  },
  emptyText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    textAlign: 'center',
  },

  // Footer
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 10,
  },
  selectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(167,139,250,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectedBannerText: {
    flex: 1,
    color: PURPLE,
    fontSize: 13,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  infoText: {
    flex: 1,
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
  },
  createBtn: {
    backgroundColor: NF_RED,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  createBtnDisabled: {
    opacity: 0.40,
  },
  createBtnText: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});

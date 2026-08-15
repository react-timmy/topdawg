/**
 * AddToCollectionScreen.tsx
 *
 * Two-source add flow:
 *   Library — filters the user's local library (existing behaviour).
 *   TMDB    — debounced search against the TMDB API (movies + TV, filterable).
 *
 * Both sources share the same quiz-verification flow before an item is
 * committed to the collection.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Search, X, Film, Tv, Check, BookOpen, Globe } from 'lucide-react-native';
import { RootStackParamList, MediaItem, CollectionItem, QuizQuestion } from '../types';
import { quizService } from '../services/quizService';
import { collectionsService } from '../storage/collectionsService';
import { storageService } from '../storage/asyncStorage';
import { tmdbService } from '../services/tmdbService';
import { QuizModal } from '../components/QuizModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type AddToCollectionRouteProp = RouteProp<RootStackParamList, 'AddToCollection'>;

type Source = 'library' | 'tmdb';
type TmdbTypeFilter = 'all' | 'movie' | 'tv';

const DEBOUNCE_MS = 420;

// ─── Component ────────────────────────────────────────────────────────────────

export function AddToCollectionScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<AddToCollectionRouteProp>();
  const { collectionId } = route.params;

  // ── Source & search state ─────────────────────────────────────────────────
  const [source, setSource] = useState<Source>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [tmdbTypeFilter, setTmdbTypeFilter] = useState<TmdbTypeFilter>('all');

  // ── Library state ─────────────────────────────────────────────────────────
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);

  // ── TMDB state ────────────────────────────────────────────────────────────
  const [tmdbResults, setTmdbResults] = useState<MediaItem[]>([]);
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [tmdbSearched, setTmdbSearched] = useState(false); // true after first search attempt
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Quiz state ────────────────────────────────────────────────────────────
  const [quizVisible, setQuizVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [addedItemIds, setAddedItemIds] = useState<Set<string>>(new Set());

  // ── Load local library once ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    storageService.getLibrary().then((lib) => {
      if (!cancelled) { setLibrary(lib); setLibraryLoading(false); }
    });
    return () => { cancelled = true; };
  }, []);

  // ── TMDB search (debounced) ───────────────────────────────────────────────
  const runTmdbSearch = useCallback(async (query: string, typeFilter: TmdbTypeFilter) => {
    if (query.trim().length < 2) {
      setTmdbResults([]);
      setTmdbSearched(false);
      return;
    }
    setTmdbLoading(true);
    try {
      let results: MediaItem[] = [];
      if (typeFilter === 'movie') {
        results = await tmdbService.search(query, 'movie');
      } else if (typeFilter === 'tv') {
        results = await tmdbService.search(query, 'tv');
      } else {
        // Fetch both in parallel, interleave by relevance (movies first, then TV)
        const [movies, tv] = await Promise.all([
          tmdbService.search(query, 'movie'),
          tmdbService.search(query, 'tv'),
        ]);
        // Interleave so both types surface near the top
        const maxLen = Math.max(movies.length, tv.length);
        for (let i = 0; i < maxLen; i++) {
          if (movies[i]) results.push(movies[i]);
          if (tv[i]) results.push(tv[i]);
        }
      }
      setTmdbResults(results);
    } catch {
      setTmdbResults([]);
    } finally {
      setTmdbLoading(false);
      setTmdbSearched(true);
    }
  }, []);

  // Re-run search when query or type filter changes (debounced)
  useEffect(() => {
    if (source !== 'tmdb') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runTmdbSearch(searchQuery, tmdbTypeFilter);
    }, DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, tmdbTypeFilter, source, runTmdbSearch]);

  // Clear TMDB results when switching away from TMDB source
  useEffect(() => {
    if (source === 'library') {
      setTmdbResults([]);
      setTmdbSearched(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
  }, [source]);

  // ── Derived library list ──────────────────────────────────────────────────
  const filteredLibrary = searchQuery.trim().length === 0
    ? library
    : library.filter((item) =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase()),
      );

  // ── Add flow ──────────────────────────────────────────────────────────────
  const handleSelectItem = async (item: MediaItem) => {
    setSelectedItem(item);
    setQuizVisible(true);
    setQuizLoading(true);
    try {
      const question = await quizService.generateQuestion(item);
      setCurrentQuestion(question);
    } catch {
      setCurrentQuestion(null);
    } finally {
      setQuizLoading(false);
    }
  };

  const handleQuizAnswer = async (selectedIndex: number) => {
    if (!selectedItem) return;

    const verified =
      currentQuestion && selectedIndex >= 0
        ? quizService.validateAnswer(currentQuestion, selectedIndex)
        : false;

    // Check if item exists in local library (for hasLocalFile flag)
    const lib = await storageService.getLibrary();
    const libraryItem = lib.find((i) => i.id === selectedItem.id);

    const collectionItem: CollectionItem = {
      id: selectedItem.id,
      title: selectedItem.title,
      type: selectedItem.type,
      posterUrl: selectedItem.posterUrl,
      backdropUrl: selectedItem.backdropUrl,
      rating: selectedItem.rating,
      releaseDate: selectedItem.releaseDate,
      numberOfSeasons: selectedItem.numberOfSeasons,
      genres: selectedItem.genres,
      verified,
      addedAt: new Date().toISOString(),
      hasLocalFile: !!libraryItem?.localFile,
    };

    try {
      await collectionsService.addItem(collectionId, collectionItem);
      setAddedItemIds((prev) => new Set(prev).add(selectedItem.id));
    } catch (err) {
      console.warn('[AddToCollection] Failed to add item:', err);
    }

    setQuizVisible(false);
    setSelectedItem(null);
    setCurrentQuestion(null);
  };

  const handleQuizSkip = () => {
    setQuizVisible(false);
    setSelectedItem(null);
    setCurrentQuestion(null);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const handleSwitchSource = (next: Source) => {
    setSource(next);
    setSearchQuery('');
  };

  const handleClearSearch = () => setSearchQuery('');

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderItem = ({ item }: { item: MediaItem }) => {
    const isAdded = addedItemIds.has(item.id);
    const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : null;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.resultItem,
          isAdded && styles.resultItemAdded,
          pressed && !isAdded && { opacity: 0.75 },
        ]}
        onPress={() => !isAdded && handleSelectItem(item)}
        disabled={isAdded}
      >
        {item.posterUrl ? (
          <Image source={{ uri: item.posterUrl }} style={styles.resultPoster} />
        ) : (
          <View style={[styles.resultPoster, styles.resultPosterPlaceholder]}>
            <Text style={styles.resultPosterPlaceholderText}>{item.title[0]}</Text>
          </View>
        )}
        <View style={styles.resultInfo}>
          <Text style={styles.resultTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.resultMeta}>
            {item.type === 'movie'
              ? <Film size={13} color="#71717a" strokeWidth={2} />
              : <Tv size={13} color="#71717a" strokeWidth={2} />}
            <Text style={styles.resultMetaText}>
              {item.type === 'movie' ? 'Movie' : 'TV Show'}
            </Text>
            {year != null && (
              <>
                <Text style={styles.resultMetaSeparator}>·</Text>
                <Text style={styles.resultMetaText}>{year}</Text>
              </>
            )}
          </View>
          {item.genres && item.genres.length > 0 && (
            <Text style={styles.resultGenres} numberOfLines={1}>
              {item.genres.slice(0, 3).join(', ')}
            </Text>
          )}
        </View>
        {isAdded ? (
          <View style={styles.addedBadge}>
            <Check size={20} color="#22c55e" strokeWidth={2.5} />
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.selectBtn, pressed && { opacity: 0.75 }]}
            onPress={() => handleSelectItem(item)}
          >
            <Text style={styles.selectBtnText}>Add</Text>
          </Pressable>
        )}
      </Pressable>
    );
  };

  // ── Derived display state ─────────────────────────────────────────────────
  const isLoading = source === 'library' ? libraryLoading : tmdbLoading;
  const listData: MediaItem[] = source === 'library' ? filteredLibrary : tmdbResults;
  const showEmpty = !isLoading && listData.length === 0;

  const emptyMessage = source === 'library'
    ? (library.length === 0 ? 'Your library is empty.' : 'No matches in your library.')
    : (searchQuery.trim().length < 2 ? 'Type to search TMDB…' : tmdbSearched ? 'No results found.' : '');

  const emptyHint = source === 'library'
    ? (library.length === 0
        ? 'Scan some files to add them first, or switch to TMDB to search any title.'
        : 'Try a different search term or switch to TMDB.')
    : (searchQuery.trim().length < 2
        ? 'Search for any movie or TV show by name.'
        : 'Try a different title or check spelling.');

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.root}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <X size={24} color="#a1a1aa" strokeWidth={2} />
          </Pressable>
          <Text style={styles.headerTitle}>Add to Collection</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* ── Source toggle ─────────────────────────────────────────────── */}
        <View style={styles.sourceToggle}>
          <Pressable
            style={[styles.sourceBtn, source === 'library' && styles.sourceBtnActive]}
            onPress={() => handleSwitchSource('library')}
          >
            <BookOpen
              size={14}
              color={source === 'library' ? '#000000' : '#71717a'}
              strokeWidth={2}
            />
            <Text style={[styles.sourceBtnText, source === 'library' && styles.sourceBtnTextActive]}>
              My Library
            </Text>
          </Pressable>
          <Pressable
            style={[styles.sourceBtn, source === 'tmdb' && styles.sourceBtnActive]}
            onPress={() => handleSwitchSource('tmdb')}
          >
            <Globe
              size={14}
              color={source === 'tmdb' ? '#000000' : '#71717a'}
              strokeWidth={2}
            />
            <Text style={[styles.sourceBtnText, source === 'tmdb' && styles.sourceBtnTextActive]}>
              Search TMDB
            </Text>
          </Pressable>
        </View>

        {/* ── Search input ──────────────────────────────────────────────── */}
        <View style={styles.searchContainer}>
          <Search size={18} color="#52525b" strokeWidth={2} />
          <TextInput
            style={styles.searchInput}
            placeholder={
              source === 'library' ? 'Search your library…' : 'Search any movie or TV show…'
            }
            placeholderTextColor="#52525b"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={handleClearSearch} hitSlop={8}>
              <X size={18} color="#52525b" strokeWidth={2} />
            </Pressable>
          )}
        </View>

        {/* ── TMDB type filter ──────────────────────────────────────────── */}
        {source === 'tmdb' && (
          <View style={styles.typeFilterRow}>
            {(['all', 'movie', 'tv'] as TmdbTypeFilter[]).map((f) => (
              <Pressable
                key={f}
                style={[styles.typeFilterBtn, tmdbTypeFilter === f && styles.typeFilterBtnActive]}
                onPress={() => setTmdbTypeFilter(f)}
              >
                <Text style={[styles.typeFilterText, tmdbTypeFilter === f && styles.typeFilterTextActive]}>
                  {f === 'all' ? 'All' : f === 'movie' ? 'Movies' : 'TV Shows'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#a78bfa" />
          {source === 'tmdb' && (
            <Text style={styles.loadingText}>Searching TMDB…</Text>
          )}
        </View>
      ) : showEmpty ? (
        <View style={styles.emptyState}>
          {source === 'tmdb' ? (
            <Globe size={48} color="#3f3f46" strokeWidth={1.5} />
          ) : (
            <Search size={48} color="#3f3f46" strokeWidth={1.5} />
          )}
          <Text style={styles.emptyText}>{emptyMessage}</Text>
          {emptyHint ? (
            <Text style={styles.emptyHint}>{emptyHint}</Text>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={listData}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.resultsList,
            { paddingBottom: insets.bottom + 20 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* ── Quiz modal ───────────────────────────────────────────────────── */}
      <QuizModal
        visible={quizVisible}
        item={selectedItem}
        question={currentQuestion}
        loading={quizLoading}
        onClose={handleQuizSkip}
        onAnswer={handleQuizAnswer}
        onSkip={handleQuizSkip}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#09090b' },

  // Header
  header: {
    backgroundColor: '#09090b',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#18181b',
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#ffffff' },

  // Source toggle
  sourceToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  sourceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
  },
  sourceBtnActive: { backgroundColor: '#ffffff' },
  sourceBtnText: { fontSize: 13, fontWeight: '700', color: '#71717a' },
  sourceBtnTextActive: { color: '#000000' },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#18181b',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: { flex: 1, fontSize: 16, color: '#ffffff' },

  // TMDB type filter chips
  typeFilterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeFilterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  typeFilterBtnActive: {
    backgroundColor: 'rgba(167,139,250,0.18)',
    borderColor: '#a78bfa',
  },
  typeFilterText: { fontSize: 13, fontWeight: '600', color: '#71717a' },
  typeFilterTextActive: { color: '#a78bfa' },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { fontSize: 13, color: '#52525b' },

  // Results list
  resultsList: { padding: 16, gap: 10 },

  // Result item
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#18181b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  resultItemAdded: { opacity: 0.5, borderColor: '#22c55e' },
  resultPoster: {
    width: 56,
    height: 84,
    borderRadius: 7,
    backgroundColor: '#27272a',
  },
  resultPosterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  resultPosterPlaceholderText: { fontSize: 22, fontWeight: '700', color: '#3f3f46' },
  resultInfo: { flex: 1, justifyContent: 'center', gap: 4 },
  resultTitle: { fontSize: 15, fontWeight: '600', color: '#ffffff', lineHeight: 21 },
  resultMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  resultMetaText: { fontSize: 12, color: '#71717a' },
  resultMetaSeparator: { fontSize: 12, color: '#3f3f46' },
  resultGenres: { fontSize: 11, color: '#52525b' },
  addedBadge: { alignSelf: 'center' },
  selectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
  },
  selectBtnText: { fontSize: 13, fontWeight: '700', color: '#a78bfa' },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyText: { fontSize: 16, fontWeight: '500', color: '#a1a1aa' },
  emptyHint: { fontSize: 13, color: '#52525b', textAlign: 'center', lineHeight: 19 },
});

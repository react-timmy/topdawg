import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Text,
  Pressable,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Search, X } from 'lucide-react-native';
import { storageService } from '../storage/asyncStorage';
import { MediaItem } from '../types';
import { MediaCard } from '../components/MediaCard';

export function SearchScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (text: string) => {
    setQuery(text);
    if (text.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const library = await storageService.getLibrary();
      const lowerQuery = text.toLowerCase();
      const filtered = library.filter(
        (item) =>
          item.title.toLowerCase().includes(lowerQuery) ||
          (item.description && item.description.toLowerCase().includes(lowerQuery)) ||
          (item.genres && item.genres.some((g) => g.toLowerCase().includes(lowerQuery))),
      );
      setResults(filtered);
    } catch (e) {
      console.error('Local search failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const clearQuery = () => {
    setQuery('');
    setResults([]);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* ── Top bar ── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <ChevronLeft size={22} color="#ffffff" strokeWidth={2.4} />
        </Pressable>

        {/* Search input */}
        <View style={styles.inputWrap}>
          <Search size={16} color="#52525b" strokeWidth={2} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Search title, genre, description…"
            placeholderTextColor="#52525b"
            value={query}
            onChangeText={handleSearch}
            autoFocus
            returnKeyType="search"
            clearButtonMode="never"
          />
          {query.length > 0 && (
            <Pressable onPress={clearQuery} hitSlop={8}>
              <X size={16} color="#52525b" strokeWidth={2} />
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Results ── */}
      {loading ? (
        <ActivityIndicator size="small" color="#ffffff" style={styles.spinner} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => <MediaCard item={item} index={index} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            query.length >= 2 ? (
              <Text style={styles.emptyText}>No results for "{query}"</Text>
            ) : (
              <Text style={styles.emptyText}>Start typing to search your library</Text>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
    flexShrink: 0,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#18181b',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  inputIcon: { flexShrink: 0 },
  input: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
    paddingVertical: 0,
  },

  spinner: { marginTop: 32 },

  list: { paddingHorizontal: 16, paddingTop: 16 },
  emptyText: {
    color: '#52525b',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 48,
  },
});

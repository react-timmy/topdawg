import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TextInput, ActivityIndicator, Text, Pressable, StatusBar } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Search, X } from 'lucide-react-native';
import { collectionsService } from '../storage/collectionsService';
import { Collection } from '../types';
import { CollectionCard } from '../components/CollectionCard';

export function CollectionsSearchScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // preload collections for faster searching
    (async () => {
      setLoading(true);
      try {
        await collectionsService.getAll();
      } catch (e) {
        console.warn('[CollectionsSearch] preload failed', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSearch = async (text: string) => {
    setQuery(text);
    if (text.length < 1) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const all = await collectionsService.getCollections();
      const lower = text.toLowerCase();
      const filtered = all.filter((c) => c.name.toLowerCase().includes(lower));
      setResults(filtered);
    } catch (e) {
      console.error('[CollectionsSearch] search failed', e);
    } finally {
      setLoading(false);
    }
  };

  const clearQuery = () => {
    setQuery('');
    setResults([]);
  };

  const handlePress = (collection: Collection) => {
    navigation.navigate('CollectionDetail', { collection });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <ChevronLeft size={22} color="#ffffff" strokeWidth={2.4} />
        </Pressable>

        <View style={styles.inputWrap}>
          <Search size={16} color="#9aa4b2" strokeWidth={2} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Search collections…"
            placeholderTextColor="#9aa4b2"
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

      {loading ? (
        <ActivityIndicator size="small" color="#ffffff" style={styles.spinner} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <CollectionCard collection={item} onPress={() => handlePress(item)} />
          )}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          ListEmptyComponent={
            query.length >= 1 ? (
              <Text style={styles.emptyText}>{`No collections match "${query}"`}</Text>
            ) : (
              <Text style={styles.emptyText}>Start typing to search your collections</Text>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05050a' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    backgroundColor: 'transparent',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0b1220',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 50,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  inputIcon: { flexShrink: 0 },
  input: {
    flex: 1,
    color: '#eef2ff',
    fontSize: 16,
    paddingVertical: 0,
  },
  spinner: { marginTop: 32 },
  list: { paddingHorizontal: 16, paddingTop: 18 },
  emptyText: {
    color: '#7c88a0',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 56,
  },
});

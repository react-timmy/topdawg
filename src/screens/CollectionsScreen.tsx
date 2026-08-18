/**
 * CollectionsScreen.tsx
 *
 * Main screen for viewing and creating collections.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Plus, Sparkles, BookMarked } from 'lucide-react-native';
import { FloatingHeader } from '../components/FloatingHeader';
import { Collection } from '../types';
import { collectionsService } from '../storage/collectionsService';
import { CollectionCard } from '../components/CollectionCard';
import { CreateCollectionModal } from '../components/CreateCollectionModal';

export function CollectionsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [headerHeight, setHeaderHeight] = useState<number>(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const collectionsData = await collectionsService.getCollections();
      setCollections(collectionsData);
    } catch (err) {
      console.warn('[CollectionsScreen] Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const handleCreateCollection = async (name: string) => {
    try {
      const newCollection = await collectionsService.create(name, 'collection');
      setCollections((prev) => [newCollection, ...prev]);
      navigation.navigate('CollectionDetail', { collection: newCollection });
    } catch (err) {
      console.warn('[CollectionsScreen] Failed to create:', err);
    }
  };

  const handlePressCollection = useCallback((collection: Collection) => {
    navigation.navigate('CollectionDetail', { collection });
  }, [navigation]);

  const renderItem = useCallback(({ item }: { item: Collection }) => (
    <CollectionCard collection={item} onPress={() => handlePressCollection(item)} />
  ), [handlePressCollection]);

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#a78bfa" />
        </View>
      );
    }

    if (collections.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Sparkles size={48} color="#3f3f46" strokeWidth={2} />
          <Text style={styles.emptyText}>No collections yet</Text>
          <Text style={styles.emptyHint}>
            Tap the + button to create your first collection
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={collections}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 80 },
        ]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={8}
        removeClippedSubviews
      />
    );
  };

  return (
    <View style={styles.root}>
      <FloatingHeader
        title="Collections"
        subtitle="Your curated movie & TV shelves"
        onSearchPress={() => navigation.navigate('CollectionsSearch')}
        onHeightChange={(h) => setHeaderHeight(h)}
        showLogo
      />

      {/* Content needs top padding to avoid being overlapped by the absolute header */}
      <View style={{ flex: 1, paddingTop: headerHeight }}>
        {renderContent()}
      </View>

      <View style={[styles.fabContainer, { right: -15, bottom: insets.bottom + 55 }]}>
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.92 }]}
          onPress={() => setCreateModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Create new collection"
        >
          <Plus size={26} color="#000000" strokeWidth={2.8} />
        </Pressable>
      </View>

      <CreateCollectionModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onCreate={handleCreateCollection}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#000000',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    backgroundColor: '#000000',
    gap: 6,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconRing: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(229,9,20,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.25)',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  headerSubtitle: {
    color: '#52525b',
    fontSize: 11,
    marginTop: 1,
    fontWeight: '500',
  },
  headerLogo: { width: 28, height: 53 },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  emptyHint: {
    color: '#71717a',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  fabContainer: {
    position: 'absolute',
    zIndex: 140,
    elevation: 140,
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'box-none',
  },
  fab: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  fabLabel: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});

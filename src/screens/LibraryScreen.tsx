import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LibraryView } from '../components/LibraryView';
import { storageService } from '../storage/asyncStorage';
import { MediaItem } from '../types';

export function LibraryScreen() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [headerOffset, setHeaderOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation<any>();

  const loadLibrary = useCallback(async () => {
    const data = await storageService.getLibrary();
    setItems(data);
  }, []);

  // Reload every time the tab gains focus (picks up newly scanned items)
  useFocusEffect(
    useCallback(() => {
      loadLibrary();
    }, [loadLibrary]),
  );

  const handleDelete = async (id: string) => {
    const updated = await storageService.removeItem(id);
    setItems(updated);
  };

  const handleToggleStar = async (id: string) => {
    const updated = await storageService.toggleStar(id);
    setItems(updated);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadLibrary();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <LibraryView
        items={items}
        onDelete={handleDelete}
        onToggleStar={handleToggleStar}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        headerOffset={headerOffset}
        onHeaderHeightChange={setHeaderOffset}
        onSettingsPress={() => navigation.navigate('Settings')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
});

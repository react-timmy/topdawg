import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LibraryView } from '../components/LibraryView';
import { storageService } from '../storage/asyncStorage';
import { cloudStarredService, CloudStarredEntry } from '../storage/cloudStarredService';
import { syncService } from '../services/syncService';
import { useAccount } from '../context/AccountContext';
import { MediaItem } from '../types';

export function LibraryScreen() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [cloudStarredItems, setCloudStarredItems] = useState<CloudStarredEntry[]>([]);
  const [headerOffset, setHeaderOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation<any>();
  const { account } = useAccount();

  const loadLibrary = useCallback(async () => {
    const [data, cloudStarred] = await Promise.all([
      storageService.getLibrary(),
      cloudStarredService.getAll(),
    ]);
    setItems(data);
    setCloudStarredItems(cloudStarred);
  }, []);

  // Reload every time the tab gains focus (picks up newly scanned items and
  // any starred entries pushed by the real-time listener in the background)
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

  /**
   * Called by LibraryView when the user confirms the TV episode prompt.
   * Writes starred: true + lastEpisode into the library item in one updateItem
   * call so the sync hook fires exactly once with the full starred entry.
   */
  const handleStarWithEpisode = async (
    id: string,
    seasonNumber: number,
    episodeNumber: number,
  ) => {
    const updated = await storageService.updateItem(id, {
      starred: true,
      lastEpisode: { seasonNumber, episodeNumber },
    });
    setItems(updated);
  };

  /**
   * Remove a cloud-only starred entry (item not in local library).
   * Deletes from local cloud store and pushes the un-star to Firestore.
   */
  const handleUnstarCloud = async (mediaId: string) => {
    await cloudStarredService.remove(mediaId);
    setCloudStarredItems((prev) => prev.filter((e) => e.mediaId !== mediaId));

    // Also remove from Firestore if signed in
    if (account?.uid) {
      void syncService.pushUnstarred(account.uid, mediaId);
    }
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
        cloudStarredItems={cloudStarredItems}
        onDelete={handleDelete}
        onToggleStar={handleToggleStar}
        onStarWithEpisode={handleStarWithEpisode}
        onUnstarCloud={handleUnstarCloud}
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

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, Pressable, Alert, Modal } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { storageService } from "../storage/asyncStorage";
import { MediaItem } from "../types";
import { MediaCard } from "../components/MediaCard";
import { FloatingHeader } from "../components/FloatingHeader";
import Animated, { useSharedValue , FadeIn } from "react-native-reanimated";
import { Film, ScanLine, Users, Plus, LogIn } from "lucide-react-native";
import { watchProgressService } from "../storage/watchProgressService";
import { useWatchParty } from "../context/WatchPartyContext";
import { useAccount } from "../context/AccountContext";
import { BlurView } from "expo-blur";

function MoviesEmptyState() {
  const navigation = useNavigation<any>();
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.empty}>
      <View style={styles.emptyIconRing}>
        <Film size={32} color="#3f3f46" strokeWidth={1.8} />
      </View>
      <Text style={styles.emptyTitle}>No movies yet</Text>
      <Text style={styles.emptySubtitle}>
        Scan local video files to build your library. FilmSort will match them with posters and metadata automatically.
      </Text>
      <Pressable
        style={styles.emptyCta}
        onPress={() => navigation.navigate("MainTabs", { screen: "Scan" })}
      >
        <ScanLine size={16} color="#000000" strokeWidth={2.2} />
        <Text style={styles.emptyCtaText}>Go to Scanner</Text>
      </Pressable>
    </Animated.View>
  );
}

export function MoviesScreen() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [lastPlayedMap, setLastPlayedMap] = useState<Record<string, string | null>>({});
  const [showWatchMenu, setShowWatchMenu] = useState(false);
  const navigation = useNavigation<any>();
  const scrollY = useSharedValue(0);
  const insets = useSafeAreaInsets();
  const party = useWatchParty();
  const { account } = useAccount();

  const loadData = useCallback(async () => {
    const data = await storageService.getLibrary();
    const localMovies = data.filter((item) => item.type === "movie");
    setItems(localMovies);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Fetch lastPlayedAt timestamps when items change
  useEffect(() => {
    if (items.length === 0) return;
    
    const fetchLastPlayed = async () => {
      const map: Record<string, string | null> = {};
      await Promise.all(
        items.map(async (item) => {
          const files = item.localFiles ?? (item.localFile ? [item.localFile] : []);
          const lastPlayed = await watchProgressService.getLastPlayedAt(item.id, files);
          map[item.id] = lastPlayed;
        })
      );
      setLastPlayedMap(map);
    };

    void fetchLastPlayed();
  }, [items]);

  // Sort items by last played (most recent first)
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const aPlayed = lastPlayedMap[a.id];
      const bPlayed = lastPlayedMap[b.id];
      // Items with no play history go to the end
      if (!aPlayed && !bPlayed) return 0;
      if (!aPlayed) return 1;
      if (!bPlayed) return -1;
      // Most recent first
      return bPlayed.localeCompare(aPlayed);
    });
  }, [items, lastPlayedMap]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCreateWatchParty = async () => {
    if (!account) {
      Alert.alert('Sign in required', 'You must be signed in to create a watch party.');
      return;
    }

    if (sortedItems.length === 0) {
      Alert.alert('Notice', 'Add some movies to your library first!');
      return;
    }

    // Use the most recently played movie, or the first one
    const item = sortedItems[0];
    const activeFile = item.localFile || (item.localFiles && item.localFiles[0]);
    
    if (!activeFile?.uri) {
      Alert.alert('Notice', 'No local video file available to watch together.');
      return;
    }

    try {
      const roomId = await party.createParty(item, activeFile.uri || null);
      navigation.navigate('WatchParty', { roomId, item });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create watch party.');
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={sortedItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => <MediaCard item={item} index={index} />}
        contentContainerStyle={[styles.list, { paddingTop: headerHeight + 24 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffffff" />
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<MoviesEmptyState />}
      />
      <FloatingHeader
        title="Movies"
        subtitle="Local movies"
        scrollY={scrollY}
        onHeightChange={setHeaderHeight}
        onSearchPress={() => navigation.navigate("Search")}
        showLogo
      />
      
      {/* Floating Watch Together button - icon only */}
      {sortedItems.length > 0 && (
        <>
          <Pressable
            style={[styles.floatingWatchBtn, { bottom: insets.bottom + 24 }]}
            onPress={() => setShowWatchMenu(true)}
          >
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} />
            <Users size={24} color="#ffffff" strokeWidth={2} />
          </Pressable>

          {/* Watch menu modal */}
          <Modal
            visible={showWatchMenu}
            transparent
            animationType="fade"
            onRequestClose={() => setShowWatchMenu(false)}
          >
            <Pressable style={styles.menuBackdrop} onPress={() => setShowWatchMenu(false)}>
              <Animated.View
                entering={FadeIn.duration(200)}
                style={[styles.menuContainer, { bottom: insets.bottom + 90 }]}
              >
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    setShowWatchMenu(false);
                    handleCreateWatchParty();
                  }}
                >
                  <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFillObject} />
                  <Plus size={20} color="#ffffff" strokeWidth={2.5} />
                  <Text style={styles.menuItemText}>Create Watch Party</Text>
                </Pressable>

                <View style={styles.menuDivider} />

                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    setShowWatchMenu(false);
                    navigation.navigate('JoinWatchParty');
                  }}
                >
                  <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFillObject} />
                  <LogIn size={20} color="#ffffff" strokeWidth={2.5} />
                  <Text style={styles.menuItemText}>Join Watch Party</Text>
                </Pressable>
              </Animated.View>
            </Pressable>
          </Modal>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000000" },
  list: { paddingHorizontal: 16, paddingBottom: 24 },

  empty: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 36,
  },
  emptyIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    color: "#3f3f46",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },
  emptySubtitle: {
    color: "#3f3f46",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 28,
  },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  emptyCtaText: {
    color: "#000000",
    fontSize: 15,
    fontWeight: "700",
  },
  
  floatingWatchBtn: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.35)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },

  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
    alignItems: "flex-end",
  },
  menuContainer: {
    position: "absolute",
    right: 20,
    width: 220,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.3)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 16,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  menuItemText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  menuDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
});

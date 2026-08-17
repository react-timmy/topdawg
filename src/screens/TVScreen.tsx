import React, { useState, useCallback, useEffect, useMemo } from "react";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, Pressable } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { storageService } from "../storage/asyncStorage";
import { MediaItem } from "../types";
import { MediaCard } from "../components/MediaCard";
import { FloatingHeader } from "../components/FloatingHeader";
import { ScanFab } from "../components/ScanFab";
import Animated, { useSharedValue , FadeIn } from "react-native-reanimated";
import { Tv, ScanLine } from "lucide-react-native";
import { watchProgressService, addProgressChangeListener, removeProgressChangeListener } from "../storage/watchProgressService";

function TVEmptyState() {
  const navigation = useNavigation<any>();
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.empty}>
      <View style={styles.emptyIconRing}>
        <Tv size={32} color="#3f3f46" strokeWidth={1.8} />
      </View>
      <Text style={styles.emptyTitle}>No TV shows yet</Text>
      <Text style={styles.emptySubtitle}>
        Scan local video files to build your library. FilmSort will match them with episode info, posters, and ratings.
      </Text>
      <Pressable
        style={styles.emptyCta}
        onPress={() => navigation.navigate('Scanner')}
      >
        <ScanLine size={16} color="#000000" strokeWidth={2.2} />
        <Text style={styles.emptyCtaText}>Go to Scanner</Text>
      </Pressable>
    </Animated.View>
  );
}

export function TVScreen() {
  const [trending, setTrending] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [lastPlayedMap, setLastPlayedMap] = useState<Record<string, string | null>>({});
  const navigation = useNavigation<any>();
  const scrollY = useSharedValue(0);
  const [scannerVisible, setScannerVisible] = useState(true);
  const lastScrollY = React.useRef(0);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const v = await storageService.getScanFabVisibility();
        if (mounted) setScannerVisible(!!v);
      } catch (e) { /* ignore */ }
    })();
    storageService.setOnScanFabVisibilityChanged((v) => {
      if (mounted) setScannerVisible(!!v);
    });
    return () => { mounted = false; storageService.setOnScanFabVisibilityChanged(null); };
  }, []);

  const insets = useSafeAreaInsets();

  const loadTrending = useCallback(async () => {
    setLoading(true);
    const data = await storageService.getLibrary();
    const localTV = data.filter((item) => item.type === "tv");
    setTrending(localTV);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTrending();
    }, [loadTrending])
  );

  // Fetch lastPlayedAt timestamps when items change and subscribe to progress updates
  useEffect(() => {
    if (trending.length === 0) return;
    let mounted = true;

    const fetchLastPlayed = async () => {
      const map: Record<string, string | null> = {};
      await Promise.all(
        trending.map(async (item) => {
          const files = item.localFiles ?? (item.localFile ? [item.localFile] : []);
          const lastPlayed = await watchProgressService.getLastPlayedAt(item.id, files);
          map[item.id] = lastPlayed;
        })
      );
      if (mounted) setLastPlayedMap(map);
    };

    void fetchLastPlayed();

    const handler = () => {
      void fetchLastPlayed();
    };
    addProgressChangeListener(handler);

    return () => {
      mounted = false;
      removeProgressChangeListener(handler);
    };
  }, [trending]);

  // Sort items by last played (most recent first)
  const sortedItems = useMemo(() => {
    return [...trending].sort((a, b) => {
      const aPlayed = lastPlayedMap[a.id];
      const bPlayed = lastPlayedMap[b.id];
      // Items with no play history go to the end
      if (!aPlayed && !bPlayed) return 0;
      if (!aPlayed) return 1;
      if (!bPlayed) return -1;
      // Most recent first
      return bPlayed.localeCompare(aPlayed);
    });
  }, [trending, lastPlayedMap]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTrending();
    setRefreshing(false);
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
        contentContainerStyle={[styles.list, { paddingTop: headerHeight + 24, paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffffff" />
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<TVEmptyState />}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          const dy = y - lastScrollY.current;
          // If scrolling up (dy < -5) show scanner; scrolling down (dy > 5) hide it
          if (dy < -5 && !scannerVisible) {
            setScannerVisible(true);
            void storageService.saveScanFabVisibility(true);
          } else if (dy > 5 && scannerVisible) {
            setScannerVisible(false);
            void storageService.saveScanFabVisibility(false);
          }
          lastScrollY.current = y;
        }}
        scrollEventThrottle={16}
      />
      <FloatingHeader
        title="TV Shows"
        subtitle="Local TV shows"
        scrollY={scrollY}
        onHeightChange={setHeaderHeight}
        onSearchPress={() => navigation.navigate("Search")}
        showLogo
      />
      <ScanFab visible={scannerVisible} />
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
});

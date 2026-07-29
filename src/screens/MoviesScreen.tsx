import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, Pressable } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { storageService } from "../storage/asyncStorage";
import { MediaItem } from "../types";
import { MediaCard } from "../components/MediaCard";
import { FloatingHeader } from "../components/FloatingHeader";
import { useSharedValue } from "react-native-reanimated";
import { Film, ScanLine } from "lucide-react-native";
import Animated, { FadeIn } from "react-native-reanimated";

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
  const navigation = useNavigation<any>();
  const scrollY = useSharedValue(0);

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

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
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
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => <MediaCard item={item} index={index} />}
        contentContainerStyle={[styles.list, { paddingTop: headerHeight + 8 }]}
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

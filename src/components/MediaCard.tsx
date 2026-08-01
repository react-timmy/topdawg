import React, { useCallback, useState } from "react";
import { View, Image, Text, Pressable, StyleSheet } from "react-native";
import Animated, { FadeIn, FadeInDown, Layout } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Star, Calendar, Play, Info, Clock } from "lucide-react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { MediaItem, LocalFile } from "../types";
import { watchProgressService } from "../storage/watchProgressService";

interface MediaCardProps {
  item: MediaItem;
  latestEpisode?: LocalFile;
  index?: number;
}

type NavigationProp = any; // Simplifying to any to handle cross-navigator types easily

function filesOf(item: MediaItem): LocalFile[] {
  return item.localFiles ?? (item.localFile ? [item.localFile] : []);
}

export const MediaCard: React.FC<MediaCardProps> = ({ item, index = 0 }) => {
  const navigation = useNavigation<NavigationProp>();
  const [resume, setResume] = useState<{
    position: number;
    file: LocalFile;
  } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const files = filesOf(item);
      watchProgressService.getForMedia(item.id, files).then((hit) => {
        if (!active) return;
        if (hit) {
          setResume({ position: hit.progress.positionSeconds, file: hit.file });
        } else {
          setResume(null);
        }
      });
      return () => {
        active = false;
      };
    }, [item.id, item.localFile?.uri, item.localFiles?.length]),
  );

  const handleDetails = () => {
    navigation.navigate("Details", { item });
  };

  const handlePlay = () => {
    const playFile = resume?.file ?? item.localFile;
    if (!playFile?.uri) return;

    const playItem: MediaItem = {
      ...item,
      localFile: playFile,
      localFiles: item.localFiles ?? (item.localFile ? [item.localFile] : undefined),
    };

    // For TV episodes, keep a readable title with SxxExx
    if (
      playFile.seasonNumber != null &&
      playFile.episodeNumber != null &&
      item.type === "tv"
    ) {
      playItem.title = `${item.title} - S${String(playFile.seasonNumber).padStart(2, "0")}E${String(playFile.episodeNumber).padStart(2, "0")}`;
    }

    navigation.navigate("VideoPlayer", {
      item: playItem,
      startPosition: resume?.position,
    });
  };

  const hasLocal = !!(resume?.file?.uri || item.localFile?.uri);
  const isContinue = !!resume;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).duration(500).springify()}
      layout={Layout.springify().duration(400)}
      style={styles.card}
    >
      <Pressable onPress={handleDetails} style={StyleSheet.absoluteFillObject} />
      {/* ── Backdrop ─────────────────────────────────────────────── */}
      {item.backdropUrl ? (
        <Image
          source={{ uri: item.backdropUrl }}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
      ) : (
        <LinearGradient
          colors={['#1a1a2e', '#16213e', '#0f3460']}
          style={styles.backgroundImage}
        />
      )}

      {/* ── Cinematic gradient ──────────────────────────────────────── */}
      <LinearGradient
        colors={["#000000", "#000000", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.1)"]}
        locations={[0, 0.3, 0.65, 1.0]}
        start={{ x: 0, y: 1 }}
        end={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ── Poster ───────────────────────────────────────────────── */}
      <Animated.View
        entering={FadeIn.delay(200).duration(600)}
        style={styles.posterOverlay}
      >
        <Image
          source={item.posterUrl ? { uri: item.posterUrl } : undefined}
          style={styles.poster}
          resizeMode="cover"
        />
      </Animated.View>

      {/* ── Content ──────────────────────────────────────────────── */}
      <View style={styles.contentContainer}>
        <View style={styles.titleContainer}>
          {item.logoUrl ? (
            <Image
              source={item.logoUrl ? { uri: item.logoUrl } : undefined}
              style={styles.logo}
              resizeMode="contain"
            />
          ) : (
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
          )}
        </View>

        {/* Badges */}
        <View style={styles.badgesContainer}>
          <View style={styles.badge}>
            <Star size={12} color="#4ade80" fill="#4ade80" />
            <Text style={styles.badgeText}>{item.rating.toFixed(1)}</Text>
          </View>
          <View style={styles.badge}>
            <Calendar size={12} color="#a1a1aa" />
            <Text style={styles.badgeText}>{item.releaseDate}</Text>
          </View>
          {item.type === 'movie' && (
            <View style={styles.badge}>
              <Clock size={12} color="#a1a1aa" />
              <Text style={styles.badgeText}>
                {item.runtime ? `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m` : 'N/A'}
              </Text>
            </View>
          )}
        </View>

        {/* Description */}
        <Text style={styles.description} numberOfLines={3}>
          {item.description}
        </Text>

        {/* Buttons */}
        <View style={styles.actionsContainer}>
          {/* Play / Continue watching */}
          <Pressable
            style={[styles.playButton, !hasLocal && styles.playButtonDisabled]}
            onPress={handlePlay}
            disabled={!hasLocal}
          >
            <Play size={14} color="#000000" fill="#000000" />
            <Text style={styles.playButtonText} numberOfLines={1}>
              {isContinue ? "Continue Watching" : "Play"}
            </Text>
          </Pressable>

          {/* Details — frosted glass (BlurView) */}
          <Pressable
            style={[styles.moreInfoButton, { flex: 1 }]}
            onPress={handleDetails}
          >
            <BlurView
              intensity={50}
              tint="dark"
              style={StyleSheet.absoluteFillObject}
            />
            <Info size={14} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.moreInfoButtonText}>Details</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: "100%",
    aspectRatio: 4 / 4.5,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#18181b",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 32 },
    shadowOpacity: 0.8,
    shadowRadius: 32,
    elevation: 24,
  },

  backgroundImage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    opacity: 1,
  },

  posterOverlay: {
    position: "absolute",
    top: 18,
    right: 0,
    width: "34%",
    aspectRatio: 3 / 4.25,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    overflow: "hidden",
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 20,
  },
  poster: {
    width: "100%",
    height: "100%",
  },

  contentContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
    padding: 22,
    zIndex: 10,
  },

  titleContainer: { marginBottom: 10 },
  logo: { height: 55, width: "65%" },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.4,
    lineHeight: 22,
  },

  badgesContainer: { flexDirection: "row", gap: 8, marginBottom: 10 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  badgeText: { fontSize: 11, fontWeight: "500", color: "#ffffff" },

  description: {
    color: "#d4d4d8",
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 14,
  },

  actionsContainer: { flexDirection: "row", gap: 8 },

  playButton: {
    flex: 1.2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 16,
  },
  playButtonDisabled: {
    opacity: 0.45,
  },
  playButtonText: { color: "#000000", fontWeight: "700", fontSize: 12 },

  moreInfoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  moreInfoButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    textTransform: "uppercase",
    fontSize: 10,
    letterSpacing: 1,
    zIndex: 1,
  },
});

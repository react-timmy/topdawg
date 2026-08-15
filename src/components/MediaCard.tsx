import React, { useCallback, useMemo, useState } from "react";
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
  onPress?: (item: MediaItem) => void;
}

type NavigationProp = any; // Simplifying to any to handle cross-navigator types easily

function filesOf(item: MediaItem): LocalFile[] {
  return item.localFiles ?? (item.localFile ? [item.localFile] : []);
}

export const MediaCard: React.FC<MediaCardProps> = ({ item, index = 0, onPress }) => {
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
    if (onPress) {
      // If custom onPress is provided, use it
      onPress(item);
    } else {
      // Default behavior: navigate to Details
      navigation.navigate("Details", { item });
    }
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

    // Mark this file as played (records lastPlayedAt) so the library can move it to the top.
    // Fire-and-forget: navigation should happen immediately even if persistence is still pending.
    void watchProgressService
      .markAsPlayed(item.id, { uri: playFile.uri, filename: playFile.filename })
      .catch(() => {});

    navigation.navigate("VideoPlayer", {
      item: playItem,
      startPosition: resume?.position,
    });
  };

  const hasLocal = !!(resume?.file?.uri || item.localFile?.uri);
  const isContinue = !!resume;

  // Mirror the same season-image logic as DetailsScreen: use the latest
  // season's poster/backdrop when available.
  const latestSeasonNumber = useMemo(() => {
    if (item.type !== 'tv' || !item.localFiles || item.localFiles.length === 0) return null;
    return Math.max(...item.localFiles.map((f) => f.seasonNumber || 1));
  }, [item.type, item.localFiles]);

  const { displayPosterUrl, displayBackdropUrl } = useMemo(() => {
    let p = item.posterUrl;
    let b = item.backdropUrl;
    if (item.type === 'tv' && latestSeasonNumber != null && item.seasons) {
      const seasonData = item.seasons.find((s) => s.seasonNumber === latestSeasonNumber);
      if (seasonData?.posterUrl) p = seasonData.posterUrl;
      if (seasonData?.backdropUrl) b = seasonData.backdropUrl;
    }
    return { displayPosterUrl: p, displayBackdropUrl: b };
  }, [item, latestSeasonNumber]);

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).duration(500).springify()}
      layout={Layout.springify().duration(400)}
      style={styles.card}
    >
      <Pressable onPress={handleDetails} style={StyleSheet.absoluteFillObject} />
      {/* ── Backdrop ─────────────────────────────────────────────── */}
      {displayBackdropUrl ? (
        <Image
          source={{ uri: displayBackdropUrl }}
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
          source={displayPosterUrl ? { uri: displayPosterUrl } : undefined}
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
            <Text style={styles.badgeText}>{item.rating != null ? item.rating.toFixed(1) : '—'}</Text>
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
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#121214",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 32 },
    shadowOpacity: 0.9,
    shadowRadius: 36,
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
    top: 24,
    right: 0,
    width: "34%",
    aspectRatio: 3 / 4.25,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    overflow: "hidden",
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
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
    padding: 24,
    zIndex: 10,
  },

  titleContainer: { marginBottom: 12 },
  logo: { height: 60, width: "70%" },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#f4f4f5",
    letterSpacing: -0.4,
    lineHeight: 24,
  },

  badgesContainer: { flexDirection: "row", gap: 8, marginBottom: 12 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  badgeText: { fontSize: 11, fontWeight: "600", color: "#e4e4e7" },

  description: {
    color: "#a1a1aa",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
    fontWeight: "400",
  },

  actionsContainer: { flexDirection: "row", gap: 20 },

  playButton: {
    flex: 1.2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#f8f8f8",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 2,
  },
  playButtonDisabled: {
    opacity: 0.45,
  },
  playButtonText: { color: "#09090b", fontWeight: "700", fontSize: 13 },

  moreInfoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 2,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  moreInfoButtonText: {
    color: "#e4e4e7",
    fontWeight: "700",
    textTransform: "uppercase",
    fontSize: 11,
    letterSpacing: 1,
    zIndex: 1,
  },
});

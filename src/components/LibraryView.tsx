import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  Dimensions,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOutUp,
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import {
  LayoutGrid,
  List,
  Trash2,
  Star,
  Film,
  Tv,
  Star as StarIcon,
  SortAsc,
  BookOpen,
  Layers,
  Play,
  Clock,
  Calendar,
  Check,
  Tv2,
  FolderHeart,
} from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "../context/AccountContext";
import { MediaItem } from "../types";
import { CloudStarredEntry } from "../storage/cloudStarredService";
import { FloatingHeader } from "./FloatingHeader";
import { watchProgressService, setOnProgressChanged } from "../storage/watchProgressService";

const SCREEN_WIDTH = Dimensions.get("window").width;
const GRID_ITEM_WIDTH = (SCREEN_WIDTH - 48 - 12) / 2; // 2-col grid with padding and gap

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterTab = "all" | "movie" | "tv" | "starred";
type SortKey = "added" | "title" | "rating" | "year" | "lastPlayed";
type ViewMode = "grid" | "list";
type NavigationProp = any; // Simplify to any to support both Tab and Root stacks

interface LibraryViewProps {
  items: MediaItem[];
  /** Cloud-only starred entries (no local file) — shown only in the starred tab */
  cloudStarredItems?: CloudStarredEntry[];
  onDelete: (id: string) => void;
  onToggleStar?: (id: string) => void;
  /** Called when starring a TV show — provides the episode the user entered */
  onStarWithEpisode?: (id: string, seasonNumber: number, episodeNumber: number) => void;
  /** Called when the user removes a cloud-only starred entry */
  onUnstarCloud?: (mediaId: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Pixels to pad the top of the scroll content so it clears the FloatingHeader */
  headerOffset?: number;
  onHeaderHeightChange?: (height: number) => void;
  onSettingsPress?: () => void;
}

// ─── Sort options cycle ───────────────────────────────────────────────────────

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "added", label: "Recently Added" },
  { key: "lastPlayed", label: "Last Played" },
  { key: "title", label: "Title A–Z" },
  { key: "rating", label: "Top Rated" },
  { key: "year", label: "Release Year" },
];

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

// ─── Grid card ────────────────────────────────────────────────────────────────

function GridCard({
  item,
  onDelete,
  onPress,
  onToggleStar,
}: {
  item: MediaItem;
  onDelete: () => void;
  onPress: () => void;
  onToggleStar?: () => void;
}) {
  const handleLongPress = () => {
    if (onToggleStar) {
      onToggleStar();
    }
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(350)}
      exiting={FadeOutUp.duration(250)}
      style={styles.gridCard}
    >
      <Pressable onPress={onPress} onLongPress={handleLongPress} delayLongPress={400}>
        <View style={styles.gridPosterWrap}>
          <Image
            source={item.posterUrl ? { uri: item.posterUrl } : undefined}
            style={styles.gridPoster}
            resizeMode="cover"
          />

          {/* Star badge */}
          {item.starred && (
            <View style={styles.gridStarBadge}>
              <StarIcon size={12} color="#facc15" fill="#facc15" />
            </View>
          )}

          {/* Type badge */}
          <View
            style={[
              styles.typePill,
              styles.typePillAbsolute,
              item.type === "movie" ? styles.moviePill : styles.tvPill,
            ]}
          >
            {item.type === "movie" ? (
              <Film size={9} color="#f59e0b" />
            ) : (
              <Tv size={9} color="#60a5fa" />
            )}
            <Text
              style={[
                styles.typePillText,
                item.type === "movie" ? styles.movieText : styles.tvText,
              ]}
            >
              {item.type === "movie" ? "Film" : "TV"}
            </Text>
          </View>

          {/* Rating Badge */}
          <View style={styles.ratingBadge}>
            <Star size={9} color="#4ade80" fill="#4ade80" />
            <Text style={styles.ratingBadgeText}>{item.rating.toFixed(1)}</Text>
          </View>

          {/* Duration Badge */}
          {item.type === 'movie' && item.runtime && (
            <View style={styles.durationBadge}>
              <Clock size={9} color="#a1a1aa" />
              <Text style={styles.durationBadgeText}>
                {Math.floor(item.runtime / 60)}h {item.runtime % 60}m
              </Text>
            </View>
          )}

          {/* Star toggle button */}
          {onToggleStar && (
            <Pressable onPress={onToggleStar} style={styles.gridStarBtn} hitSlop={8}>
              <StarIcon
                size={12}
                color={item.starred ? "#facc15" : "#71717a"}
                fill={item.starred ? "#facc15" : "none"}
              />
            </Pressable>
          )}

          {/* Delete button */}
          <Pressable
            onPress={(e) => {
              e?.stopPropagation?.();
              onDelete();
            }}
            style={styles.gridDeleteBtn}
            hitSlop={8}
          >
            <Trash2 size={12} color="#f87171" />
          </Pressable>
        </View>

        <Text style={styles.gridTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.releaseDate && (
          <Text style={styles.gridYear}>{item.releaseDate.split("-")[0]}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ─── List card ────────────────────────────────────────────────────────────────

function ListCard({
  item,
  onDelete,
  onPress,
  onToggleStar,
  showEpisodeBadge = false,
}: {
  item: MediaItem;
  onDelete: () => void;
  onPress: () => void;
  onToggleStar?: () => void;
  showEpisodeBadge?: boolean;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(350)}
      exiting={FadeOutUp.duration(250)}
      style={styles.listCard}
    >
      {/* Backdrop accent */}
      {item.backdropUrl ? (
        <Image
          source={{ uri: item.backdropUrl }}
          style={styles.listBackdrop}
          resizeMode="cover"
          blurRadius={18}
        />
      ) : null}
      <View style={styles.listBackdropOverlay} />

      <Pressable onPress={onPress} style={styles.listPressable}>
        {/* Poster */}
        <View style={styles.listPosterContainer}>
          <Image
            source={item.posterUrl ? { uri: item.posterUrl } : undefined}
            style={styles.listPoster}
            resizeMode="cover"
          />
          {/* Play overlay for items with local files */}
          {item.localFile?.uri && (
            <View style={styles.listPlayOverlay}>
              <Play size={14} color="#ffffff" fill="#ffffff" />
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.listInfo}>
          <Text style={styles.listTitle} numberOfLines={2}>{item.title}</Text>

          {/* Badges row */}
          <View style={styles.listBadgeRow}>
            <View style={[styles.typePill, item.type === "movie" ? styles.moviePill : styles.tvPill]}>
              {item.type === "movie" ? <Film size={9} color="#f59e0b" /> : <Tv size={9} color="#60a5fa" />}
              <Text style={[styles.typePillText, item.type === "movie" ? styles.movieText : styles.tvText]}>
                {item.type === "movie" ? "Movie" : "TV"}
              </Text>
            </View>
            <View style={styles.ratingRow}>
              <Star size={10} color="#facc15" fill="#facc15" />
              <Text style={styles.listRating}>{item.rating.toFixed(1)}</Text>
            </View>
            {item.type === 'movie' && item.runtime && (
              <View style={styles.ratingRow}>
                <Clock size={10} color="#71717a" />
                <Text style={styles.listYear}>
                  {Math.floor(item.runtime / 60)}h {item.runtime % 60}m
                </Text>
              </View>
            )}
            {item.releaseDate && (
              <View style={styles.ratingRow}>
                <Calendar size={10} color="#52525b" />
                <Text style={styles.listYear}>{item.releaseDate.split("-")[0]}</Text>
              </View>
            )}
          </View>

          {/* Genres */}
          {item.genres && item.genres.length > 0 && (
            <View style={styles.listGenreRow}>
              {item.genres.slice(0, 3).map((g) => (
                <View key={g} style={styles.listGenrePill}>
                  <Text style={styles.listGenreText}>{g}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Description */}
          <Text style={styles.listDesc} numberOfLines={2}>{item.description}</Text>

          {/* Last episode badge — TV only, starred tab only */}
          {showEpisodeBadge && item.type === "tv" && item.starred && item.lastEpisode && (
            <View style={styles.lastEpisodeBadge}>
              <Tv2 size={10} color="#60a5fa" />
              <Text style={styles.lastEpisodeText}>
                S{item.lastEpisode.seasonNumber} · E{item.lastEpisode.episodeNumber}
              </Text>
            </View>
          )}
        </View>
      </Pressable>

      {/* Actions column */}
      <View style={styles.listActions}>
        {onToggleStar && (
          <Pressable onPress={onToggleStar} style={styles.listStarBtn} hitSlop={8}>
            <StarIcon
              size={13}
              color={item.starred ? "#facc15" : "#52525b"}
              fill={item.starred ? "#facc15" : "none"}
            />
          </Pressable>
        )}
        <Pressable onPress={onDelete} style={styles.listDeleteBtn} hitSlop={8}>
          <Trash2 size={13} color="#f87171" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ─── Remove confirmation sheet (matches reminder set/cancel style) ────────────

function RemoveConfirmSheet({
  item,
  phase,
  onCancel,
  onConfirm,
  onDone,
}: {
  item: MediaItem;
  phase: "confirm" | "done";
  onCancel: () => void;
  onConfirm: () => void;
  onDone: () => void;
}) {
  const isDone = phase === "done";

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={isDone ? onDone : onCancel}
      statusBarTranslucent
    >
      <Pressable
        style={styles.removeBackdrop}
        onPress={isDone ? onDone : onCancel}
      />
      <Animated.View entering={FadeIn.duration(220)} style={styles.removeSheet}>
        {(item.backdropUrl || item.posterUrl) && (
          <Image
            source={{ uri: item.backdropUrl || item.posterUrl }}
            style={StyleSheet.absoluteFillObject}
            blurRadius={20}
          />
        )}
        <LinearGradient
          colors={["rgba(10,10,12,0.45)", "rgba(10,10,12,0.97)"]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.removeInner}>
          <View
            style={[
              styles.removeIconRing,
              isDone
                ? styles.removeIconRingDone
                : styles.removeIconRingDanger,
            ]}
          >
            {isDone ? (
              <Check size={26} color="#4ade80" strokeWidth={2.5} />
            ) : (
              <Trash2 size={26} color="#f87171" />
            )}
          </View>

          <Text
            style={[
              styles.removeTitle,
              { color: isDone ? "#4ade80" : "#f87171" },
            ]}
          >
            {isDone ? "Removed from Library" : "Remove from Library"}
          </Text>

          <Text style={styles.removeSubtitle} numberOfLines={2}>
            {item.title}
          </Text>

          <View
            style={[
              styles.removeMetaRow,
              isDone && styles.removeMetaRowDone,
            ]}
          >
            {item.type === "movie" ? (
              <Film size={13} color={isDone ? "#4ade80" : "#f87171"} />
            ) : (
              <Tv size={13} color={isDone ? "#4ade80" : "#f87171"} />
            )}
            <Text
              style={[
                styles.removeMetaText,
                { color: isDone ? "#4ade80" : "#f87171" },
              ]}
            >
              {item.type === "movie" ? "Movie" : "TV Show"}
              {item.releaseDate ? ` · ${item.releaseDate.split("-")[0]}` : ""}
            </Text>
          </View>

          <Text style={styles.removeBody}>
            {isDone
              ? "This title has been removed from your library."
              : "This title will be removed from your library. Video files on your device are not deleted."}
          </Text>

          {isDone ? (
            <Pressable style={styles.removeBtn} onPress={onDone}>
              <Text style={styles.removeBtnText}>Got it</Text>
            </Pressable>
          ) : (
            <View style={styles.removeActions}>
              <Pressable
                style={[styles.removeBtn, styles.removeBtnSecondary]}
                onPress={onCancel}
              >
                <Text style={styles.removeBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.removeBtn, styles.removeBtnDanger]}
                onPress={onConfirm}
              >
                <Text style={[styles.removeBtnText, styles.removeBtnDangerText]}>
                  Remove
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── Starred card (cloud-only) ────────────────────────────────────────────────

/**
 * Shown in the starred tab for items that came from the cloud but have no
 * local file on this device. Info-only: no play button, no delete, no navigation.
 * Shows all available metadata. Unstar button only.
 *
 * Supports both "list" (horizontal row) and "grid" (poster card) view modes
 * to match the app's GridCard design when the user switches to grid view.
 */
function StarredCard({
  entry,
  onUnstar,
  viewMode = 'list',
}: {
  entry: CloudStarredEntry;
  onUnstar: () => void;
  viewMode?: ViewMode;
}) {
  // ── Grid variant — mirrors GridCard layout ──────────────────────────────────
  if (viewMode === 'grid') {
    return (
      <Animated.View
        entering={FadeInDown.duration(350)}
        exiting={FadeOutUp.duration(250)}
        style={styles.gridCard}
      >
        <View style={styles.gridPosterWrap}>
          <Image
            source={entry.posterUrl ? { uri: entry.posterUrl } : undefined}
            style={styles.gridPoster}
            resizeMode="cover"
          />

          {/* Type pill */}
          <View
            style={[
              styles.typePill,
              styles.typePillAbsolute,
              entry.type === 'movie' ? styles.moviePill : styles.tvPill,
            ]}
          >
            {entry.type === 'movie'
              ? <Film size={9} color="#f59e0b" />
              : <Tv size={9} color="#60a5fa" />}
            <Text
              style={[
                styles.typePillText,
                entry.type === 'movie' ? styles.movieText : styles.tvText,
              ]}
            >
              {entry.type === 'movie' ? 'Film' : 'TV'}
            </Text>
          </View>

          {/* Rating badge */}
          {entry.rating !== undefined && entry.rating > 0 && (
            <View style={styles.ratingBadge}>
              <Star size={9} color="#4ade80" fill="#4ade80" />
              <Text style={styles.ratingBadgeText}>{entry.rating.toFixed(1)}</Text>
            </View>
          )}

          {/* Episode badge for TV — bottom-left overlay */}
          {entry.type === 'tv' && entry.lastEpisode && (
            <View style={styles.starredGridEpisodeBadge}>
              <Tv2 size={9} color="#60a5fa" />
              <Text style={styles.starredGridEpisodeText}>
                S{entry.lastEpisode.seasonNumber}·E{entry.lastEpisode.episodeNumber}
              </Text>
            </View>
          )}

          {/* Unstar button */}
          <Pressable onPress={onUnstar} style={styles.gridDeleteBtn} hitSlop={8}>
            <StarIcon size={12} color="#facc15" fill="#facc15" />
          </Pressable>
        </View>

        <Text style={styles.gridTitle} numberOfLines={2}>
          {entry.title}
        </Text>
        {entry.releaseDate && (
          <Text style={styles.gridYear}>{entry.releaseDate.split('-')[0]}</Text>
        )}
      </Animated.View>
    );
  }

  // ── List variant (default) ──────────────────────────────────────────────────
  return (
    <Animated.View
      entering={FadeInDown.duration(350)}
      exiting={FadeOutUp.duration(250)}
      style={styles.starredCard}
    >
      {/* Blurred backdrop */}
      {(entry.backdropUrl || entry.posterUrl) && (
        <Image
          source={{ uri: entry.backdropUrl || entry.posterUrl }}
          style={styles.starredBackdrop}
          resizeMode="cover"
          blurRadius={20}
        />
      )}
      <LinearGradient
        colors={['rgba(10,10,12,0.35)', 'rgba(10,10,12,0.92)']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Non-interactive body — just layout, no Pressable */}
      <View style={styles.starredPressable}>
        {/* Poster */}
        <View style={styles.starredPosterWrap}>
          <Image
            source={entry.posterUrl ? { uri: entry.posterUrl } : undefined}
            style={styles.starredPoster}
            resizeMode="cover"
          />
          {/* Starred badge on poster */}
          <View style={styles.starredPosterBadge}>
            <StarIcon size={11} color="#facc15" fill="#facc15" />
          </View>
        </View>

        {/* Info */}
        <View style={styles.starredInfo}>
          {/* Title */}
          <Text style={styles.starredTitle} numberOfLines={2}>
            {entry.title}
          </Text>

          {/* Badges row */}
          <View style={styles.starredBadgeRow}>
            <View style={[styles.typePill, entry.type === 'movie' ? styles.moviePill : styles.tvPill]}>
              {entry.type === 'movie'
                ? <Film size={9} color="#f59e0b" />
                : <Tv size={9} color="#60a5fa" />}
              <Text style={[styles.typePillText, entry.type === 'movie' ? styles.movieText : styles.tvText]}>
                {entry.type === 'movie' ? 'Movie' : 'TV'}
              </Text>
            </View>
            {entry.rating !== undefined && entry.rating > 0 && (
              <View style={styles.ratingRow}>
                <Star size={10} color="#facc15" fill="#facc15" />
                <Text style={styles.listRating}>{entry.rating.toFixed(1)}</Text>
              </View>
            )}
            {entry.releaseDate && (
              <View style={styles.ratingRow}>
                <Calendar size={10} color="#52525b" />
                <Text style={styles.listYear}>{entry.releaseDate.split('-')[0]}</Text>
              </View>
            )}
          </View>

          {/* TV last-episode — prominent hero badge */}
          {entry.type === 'tv' && entry.lastEpisode ? (
            <View style={styles.starredEpisodeHero}>
              <Tv2 size={12} color="#60a5fa" />
              <Text style={styles.starredEpisodeHeroText}>
                Up to  S{entry.lastEpisode.seasonNumber}  ·  E{entry.lastEpisode.episodeNumber}
              </Text>
            </View>
          ) : entry.type === 'tv' && entry.numberOfSeasons ? (
            <View style={styles.starredSeasonsBadge}>
              <Tv size={10} color="#60a5fa" />
              <Text style={styles.starredSeasonsText}>
                {entry.numberOfSeasons} {entry.numberOfSeasons === 1 ? 'Season' : 'Seasons'}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Unstar button */}
      <View style={styles.starredActions}>
        <Pressable onPress={onUnstar} style={styles.starredUnstarBtn} hitSlop={8}>
          <StarIcon size={13} color="#facc15" fill="#facc15" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ─── TV Episode Prompt ────────────────────────────────────────────────────────

/**
 * Shown when the user stars a TV show that isn't starred yet.
 * Asks which season + episode they're up to so it can be saved and synced.
 */
function EpisodePrompt({
  item,
  onConfirm,
  onSkip,
}: {
  item: MediaItem;
  onConfirm: (seasonNumber: number, episodeNumber: number) => void;
  onSkip: () => void;
}) {
  const [season, setSeason] = useState(
    item.lastEpisode ? String(item.lastEpisode.seasonNumber) : "1",
  );
  const [episode, setEpisode] = useState(
    item.lastEpisode ? String(item.lastEpisode.episodeNumber) : "",
  );

  const canConfirm = season.trim() !== "" && episode.trim() !== "";

  const handleConfirm = () => {
    const s = parseInt(season, 10);
    const e = parseInt(episode, 10);
    if (!isNaN(s) && !isNaN(e) && s > 0 && e > 0) {
      onConfirm(s, e);
    }
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onSkip}
      statusBarTranslucent
    >
      <Pressable style={styles.removeBackdrop} onPress={onSkip} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.episodeKav}
      >
        <Animated.View entering={FadeIn.duration(220)} style={styles.episodeSheet}>
          {(item.backdropUrl || item.posterUrl) && (
            <Image
              source={{ uri: item.backdropUrl || item.posterUrl }}
              style={StyleSheet.absoluteFillObject}
              blurRadius={22}
            />
          )}
          <LinearGradient
            colors={["rgba(10,10,12,0.45)", "rgba(10,10,12,0.97)"]}
            style={StyleSheet.absoluteFillObject}
          />

          <View style={styles.episodeInner}>
            {/* Icon */}
            <View style={styles.episodeIconRing}>
              <Tv2 size={26} color="#60a5fa" />
            </View>

            <Text style={styles.episodeTitle}>Where are you up to?</Text>

            <Text style={styles.episodeSubtitle} numberOfLines={2}>
              {item.title}
            </Text>

            <Text style={styles.episodeHint}>
              We&apos;ll save this so you know where to continue on any device.
            </Text>

            {/* Season + Episode inputs */}
            <View style={styles.episodeInputRow}>
              <View style={styles.episodeInputWrap}>
                <Text style={styles.episodeInputLabel}>Season</Text>
                <TextInput
                  style={styles.episodeInput}
                  value={season}
                  onChangeText={setSeason}
                  keyboardType="number-pad"
                  placeholder="1"
                  placeholderTextColor="#52525b"
                  maxLength={3}
                  returnKeyType="next"
                  selectTextOnFocus
                />
              </View>
              <View style={styles.episodeSeparator} />
              <View style={styles.episodeInputWrap}>
                <Text style={styles.episodeInputLabel}>Episode</Text>
                <TextInput
                  style={styles.episodeInput}
                  value={episode}
                  onChangeText={setEpisode}
                  keyboardType="number-pad"
                  placeholder="1"
                  placeholderTextColor="#52525b"
                  maxLength={3}
                  returnKeyType="done"
                  onSubmitEditing={canConfirm ? handleConfirm : undefined}
                  selectTextOnFocus
                />
              </View>
            </View>

            {/* Actions */}
            <View style={styles.episodeActions}>
              <Pressable style={[styles.episodeBtn, styles.episodeBtnSecondary]} onPress={onSkip}>
                <Text style={styles.episodeBtnText}>Skip</Text>
              </Pressable>
              <Pressable
                style={[styles.episodeBtn, styles.episodeBtnPrimary, !canConfirm && styles.episodeBtnDisabled]}
                onPress={handleConfirm}
                disabled={!canConfirm}
              >
                <StarIcon size={14} color={canConfirm ? "#000000" : "#52525b"} fill={canConfirm ? "#000000" : "none"} />
                <Text style={[styles.episodeBtnText, canConfirm && styles.episodeBtnPrimaryText]}>
                  Save & Star
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ isFiltered }: { isFiltered: boolean }) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        <BookOpen size={32} color="#3f3f46" />
      </View>
      <Text style={styles.emptyTitle}>
        {isFiltered ? "No matches" : "Library empty"}
      </Text>
      <Text style={styles.emptySubtext}>
        {isFiltered
          ? "Try a different filter."
          : "Use the Scanner button to add titles here."}
      </Text>
    </Animated.View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LibraryView({
  items,
  cloudStarredItems = [],
  onDelete,
  onToggleStar,
  onStarWithEpisode,
  onUnstarCloud,
  onRefresh,
  refreshing = false,
  headerOffset = 0,
  onHeaderHeightChange,
  onSettingsPress,
}: LibraryViewProps) {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { account } = useAccount();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sortIdx, setSortIdx] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const scrollY = useSharedValue(0);

  /** Remove confirmation sheet (styled like reminder set / cancel) */
  const [removeTarget, setRemoveTarget] = useState<MediaItem | null>(null);
  const [removePhase, setRemovePhase] = useState<"confirm" | "done">("confirm");

  /** Episode prompt — shown when starring a TV show */
  const [episodePromptItem, setEpisodePromptItem] = useState<MediaItem | null>(null);

  /** Track last played timestamps for sorting */
  const [lastPlayedMap, setLastPlayedMap] = useState<Record<string, string | null>>({});

  const sortKey = SORT_OPTIONS[sortIdx].key;
  const sortLabel = SORT_OPTIONS[sortIdx].label;

  // Fetch lastPlayedAt timestamps when items change and subscribe to progress updates
  useEffect(() => {
    let mounted = true;

    const fetchLastPlayed = async () => {
      const map: Record<string, string | null> = {};
      await Promise.all(
        items.map(async (item) => {
          const files = item.localFiles ?? (item.localFile ? [item.localFile] : []);
          const lastPlayed = await watchProgressService.getLastPlayedAt(item.id, files);
          map[item.id] = lastPlayed;
        })
      );
      if (mounted) setLastPlayedMap(map);
    };

    void fetchLastPlayed();

    // Refresh when any progress changes (markAsPlayed / save / clear)
    setOnProgressChanged(() => {
      void fetchLastPlayed();
    });

    return () => {
      mounted = false;
      setOnProgressChanged(null);
    };
  }, [items]);

  const handleDetails = (item: MediaItem) => {
    console.log(`LibraryView: Navigating to Details for: ${item.title} (ID: ${item.id})`);
    navigation.navigate("Details", { item });
  };

  /**
   * Called when the user taps the star on any card.
   * - Movies and already-starred TV shows → direct toggle.
   * - Un-starred TV shows → open episode prompt first.
   */
  const handleStarPress = (item: MediaItem) => {
    if (!onToggleStar) return;

    // Un-starring always works immediately regardless of type
    if (item.starred) {
      onToggleStar(item.id);
      return;
    }

    // Starring a TV show → ask for episode first
    if (item.type === "tv" && onStarWithEpisode) {
      setEpisodePromptItem(item);
      return;
    }

    // Movie (or TV when onStarWithEpisode not provided) → direct toggle
    onToggleStar(item.id);
  };

  const handlePlay = (item: MediaItem) => {
    if (item.localFile?.uri) {
      navigation.navigate("VideoPlayer", { item });
    } else {
      handleDetails(item);
    }
  };

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  // ── Derived list ────────────────────────────────────────────────────────────
  // When the starred tab is active, we append cloud-only entries at the end.
  // We use a discriminated wrapper so renderItem can branch on type.
  type ListRow =
    | { kind: 'media'; item: MediaItem }
    | { kind: 'cloud'; entry: CloudStarredEntry };

  // Map item id -> index in the incoming items array (assumed to reflect added order)
  const addedIndex = useMemo(() => {
    const m: Record<string, number> = {};
    items.forEach((it, idx) => { m[it.id] = idx; });
    return m;
  }, [items]);

  const visible = useMemo((): ListRow[] => {
    let list = items;

    if (filter === "starred") {
      list = list.filter((i) => i.starred);
    } else if (filter !== "all") {
      list = list.filter((i) => i.type === filter);
    }

    const sorted = [...list].sort((a, b) => {
      if (sortKey === "title") return a.title.localeCompare(b.title);
      if (sortKey === "rating") return b.rating - a.rating;
      if (sortKey === "year")
        return (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "");

      if (sortKey === "lastPlayed") {
        const aPlayed = lastPlayedMap[a.id];
        const bPlayed = lastPlayedMap[b.id];
        if (!aPlayed && !bPlayed) return 0;
        if (!aPlayed) return 1;
        if (!bPlayed) return -1;
        return bPlayed.localeCompare(aPlayed);
      }

      // Default (added / recently added):
      // 1) Items with a recent lastPlayedAt should float to the top (most recent first)
      // 2) Otherwise fall back to incoming items order (assumed added order) with newest first
      const aPlayed = lastPlayedMap[a.id];
      const bPlayed = lastPlayedMap[b.id];
      if (aPlayed || bPlayed) {
        if (!aPlayed) return 1;
        if (!bPlayed) return -1;
        const cmp = bPlayed.localeCompare(aPlayed);
        if (cmp !== 0) return cmp;
      }

      const aIdx = addedIndex[a.id] ?? 0;
      const bIdx = addedIndex[b.id] ?? 0;
      return bIdx - aIdx;
    });

    const mediaRows: ListRow[] = sorted.map((item) => ({ kind: 'media', item }));

    // Append cloud-only entries only in the starred tab
    // Filter out entries that already exist in the local library (as starred items)
    if (filter === "starred" && cloudStarredItems.length > 0) {
      const localIds = new Set(items.map((i) => i.id));
      const cloudOnlyEntries = cloudStarredItems.filter((e) => !localIds.has(e.mediaId));
      const cloudRows: ListRow[] = cloudOnlyEntries.map((entry) => ({
        kind: 'cloud',
        entry,
      }));
      return [...mediaRows, ...cloudRows];
    }

    return mediaRows;
  }, [items, cloudStarredItems, filter, sortKey, lastPlayedMap, addedIndex]);

  const movies = items.filter((i) => i.type === "movie").length;
  const tvShows = items.filter((i) => i.type === "tv").length;
  const starredCount = items.filter((i) => i.starred).length + cloudStarredItems.length;
  const isFiltered = filter !== "all";

  // ── List header (stats + controls) ──────────────────────────────────────────
  const ListHeader = () => (
    <View style={styles.headerBlock}>
      {/* ── Stats row ────────────────────────────────────────────── */}
      <View style={styles.statsRow}>
        <Pressable style={styles.statCard} onPress={() => setFilter("all")}>
          <Layers size={14} color="#a1a1aa" />
          <Text style={styles.statValue}>{items.length}</Text>
          <Text style={styles.statLabel}>
            {pluralize(items.length, "Title", "Total")}
          </Text>
        </Pressable>
        <View style={styles.statDivider} />
        <Pressable style={styles.statCard} onPress={() => setFilter("movie")}>
          <Film size={14} color="#f59e0b" />
          <Text style={styles.statValue}>{movies}</Text>
          <Text style={styles.statLabel}>
            {pluralize(movies, "Movie", "Movies")}
          </Text>
        </Pressable>
        <View style={styles.statDivider} />
        <Pressable style={styles.statCard} onPress={() => setFilter("tv")}>
          <Tv size={14} color="#60a5fa" />
          <Text style={styles.statValue}>{tvShows}</Text>
          <Text style={styles.statLabel}>
            {pluralize(tvShows, "TV Show", "TV Shows")}
          </Text>
        </Pressable>
        <View style={styles.statDivider} />
        <Pressable style={styles.statCard} onPress={() => setFilter("starred")}>
          <StarIcon size={14} color="#facc15" fill={starredCount > 0 ? "#facc15" : "none"} />
          <Text style={styles.statValue}>{starredCount}</Text>
          <Text style={styles.statLabel}>Starred</Text>
        </Pressable>
      </View>

      {/* ── Filter tabs + view toggle row ───────────────────────────────── */}
      <View style={styles.controlRow}>
        {/* Filter tabs */}
        <View style={styles.filterTabs}>
          {(["all", "movie", "tv", "starred"] as FilterTab[]).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setFilter(tab)}
              style={[
                styles.filterTab,
                filter === tab && styles.filterTabActive,
              ]}
            >
              {tab === "starred" ? (
                <StarIcon size={14} color={filter === tab ? "#facc15" : "#71717a"} fill={filter === tab ? "#facc15" : "none"} />
              ) : (
                <Text
                  style={[
                    styles.filterTabText,
                    filter === tab && styles.filterTabTextActive,
                  ]}
                >
                  {tab === "all" ? "All" : tab === "movie" ? "Movies" : "TV"}
                </Text>
              )}
            </Pressable>
          ))}
        </View>

        {/* Right controls — sort + view toggle */}
        <View style={styles.rightControls}>
          <Pressable
            onPress={() => setSortIdx((i) => (i + 1) % SORT_OPTIONS.length)}
            style={styles.iconBtn}
          >
            <SortAsc size={14} color="#a1a1aa" />
          </Pressable>

          <Pressable
            onPress={() => setViewMode((v) => (v === "grid" ? "list" : "grid"))}
            style={styles.iconBtn}
          >
            {viewMode === "grid" ? (
              <List size={14} color="#a1a1aa" />
            ) : (
              <LayoutGrid size={14} color="#a1a1aa" />
            )}
          </Pressable>
        </View>
      </View>

      {/* Sort label + result count */}
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sorted by: {sortLabel}</Text>
        {isFiltered && (
          <Text style={styles.resultCount}>
            {visible.length} {pluralize(visible.length, "result", "results")}
          </Text>
        )}
      </View>
    </View>
  );

  // ── Render container ─────────────────────────────────────────────────────────
  return (
    <>
      <Animated.FlatList
        data={visible}
        key={viewMode}
        keyExtractor={(row) =>
          row.kind === 'media' ? row.item.id : `cloud:${row.entry.mediaId}`
        }
        numColumns={viewMode === "grid" ? 2 : 1}
        columnWrapperStyle={viewMode === "grid" ? styles.gridRow : undefined}
        ListHeaderComponent={<ListHeader />}
        ListEmptyComponent={<EmptyState isFiltered={isFiltered} />}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#ffffff"
              progressViewOffset={headerOffset}
            />
          ) : undefined
        }
        contentContainerStyle={[
          viewMode === "grid" ? styles.gridContent : styles.listContent,
          { paddingTop: headerOffset + 8, paddingHorizontal: 24 },
        ]}
        renderItem={({ item: row }) => {
          if (row.kind === 'cloud') {
            return (
              <StarredCard
                entry={row.entry}
                onUnstar={() => onUnstarCloud?.(row.entry.mediaId)}
                viewMode={viewMode}
              />
            );
          }

          const item = row.item;

          // Local starred items in the starred tab → StarredCard (info-only view)
          if (filter === 'starred' && item.starred) {
            const entry: CloudStarredEntry = {
              mediaId: item.id,
              title: item.title,
              type: item.type,
              posterUrl: item.posterUrl,
              backdropUrl: item.backdropUrl,
              rating: item.rating,
              releaseDate: item.releaseDate,
              genres: item.genres,
              description: item.description,
              numberOfSeasons: item.numberOfSeasons,
              lastEpisode: item.lastEpisode,
              updatedAt: new Date().toISOString(),
            };
            return (
              <StarredCard
                entry={entry}
                onUnstar={() => onToggleStar?.(item.id)}
                viewMode={viewMode}
              />
            );
          }

          // All other tabs → normal grid/list card with play + delete
          return viewMode === "grid" ? (
            <GridCard
              item={item}
              onDelete={() => {
                setRemovePhase("confirm");
                setRemoveTarget(item);
              }}
              onPress={() => handlePlay(item)}
              onToggleStar={onToggleStar ? () => handleStarPress(item) : undefined}
            />
          ) : (
            <ListCard
              item={item}
              onDelete={() => {
                setRemovePhase("confirm");
                setRemoveTarget(item);
              }}
              onPress={() => handlePlay(item)}
              onToggleStar={onToggleStar ? () => handleStarPress(item) : undefined}
              showEpisodeBadge={filter === 'starred'}
            />
          );
        }}
      />
      <FloatingHeader
        title="Library"
        subtitle="Your scanned collection"
        scrollY={scrollY}
        onHeightChange={onHeaderHeightChange}
        onSettingsPress={onSettingsPress}
        showLogo
      />

      {removeTarget && (
        <RemoveConfirmSheet
          item={removeTarget}
          phase={removePhase}
          onCancel={() => {
            setRemoveTarget(null);
            setRemovePhase("confirm");
          }}
          onConfirm={() => {
            onDelete(removeTarget.id);
            setRemovePhase("done");
          }}
          onDone={() => {
            setRemoveTarget(null);
            setRemovePhase("confirm");
          }}
        />
      )}

      {/* TV episode prompt — shown when starring an un-starred TV show */}
      {episodePromptItem && (
        <EpisodePrompt
          item={episodePromptItem}
          onConfirm={(seasonNumber, episodeNumber) => {
            onStarWithEpisode?.(episodePromptItem.id, seasonNumber, episodeNumber);
            setEpisodePromptItem(null);
          }}
          onSkip={() => {
            // Star without episode info
            onToggleStar?.(episodePromptItem.id);
            setEpisodePromptItem(null);
          }}
        />
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Header block ─────────────────────────────────────────────────────────────
  headerBlock: { paddingBottom: 16 },

  statsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 20,
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "space-around",
  },
  statCard: { alignItems: "center", gap: 4 },
  statValue: { fontSize: 22, fontWeight: "800", color: "#ffffff" },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#52525b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: "rgba(255,255,255,0.07)",
  },

  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  filterTabs: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  filterTabActive: { backgroundColor: "#ffffff" },
  filterTabText: { fontSize: 12, fontWeight: "600", color: "#71717a" },
  filterTabTextActive: { color: "#000000" },

  rightControls: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sortLabel: {
    fontSize: 10,
    color: "#3f3f46",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
  },
  resultCount: {
    fontSize: 10,
    color: "#52525b",
    fontWeight: "600",
  },

  // ── Grid ──────────────────────────────────────────────────────────────────────
  gridContent: { paddingBottom: 140 },
  gridRow: { gap: 12, marginBottom: 12 },

  gridCard: { width: GRID_ITEM_WIDTH },
  gridPosterWrap: {
    width: GRID_ITEM_WIDTH,
    height: GRID_ITEM_WIDTH * 1.45,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#18181b",
    marginBottom: 8,
    position: "relative",
  },
  gridPoster: { width: "100%", height: "100%" },

  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 9999,
    borderWidth: 1,
  },
  typePillAbsolute: {
    position: "absolute",
    top: 8,
    left: 8,
  },
  moviePill: {
    backgroundColor: "rgba(245,158,11,0.12)",
    borderColor: "rgba(245,158,11,0.30)",
  },
  tvPill: {
    backgroundColor: "rgba(96,165,250,0.12)",
    borderColor: "rgba(96,165,250,0.30)",
  },
  typePillText: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  movieText: { color: "#f59e0b" },
  tvText: { color: "#60a5fa" },

  gridDeleteBtn: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 9999,
    backgroundColor: "rgba(0,0,0,0.60)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  gridStarBtn: {
    position: "absolute",
    bottom: 42,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 9999,
    backgroundColor: "rgba(0,0,0,0.60)",
    borderWidth: 1,
    borderColor: "rgba(250,204,21,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  ratingBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 9999,
    backgroundColor: "rgba(0,0,0,0.60)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  ratingBadgeText: { fontSize: 9, fontWeight: "800", color: "#ffffff" },
  durationBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 9999,
    backgroundColor: "rgba(0,0,0,0.60)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  durationBadgeText: { fontSize: 9, fontWeight: "800", color: "#ffffff" },
  gridStarBadge: {
    position: "absolute",
    bottom: 42,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(250,204,21,0.15)",
    borderWidth: 1,
    borderColor: "rgba(250,204,21,0.3)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },

  gridTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
    lineHeight: 16,
    marginBottom: 2,
  },
  gridYear: {
    fontSize: 10,
    fontWeight: "500",
    color: "#52525b",
  },
  gridMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  gridRating: { fontSize: 11, fontWeight: "600", color: "#a1a1aa" },

  // ── List ──────────────────────────────────────────────────────────────────────
  listContent: { gap: 12, paddingBottom: 140 },

  listCard: {
    flexDirection: "row",
    backgroundColor: "#111113",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
    padding: 14,
    gap: 14,
    alignItems: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  listBackdrop: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.18,
  },
  listBackdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,10,12,0.72)",
  },
  listPressable: { flex: 1, flexDirection: "row", gap: 14, zIndex: 1 },
  listPosterContainer: {
    width: 76,
    height: 112,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#27272a",
    flexShrink: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  listPoster: {
    width: 76,
    height: 112,
    borderRadius: 12,
    backgroundColor: "#27272a",
  },
  listPlayOverlay: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  listInfo: { flex: 1, gap: 6, justifyContent: "center" },
  listTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.4,
    lineHeight: 20,
  },
  listBadgeRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4, height: 20 },
  listRating: { fontSize: 11, color: "#facc15", fontWeight: "700", lineHeight: 14 },
  listYear: { fontSize: 11, color: "#52525b", fontWeight: "500", lineHeight: 14, height: 20, textAlignVertical: "center" },
  listGenreRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  listGenrePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  listGenreText: { fontSize: 10, color: "#a1a1aa", fontWeight: "600" },
  listDesc: { fontSize: 11, color: "#71717a", lineHeight: 16 },
  listActions: {
    zIndex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 2,
    gap: 8,
  },
  listStarBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(250,204,21,0.08)",
    borderWidth: 1,
    borderColor: "rgba(250,204,21,0.18)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  listDeleteBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(248,113,113,0.08)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.18)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  // ── Empty state ───────────────────────────────────────────────────────────────
  emptyWrap: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#3f3f46",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: "#3f3f46",
    textAlign: "center",
    lineHeight: 19,
  },

  // ── Remove confirmation sheet (reminder-style) ─────────────────────────────
  removeBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  removeSheet: {
    margin: 24,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#111113",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignSelf: "center",
    width: "90%",
    position: "absolute",
    top: "28%",
  },
  removeInner: {
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  removeIconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    borderWidth: 1,
  },
  removeIconRingDanger: {
    backgroundColor: "rgba(248,113,113,0.1)",
    borderColor: "rgba(248,113,113,0.35)",
  },
  removeIconRingDone: {
    backgroundColor: "rgba(74,222,128,0.1)",
    borderColor: "rgba(74,222,128,0.3)",
  },
  removeTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  removeSubtitle: {
    color: "#a1a1aa",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  removeMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(248,113,113,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.2)",
  },
  removeMetaRowDone: {
    backgroundColor: "rgba(74,222,128,0.1)",
    borderColor: "rgba(74,222,128,0.2)",
  },
  removeMetaText: {
    fontSize: 13,
    fontWeight: "700",
  },
  removeBody: {
    color: "#71717a",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  removeActions: {
    flexDirection: "row",
    width: "100%",
    gap: 10,
    marginTop: 4,
  },
  removeBtn: {
    marginTop: 4,
    flex: 1,
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
  },
  removeBtnSecondary: {
    flex: 1,
  },
  removeBtnDanger: {
    flex: 1,
    backgroundColor: "rgba(248,113,113,0.14)",
    borderColor: "rgba(248,113,113,0.35)",
  },
  removeBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  removeBtnDangerText: {
    color: "#f87171",
  },

  // ── Last episode badge (list card) ────────────────────────────────────────────
  lastEpisodeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: "rgba(96,165,250,0.1)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.25)",
    marginTop: 2,
  },
  lastEpisodeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#60a5fa",
    letterSpacing: 0.3,
  },

  // ── Episode prompt modal ──────────────────────────────────────────────────────
  episodeKav: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  episodeSheet: {
    width: "88%",
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#111113",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  episodeInner: {
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  episodeIconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(96,165,250,0.1)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  episodeTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  episodeSubtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#a1a1aa",
    textAlign: "center",
  },
  episodeHint: {
    fontSize: 13,
    color: "#52525b",
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: 8,
  },
  episodeInputRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 12,
    marginTop: 4,
  },
  episodeInputWrap: {
    flex: 1,
    gap: 6,
  },
  episodeInputLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#52525b",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    textAlign: "center",
  },
  episodeInput: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: "800",
    color: "#ffffff",
    textAlign: "center",
  },
  episodeSeparator: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginTop: 22,
  },
  episodeActions: {
    flexDirection: "row",
    width: "100%",
    gap: 10,
    marginTop: 4,
  },
  episodeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  episodeBtnSecondary: {},
  episodeBtnPrimary: {
    backgroundColor: "#facc15",
    borderColor: "#facc15",
  },
  episodeBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.07)",
  },
  episodeBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  episodeBtnPrimaryText: {
    color: "#000000",
  },

  // ── Starred card (cloud-only) ─────────────────────────────────────────────────
  starredCard: {
    flexDirection: "row",
    backgroundColor: "#0d0d10",
    borderRadius: 20,
    overflow: "hidden",
    padding: 14,
    gap: 14,
    alignItems: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  starredTopBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(250,204,21,0.45)",
  },
  starredBackdrop: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.14,
  },
  starredPressable: {
    flex: 1,
    flexDirection: "row",
    gap: 14,
    zIndex: 1,
  },
  starredPosterWrap: {
    width: 76,
    height: 112,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#27272a",
    flexShrink: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  starredPoster: {
    width: 76,
    height: 112,
    borderRadius: 12,
    backgroundColor: "#27272a",
  },
  starredPosterBadge: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(250,204,21,0.2)",
    borderWidth: 1,
    borderColor: "rgba(250,204,21,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  starredInfo: {
    flex: 1,
    gap: 6,
    justifyContent: "center",
  },
  starredTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.4,
    lineHeight: 20,
  },
  starredBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  starredEpisodeHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: "rgba(96,165,250,0.12)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.3)",
    marginTop: 2,
  },
  starredEpisodeHeroText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#60a5fa",
    letterSpacing: 0.4,
  },
  starredSeasonsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: "rgba(96,165,250,0.08)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.2)",
    marginTop: 2,
  },
  starredSeasonsText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#60a5fa",
  },
  starredActions: {
    zIndex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 2,
  },
  starredUnstarBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(250,204,21,0.1)",
    borderWidth: 1,
    borderColor: "rgba(250,204,21,0.28)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  // Wraps StarredCard in grid mode so it spans both columns at full width
  starredGridWrap: {
    width: SCREEN_WIDTH - 48, // full content width (matches paddingHorizontal: 24 on each side)
    marginBottom: 12,
  },

  // ── Starred grid card overlays ────────────────────────────────────────────────
  starredGridEpisodeBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 9999,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.35)",
  },
  starredGridEpisodeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#60a5fa",
    letterSpacing: 0.2,
  },

});

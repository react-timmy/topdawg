import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  Image,
  StyleSheet,
  Dimensions,
  RefreshControl,
  Modal,
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
} from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { MediaItem } from "../types";
import { FloatingHeader } from "./FloatingHeader";

const SCREEN_WIDTH = Dimensions.get("window").width;
const GRID_ITEM_WIDTH = (SCREEN_WIDTH - 48 - 12) / 2; // 2-col grid with padding and gap

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterTab = "all" | "movie" | "tv" | "starred";
type SortKey = "added" | "title" | "rating" | "year";
type ViewMode = "grid" | "list";
type NavigationProp = any; // Simplify to any to support both Tab and Root stacks

interface LibraryViewProps {
  items: MediaItem[];
  onDelete: (id: string) => void;
  onToggleStar?: (id: string) => void;
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
}: {
  item: MediaItem;
  onDelete: () => void;
  onPress: () => void;
  onToggleStar?: () => void;
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
          : "Scan a video file from the Scanner tab to add titles here."}
      </Text>
    </Animated.View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LibraryView({
  items,
  onDelete,
  onToggleStar,
  onRefresh,
  refreshing = false,
  headerOffset = 0,
  onHeaderHeightChange,
  onSettingsPress,
}: LibraryViewProps) {
  const navigation = useNavigation<NavigationProp>();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sortIdx, setSortIdx] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const scrollY = useSharedValue(0);

  /** Remove confirmation sheet (styled like reminder set / cancel) */
  const [removeTarget, setRemoveTarget] = useState<MediaItem | null>(null);
  const [removePhase, setRemovePhase] = useState<"confirm" | "done">("confirm");

  const sortKey = SORT_OPTIONS[sortIdx].key;
  const sortLabel = SORT_OPTIONS[sortIdx].label;

  const handleDetails = (item: MediaItem) => {
    console.log(`LibraryView: Navigating to Details for: ${item.title} (ID: ${item.id})`);
    navigation.navigate("Details", { item });
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
  const visible = useMemo(() => {
    let list = items;

    if (filter === "starred") {
      list = list.filter((i) => i.starred);
    } else if (filter !== "all") {
      list = list.filter((i) => i.type === filter);
    }

    return [...list].sort((a, b) => {
      if (sortKey === "title") return a.title.localeCompare(b.title);
      if (sortKey === "rating") return b.rating - a.rating;
      if (sortKey === "year")
        return (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "");
      return 0; // 'added' — already newest-first from context
    });
  }, [items, filter, sortKey]);

  const movies = items.filter((i) => i.type === "movie").length;
  const tvShows = items.filter((i) => i.type === "tv").length;
  const starredCount = items.filter((i) => i.starred).length;
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
        keyExtractor={(item) => item.id}
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
        renderItem={({ item }) =>
          viewMode === "grid" ? (
            <GridCard
              item={item}
              onDelete={() => {
                setRemovePhase("confirm");
                setRemoveTarget(item);
              }}
              onPress={() => handlePlay(item)}
              onToggleStar={onToggleStar ? () => onToggleStar(item.id) : undefined}
            />
          ) : (
            <ListCard
              item={item}
              onDelete={() => {
                setRemovePhase("confirm");
                setRemoveTarget(item);
              }}
              onPress={() => handlePlay(item)}
              onToggleStar={onToggleStar ? () => onToggleStar(item.id) : undefined}
            />
          )
        }
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
  gridContent: { paddingBottom: 90 },
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
  listContent: { gap: 12, paddingBottom: 90 },

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
});

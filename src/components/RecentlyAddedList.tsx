import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Image,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import {
  CheckCircle2,
  X,
  Play,
  Info,
  Search,
  Check,
  Tv,
  Film,
  RefreshCw,
  ScanLine,
  Link2,
  Wrench,
  Clapperboard,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { MediaItem } from '../types';
import { tmdbService } from '../services/tmdbService';
import { animeService } from '../services/animeService';
import { geminiAIService } from '../services/geminiAIService';
import { storageService } from '../storage/asyncStorage';

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

interface RecentlyAddedListProps {
  items: MediaItem[];
  onDismiss?: () => void;
  onRematchSuccess?: (oldItem: MediaItem, newItem: MediaItem) => void;
}

type NavigationProp = any;

export function RecentlyAddedList({ items, onDismiss, onRematchSuccess }: RecentlyAddedListProps) {
  const navigation = useNavigation<NavigationProp>();
  const [selectedOldItem, setSelectedOldItem] = useState<MediaItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"movie" | "tv">("movie");
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");

  // Auto clean filename for initial search query
  const cleanFilenameForSearch = (filename: string) => {
    return filename
      .replace(/\.[a-zA-Z0-9]+$/, "") // strip extension
      .replace(/[\._\+]/g, " ") // replace dots, underscores, pluses
      .replace(/\b(1080p|720p|2160p|4k|bluray|webdl|h264|h265|x264|x265|hevc|aac|dts|dd5\.1|dual audio|eng|sub|dub)\b/gi, "") // strip release specs
      .replace(/\b(s[0-9]{1,2}e[0-9]{1,2}|season\s*[0-9]{1,2}|ep\s*[0-9]{1,2})\b/gi, "") // strip season/ep numbers
      .replace(/\s+/g, " ") // collapse spaces
      .trim();
  };

  const performSearch = async (query: string, type: "movie" | "tv") => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setLoadingMessage("Searching databases, please wait...");
    setLoading(true);
    try {
      const results = await tmdbService.search(query, type);
      if (results.length === 0 && type === "tv") {
        // Fallback search anime
        const animeResults = await animeService.search(query);
        setSearchResults(animeResults);
      } else {
        setSearchResults(results);
      }
    } catch (e) {
      console.error("Search rematch query failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initSearch = async () => {
      if (selectedOldItem?.localFile) {
        setLoadingMessage("Analyzing filename with AI...");
        setLoading(true);
        let initialQuery = "";
        try {
          const parsed = await geminiAIService.parseSingleFilename(selectedOldItem.localFile.filename);
          if (parsed && parsed.title) {
            initialQuery = parsed.title;
          }
        } catch (e) {
          console.warn("AI parse for rematch failed:", e);
        }

        if (!initialQuery) {
          initialQuery = cleanFilenameForSearch(selectedOldItem.localFile.filename);
        }

        setSearchQuery(initialQuery);
        setSearchType(selectedOldItem.type); // Default search to the item's current type
        performSearch(initialQuery, selectedOldItem.type);
      } else {
        setSearchQuery("");
        setSearchResults([]);
      }
    };
    initSearch();
  }, [selectedOldItem]);

  // Search trigger when searchType changes
  useEffect(() => {
    if (selectedOldItem?.localFile && searchQuery) {
      performSearch(searchQuery, searchType);
    }
  }, [searchType]);

  function parseSeasonEpisode(filename: string): { season: number | null; episode: number | null; extractedName?: string } {
    let tempName = filename.replace(/\.[a-zA-Z0-9]+$/, '');
    tempName = tempName.replace(/^\[[^\]]+\]\s*/g, '');
    tempName = tempName.replace(/\s*\[[^\]]+\]/g, '');
    tempName = tempName.replace(/\s*\([^)]+\)/g, '');
    tempName = tempName.replace(/[\._\+]/g, ' ').trim();

    const seMatch = tempName.match(/(.*?)\b[sS]([0-9]{1,2})[eE]([0-9]{1,2})\b(.*)/i) || 
                    tempName.match(/(.*?)\b([0-9]{1,2})x([0-9]{1,2})\b(.*)/i);
    if (seMatch) {
      let extractedName = seMatch[4]?.replace(/^[-\s]+/, '').trim();
      return { season: parseInt(seMatch[2], 10), episode: parseInt(seMatch[3], 10), extractedName: extractedName || undefined };
    }
    const animeMatch = tempName.match(/(.*?)\s*-\s*([0-9]{1,4})\b(.*)/);
    if (animeMatch) {
      let extractedName = animeMatch[3]?.replace(/^[-\s]+/, '').trim();
      return { season: 1, episode: parseInt(animeMatch[2], 10), extractedName: extractedName || undefined };
    }
    return { season: null, episode: null, extractedName: undefined };
  }

  const handleMatchSelect = async (item: MediaItem) => {
    if (!selectedOldItem?.localFile) return;

    setLoadingMessage("Parsing match details with AI, please wait...");
    setLoading(true);
    try {
      const details = await tmdbService.getDetails(item.id, item.type);
      
      let localFileWithMeta = { ...selectedOldItem.localFile };
      if (item.type === 'tv') {
        let parsed = parseSeasonEpisode(selectedOldItem.localFile.filename);
        try {
          const aiParsed = await geminiAIService.parseEpisodeWithContext(selectedOldItem.localFile.filename, item.title);
          if (aiParsed.season !== null && aiParsed.episode !== null) {
            parsed = {
              season: aiParsed.season,
              episode: aiParsed.episode,
              extractedName: aiParsed.episodeName || parsed.extractedName,
            };
          }
        } catch (e) {
          console.warn('Gemini episode parsing failed:', e);
        }

        let episodeName: string | undefined = undefined;
        let stillUrl: string | undefined = undefined;
        if (parsed.season !== null && parsed.episode !== null) {
          if (!item.id.startsWith('anime:')) {
            const epDetails = await tmdbService.getEpisodeDetails(item.id, parsed.season, parsed.episode);
            if (epDetails) {
              episodeName = epDetails.name;
              stillUrl = epDetails.stillUrl;
            }
          }
        }
        localFileWithMeta = {
          ...selectedOldItem.localFile,
          seasonNumber: parsed.season ?? 1,
          episodeNumber: parsed.episode ?? 1,
          episodeName: episodeName || parsed.extractedName,
          stillUrl,
        };
      } else {
        // Clear TV specific properties if changing type to movie
        delete (localFileWithMeta as any).seasonNumber;
        delete (localFileWithMeta as any).episodeNumber;
        delete (localFileWithMeta as any).episodeName;
        delete (localFileWithMeta as any).stillUrl;
      }

      const fullyMatchedItem: MediaItem = {
        ...item,
        ...details,
        localFile: localFileWithMeta,
      };

      if (onRematchSuccess) {
        onRematchSuccess(selectedOldItem, fullyMatchedItem);
      }
      Alert.alert("Success", `"${fullyMatchedItem.title}" matched successfully!`);
      setSelectedOldItem(null);
    } catch (e) {
      Alert.alert("Error", "Failed to retrieve full item metadata.");
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const isEmpty = !items || items.length === 0;

  const handleDetails = (item: MediaItem) => {
    navigation.navigate("Details", { item });
  };

  const handlePlay = (item: MediaItem) => {
    if (item.localFile?.uri) {
      navigation.navigate("VideoPlayer", { item });
    } else {
      handleDetails(item);
    }
  };

  return (
    <Animated.View entering={FadeInUp.duration(350)} style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <CheckCircle2 size={16} color="#4ade80" />
          <Text style={styles.title}>
            {isEmpty ? 'Recently Matched' : `Recently Matched (${items.length})`}
          </Text>
        </View>
        {!isEmpty && onDismiss && (
          <Pressable onPress={onDismiss} style={styles.dismissBtn} hitSlop={10}>
            <X size={14} color="#71717a" />
          </Pressable>
        )}
      </View>

      {isEmpty ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyHero}>
            <View style={styles.emptyIconOuter}>
              <View style={styles.emptyIconInner}>
                <Clapperboard size={22} color="#4ade80" strokeWidth={1.8} />
              </View>
            </View>
            <View style={styles.emptyCopy}>
              <Text style={styles.emptyTitle}>Your matches will land here</Text>
              <Text style={styles.emptyDesc}>
                After a scan, successfully matched titles show up in this row so you can play, rematch, or fix them fast.
              </Text>
            </View>
          </View>

          <View style={styles.emptySteps}>
            <View style={styles.emptyStep}>
              <View style={[styles.emptyStepIcon, { backgroundColor: 'rgba(96,165,250,0.12)' }]}>
                <ScanLine size={14} color="#60a5fa" strokeWidth={2.2} />
              </View>
              <Text style={styles.emptyStepLabel}>Scan</Text>
              <Text style={styles.emptyStepHint}>Pull in local videos</Text>
            </View>
            <View style={styles.emptyStepDivider} />
            <View style={styles.emptyStep}>
              <View style={[styles.emptyStepIcon, { backgroundColor: 'rgba(167,139,250,0.12)' }]}>
                <Link2 size={14} color="#a78bfa" strokeWidth={2.2} />
              </View>
              <Text style={styles.emptyStepLabel}>Match</Text>
              <Text style={styles.emptyStepHint}>Link titles & metadata</Text>
            </View>
            <View style={styles.emptyStepDivider} />
            <View style={styles.emptyStep}>
              <View style={[styles.emptyStepIcon, { backgroundColor: 'rgba(74,222,128,0.12)' }]}>
                <Wrench size={14} color="#4ade80" strokeWidth={2.2} />
              </View>
              <Text style={styles.emptyStepLabel}>Fix</Text>
              <Text style={styles.emptyStepHint}>Rematch if needed</Text>
            </View>
          </View>
        </View>
      ) : (
        <>
      <Text style={styles.desc}>
        These items were successfully matched and added to your library. Tap to play or view details.
      </Text>

      <FlatList
        data={items}
        keyExtractor={(item) => `${item.id}-${item.localFile?.uri ?? ''}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews
        renderItem={({ item }) => {
          const isTv = item.type === 'tv';
          const imageUrl = isTv ? (item.localFile?.stillUrl ?? item.posterUrl) : item.posterUrl;
          const mainTitle = isTv ? (item.localFile?.episodeName ?? `Episode ${item.localFile?.episodeNumber ?? ''}`) : item.title;
          const subtitle = isTv ? item.title : `Movie${item.releaseDate ? ` · ${item.releaseDate.split('-')[0]}` : ''}`;

          return (
            <View style={[styles.itemCard, { position: 'relative' }]}>
              <Image
                source={imageUrl ? { uri: imageUrl } : undefined}
                style={styles.poster}
                resizeMode="cover"
              />
              
              <Pressable
                style={styles.rematchBtn}
                onPress={() => setSelectedOldItem(item)}
                hitSlop={8}
              >
                <RefreshCw size={12} color="#ffffff" />
              </Pressable>
              
              <View style={styles.infoWrap}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {mainTitle}
                </Text>
                <Text style={styles.itemMeta} numberOfLines={1}>
                  {subtitle}
                </Text>
              </View>

            {/* Action buttons */}
            <View style={styles.actions}>
              <Pressable
                style={styles.detailBtn}
                onPress={() => handleDetails(item)}
                hitSlop={4}
              >
                <Info size={12} color="#a1a1aa" />
              </Pressable>
              <Pressable
                style={styles.playBtn}
                onPress={() => handlePlay(item)}
                hitSlop={4}
              >
                <Play size={10} color="#000000" fill="#000000" />
              </Pressable>
            </View>
          </View>
        );
      }}
      />

      {/* Manual Search Modal for Rematch */}
      <Modal
        visible={selectedOldItem !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedOldItem(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSelectedOldItem(null)}
        />
        <View style={styles.modalSheet}>
          <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFillObject} />
          
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Rematch Item</Text>
            <Pressable
              style={styles.closeBtn}
              onPress={() => setSelectedOldItem(null)}
            >
              <X size={18} color="#a1a1aa" />
            </Pressable>
          </View>

          {selectedOldItem?.localFile && (
            <View style={styles.modalSubtitleBlock}>
              <Text style={styles.modalSubLabel}>File to rematch:</Text>
              <Text style={styles.modalSubtitle} numberOfLines={2}>
                {selectedOldItem.localFile.filename}
              </Text>
            </View>
          )}

          {/* Search Inputs */}
          <View style={styles.searchBlock}>
            <View style={styles.searchInputRow}>
              <Search size={16} color="#71717a" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search movie or TV show title..."
                placeholderTextColor="#52525b"
                value={searchQuery}
                onChangeText={(text) => {
                  setSearchQuery(text);
                  performSearch(text, searchType);
                }}
                autoFocus={true}
                returnKeyType="search"
                onSubmitEditing={() => performSearch(searchQuery, searchType)}
              />
              {searchQuery.length > 0 && (
                <Pressable
                  onPress={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                  }}
                  hitSlop={8}
                >
                  <X size={16} color="#71717a" />
                </Pressable>
              )}
            </View>

            {/* Type selector */}
            <View style={styles.typeSelector}>
              <Pressable
                style={[
                  styles.typeTab,
                  searchType === "movie" && styles.typeTabActive,
                ]}
                onPress={() => setSearchType("movie")}
              >
                <Film size={14} color={searchType === "movie" ? "#000000" : "#a1a1aa"} />
                <Text
                  style={[
                    styles.typeTabText,
                    searchType === "movie" && styles.typeTabTextActive,
                  ]}
                >
                  Movies
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.typeTab,
                  searchType === "tv" && styles.typeTabActive,
                ]}
                onPress={() => setSearchType("tv")}
              >
                <Tv size={14} color={searchType === "tv" ? "#000000" : "#a1a1aa"} />
                <Text
                  style={[
                    styles.typeTabText,
                    searchType === "tv" && styles.typeTabTextActive,
                  ]}
                >
                  TV Shows
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Search Results list */}
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#ffffff" />
              {loadingMessage ? <Text style={{ color: '#a1a1aa', marginTop: 16, fontSize: 13, fontWeight: '600' }}>{loadingMessage}</Text> : null}
            </View>
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => `${item.id}-${item.type}`}
              contentContainerStyle={styles.resultsList}
              ListEmptyComponent={
                searchQuery.trim().length > 1 ? (
                  <Text style={styles.noResults}>No matches found.</Text>
                ) : (
                  <Text style={styles.noResults}>
                    Type a query to search online databases.
                  </Text>
                )
              }
              renderItem={({ item }) => (
                <Pressable
                  style={styles.resultCard}
                  onPress={() => handleMatchSelect(item)}
                >
                  {item.posterUrl ? (
                    <Image
                      source={{ uri: item.posterUrl }}
                      style={styles.resultPoster}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.resultPoster, styles.resultPosterPlaceholder]}>
                      <Film size={18} color="#3f3f46" />
                    </View>
                  )}
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.resultMeta}>
                      {item.type === "movie" ? "Movie" : "TV Show"}
                      {item.releaseDate ? ` · ${item.releaseDate.split("-")[0]}` : ""}
                    </Text>
                    <Text style={styles.resultDesc} numberOfLines={2}>
                      {item.description}
                    </Text>
                  </View>
                  <View style={styles.selectCircle}>
                    <Check size={14} color="#4ade80" />
                  </View>
                </Pressable>
              )}
            />
          )}
        </View>
      </Modal>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111113',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    marginTop: 20,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '800',
  },
  dismissBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  desc: {
    color: '#71717a',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  emptyWrap: {
    marginTop: 10,
    gap: 14,
  },
  emptyHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  emptyIconOuter: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(74,222,128,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emptyIconInner: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(74,222,128,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  emptyTitle: {
    color: '#e4e4e7',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  emptyDesc: {
    color: '#71717a',
    fontSize: 12,
    lineHeight: 17,
  },
  emptySteps: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  emptyStep: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 4,
  },
  emptyStepIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emptyStepLabel: {
    color: '#d4d4d8',
    fontSize: 11,
    fontWeight: '800',
  },
  emptyStepHint: {
    color: '#52525b',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 13,
  },
  emptyStepDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 4,
  },
  listContent: {
    gap: 12,
    paddingBottom: 4,
  },
  itemCard: {
    width: 140,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 8,
    alignItems: 'center',
    gap: 8,
  },
  poster: {
    width: 124,
    height: 150,
    borderRadius: 10,
    backgroundColor: '#18181b',
  },
  infoWrap: {
    width: '100%',
    gap: 2,
  },
  itemTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  itemMeta: {
    color: '#52525b',
    fontSize: 10,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
    paddingTop: 8,
    marginTop: 2,
  },
  detailBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rematchBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
  },
  modalSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.85,
    backgroundColor: "#0a0a0c",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
  },
  modalTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalSubtitleBlock: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 4,
  },
  modalSubLabel: {
    color: "#52525b",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  modalSubtitle: {
    color: "#a1a1aa",
    fontSize: 13,
    lineHeight: 18,
  },
  searchBlock: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  searchInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchIcon: {
    marginRight: 2,
  },
  searchInput: {
    flex: 1,
    color: "#ffffff",
    fontSize: 14,
    paddingVertical: 0,
  },
  typeSelector: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 10,
    padding: 3,
    gap: 2,
    alignSelf: "flex-start",
  },
  typeTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  typeTabActive: {
    backgroundColor: "#ffffff",
  },
  typeTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#71717a",
  },
  typeTabTextActive: {
    color: "#000000",
    fontWeight: "800",
  },
  resultsList: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  noResults: {
    color: "#52525b",
    fontSize: 14,
    textAlign: "center",
    marginTop: 40,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  resultCard: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    alignItems: "center",
    gap: 12,
  },
  resultPoster: {
    width: 50,
    height: 75,
    borderRadius: 8,
    backgroundColor: "#18181b",
  },
  resultPosterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#18181b',
  },
  resultInfo: {
    flex: 1,
    gap: 4,
  },
  resultTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  resultMeta: {
    color: "#71717a",
    fontSize: 11,
  },
  resultDesc: {
    color: "#52525b",
    fontSize: 11,
    lineHeight: 15,
  },
  selectCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(74,222,128,0.1)",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
});

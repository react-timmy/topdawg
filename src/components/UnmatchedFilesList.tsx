import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import {
  Search,
  X,
  AlertCircle,
  Film,
  Tv,
  Check,
  HelpCircle,
  ChevronRight,
} from "lucide-react-native";
import Animated, { FadeIn, FadeInDown, Layout } from "react-native-reanimated";

import { LocalFile, MediaItem } from "../types";
import { tmdbService } from "../services/tmdbService";
import { animeService } from "../services/animeService";
import { geminiAIService } from "../services/geminiAIService";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

interface UnmatchedFilesListProps {
  files: LocalFile[];
  onMatchSuccess: (file: LocalFile, matchedItem: MediaItem) => void;
  onIgnore: (file: LocalFile) => void;
}

export function UnmatchedFilesList({
  files,
  onMatchSuccess,
  onIgnore,
}: UnmatchedFilesListProps) {
  const [selectedFile, setSelectedFile] = useState<LocalFile | null>(null);
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

  useEffect(() => {
    const initSearch = async () => {
      if (selectedFile) {
        setLoadingMessage("Analyzing filename with AI...");
        setLoading(true);
        let initialQuery = "";
        try {
          const parsed = await geminiAIService.parseSingleFilename(selectedFile.filename);
          if (parsed && parsed.title) {
            initialQuery = parsed.title;
          }
        } catch (e) {
          console.warn("AI parse for match failed:", e);
        }

        if (!initialQuery) {
          initialQuery = cleanFilenameForSearch(selectedFile.filename);
        }

        setSearchQuery(initialQuery);
        performSearch(initialQuery, searchType);
      } else {
        setSearchQuery("");
        setSearchResults([]);
      }
    };
    initSearch();
  }, [selectedFile]);

  // Search trigger when searchType changes
  useEffect(() => {
    if (selectedFile && searchQuery) {
      performSearch(searchQuery, searchType);
    }
  }, [searchType]);

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
      console.error("Search unmatched query failed:", e);
    } finally {
      setLoading(false);
    }
  };

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
    if (!selectedFile) return;

    setLoadingMessage("Parsing match details with AI, please wait...");
    setLoading(true);
    try {
      // Get detailed metadata
      const details = await tmdbService.getDetails(item.id, item.type);
      
      let localFileWithMeta = { ...selectedFile };
      if (item.type === 'tv') {
        let parsed = parseSeasonEpisode(selectedFile.filename);
        try {
          const aiParsed = await geminiAIService.parseEpisodeWithContext(selectedFile.filename, item.title);
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
          ...selectedFile,
          seasonNumber: parsed.season ?? 1,
          episodeNumber: parsed.episode ?? 1,
          episodeName: episodeName || parsed.extractedName,
          stillUrl,
        };
      }

      const fullyMatchedItem: MediaItem = {
        ...item,
        ...details,
        localFile: localFileWithMeta,
      };

      onMatchSuccess(selectedFile, fullyMatchedItem);
      Alert.alert("Success", `"${fullyMatchedItem.title}" matched successfully!`);
      setSelectedFile(null);
    } catch (e) {
      Alert.alert("Error", "Failed to retrieve full item metadata.");
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  if (!files || files.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <AlertCircle size={16} color="#f87171" />
        <Text style={styles.sectionTitle}>Unmatched Files ({files.length})</Text>
      </View>
      <Text style={styles.sectionDesc}>
        These video files could not be identified automatically. Tap to manually search and match them.
      </Text>

      <FlatList
        data={files}
        keyExtractor={(item) => item.uri}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <Animated.View
            layout={Layout.springify()}
            entering={FadeInDown.duration(300)}
            style={styles.fileCard}
          >
            <View style={styles.fileCardContent}>
              <HelpCircle size={20} color="#71717a" style={styles.fileIcon} />
              <View style={styles.fileInfo}>
                <Text style={styles.filename} numberOfLines={2}>
                  {item.filename}
                </Text>
                <Text style={styles.fileUri} numberOfLines={1}>
                  {item.uri}
                </Text>
              </View>
            </View>

            <View style={styles.cardActions}>
              <Pressable
                style={styles.ignoreBtn}
                onPress={() => onIgnore(item)}
              >
                <Text style={styles.ignoreText}>Ignore</Text>
              </Pressable>
              <Pressable
                style={styles.matchBtn}
                onPress={() => setSelectedFile(item)}
              >
                <Text style={styles.matchText}>Fix Match</Text>
                <ChevronRight size={14} color="#000000" />
              </Pressable>
            </View>
          </Animated.View>
        )}
      />

      {/* Manual Search Modal */}
      <Modal
        visible={selectedFile !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedFile(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSelectedFile(null)}
        />
        <View style={styles.modalSheet}>
          <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFillObject} />
          
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Fix Match</Text>
            <Pressable
              style={styles.closeBtn}
              onPress={() => setSelectedFile(null)}
            >
              <X size={18} color="#a1a1aa" />
            </Pressable>
          </View>

          {selectedFile && (
            <View style={styles.modalSubtitleBlock}>
              <Text style={styles.modalSubLabel}>File to match:</Text>
              <Text style={styles.modalSubtitle} numberOfLines={2}>
                {selectedFile.filename}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    width: "100%",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    color: "#f87171",
    fontSize: 16,
    fontWeight: "800",
  },
  sectionDesc: {
    color: "#71717a",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  fileCard: {
    backgroundColor: "#111113",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  fileCardContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  fileIcon: {
    marginTop: 2,
  },
  fileInfo: {
    flex: 1,
    gap: 3,
  },
  filename: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  fileUri: {
    color: "#3f3f46",
    fontSize: 10,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.04)",
    paddingTop: 10,
  },
  ignoreBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  ignoreText: {
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "600",
  },
  matchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  matchText: {
    color: "#000000",
    fontSize: 11,
    fontWeight: "800",
  },

  // Modal styling
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

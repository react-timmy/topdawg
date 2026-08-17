import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Linking,
  TextInput,
  Modal,
  FlatList,
  Alert,
} from 'react-native';
import { useRoute, useNavigation, RouteProp, useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft,
  Star,
  Clock,
  Play,
  Globe,
  Film,
  Tv,
  HardDrive,
  Search,
  X,
  Check,
  RefreshCw,
  Youtube,
  Users,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInRight,
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  useAnimatedScrollHandler,
  Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RootStackParamList, MediaItem, EpisodeInfo, WatchProvider, LocalFile } from '../types';
import { tmdbService } from '../services/tmdbService';
import { storageService } from '../storage/asyncStorage';
import { animeService } from '../services/animeService';
import { geminiAIService } from '../services/geminiAIService';
import { watchProgressService } from '../storage/watchProgressService';
import { watchHistoryService } from '../storage/watchHistoryService';
import { usePro } from '../context/ProContext';
import { fileLabel } from '../services/fileOrganizeService';
import { useWatchParty } from '../context/WatchPartyContext';
import { useAccount } from '../context/AccountContext';
import { truncateDescription } from '../utils/descriptionUtils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BACKDROP_HEIGHT = SCREEN_HEIGHT * 0.42;

type DetailsRouteProp = RouteProp<RootStackParamList, 'Details'>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Formats seconds into h m s string e.g. 1h 42m */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ─── Similar card ─────────────────────────────────────────────────────────────

function SimilarCard({ sim }: { sim: MediaItem }) {
  const [expanded, setExpanded] = React.useState(false);

  const rawId = sim.id.includes(':') ? sim.id.split(':').slice(1).join(':') : sim.id;
  const tmdbType = sim.type === 'tv' ? 'tv' : 'movie';
  const tmdbUrl = `https://www.themoviedb.org/${tmdbType}/${rawId}`;

  const handleTrailerPress = async () => {
    try {
      const url = await tmdbService.getTrailerUrl(sim.id, sim.type);
      if (url) {
        Linking.openURL(url);
      } else {
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(sim.title + ' trailer')}`;
        Linking.openURL(searchUrl);
      }
    } catch {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(sim.title + ' trailer')}`;
      Linking.openURL(searchUrl);
    }
  };

  return (
    <Pressable style={styles.similarCard} onPress={() => setExpanded(e => !e)}>
      {sim.posterUrl ? (
        <Image
          source={{ uri: sim.posterUrl }}
          style={styles.similarPoster}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.similarPoster, styles.similarPosterPlaceholder]}>
          {sim.type === 'tv'
            ? <Tv size={22} color="#3f3f46" />
            : <Film size={22} color="#3f3f46" />}
        </View>
      )}
      <Text style={styles.similarTitle} numberOfLines={2}>{sim.title}</Text>
      <View style={styles.similarMeta}>
        <Star size={10} color="#4ade80" fill="#4ade80" />
        <Text style={styles.similarMetaText}>{sim.rating != null ? sim.rating.toFixed(1) : '—'}</Text>
        {sim.releaseDate ? (
          <Text style={styles.similarMetaText}>· {sim.releaseDate.split('-')[0]}</Text>
        ) : null}
      </View>
      {expanded ? (
        <View style={styles.similarActions}>
          <Pressable
            style={styles.similarActionBtn}
            onPress={() => Linking.openURL(tmdbUrl)}
          >
            <Globe size={12} color="#a1a1aa" />
            <Text style={styles.similarActionText}>TMDB</Text>
          </Pressable>
          <Pressable
            style={styles.similarActionBtn}
            onPress={handleTrailerPress}
          >
            <Youtube size={12} color="#f87171" />
            <Text style={styles.similarActionText}>Trailer</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

// ─── Episode card ─────────────────────────────────────────────────────────────

function EpisodeCard({ episode, index, onPlay }: { episode: EpisodeInfo; index: number; onPlay: () => void }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(index * 45).duration(380).springify().damping(20)}
      style={styles.episodeCard}
    >
      <Pressable 
        onPress={onPlay} 
        style={({ pressed }) => [
          styles.episodeCardPressable,
          { opacity: pressed ? 0.75 : 1 }
        ]}
      >
        {/* Blurred still as background accent */}
        {episode.stillUrl && (
          <Image
            source={{ uri: episode.stillUrl }}
            style={styles.episodeCardBg}
            blurRadius={18}
          />
        )}
        <View style={styles.episodeCardOverlay} />

        <View style={styles.episodeCardInner}>
          {/* Still + play icon overlay */}
          <View style={styles.episodeStillWrap}>
            <Image
              source={episode.stillUrl ? { uri: episode.stillUrl } : undefined}
              style={styles.episodeStill}
              resizeMode="cover"
            />
            <View style={styles.episodePlayOverlay}>
              <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
              <Play size={18} color="#ffffff" fill="#ffffff" />
            </View>
          </View>
          <View style={styles.episodeInfo}>
            <Text style={styles.episodeNum}>
              EP {String(episode.episodeNumber).padStart(2, '0')}
            </Text>
            <Text style={styles.episodeName} numberOfLines={2}>
              {episode.name}
            </Text>
            {episode.runtime ? (
              <View style={styles.episodeMeta}>
                <Clock size={10} color="#71717a" />
                <Text style={styles.episodeMetaText}>{episode.runtime}m</Text>
              </View>
            ) : null}
          </View>
        </View>

        {episode.overview ? (
          <Text style={styles.episodeOverview} numberOfLines={2}>
            {episode.overview}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function DetailsScreen() {
  const route = useRoute<DetailsRouteProp>();
  const { item: initialItem } = route.params;
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [item, setItem] = useState<MediaItem>(initialItem);
  const [loading, setLoading] = useState(true);
  const [episodes, setEpisodes] = useState<EpisodeInfo[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [trailerUrl, setTrailerUrl] = useState<string | null>(null);
  const { isPro } = usePro();
  const party = useWatchParty();
  const { account } = useAccount();

  const [showMatchModal, setShowMatchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'movie' | 'tv'>('movie');
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [watchProviders, setWatchProviders] = useState<WatchProvider[]>([]);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [resume, setResume] = useState<{
    position: number;
    file: LocalFile;
    episodeNumber?: number;
    seasonNumber?: number;
  } | null>(null);
  const [similarItems, setSimilarItems] = useState<MediaItem[]>([]);
  const [tvTab, setTvTab] = useState<'episodes' | 'similar'>('episodes');
  const [isWatched, setIsWatched] = useState(false);
  const [expandedDescription, setExpandedDescription] = useState(false);

  // Identify the latest season for TV shows based on local files
  const latestSeasonNumber = useMemo(() => {
    if (item.type !== 'tv' || !item.localFiles || item.localFiles.length === 0) return null;
    return Math.max(...item.localFiles.map((f) => f.seasonNumber || 1));
  }, [item]);

  // Compute display poster and backdrop (overriding with season-specific ones if available)
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

  const cleanFilenameForSearch = (filename: string) => {
    return filename
      .replace(/\.[a-zA-Z0-9]+$/, "") // strip extension
      .replace(/[\._\+]/g, " ") // replace dots, underscores, pluses
      .replace(/\b(1080p|720p|2160p|4k|bluray|webdl|h264|h265|x264|x265|hevc|aac|dts|dd5\.1|dual audio|eng|sub|dub)\b/gi, "") // strip release specs
      .replace(/\b(s[0-9]{1,2}e[0-9]{1,2}|season\s*[0-9]{1,2}|ep\s*[0-9]{1,2})\b/gi, "") // strip season/ep numbers
      .replace(/\s+/g, " ") // collapse spaces
      .trim();
  };

  const performSearch = async (query: string, type: 'movie' | 'tv') => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const results = await tmdbService.search(query, type);
      if (results.length === 0 && type === 'tv') {
        const animeResults = await animeService.search(query);
        setSearchResults(animeResults);
      } else {
        setSearchResults(results);
      }
    } catch (e) {
      console.error("Search failed:", e);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleMatchSelect = async (selectedItem: MediaItem) => {
    setSearchLoading(true);
    try {
      const details = await tmdbService.getDetails(selectedItem.id, selectedItem.type);
      
      const allFiles = item.localFiles || (item.localFile ? [item.localFile] : []);
      if (allFiles.length === 0) {
        throw new Error("No local files associated with this item");
      }

      let newLocalFile = undefined;
      let newLocalFiles = undefined;

      if (selectedItem.type === 'tv') {
        const parseSeasonEpisode = (filename: string) => {
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
          return { season: 1, episode: 1, extractedName: undefined };
        };

        const filenames = allFiles.map(f => f.filename);
        let aiParsedEpisodes: Record<string, any> = {};
        try {
          aiParsedEpisodes = await geminiAIService.batchParseEpisodesWithContext(
            filenames,
            selectedItem.title,
            { isPro },
          );
        } catch (e) {
          console.warn('Gemini batch episode parsing failed:', e);
        }

        newLocalFiles = await Promise.all(allFiles.map(async (f) => {
          let parsed = parseSeasonEpisode(f.filename);
          const aiParsed = aiParsedEpisodes[f.filename];
          if (aiParsed && aiParsed.season !== null && aiParsed.episode !== null) {
            parsed = {
              season: aiParsed.season,
              episode: aiParsed.episode,
              extractedName: aiParsed.episodeName || parsed.extractedName,
            };
          }

          let episodeName: string | undefined = undefined;
          let stillUrl: string | undefined = undefined;
          if (parsed.season !== null && parsed.episode !== null) {
            if (!selectedItem.id.startsWith('anime:')) {
              const epDetails = await tmdbService.getEpisodeDetails(selectedItem.id, parsed.season, parsed.episode);
              if (epDetails) {
                episodeName = epDetails.name;
                stillUrl = epDetails.stillUrl;
              }
            }
          }
          return {
            ...f,
            seasonNumber: parsed.season,
            episodeNumber: parsed.episode,
            episodeName: episodeName || parsed.extractedName,
            stillUrl,
          };
        }));
      } else {
        newLocalFile = { ...allFiles[0] };
      }

      const fullyMatchedItem: MediaItem = {
        ...selectedItem,
        ...details,
      };
      if (newLocalFile) fullyMatchedItem.localFile = newLocalFile;
      if (newLocalFiles) fullyMatchedItem.localFiles = newLocalFiles;

      await storageService.addItem(fullyMatchedItem);

      if (item.id !== fullyMatchedItem.id) {
        await storageService.removeItem(item.id);
      }

      setItem(fullyMatchedItem);
      setShowMatchModal(false);
      Alert.alert("Success", `Re-matched to "${fullyMatchedItem.title}" successfully!`);
      
      navigation.setParams({ item: fullyMatchedItem });
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to update item metadata.");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleQueryChange = (text: string) => {
    setSearchQuery(text);
    performSearch(text, searchType);
  };

  const handleTypeChange = (type: 'movie' | 'tv') => {
    setSearchType(type);
    performSearch(searchQuery, type);
  };

  const scrollY = useSharedValue(0);

  // ── Load details ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      // Retrieve latest state of the item from library storage to get all matched episodes
      const library = await storageService.getLibrary();
      const storedItem = library.find(i => i.id === initialItem.id);
      const activeItem = storedItem || initialItem;
      setItem(activeItem);

      const isAnime = initialItem.id.startsWith('anime:');

      let details: any = {};
      let trailer: string | null = null;
      let providers: WatchProvider[] = [];
      let similar: MediaItem[] = [];

      try {
        [details, trailer, providers, similar] = await Promise.all([
          tmdbService.getDetails(initialItem.id, initialItem.type),
          tmdbService.getTrailerUrl(initialItem.id, initialItem.type),
          tmdbService.getWatchProviders(
            initialItem.id,
            initialItem.type,
            activeItem.title,
            { isAnime },
          ),
          tmdbService.getSimilar(initialItem.id, initialItem.type, 5),
        ]);
      } catch (e) {
        console.warn('Network error fetching TMDB details:', e);
      }
      if (cancelled) return;

      const mergedItem = { ...activeItem, ...details };
      setItem(mergedItem);
      setTrailerUrl(trailer);
      setWatchProviders(providers);
      setProvidersLoaded(true);
      setSimilarItems(similar);

      const files = mergedItem.localFiles ?? (mergedItem.localFile ? [mergedItem.localFile] : []);
      const hit = await watchProgressService.getForMedia(mergedItem.id, files);
      if (!cancelled && hit) {
        setResume({
          position: hit.progress.positionSeconds,
          file: hit.file,
          episodeNumber: hit.progress.episodeNumber ?? hit.file.episodeNumber,
          seasonNumber: hit.progress.seasonNumber ?? hit.file.seasonNumber,
        });
      } else if (!cancelled) {
        setResume(null);
      }

      if (initialItem.type === 'tv') {
        const startSeason = hit?.file.seasonNumber ?? 1;
        setSelectedSeason(startSeason);
        await loadEpisodesWithItem(mergedItem, startSeason);
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [initialItem.id]);

  const loadEpisodesWithItem = async (currentItem: MediaItem, season: number) => {
    setEpisodesLoading(true);
    const localFiles = currentItem.localFiles ?? (currentItem.localFile ? [currentItem.localFile] : []);
    const seasonFiles = localFiles.filter(f => f.seasonNumber === season);

    const fetchedEps: EpisodeInfo[] = [];
    await Promise.all(
      seasonFiles.map(async (file) => {
        if (file.episodeNumber !== undefined) {
          let epDetails: EpisodeInfo | null = null;
          if (!currentItem.id.startsWith('anime:')) {
            epDetails = await tmdbService.getEpisodeDetails(currentItem.id, season, file.episodeNumber);
          }
          if (epDetails) {
            fetchedEps.push({
              ...epDetails,
              stillUrl: file.stillUrl ?? epDetails.stillUrl, // Prefer cached file-level still url if set
              name: file.episodeName ?? epDetails.name,
            });
          } else {
            fetchedEps.push({
              id: `${currentItem.id}-${season}-${file.episodeNumber}`,
              episodeNumber: file.episodeNumber,
              seasonNumber: season,
              name: file.episodeName || `Episode ${file.episodeNumber}`,
              overview: '',
              stillUrl: file.stillUrl,
            });
          }
        }
      })
    );

    fetchedEps.sort((a, b) => a.episodeNumber - b.episodeNumber);
    setEpisodes(fetchedEps);
    setEpisodesLoading(false);
  };

  const handleSeasonChange = (season: number) => {
    setSelectedSeason(season);
    loadEpisodesWithItem(item, season);
  };

  // Refresh continue-watching progress when returning from the player
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const files = item.localFiles ?? (item.localFile ? [item.localFile] : []);
      if (files.length === 0) return;
      watchProgressService.getForMedia(item.id, files).then((hit) => {
        if (!active) return;
        if (hit) {
          setResume({
            position: hit.progress.positionSeconds,
            file: hit.file,
            episodeNumber: hit.progress.episodeNumber ?? hit.file.episodeNumber,
            seasonNumber: hit.progress.seasonNumber ?? hit.file.seasonNumber,
          });
        } else {
          setResume(null);
        }
      });
      return () => {
        active = false;
      };
    }, [item.id, item.localFile?.uri, item.localFiles?.length]),
  );

  // Refresh "Mark as Watched" state on focus
  useFocusEffect(
    useCallback(() => {
      let active = true;
      watchHistoryService.hasWatched(item.id).then((watched) => {
        if (active) setIsWatched(watched);
      });
      return () => { active = false; };
    }, [item.id]),
  );

  // ── Scroll animations ───────────────────────────────────────────────────────
  const scrollHandler = useAnimatedScrollHandler(e => {
    scrollY.value = e.contentOffset.y;
  });

  const topBarBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [BACKDROP_HEIGHT - 120, BACKDROP_HEIGHT - 40],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const topBarTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [BACKDROP_HEIGHT - 80, BACKDROP_HEIGHT],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const backdropParallax = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [0, BACKDROP_HEIGHT],
          [0, BACKDROP_HEIGHT * 0.35],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleTrailer = () => {
    if (trailerUrl) Linking.openURL(trailerUrl);
  };

  const handleOpenProvider = (provider: WatchProvider) => {
    Linking.openURL(provider.url);
  };

  const handleMarkWatched = async () => {
    if (isWatched) return;
    const localFiles = item.localFiles ?? (item.localFile ? [item.localFile] : []);
    const runtime = item.runtime ?? 0;

    if (item.type === 'movie') {
      await watchHistoryService.recordCompletion({
        mediaId: item.id,
        title: item.title,
        type: 'movie',
        genres: item.genres ?? [],
        runtime,
        posterUrl: item.posterUrl,
        manual: true,
      });
    } else {
      // TV: record one event per local file, capped at 24
      const capped = localFiles.slice(0, 24);
      for (const file of capped) {
        const fileRuntime = file.duration ? Math.round(file.duration / 60) : runtime;
        await watchHistoryService.recordCompletion({
          mediaId: item.id,
          title: item.title,
          type: 'tv',
          genres: item.genres ?? [],
          runtime: fileRuntime,
          posterUrl: item.posterUrl,
          seasonNumber: file.seasonNumber,
          episodeNumber: file.episodeNumber,
          manual: true,
        });
      }
    }
    setIsWatched(true);
    // Check for newly earned badges after manual mark
    const history = await watchHistoryService.getHistory();
    
  };

  const handlePlayMovie = () => {
    const activeFile =
      resume?.file || item.localFile || (item.localFiles && item.localFiles[0]);
    if (activeFile?.uri) {
      const playItem: MediaItem = { ...item, localFile: activeFile };
      navigation.navigate("VideoPlayer", {
        item: playItem,
        startPosition: resume?.position,
      });
    } else {
      if (trailerUrl) {
        Linking.openURL(trailerUrl);
      } else {
        Alert.alert("Notice", "No local video file or trailer available for this movie.");
      }
    }
  };

  const handlePlayTvShow = () => {
    // Resume last stopped episode when available
    if (resume?.file?.uri) {
      const s = resume.seasonNumber ?? resume.file.seasonNumber;
      const e = resume.episodeNumber ?? resume.file.episodeNumber;
      const playItem: MediaItem = {
        ...item,
        title:
          s != null && e != null
            ? `${item.title} - S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`
            : item.title,
        localFile: resume.file,
        localFiles: item.localFiles ?? (item.localFile ? [item.localFile] : undefined),
      };
      navigation.navigate("VideoPlayer", {
        item: playItem,
        startPosition: resume.position,
      });
      return;
    }

    if (episodes.length > 0) {
      handlePlayEpisode(episodes[0]);
    } else {
      Alert.alert("Notice", "No episodes matched in the library for this season.");
    }
  };

  const handlePlayEpisode = async (episode: EpisodeInfo) => {
    const localFiles = item.localFiles ?? (item.localFile ? [item.localFile] : []);
    const matchedFile = localFiles.find(
      (f) => f.seasonNumber === selectedSeason && f.episodeNumber === episode.episodeNumber
    );
    if (matchedFile) {
      const saved = await watchProgressService.get(item.id, matchedFile);
      const startPosition =
        saved && saved.positionSeconds >= 30 ? saved.positionSeconds : undefined;
      const fileWithTitle: LocalFile = {
        ...matchedFile,
        episodeName: matchedFile.episodeName?.trim() || episode.name || undefined,
      };
      const playItem: MediaItem = {
        ...item,
        title: `${item.title} - S${String(selectedSeason).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')}`,
        localFile: fileWithTitle,
        localFiles: localFiles.map((f) =>
          f.seasonNumber === fileWithTitle.seasonNumber &&
          f.episodeNumber === fileWithTitle.episodeNumber
            ? fileWithTitle
            : f,
        ),
      };
      navigation.navigate("VideoPlayer", { item: playItem, startPosition });
    } else {
      Alert.alert("Notice", `Local file not found for Episode ${episode.episodeNumber}.`);
    }
  };

  const handleCreateWatchParty = async () => {
    if (!account) {
      Alert.alert('Sign in required', 'You must be signed in to create a watch party.');
      return;
    }

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

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>

      {/* ── Top bar (sticky, blurs in on scroll) ────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <Animated.View style={[StyleSheet.absoluteFillObject, topBarBgStyle, styles.topBarBg]}>
          <View style={styles.topBarBorderLine} />
        </Animated.View>

        <View style={styles.topBarRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.topBarBtn} hitSlop={10}>
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />
            <ChevronLeft size={22} color="#ffffff" />
          </Pressable>

          <Animated.Text
            style={[styles.topBarTitle, topBarTitleStyle]}
            numberOfLines={1}
          >
            {item.title}
          </Animated.Text>

          {/* Invisible balance for centered title (no visible circle) */}
          <View style={styles.topBarTitleBalance} />
        </View>
      </View>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
      >

        {/* ── Hero backdrop ──────────────────────────────────────────────────── */}
        <View style={styles.backdropContainer}>
          <Animated.View style={[StyleSheet.absoluteFillObject, backdropParallax]}>
            {displayBackdropUrl ? (
              <Image
                source={{ uri: displayBackdropUrl }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
              />
            ) : (
              <LinearGradient
                colors={['#1a1a2e', '#16213e', '#0f3460']}
                style={StyleSheet.absoluteFillObject}
              />
            )}
          </Animated.View>

          {/* Cinematic bottom gradient — matches MediaCard */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.82)', '#000000']}
            locations={[0.25, 0.55, 0.8, 1]}
            style={StyleSheet.absoluteFillObject}
          />

          {/* Poster — bottom-right, same placement as MediaCard */}
          <Animated.View
            entering={FadeIn.delay(150).duration(500)}
            style={styles.posterWrap}
          >
            {displayPosterUrl ? (
              <Image
                source={{ uri: displayPosterUrl }}
                style={styles.poster}
                resizeMode="cover"
              />
            ) : null}
          </Animated.View>

          {/* Streaming providers — top-right of backdrop */}
          {providersLoaded && watchProviders.length > 0 ? (
            <Animated.View entering={FadeIn.delay(200).duration(400)} style={styles.providersOverlay}>
              {watchProviders.map((p) => (
                <Pressable
                  key={p.id}
                  style={styles.providerBtnOverlay}
                  onPress={() => handleOpenProvider(p)}
                >
                  <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
                  {p.logoUrl ? (
                    <Image source={{ uri: p.logoUrl }} style={styles.providerLogoOverlay} />
                  ) : (
                    <Globe size={16} color="#ffffff" />
                  )}
                </Pressable>
              ))}
            </Animated.View>
          ) : null}

          {/* Left column: title/logo → tagline → info strip, all stacked bottom-left */}
          <Animated.View
            entering={FadeIn.delay(80).duration(420)}
            style={styles.leftColumn}
          >
            {/* Title / logo */}
            {item.logoUrl ? (
              <Image source={{ uri: item.logoUrl }} style={styles.logo} resizeMode="contain" />
            ) : (
              <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
            )}

            {/* Tagline */}
            {item.tagline ? (
              <Text style={styles.tagline} numberOfLines={2}>{item.tagline}</Text>
            ) : null}

            {/* Info strip — type pill · star · year · runtime · filesize */}
            <View style={styles.infoStrip}>
              {/* Type pill */}
              <View style={[styles.infoStripPill, styles.infoStripPillBorder]}>
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />
                {item.type === 'movie'
                  ? <Film size={10} color="#f59e0b" />
                  : <Tv size={10} color="#60a5fa" />}
                <Text style={[styles.infoStripPillText, item.type === 'movie' ? styles.movieColor : styles.tvColor]}>
                  {item.type === 'movie' ? 'MOVIE' : 'TV SERIES'}
                </Text>
              </View>

              <View style={styles.infoStripDot} />

              {/* Star rating */}
              <Star size={11} color="#4ade80" fill="#4ade80" />
              <Text style={styles.infoStripText}>{item.rating != null ? item.rating.toFixed(1) : '—'}</Text>

              <View style={styles.infoStripDot} />

              {/* Year */}
              <Text style={styles.infoStripText}>
                {item.releaseDate?.split('-')[0] ?? '—'}
              </Text>

              {/* Local file duration */}
              {item.localFile?.duration ? (
                <>
                  <View style={styles.infoStripDot} />
                  <HardDrive size={11} color="#71717a" />
                  <Text style={styles.infoStripText}>
                    {formatDuration(item.localFile.duration)}
                  </Text>
                </>
              ) : null}
            </View>
          </Animated.View>
        </View>

        {/* ── Content ────────────────────────────────────────────────────────── */}
        <View style={styles.content}>

          {/* Genre pills — always exactly 3 */}
          {(() => {
            const raw = item.genres ?? [];
            const capped = raw.slice(0, 3);
            while (capped.length < 3) capped.push('Other');
            return (
              <Animated.View entering={FadeInDown.delay(120).duration(400)} style={styles.genreRow}>
                {capped.map((g, idx) => (
                  <View key={`${g}-${idx}`} style={styles.genrePill}>
                    <Text style={styles.genrePillText}>{g}</Text>
                  </View>
                ))}
              </Animated.View>
            );
          })()}

          {/* Overview — moved below genre pills */}
          <Animated.View entering={FadeInDown.delay(150).duration(400)}>
            {(() => {
              const { truncated, isTruncated } = truncateDescription(item.description);
              const displayText = expandedDescription ? item.description : truncated;
              
              return (
                <View>
                  <Text style={styles.overview}>{displayText}</Text>
                  {isTruncated && (
                    <Pressable 
                      onPress={() => setExpandedDescription(!expandedDescription)}
                      style={styles.expandButton}
                    >
                      <Text style={styles.expandButtonText}>
                        {expandedDescription ? 'Show less' : 'Show more'}
                      </Text>
                      {expandedDescription ? (
                        <ChevronUp size={14} color="#3b82f6" />
                      ) : (
                        <ChevronDown size={14} color="#3b82f6" />
                      )}
                    </Pressable>
                  )}
                </View>
              );
            })()}
          </Animated.View>

          {/* Action buttons */}
          <Animated.View entering={FadeInDown.delay(180).duration(400)} style={styles.actionSectionContainer}>

            <View style={styles.secondaryActionsRow}>
              {/* Watch Trailer — only shown when trailerUrl is available */}
              {trailerUrl ? (
                <Pressable
                  style={styles.flexSecondaryBtn}
                  onPress={handleTrailer}
                >
                  <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFillObject} />
                  <Youtube size={14} color="#f87171" />
                  <Text style={styles.secondaryBtnText}>Trailer</Text>
                </Pressable>
              ) : null}

              {/* Mark as Watched — replaces Watchlist button */}
              <Pressable
                style={[styles.flexSecondaryBtn, isWatched && styles.watchedBtnActive]}
                onPress={handleMarkWatched}
                disabled={isWatched}
              >
                <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFillObject} />
                <Check
                  size={14}
                  color={isWatched ? '#4ade80' : '#ffffff'}
                  strokeWidth={isWatched ? 3 : 2}
                />
                <Text style={[styles.secondaryBtnText, isWatched && styles.watchedBtnText]}>
                  {isWatched ? 'Watched' : 'Watched?'}
                </Text>
              </Pressable>

              {/* Fix Match */}
              <Pressable
                style={styles.flexSecondaryBtn}
                onPress={() => {
                  const activeFile = item.localFile || (item.localFiles && item.localFiles[0]);
                  const initialQuery = activeFile ? cleanFilenameForSearch(activeFile.filename) : item.title;
                  setSearchQuery(initialQuery);
                  setSearchType(item.type);
                  performSearch(initialQuery, item.type);
                  setShowMatchModal(true);
                }}
              >
                <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFillObject} />
                <RefreshCw size={14} color="#ffffff" />
                <Text style={styles.secondaryBtnText}>Fix Match</Text>
              </Pressable>
            </View>

            {/* Row 2: Play / Continue Watching (full width) */}
            {item.type === 'movie' ? (
              <Pressable
                style={styles.playFullBtn}
                onPress={handlePlayMovie}
              >
                <Play size={16} color="#000000" fill="#000000" />
                <Text style={styles.playFullBtnText}>
                  {resume ? 'Continue Watching' : 'Play Movie'}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={[
                  styles.playFullBtn,
                  !resume && episodes.length === 0 && styles.playFullBtnDisabled
                ]}
                onPress={handlePlayTvShow}
                disabled={!resume && episodes.length === 0}
              >
                <Play size={16} color="#000000" fill="#000000" />
                <Text style={styles.playFullBtnText}>
                  {resume
                    ? resume.episodeNumber != null
                      ? `Continue Watching · E${resume.episodeNumber}`
                      : 'Continue Watching'
                    : episodes.length > 0
                      ? `Play Episode ${episodes[0].episodeNumber}`
                      : episodesLoading
                        ? 'Loading episodes...'
                        : 'No Matched Episodes'}
                </Text>
              </Pressable>
            )}
          </Animated.View>

          {/* ── TV: tabbed episodes / similar ─────────────────────────────── */}
          {item.type === 'tv' && (
            <Animated.View entering={FadeInDown.delay(250).duration(400)} style={styles.tvSection}>

              {/* Tab switcher */}
              <View style={styles.tvTabRow}>
                <Pressable
                  style={[styles.tvTab, tvTab === 'episodes' && styles.tvTabActive]}
                  onPress={() => setTvTab('episodes')}
                >
                  <Text style={[styles.tvTabText, tvTab === 'episodes' && styles.tvTabTextActive]}>
                    Seasons
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.tvTab, tvTab === 'similar' && styles.tvTabActive]}
                  onPress={() => setTvTab('similar')}
                >
                  <Text style={[styles.tvTabText, tvTab === 'similar' && styles.tvTabTextActive]}>
                    Similar Shows
                  </Text>
                </Pressable>
              </View>

              {tvTab === 'episodes' ? (
                <>
                  {/* Season chips */}
                  {(item.numberOfSeasons ?? 0) > 0 && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.seasonRow}
                    >
                      {Array.from({ length: item.numberOfSeasons ?? 0 }).map((_, i) => {
                        const s = i + 1;
                        const active = s === selectedSeason;
                        return (
                          <Animated.View key={s} entering={FadeInRight.delay(i * 35).duration(260)}>
                            <Pressable
                              style={[styles.seasonChip, active && styles.seasonChipActive]}
                              onPress={() => handleSeasonChange(s)}
                            >
                              <Text style={[styles.seasonChipText, active && styles.seasonChipTextActive]}>
                                Season {s}
                              </Text>
                            </Pressable>
                          </Animated.View>
                        );
                      })}
                    </ScrollView>
                  )}

                  {/* Episodes */}
                  {episodesLoading || loading ? (
                    <ActivityIndicator color="#ffffff" style={{ marginTop: 24 }} />
                  ) : episodes.length > 0 ? (
                    episodes.map((ep, i) => (
                      <EpisodeCard
                        key={ep.id}
                        episode={ep}
                        index={i}
                        onPlay={() => handlePlayEpisode(ep)}
                      />
                    ))
                  ) : (
                    <Text style={styles.noEpisodesText}>No episodes matched for this season.</Text>
                  )}
                </>
              ) : (
                /* Similar Shows tab */
                similarItems.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.similarRow}
                  >
                    {similarItems.map((sim, i) => (
                      <Animated.View
                        key={sim.id}
                        entering={FadeInRight.delay(i * 50).duration(300)}
                      >
                        <SimilarCard sim={sim} />
                      </Animated.View>
                    ))}
                  </ScrollView>
                ) : (
                  <Text style={styles.noEpisodesText}>No similar shows found.</Text>
                )
              )}
            </Animated.View>
          )}

          {/* ── Movie: similar movies ──────────────────────────────────────────── */}
          {item.type === 'movie' && similarItems.length > 0 && (
            <Animated.View entering={FadeInDown.delay(280).duration(400)} style={styles.similarSection}>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerLabel}>Similar Movies</Text>
                <View style={styles.dividerLine} />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.similarRow}
              >
                {similarItems.map((sim, i) => (
                  <Animated.View
                    key={sim.id}
                    entering={FadeInRight.delay(i * 50).duration(300)}
                  >
                    <SimilarCard sim={sim} />
                  </Animated.View>
                ))}
              </ScrollView>
            </Animated.View>
          )}
        </View>
      </Animated.ScrollView>

      {/* Manual Search Modal */}
      <Modal
        visible={showMatchModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMatchModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowMatchModal(false)}
        />
        <View style={styles.modalSheet}>
          <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFillObject} />
          
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Fix Match</Text>
            <Pressable
              style={styles.closeBtn}
              onPress={() => setShowMatchModal(false)}
            >
              <X size={18} color="#a1a1aa" />
            </Pressable>
          </View>

          {(() => {
            const activeFile = item.localFile || (item.localFiles && item.localFiles[0]);
            return activeFile ? (
              <View style={styles.modalSubtitleBlock}>
                <Text style={styles.modalSubLabel}>File to match:</Text>
                <Text style={styles.modalSubtitle} numberOfLines={2}>
                  {fileLabel(activeFile)}
                </Text>
              </View>
            ) : null;
          })()}

          {/* Search Inputs */}
          <View style={styles.searchBlock}>
            <View style={styles.searchInputRow}>
              <Search size={16} color="#71717a" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search movie or TV show title..."
                placeholderTextColor="#52525b"
                value={searchQuery}
                onChangeText={handleQueryChange}
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
                onPress={() => handleTypeChange("movie")}
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
                onPress={() => handleTypeChange("tv")}
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
          {searchLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#ffffff" />
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },

  // Top bar
  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 100,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  topBarBg: {
    backgroundColor: '#000000',
  },
  topBarBorderLine: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  topBarTitleBalance: {
    width: 44,
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#f4f4f5',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    paddingHorizontal: 8,
  },

  // Backdrop
  backdropContainer: {
    height: BACKDROP_HEIGHT,
    overflow: 'hidden',
  },

  // Poster — bottom-right, mirrors MediaCard posterOverlay
  posterWrap: {
    position: 'absolute',
    bottom: 24,
    right: 0,
    width: SCREEN_WIDTH * 0.32,
    aspectRatio: 3 / 4.25,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    overflow: 'hidden',
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 12,
  },
  poster: { width: '100%', height: '100%' },

  // Streaming providers overlay — top-right of backdrop
  providersOverlay: {
    position: 'absolute',
    top: 48,
    right: 16,
    flexDirection: 'row',
    gap: 8,
  },
  providerBtnOverlay: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  providerLogoOverlay: {
    width: 26,
    height: 26,
    borderRadius: 8,
  },

  // Left column — anchored bottom-left inside the backdrop, right edge stops before the poster
  leftColumn: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: SCREEN_WIDTH * 0.34 + 12,
    gap: 8,
  },

  // Info strip — sits at the bottom of leftColumn as a plain flex row
  infoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  infoStripPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  infoStripPillBorder: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  infoStripPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  infoStripDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  infoStripText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a1a1aa',
  },

  movieColor: { color: '#fbbf24' },
  tvColor: { color: '#93c5fd' },

  // Content body
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 20,
  },

  // Title / logo — inside leftColumn
  titleBlock: { gap: 8 },
  logo: { height: 54, width: '90%' },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#f4f4f5',
    letterSpacing: -0.6,
    lineHeight: 34,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  tagline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontStyle: 'italic',
    lineHeight: 18,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Badges (legacy — kept for potential reuse)
  badgesRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#e4e4e7' },

  // Genre pills — same style as LibraryView
  genreRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  genrePill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  genrePillText: { fontSize: 13, color: '#a1a1aa', fontWeight: '500' },

  // Actions — mirrors MediaCard's button row
  actionSectionContainer: {
    gap: 20,
    width: '100%',
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  providersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
  },
  providerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    maxWidth: '48%',
  },
  providerLogo: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  providerBtnText: {
    color: '#e4e4e7',
    fontWeight: '700',
    fontSize: 13,
    flexShrink: 1,
  },
  flexSecondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  watchedBtnActive: {
    borderColor: 'rgba(74,222,128,0.2)',
    backgroundColor: 'rgba(74,222,128,0.05)',
  },
  watchedBtnText: {
    color: '#4ade80',
    fontWeight: '600',
  },
  playFullBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#f8f8f8',
    paddingVertical: 16,
    borderRadius: 2,
  },
  playFullBtnDisabled: {
    opacity: 0.45,
  },
  playFullBtnText: {
    color: '#09090b',
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryBtnText: {
    color: '#e4e4e7',
    fontWeight: '700',
    fontSize: 14,
    zIndex: 1,
  },

  // Overview
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#52525b',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  overview: {
    fontSize: 15,
    color: '#a1a1aa',
    lineHeight: 24,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  expandButtonText: {
    fontSize: 13,
    color: '#60a5fa',
    fontWeight: '600',
  },

  // TV section
  tvSection: { gap: 16 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
  dividerLabel: {
    color: '#52525b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  seasonRow: { gap: 10, paddingBottom: 6 },
  seasonChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  seasonChipActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  seasonChipText: { color: '#a1a1aa', fontSize: 14, fontWeight: '600' },
  seasonChipTextActive: { color: '#f4f4f5', fontWeight: '800' },

  // Episode card — mirrors LibraryView listCard with blurred backdrop accent
  episodeCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#121214',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  episodeCardPressable: {
    width: '100%',
  },
  episodeCardBg: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.1,
  },
  episodeCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,12,0.85)',
  },
  episodeCardInner: {
    flexDirection: 'row',
    gap: 14,
    padding: 14,
  },
  // Still thumbnail wrapper — holds image + play overlay
  episodeStillWrap: {
    width: 120,
    height: 68,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#18181b',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeStill: {
    ...StyleSheet.absoluteFillObject,
  },
  episodePlayOverlay: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  episodeInfo: { flex: 1, gap: 6, justifyContent: 'center' },
  episodeNum: {
    fontSize: 11,
    fontWeight: '700',
    color: '#52525b',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  episodeName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f4f4f5',
    lineHeight: 20,
  },
  episodeMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  episodeMetaText: { fontSize: 12, color: '#71717a', fontWeight: '500' },
  episodeOverview: {
    fontSize: 13,
    color: '#a1a1aa',
    lineHeight: 18,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  noEpisodesText: {
    color: '#71717a',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 28,
    marginBottom: 28,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  modalSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.85,
    backgroundColor: "#121214",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  modalTitle: {
    color: "#f4f4f5",
    fontSize: 22,
    fontWeight: "800",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalSubtitleBlock: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 6,
  },
  modalSubLabel: {
    color: "#52525b",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  modalSubtitle: {
    color: "#a1a1aa",
    fontSize: 14,
    lineHeight: 20,
  },
  searchBlock: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  searchInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  searchIcon: {
    marginRight: 4,
  },
  searchInput: {
    flex: 1,
    color: "#f4f4f5",
    fontSize: 15,
    paddingVertical: 0,
  },
  typeSelector: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 4,
    gap: 4,
    alignSelf: "flex-start",
  },
  typeTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  typeTabActive: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  typeTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#71717a",
  },
  typeTabTextActive: {
    color: "#f4f4f5",
    fontWeight: "700",
  },
  resultsList: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 48,
  },
  noResults: {
    color: "#52525b",
    fontSize: 15,
    textAlign: "center",
    marginTop: 48,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  resultCard: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    alignItems: "center",
    gap: 16,
  },
  resultPoster: {
    width: 56,
    height: 84,
    borderRadius: 10,
    backgroundColor: "#18181b",
  },
  resultPosterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#18181b',
  },
  resultInfo: {
    flex: 1,
    gap: 6,
  },
  resultTitle: {
    color: "#f4f4f5",
    fontSize: 15,
    fontWeight: "800",
  },
  resultMeta: {
    color: "#71717a",
    fontSize: 12,
  },
  resultDesc: {
    color: "#a1a1aa",
    fontSize: 12,
    lineHeight: 18,
  },
  selectCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(74,222,128,0.08)",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },

  // TV tab switcher
  tvTabRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tvTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tvTabActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tvTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#71717a',
  },
  tvTabTextActive: {
    color: '#f4f4f5',
    fontWeight: '700',
  },

  // Similar cards
  similarSection: {
    gap: 16,
  },
  similarRow: {
    gap: 14,
    paddingBottom: 6,
    paddingRight: 6,
  },
  similarCard: {
    width: 130,
    gap: 8,
  },
  similarPoster: {
    width: 130,
    height: 195,
    borderRadius: 16,
    backgroundColor: '#18181b',
  },
  similarPosterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  similarTitle: {
    color: '#f4f4f5',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  similarMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  similarMetaText: {
    fontSize: 12,
    color: '#71717a',
    fontWeight: '500',
  },
  similarActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  similarActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  similarActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#a1a1aa',
  },
});

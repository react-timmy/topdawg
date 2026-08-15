/**
 * Netflix-style video player
 * Fixes applied:
 * - Video stays paused: useVideoPlayer status event → force play on readyToPlay
 * - Auto-hide chrome no longer fires while paused
 * - GestureDetector zones layer sits BELOW controls (zIndex fix) so buttons are tappable
 * - Audio & Subtitles panel slides in from the RIGHT (same as Episodes)
 * - Disabled Next Episode ghost has pointerEvents="none" so it never blocks taps
 * - setSpeed no longer closes the audio panel
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  Platform,
  Modal,
  ScrollView,
  Image,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import Slider from '@react-native-community/slider';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  FadeInUp,
  SlideInRight,
  SlideOutRight,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import {
  ChevronLeft,
  ChevronDown,
  Play,
  Pause,
  ListVideo,
  Captions,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  X,
  Check,
  Gauge,
  Lock,
  Unlock,
  Search,
  Download,
  AlignCenter,
  MoveVertical,
  Type,
} from 'lucide-react-native';

import { RootStackParamList, MediaItem, LocalFile } from '../types';
import { watchProgressService, COMPLETED_FRACTION } from '../storage/watchProgressService';
import { watchHistoryService } from '../storage/watchHistoryService';
import { useSubtitles } from '../hooks/useSubtitles';
import { SubtitleOverlay, SubtitleStyleConfig, SubtitleFontWeight, SubtitleBgOpacity } from '../components/SubtitleOverlay';
import { searchSubtitles, downloadSubtitleCues, SUBTITLE_LANGUAGES, SubtitleHit } from '../services/subtitleSearchService';
import { subtitleStorageService } from '../storage/subtitleStorageService';
import { CastButton } from '../components/CastButton';
import { WatchPartyBar } from '../components/WatchPartyBar';
import { useCast } from '../context/CastContext';
import { useWatchParty } from '../context/WatchPartyContext';

type VideoPlayerRouteProp = RouteProp<RootStackParamList, 'VideoPlayer'>;

const NF_RED = '#E50914';
const SKIP_SECONDS = 10;
const HIDE_MS = 4000;

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function epCode(f: LocalFile): string {
  if (f.seasonNumber != null && f.episodeNumber != null) {
    return `S${f.seasonNumber}:E${f.episodeNumber}`;
  }
  return '';
}

function sortEpisodes(files: LocalFile[]): LocalFile[] {
  return [...files].sort((a, b) => {
    const sa = a.seasonNumber ?? 0;
    const sb = b.seasonNumber ?? 0;
    if (sa !== sb) return sa - sb;
    return (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0);
  });
}

function fileKey(f: LocalFile): string {
  return `${f.uri}::${f.filename}`;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

// brightness removed — volume only on right-side pan

// ─── Skip icon (rotate arrow + "10" label) ────────────────────────────────────

function SkipIcon({ direction }: { direction: 'back' | 'forward' }) {
  const Icon = direction === 'back' ? RotateCcw : RotateCw;
  return (
    <View style={styles.skipIconWrap}>
      <Icon size={58} color="#ffffff" strokeWidth={2.2} />
      <Text style={styles.skipIconNum}>10</Text>
    </View>
  );
}

// ─── Countdown Overlay ────────────────────────────────────────────────────────

function CountdownOverlay({ startedAt, onComplete }: { startedAt: string; onComplete: () => void }) {
  const [count, setCount] = useState(3);
  // Track whether onComplete has already fired so we never call it twice.
  const completedRef = useRef(false);
  // Keep a stable ref to onComplete so the interval closure always sees the
  // latest callback without needing to re-register the interval.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(1);

  useEffect(() => {
    completedRef.current = false;
    const startTime = new Date(startedAt).getTime();
    const elapsed = Date.now() - startTime;
    const remaining = 3000 - elapsed;

    if (remaining <= 0) {
      setCount(0);
      return;
    }

    // Set initial count based on elapsed time
    const initialCount = Math.ceil(remaining / 1000);
    setCount(initialCount);

    const interval = setInterval(() => {
      // Pure state transition — never call side-effects inside an updater.
      setCount((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt]);

  // Fire onComplete exactly once when the count reaches 0, outside of render.
  useEffect(() => {
    if (count === 0 && !completedRef.current) {
      completedRef.current = true;
      onCompleteRef.current();
    }
  }, [count]);

  useEffect(() => {
    if (count === 0) return;
    // Animate each number
    scale.value = 0.5;
    opacity.value = 1;
    scale.value = withTiming(1.2, { duration: 300, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(0, { duration: 900 });
  }, [count, scale, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (count === 0) return null;

  return (
    <View style={styles.countdownOverlay} pointerEvents="none">
      <Text style={styles.countdownReady}>Ready?</Text>
      <Animated.Text style={[styles.countdownNumber, animStyle]}>
        {count}
      </Animated.Text>
    </View>
  );
}

// ─── Gesture HUD ──────────────────────────────────────────────────────────────

function GestureHud({ value }: { value: number }) {
  const barPct = Math.min(100, value * 100);
  const Icon = value <= 0.001 ? VolumeX : Volume2;
  return (
    <Animated.View entering={FadeIn.duration(100)} exiting={FadeOut.duration(180)} style={styles.gestureHud} pointerEvents="none">
      <Icon size={28} color="#ffffff" strokeWidth={2} />
      <View style={styles.gestureBarTrack}>
        <View style={[styles.gestureBarFill, { height: `${barPct}%` }]} />
      </View>
      <Text style={styles.gestureHudText}>{Math.round(value * 100)}%</Text>
    </Animated.View>
  );
}

// ─── Next-up countdown bar ────────────────────────────────────────────────────

const NEXT_UP_COUNTDOWN_MS = 10_000;

function NextUpCountdownBar({ onComplete }: { onComplete: () => void }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: NEXT_UP_COUNTDOWN_MS,
      easing: Easing.linear,
    }, (finished) => {
      if (finished) runOnJS(onComplete)();
    });
    return () => { cancelAnimation(progress); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View style={nextUpBarStyles.track}>
      <Animated.View style={[nextUpBarStyles.fill, fillStyle]} />
    </View>
  );
}

const nextUpBarStyles = StyleSheet.create({
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
    marginTop: 6,
  },
  fill: {
    height: '100%',
    backgroundColor: NF_RED,
    borderRadius: 2,
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export function VideoPlayerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<VideoPlayerRouteProp>();
  const initialItem = route.params.item;
  const initialStartPosition = route.params.startPosition ?? 0;
  const watchPartyRoomId = route.params.watchPartyRoomId;
  const insets = useSafeAreaInsets();

  // ── Cast & Watch Party ────────────────────────────────────────────────────
  const { notifyAirPlay, castState } = useCast();
  const party = useWatchParty();
  const { width: windowW, height: windowH } = useWindowDimensions();
  // Compact right sheet — wide enough for episode cards, not a half-screen slab
  const episodesPanelW = Math.min(300, Math.max(280, Math.round(windowW * 0.32)));

  const [item, setItem] = useState<MediaItem>(initialItem);
  const activeFile = item.localFile;
  const startPositionRef = useRef(initialStartPosition);
  const didSeekToStart = useRef(false);
  const lastSavedAt = useRef(0);

  const progressMediaId = useMemo(() => initialItem.id, [initialItem.id]);

  const episodes = useMemo(() => {
    const all = item.localFiles?.length ? item.localFiles : item.localFile ? [item.localFile] : [];
    return sortEpisodes(all);
  }, [item]);

  const currentEpIndex = useMemo(() => {
    if (!activeFile) return -1;
    const k = fileKey(activeFile);
    return episodes.findIndex((f) => fileKey(f) === k);
  }, [episodes, activeFile]);

  const nextEpisode = currentEpIndex >= 0 ? episodes[currentEpIndex + 1] : undefined;
  const prevEpisode = currentEpIndex > 0 ? episodes[currentEpIndex - 1] : undefined;

  // ── Season list (derived from all episodes) ───────────────────────────────
  const seasonNumbers = useMemo(() => {
    const nums = new Set<number>();
    let hasNull = false;
    for (const ep of episodes) {
      if (ep.seasonNumber != null) {
        nums.add(ep.seasonNumber);
      } else {
        hasNull = true;
      }
    }
    const arr = [...nums].sort((a, b) => a - b);
    if (hasNull && arr.length > 0) {
      arr.unshift(0); // 0 acts as 'Extras'
    }
    return arr;
  }, [episodes]);

  // Default: the season of the currently playing episode, else first season
  const defaultSeason = activeFile ? (activeFile.seasonNumber ?? (seasonNumbers.includes(0) ? 0 : null)) : (seasonNumbers[0] ?? null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(defaultSeason);

  // Track completed episodes
  const [completedEpisodes, setCompletedEpisodes] = useState<Set<string>>(new Set());

  // Episodes visible in the panel — filtered to selected season (or all if no seasons)
  const visibleEpisodes = useMemo(() => {
    if (seasonNumbers.length === 0 || selectedSeason === null) return episodes;
    return episodes.filter((ep) => (ep.seasonNumber ?? 0) === selectedSeason);
  }, [episodes, seasonNumbers, selectedSeason]);

  // Fetch completion status for all episodes when episodes list changes
  useEffect(() => {
    if (episodes.length === 0) return;
    
    const fetchCompletionStatus = async () => {
      const completed = new Set<string>();
      await Promise.all(
        episodes.map(async (ep) => {
          const progress = await watchProgressService.get(progressMediaId, ep);
          // Check if episode was watched to completion (progress will be cleared at 92%)
          // or if position is very close to duration
          if (!progress) {
            // No progress means either never watched OR completed (cleared at 92%)
            // We can't distinguish, so we'll assume not completed
            return;
          }
          if (progress.durationSeconds > 0) {
            const fraction = progress.positionSeconds / progress.durationSeconds;
            if (fraction >= COMPLETED_FRACTION) {
              completed.add(fileKey(ep));
            }
          }
        })
      );
      setCompletedEpisodes(completed);
    };

    void fetchCompletionStatus();
  }, [episodes, progressMediaId]);

  // ── Episodes panel scroll-to-active ──────────────────────────────────────
  const episodesScrollRef = useRef<ScrollView>(null);
  const epCardHeightRef = useRef<number>(78);

  // Capture latest values in refs so the scroll callback is never stale
  const visibleEpisodesRef = useRef(visibleEpisodes);
  const activeFileRef = useRef(activeFile);
  useEffect(() => { visibleEpisodesRef.current = visibleEpisodes; }, [visibleEpisodes]);
  useEffect(() => { activeFileRef.current = activeFile; }, [activeFile]);

  const scrollToActive = useCallback(() => {
    const eps = visibleEpisodesRef.current;
    const af  = activeFileRef.current;
    const activeIdx = af ? eps.findIndex((ep) => fileKey(ep) === fileKey(af)) : -1;
    if (activeIdx <= 0) return;
    const y = 14 + activeIdx * epCardHeightRef.current;
    episodesScrollRef.current?.scrollTo({ y, animated: true });
  }, []);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const showControlsRef = useRef(false); // mirror — always fresh, safe inside stale callbacks
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false); // mirror for use inside gesture callbacks
  const [showLockHint, setShowLockHint] = useState(false);

  // Sync showControlsRef whenever showControls changes
  useEffect(() => { showControlsRef.current = showControls; }, [showControls]);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [muted, setMuted] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreview, setSeekPreview] = useState(0);
  // ── Scrubber teleport: incrementing the key remounts the Slider with a fresh
  //    defaultValue, then we leave it uncontrolled so the native thumb moves
  //    freely — no more stutter on play/pause.
  const [sliderResetKey, setSliderResetKey] = useState(0);
  const sliderSeedRef = useRef(0);
  const sliderMaxRef = useRef(0); // locked once duration is first known
  const teleportSlider = useCallback((pos: number) => {
    sliderSeedRef.current = pos;
    setSliderResetKey((k) => k + 1);
  }, []);

  // ── Subtitle system ───────────────────────────────────────────────────────
  const subtitles = useSubtitles(currentTime, isPlaying);

  // ── Subtitle panel state ──────────────────────────────────────────────────
  const [subtitleOpen, setSubtitleOpen] = useState(false);
  const subtitleOpenRef = useRef(false);
  useEffect(() => { subtitleOpenRef.current = subtitleOpen; }, [subtitleOpen]);

  // Style prefs (persisted in component lifetime — survive panel open/close)
  const [subStyle, setSubStyle] = useState<SubtitleStyleConfig>({
    fontSize: 16,
    fontWeight: 'semibold',
    bgOpacity: 0.78,
  });
  // Vertical offset from bottom in px — draggable by the user
  const [subBottomOffset, setSubBottomOffset] = useState(72);

  // Auto-fetch via OpenSubtitles
  const [subSearchLang, setSubSearchLang] = useState('en');
  const [subSearchResults, setSubSearchResults] = useState<SubtitleHit[]>([]);
  const [subSearchState, setSubSearchState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [subDownloadingId, setSubDownloadingId] = useState<number | null>(null);
  const [subSearchError, setSubSearchError] = useState<string | null>(null);
  const [subLangPickerOpen, setSubLangPickerOpen] = useState(false);
  // Which tab is shown inside the subtitle panel
  const [subTab, setSubTab] = useState<'load' | 'style' | 'search'>('load');

  const handleSubtitleSearch = useCallback(async () => {
    const q = item.title;
    setSubSearchState('loading');
    setSubSearchError(null);
    setSubSearchResults([]);
    try {
      const results = await searchSubtitles({
        query: q,
        tmdbId: item.id,
        season: activeFile?.seasonNumber,
        episode: activeFile?.episodeNumber,
        language: subSearchLang,
      });
      setSubSearchResults(results);
      setSubSearchState('done');
    } catch (e: unknown) {
      setSubSearchError(e instanceof Error ? e.message : 'Search failed');
      setSubSearchState('error');
    }
  }, [subSearchLang, item, activeFile]);

  const handleSubtitleDownload = useCallback(async (hit: SubtitleHit) => {
    setSubDownloadingId(hit.fileId);
    try {
      const cues = await downloadSubtitleCues(hit.fileId);
      // Inject directly into the subtitles hook via its internal setter
      // (we do this by clearing + re-loading via the hook's public API)
      subtitles.injectCues(cues, hit.fileName);
    } catch (e: unknown) {
      setSubSearchError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setSubDownloadingId(null);
    }
  }, [subtitles]);

  const [episodesOpen, setEpisodesOpen] = useState(false);
  const episodesOpenRef = useRef(false);
  const audioOpenRef = useRef(false); // keeping ref for auto-hide guard compatibility
  useEffect(() => { episodesOpenRef.current = episodesOpen; }, [episodesOpen]);

  // ── Subtitle persistence ──────────────────────────────────────────────────
  // Auto-load: when the active file changes, check if we have a saved SRT for it
  useEffect(() => {
    if (!activeFile?.uri) return;
    void (async () => {
      const saved = await subtitleStorageService.load(activeFile.uri);
      if (!saved) return;
      // Re-read the SRT file from the saved URI and inject
      try {
        const FileSystem = await import('expo-file-system/legacy');
        const info = await FileSystem.getInfoAsync(saved.srtUri);
        if (!info.exists) {
          // File was moved/deleted — clean up the stale record
          await subtitleStorageService.clear(activeFile.uri);
          return;
        }
        const content = await FileSystem.readAsStringAsync(saved.srtUri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        const { parseSRT } = await import('../utils/srtParser');
        const cues = parseSRT(content);
        if (cues.length > 0) {
          subtitles.injectCues(cues, saved.filename);
        }
      } catch {
        // Silently skip — stale cache URI or file system error
      }
    })();
  // Only re-run when the active file changes, not on every subtitle state change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile?.uri]);

  // Auto-save: when a new SRT file is picked from device, persist the association
  useEffect(() => {
    if (!activeFile?.uri || !subtitles.srtUri || !subtitles.filename) return;
    void subtitleStorageService.save(activeFile.uri, subtitles.srtUri, subtitles.filename);
  }, [subtitles.srtUri, activeFile?.uri, subtitles.filename]);

  // Auto-clear persistence when user explicitly removes subtitles
  const handleClearSubtitles = useCallback(() => {
    subtitles.clearSubtitles();
    if (activeFile?.uri) {
      void subtitleStorageService.clear(activeFile.uri);
    }
  }, [subtitles, activeFile?.uri]);

  // ── Season/scroll effects (episodesOpen must be declared above these) ────
  // Reset season to the playing episode's season when panel opens
  useEffect(() => {
    if (!episodesOpen) return;
    setSelectedSeason(activeFile ? (activeFile.seasonNumber ?? (seasonNumbers.includes(0) ? 0 : null)) : (seasonNumbers[0] ?? null));
  }, [episodesOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to the active episode after the panel slide-in finishes (340ms)
  useEffect(() => {
    if (!episodesOpen) return;
    const t = setTimeout(scrollToActive, 340);
    return () => clearTimeout(t);
  }, [episodesOpen, scrollToActive]);

  // Re-scroll after user switches season
  useEffect(() => {
    if (!episodesOpen) return;
    const t = setTimeout(scrollToActive, 80);
    return () => clearTimeout(t);
  }, [selectedSeason]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showNextUp, setShowNextUp] = useState(false);
  const [videoFill, setVideoFill] = useState(false);
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownStartedAt, setCountdownStartedAt] = useState<string | null>(null);
  const pinchScale = useSharedValue(1);
  const panSideSV = useSharedValue(0);

  const [volume, setVolume] = useState(1);
  const [gestureHud, setGestureHud] = useState<number | null>(null); // volume 0-1
  const volumeStart = useRef(1);
  const gestureHudTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether this screen is still mounted — guards async callbacks (e.g.
  // the auto-hide setTimeout) from touching the native player after it has been
  // released on navigation away.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);
  /** Fires at most once per player mount — resets when active file changes. */
  const hasRecordedCompletionRef = useRef(false);
  /**
   * Counts seconds the user *actually played* (scrubbing does not increment
   * this). Completion is only recorded when both the playhead has reached
   * COMPLETED_FRACTION AND the user has genuinely played at least
   * MIN_PLAY_FRACTION of the total duration.
   */
  const activePlayedSecondsRef = useRef(0);
  /** Minimum fraction of duration that must be actively played before a
   *  completion event is accepted. Set to 0.5 = 50 %. */
  const MIN_PLAY_FRACTION = 0.5;

  // Reset completion/play counters on unmount so a remount starts fresh
  useEffect(() => {
    return () => {
      hasRecordedCompletionRef.current = false;
      activePlayedSecondsRef.current = 0;
    };
  }, []);
  const overlayOpacity = useSharedValue(0); // starts hidden — tap to reveal
  // Track height animates between thin (hidden) and bold (visible)
  const trackH = useSharedValue(2); // starts thin
  // Whether controls layer should receive touches (1 = yes, 0 = no)
  const controlsPointer = useSharedValue(1);

  const uri = activeFile?.uri || '';

  // Create the player ONCE with an empty source — never pass uri here.
  // Passing uri causes expo-video to recreate the native player on every episode
  // switch, which invalidates the old native handle and produces:
  //   "The 1st argument cannot be cast to type VideoPlayer (received class Integer)"
  // Instead we drive all source changes through player.replaceAsync() so the
  // native player instance stays alive for the full lifetime of this screen.
  const player = useVideoPlayer('', (p) => {
    p.loop = false;
  });

  const persistProgress = useCallback(async (position: number, dur: number) => {
    if (!activeFile?.uri) return;
    if (!Number.isFinite(position) || position < 0) return;
    await watchProgressService.save({
      mediaId: progressMediaId,
      fileUri: activeFile.uri,
      filename: activeFile.filename,
      positionSeconds: position,
      durationSeconds: dur > 0 ? dur : 0,
      seasonNumber: activeFile.seasonNumber,
      episodeNumber: activeFile.episodeNumber,
    });
  }, [activeFile, progressMediaId]);

  // ── Immersive system UI ────────────────────────────────────────────────────
  const setSystemUiImmersive = useCallback(async (immersive: boolean) => {
    try { StatusBar.setHidden(immersive, 'fade'); } catch { /* ignore */ }
    if (Platform.OS !== 'android') return;
    try {
      await NavigationBar.setBehaviorAsync('overlay-swipe');
      await NavigationBar.setButtonStyleAsync('light');
      await NavigationBar.setVisibilityAsync(immersive ? 'hidden' : 'visible');
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void setSystemUiImmersive(true);
    let sub: { remove: () => void } | undefined;
    if (Platform.OS === 'android') {
      try {
        sub = NavigationBar.addVisibilityListener(({ visibility }) => {
          if (visibility === 'visible') void NavigationBar.setVisibilityAsync('hidden');
        });
      } catch { /* ignore */ }
    }
    return () => {
      sub?.remove();
      try { StatusBar.setHidden(false, 'fade'); } catch { /* ignore */ }
      if (Platform.OS === 'android') void NavigationBar.setVisibilityAsync('visible').catch(() => {});
    };
  }, [setSystemUiImmersive]);

  // ── Subscribe to player status → play as soon as video is ready ──────────
  // autoPlayNextEp is set to true by the source-change effect before every
  // replaceAsync call (initial load + episode switches).  We guard on it here
  // so that a spurious readyToPlay event (e.g. after seek) doesn't force-play
  // while the user has intentionally paused.
  const autoPlayNextEp = useRef(false);
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status !== 'readyToPlay') return;

      // Guest in a watch party: always apply host sync on ready, regardless of
      // whether this was an auto-play load or a manual navigation.  The old
      // guard (autoPlayNextEp.current) meant that if the player was already
      // loaded when the guest opened the screen the host state was never applied.
      if (watchPartyRoomId && !party.isHost) {
        autoPlayNextEp.current = false;
        const hostPlayback = party.room?.playback;
        if (hostPlayback) {
          const latencyS = (Date.now() - new Date(hostPlayback.updatedAt).getTime()) / 1000;
          const targetPos = hostPlayback.isPlaying
            ? hostPlayback.positionSeconds + latencyS
            : hostPlayback.positionSeconds;
          try { player.currentTime = Math.max(0, targetPos); } catch { /* ignore */ }
          if (hostPlayback.isPlaying) { player.play(); setIsPlaying(true); }
        }
        // No host state yet (still in lobby) — leave paused; context sync will
        // apply the state once the host starts playing.
        return;
      }

      // Non-party path: only auto-play when a source change requested it.
      // This prevents spurious readyToPlay events (e.g. after a seek) from
      // force-playing while the user has intentionally paused.
      if (autoPlayNextEp.current) {
        autoPlayNextEp.current = false;
        player.play();
        setIsPlaying(true);
      }
    });
    return () => sub.remove();
  }, [player, watchPartyRoomId, party.isHost, party.room?.playback]);

  // ── Resume from saved position ─────────────────────────────────────────────
  useEffect(() => {
    if (!player || didSeekToStart.current) return;
    const target = startPositionRef.current;
    if (!target || target <= 0) { didSeekToStart.current = true; return; }
    const trySeek = () => {
      const d = player.duration || 0;
      if (d > 0 || player.currentTime >= 0) {
        const clamped = d > 0 ? Math.min(target, Math.max(0, d - 2)) : target;
        player.currentTime = clamped;
        setCurrentTime(clamped);
        teleportSlider(clamped);
        didSeekToStart.current = true;
      }
    };
    const t = setTimeout(trySeek, 350);
    const t2 = setTimeout(trySeek, 900);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [player, uri]);

  // ── Episode source change (handles both initial load and episode switches) ──
  // sourceReady is kept to debounce the initial empty-string → real URI transition.
  const sourceReady = useRef(false);
  useEffect(() => {
    // Reset on unmount so a remount starts fresh
    return () => { sourceReady.current = false; };
  }, []);
  useEffect(() => {
    if (!player || !uri) return;
    (async () => {
      try {
        // On the very first load sourceReady is false — treat same as an episode switch.
        const isInitialLoad = !sourceReady.current;
        sourceReady.current = true;

        if (isInitialLoad) {
          // First load: respect startPosition but do NOT force play yet;
          // statusChange → readyToPlay will handle it.
          autoPlayNextEp.current = true;
          didSeekToStart.current = startPositionRef.current <= 0;
        } else {
          // Episode switch: capture auto-play intent, reset state.
          const shouldPlay = isPlaying;
          autoPlayNextEp.current = shouldPlay;
          didSeekToStart.current = true;
          startPositionRef.current = 0;
          if (activeFile) {
            const saved = await watchProgressService.get(progressMediaId, activeFile);
            if (saved && saved.positionSeconds > 30) {
              startPositionRef.current = saved.positionSeconds;
              didSeekToStart.current = false;
            }
          }
          setCurrentTime(0);
          setShowNextUp(false);
          sliderMaxRef.current = 0;
          sliderSeedRef.current = startPositionRef.current; // Initialize slider to resume position
          setSliderResetKey((k) => k + 1);
          hasRecordedCompletionRef.current = false;
          activePlayedSecondsRef.current = 0;
        }

        await player.replaceAsync(uri);
        // Mark as played when video loads
        if (activeFile) {
          void watchProgressService.markAsPlayed(progressMediaId, activeFile);
        }
        // statusChange → readyToPlay fires play() automatically.
      } catch (e) { console.warn('[Player] replace source failed', e); }
    })();
  }, [uri]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist progress + active-play accumulation ───────────────────────────
  useEffect(() => {
    if (!player) return;
    const TICK_MS = 5000;
    const TICK_S  = TICK_MS / 1000; // 5 s per tick

    const interval = setInterval(() => {
      const t = player.currentTime;
      const d = player.duration || 0;
      const now = Date.now();
      if (now - lastSavedAt.current < TICK_MS) return;
      lastSavedAt.current = now;
      void persistProgress(t, d);

      // ── Accumulate genuine play time (only while playing, not while scrubbing) ──
      if (player.playing) {
        activePlayedSecondsRef.current += TICK_S;
      }

      // ── Record watch completion (fire-and-forget, at most once per file) ──
      // Two conditions must BOTH be true before a completion counts:
      //   1. Playhead has reached the end threshold (92%)
      //   2. User has genuinely played at least MIN_PLAY_FRACTION of the runtime
      //      — prevents awarding badges by scrubbing to the end.
      const enoughPlayTime =
        d > 0 &&
        activePlayedSecondsRef.current / d >= MIN_PLAY_FRACTION;

      if (
        d > 0 &&
        t / d >= COMPLETED_FRACTION &&
        enoughPlayTime &&
        !hasRecordedCompletionRef.current &&
        activeFile
      ) {
        hasRecordedCompletionRef.current = true;
        void watchHistoryService.recordCompletion({
          mediaId: item.id,
          title: item.title,
          type: item.type,
          genres: item.genres ?? [],
          runtime: item.runtime ?? (activeFile.duration ? Math.round(activeFile.duration / 60) : 0),
          posterUrl: item.posterUrl,
          seasonNumber: activeFile.seasonNumber,
          episodeNumber: activeFile.episodeNumber,
        }).then(() => watchHistoryService.getHistory());
      }
    }, TICK_MS);
    return () => {
      clearInterval(interval);
      try { void persistProgress(player.currentTime, player.duration || 0); } catch { /* ignore */ }
    };
  }, [player, persistProgress, activeFile, item]);

  // ── Top title ─────────────────────────────────────────────────────────────
  const topTitle = useMemo(() => {
    const f = activeFile;
    if (f?.episodeName?.trim()) return f.episodeName.trim();
    if (f?.seasonNumber != null && f?.episodeNumber != null) return `S${f.seasonNumber}:E${f.episodeNumber}`;
    if (f?.episodeNumber != null) return `Episode ${f.episodeNumber}`;
    return item.title;
  }, [activeFile, item.title]);

  // ── Landscape lock ────────────────────────────────────────────────────────
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => { ScreenOrientation.unlockAsync(); };
  }, []);

  // ── Intercept ALL back navigation (button + hardware/gesture back) ────────
  // This ensures portrait is restored and audio stops even when the user
  // dismisses via the Android back gesture instead of the in-player button.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      // Cancel the auto-hide timer immediately — if it fires after the native
      // player is released it throws "Cannot use shared object that was already released"
      if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
      if (gestureHudTimeout.current) clearTimeout(gestureHudTimeout.current);
      // Pause immediately so audio doesn't leak into the previous screen
      try { player?.pause(); } catch { /* ignore */ }
      // Persist progress on the way out
      try {
        if (player && activeFile) {
          void persistProgress(player.currentTime, player.duration || 0);
        }
      } catch { /* ignore */ }
      // Re-lock to portrait — runs before the screen is removed from the stack
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    });
    return unsubscribe;
  }, [navigation, player, activeFile, persistProgress]);

  // ── Sync initial volume ───────────────────────────────────────────────────
  useEffect(() => {
    if (!player) return;
    try { setVolume(clamp01(player.volume ?? 1)); } catch { /* ignore */ }
  }, [player]);

  // ── Ticker ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!player) return;
    const interval = setInterval(() => {
      const t = player.currentTime;
      const d = player.duration || 0;
      if (!isSeeking) setCurrentTime(t);
      setDuration(d);
      setIsPlaying(player.playing);
      // Lock slider max once duration is first known — prevents native thumb jump
      if (d > 0 && sliderMaxRef.current === 0) sliderMaxRef.current = d;
      if (nextEpisode && d > 0 && t >= d - 30 && t < d - 0.5) setShowNextUp(true);
      // ── Notify watch party context with fresh playback state ──────────────
      party.notifyPlayback(t, d, player.playing, false);
    }, 250);
    return () => clearInterval(interval);
  }, [player, isSeeking, nextEpisode, party]);

  // ── Watch Party: register PlayerBridge so context can seek/play guests ────
  useEffect(() => {
    if (!player) { party.registerPlayer(null); return; }
    party.registerPlayer({
      getPosition: () => { try { return player.currentTime; } catch { return 0; } },
      getDuration: () => { try { return player.duration || 0; } catch { return 0; } },
      seek: (pos) => { try { player.currentTime = pos; setCurrentTime(pos); teleportSlider(pos); } catch { /* ignore */ } },
      setPlaying: (play) => {
        try {
          if (play && !player.playing) { player.play(); setIsPlaying(true); }
          else if (!play && player.playing) { player.pause(); setIsPlaying(false); }
        } catch { /* ignore */ }
      },
    });
    return () => { party.registerPlayer(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  // ── Watch Party: auto-join room if navigated here from WatchPartyScreen ───
  // Guard on both isInParty AND isLoading: WatchPartyScreen may have already
  // called joinParty and the async result is still in-flight when this screen
  // mounts. Without the isLoading guard a second joinParty call races with the
  // first, causing two Firestore listeners and a play/pause flicker loop.
  useEffect(() => {
    if (!watchPartyRoomId || party.isInParty || party.isLoading) return;
    
    // Check if we have a playable file
    if (!activeFile?.uri) {
      Alert.alert(
        'Video Not Available',
        'You don\'t have this video file in your library. The host is watching something you need to download first.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
      return;
    }
    
    party.joinParty(watchPartyRoomId, initialItem).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchPartyRoomId, party.isInParty, party.isLoading]);

  // ── Watch Party: Handle countdown and sync ────────────────────────────────
  useEffect(() => {
    if (!party.room) return;

    // Show countdown when status is 'countdown'
    if (party.room.status === 'countdown' && party.room.countdownStartedAt) {
      setShowCountdown(true);
      setCountdownStartedAt(party.room.countdownStartedAt);
    } else {
      setShowCountdown(false);
    }

    // Auto-play when countdown finishes (status changes to 'playing')
    if (party.room.status === 'playing' && player && !player.playing) {
      player.play();
      setIsPlaying(true);
    }
  }, [party.room?.status, party.room?.countdownStartedAt, player]);

  // ── Cast: notify context when AirPlay external route becomes active ────────
  useEffect(() => {
    if (!player) return;
    // expo-video fires 'externalPlaybackChange' on iOS when AirPlay connects
    const sub = (player as any).addListener?.('externalPlaybackChange', ({ isExternalPlaybackActive }: { isExternalPlaybackActive: boolean }) => {
      notifyAirPlay(isExternalPlaybackActive);
    });
    return () => { sub?.remove?.(); };
  }, [player, notifyAirPlay]);

  // ── Auto-hide controls ────────────────────────────────────────────────────
  const scheduleHide = useCallback(() => {
    if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
    hideControlsTimeout.current = setTimeout(() => {
      // Guard: if the screen was unmounted (user navigated back) before this
      // timer fired, the native player has been released — bail out immediately
      // to avoid the "Cannot use shared object that was already released" crash.
      if (!isMountedRef.current) return;
      // Re-read player.playing at fire time — never hide while paused.
      // Use refs for panel state so opening/closing panels doesn't reschedule this timer.
      if (player?.playing && !episodesOpenRef.current && !audioOpenRef.current && !subtitleOpenRef.current) {
        setShowControls(false);
        overlayOpacity.value = withTiming(0, { duration: 500 });
        trackH.value = withTiming(2, { duration: 500 });
        controlsPointer.value = 0;
      }
    }, HIDE_MS);
  }, [player, overlayOpacity, trackH, controlsPointer]);

  const revealControls = useCallback(() => {
    if (lockedRef.current) return;
    setShowControls(true);
    overlayOpacity.value = withTiming(1, { duration: 220 });
    trackH.value = withTiming(4, { duration: 220 });
    controlsPointer.value = 1;
    // Only start the auto-hide countdown while playing — paused = stay visible
    if (player?.playing) scheduleHide();
  }, [player, overlayOpacity, trackH, controlsPointer, scheduleHide]);

  // scheduleHide is called explicitly from revealControls and resume-play only.
  // No reactive effect — avoids the timer being reset every 250ms by the ticker.

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const trackFillAnimStyle = useAnimatedStyle(() => ({ height: trackH.value }));
  // pointerEvents can't be animated directly — we derive it from controlsPointer
  // by using the state boolean showControls which is kept in sync.

  // ── Countdown Complete ────────────────────────────────────────────────────
  
  const handleCountdownComplete = useCallback(async () => {
    setShowCountdown(false);
    
    // Host: update room status to 'playing' and start broadcasting
    if (party.isHost && party.room) {
      try {
        const { watchPartyService } = await import('../services/watchPartyService');
        await watchPartyService.pushPlayback(party.room.roomId, {
          positionSeconds: 0,
          isPlaying: true,
          seekGeneration: 0,
        });
      } catch (e) {
        console.error('Failed to start playback:', e);
      }
    }

    // Everyone: start playing
    if (player) {
      player.play();
      setIsPlaying(true);
    }
  }, [party.isHost, party.room, player]);

  // ── Controls ──────────────────────────────────────────────────────────────

  const togglePlayPause = () => {
    if (!player) return;
    if (player.playing) {
      player.pause();
      setIsPlaying(false);
      // Show controls and cancel any pending hide — stay visible until user taps away
      setShowControls(true);
      overlayOpacity.value = withTiming(1, { duration: 220 });
      trackH.value = withTiming(4, { duration: 220 });
      controlsPointer.value = 1;
      if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
    } else {
      player.play();
      setIsPlaying(true);
      revealControls(); // resumes with auto-hide
    }
  };

  const skipBy = useCallback((delta: number) => {
    if (!player || lockedRef.current) return;
    const wasPlaying = player.playing;
    const next = Math.max(0, Math.min(player.duration || 0, player.currentTime + delta));
    player.currentTime = next;
    setCurrentTime(next);
    teleportSlider(next);
    // Restore play state — some expo-video versions internally pause on currentTime assignment.
    // Do NOT call setIsPlaying here — play state hasn't changed, we're just seeking.
    if (wasPlaying) {
      player.play();
    }
    // Only show controls if they are already visible — skip should never pop controls
    // open when the user has tapped them away (fixes double-tap revealing controls).
    if (showControlsRef.current) {
      scheduleHide();
    }
  }, [player, teleportSlider, scheduleHide]);

  const hideGestureHudSoon = useCallback(() => {
    if (gestureHudTimeout.current) clearTimeout(gestureHudTimeout.current);
    gestureHudTimeout.current = setTimeout(() => setGestureHud(null), 700);
  }, []);

  // Left-side pan is a no-op (brightness removed)
  const beginVolumeGesture = useCallback(() => {
    volumeStart.current = volume;
    if (gestureHudTimeout.current) clearTimeout(gestureHudTimeout.current);
  }, [volume]);

  const updateVolumeGesture = useCallback((translationY: number) => {
    if (!player) return;
    const delta = -translationY / (Math.max(windowH, 240) * 0.5);
    const next = clamp01(volumeStart.current + delta);
    player.volume = next;
    if (next > 0 && player.muted) { player.muted = false; setMuted(false); }
    setVolume(next);
    setGestureHud(next);
  }, [player, windowH]);

  const endVolumeGesture = useCallback(() => { hideGestureHudSoon(); }, [hideGestureHudSoon]);

  const onSingleTapChrome = useCallback(() => {
    if (locked) {
      // While locked — just flash the lock icon so user knows how to unlock
      setShowLockHint(true);
      setTimeout(() => setShowLockHint(false), 2000);
      return;
    }
    if (showControls) {
      // Don't hide controls on tap if video is paused
      if (!player?.playing) return;
      
      setShowControls(false);
      overlayOpacity.value = withTiming(0, { duration: 380 });
      trackH.value = withTiming(2, { duration: 380 });
      controlsPointer.value = 0;
      if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
    } else {
      revealControls();
    }
  }, [locked, showControls, overlayOpacity, trackH, controlsPointer, revealControls, player]);

  const onDoubleTapSide = useCallback((side: 'left' | 'right') => {
    skipBy(side === 'left' ? -SKIP_SECONDS : SKIP_SECONDS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  const applyVideoFill = useCallback((fill: boolean) => { setVideoFill(fill); }, []);

  // ── Gestures ──────────────────────────────────────────────────────────────
  const playerGestures = useMemo(() => {
    const midX = windowW / 2;

    const pinch = Gesture.Pinch()
      .onUpdate((e) => { pinchScale.value = Math.min(2.2, Math.max(0.55, e.scale)); })
      .onEnd((e) => {
        if (e.scale > 1.12) runOnJS(applyVideoFill)(true);
        else if (e.scale < 0.9) runOnJS(applyVideoFill)(false);
        pinchScale.value = withTiming(1, { duration: 160 });
      })
      .onFinalize(() => { pinchScale.value = withTiming(1, { duration: 160 }); });

    const pan = Gesture.Pan()
      .maxPointers(1)
      .activeOffsetY([-10, 10])
      .failOffsetX([-24, 24])
      .onBegin((e) => {
        panSideSV.value = e.x < midX ? 0 : 1;
        // Left side: no-op (brightness removed). Right side: volume.
        if (e.x >= midX) runOnJS(beginVolumeGesture)();
      })
      .onUpdate((e) => {
        if (panSideSV.value === 1) runOnJS(updateVolumeGesture)(e.translationY);
      })
      .onEnd(() => {
        if (panSideSV.value === 1) runOnJS(endVolumeGesture)();
      })
      .onFinalize(() => {
        if (panSideSV.value === 1) runOnJS(endVolumeGesture)();
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(280)
      .onEnd((e) => {
        const side = e.x < midX ? 'left' : 'right';
        runOnJS(onDoubleTapSide)(side);
      });

    const singleTap = Gesture.Tap()
      .numberOfTaps(1)
      .onEnd(() => { runOnJS(onSingleTapChrome)(); });

    return Gesture.Simultaneous(pinch, Gesture.Exclusive(pan, doubleTap, singleTap));
  }, [
    windowW, pinchScale, panSideSV, applyVideoFill,
    beginVolumeGesture, updateVolumeGesture, endVolumeGesture,
    onDoubleTapSide, onSingleTapChrome,
  ]);

  const videoPinchStyle = useAnimatedStyle(() => ({ transform: [{ scale: pinchScale.value }] }));

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleBack = () => {
    // beforeRemove listener handles progress save, player pause, and portrait lock.
    // Guard with canGoBack() — if the player was launched as the initial route
    // (e.g. from a deep-link) there is nothing to pop and GO_BACK would crash.
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  const handleSeekComplete = (value: number) => {
    if (!player) return;
    player.currentTime = value;
    setCurrentTime(value);
    teleportSlider(value);
    setIsSeeking(false);
    // Resume play after seek if was playing
    if (isPlaying) player.play();
    revealControls();
    // Snap subtitle cue to the new position immediately
    subtitles.seek(value);
  };

  const playEpisode = (file: LocalFile) => {
    setItem((prev) => ({
      ...prev,
      localFile: file,
      title: file.seasonNumber != null && file.episodeNumber != null
        ? `${initialItem.title.replace(/\s*-\s*S\d+E\d+.*$/i, '')} - S${String(file.seasonNumber).padStart(2, '0')}E${String(file.episodeNumber).padStart(2, '0')}`
        : prev.title,
    }));
    setEpisodesOpen(false);
    setShowNextUp(false);
    // Always auto-play when the user explicitly picks an episode (or next-episode fires).
    // The statusChange → readyToPlay listener will call player.play(), but we also mark
    // isPlaying true now so the UI reflects intent immediately.
    setIsPlaying(true);
  };

  const handleNextEpisode = () => { if (nextEpisode) playEpisode(nextEpisode); };
  const handlePrevEpisode = () => { if (prevEpisode) playEpisode(prevEpisode); };

  // FIX: setSpeed does NOT close the audio panel
  const setSpeed = (rate: number) => {
    setPlaybackSpeed(rate);
    if (player) player.playbackRate = rate;
  };

  const toggleMute = () => {
    if (!player) return;
    const next = !muted;
    player.muted = next;
    setMuted(next);
  };

  const toggleLock = () => {
    const next = !locked;
    setLocked(next);
    lockedRef.current = next;
    setShowLockHint(false);
    if (next) {
      // Locking — hide full controls, only lock button remains accessible
      setShowControls(false);
      overlayOpacity.value = withTiming(0, { duration: 300 });
      trackH.value = withTiming(2, { duration: 300 });
      controlsPointer.value = 0;
      if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
    } else {
      // Unlocking — reveal controls
      revealControls();
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const sliderMax = sliderMaxRef.current > 0 ? sliderMaxRef.current : 1;
  const scrubValue = isSeeking ? seekPreview : currentTime;
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (scrubValue / duration) * 100)) : 0;
  const padH = Math.max(insets.left, insets.right, 16);
  const padTop = Math.max(insets.top, 8);
  const padBot = Math.max(insets.bottom, 10);
  const nextEpisodeLabel = useMemo(
    () => nextEpisode
      ? nextEpisode.episodeName?.trim() || (nextEpisode.episodeNumber != null ? `Episode ${nextEpisode.episodeNumber}` : epCode(nextEpisode) || 'Next')
      : '',
    [nextEpisode],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar hidden barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Video layer — zIndex 0 */}
      <Animated.View style={[styles.videoWrap, videoPinchStyle]}>
        <VideoView
          style={[styles.video, (episodesOpen || subtitleOpen) && { opacity: 0.45 }]}
          player={player}
          allowsFullscreen={false}
          allowsPictureInPicture
          nativeControls={false}
          contentFit={videoFill ? 'cover' : 'contain'}
        />
      </Animated.View>

      {/*
        FIX: GestureDetector zones sit at zIndex 2 — BELOW the controls (zIndex 6).
        This means button Pressables receive touches first; the gesture only fires
        on the bare video area where no button sits.
      */}
      <GestureDetector gesture={playerGestures}>
        <View style={styles.zones} />
      </GestureDetector>

      {/* Subtitle overlay — zIndex 4, sits above video + gesture zones, below controls */}
      <SubtitleOverlay
        cue={subtitles.activeCue}
        subtitleStyle={subStyle}
        bottomOffset={showControls && subBottomOffset < 106 ? 106 : subBottomOffset}
        horizontalPadding={padH}
      />

      {/* Gesture HUD — zIndex 5, pointer-events none */}
      {/* Volume HUD — always on the right side */}
      {gestureHud !== null && (
        <View style={[styles.gestureHudAnchor, styles.gestureHudRight]} pointerEvents="none">
          <GestureHud value={gestureHud} />
        </View>
      )}

      {/* Skip flash removed — double-tap still works, no overlay shown */}

      {/* Watch Party Bar — floats above video, below controls */}
      <WatchPartyBar
        visible={showControls}
        onPress={() => {
          if (party.room) {
            navigation.navigate('WatchParty', { roomId: party.room.roomId, item });
          }
        }}
      />

      {/* Countdown Overlay — shows 3-2-1 countdown before video starts */}
      {showCountdown && countdownStartedAt && (
        <CountdownOverlay
          startedAt={countdownStartedAt}
          onComplete={handleCountdownComplete}
        />
      )}

      {/* Controls overlay — always mounted, fades in/out via overlayOpacity */}
      <Animated.View
        style={[styles.controlsRoot, overlayStyle]}
        pointerEvents={showControls ? 'box-none' : 'none'}
      >
        {/* TOP */}
        <LinearGradient
          colors={['rgba(0,0,0,0.75)', 'rgba(0,0,0,0.25)', 'transparent']}
          style={[styles.topGradient, { paddingTop: padTop, paddingHorizontal: padH }]}
          pointerEvents="box-none"
        >
          <View style={styles.topRow}>
            <Pressable onPress={handleBack} hitSlop={14} style={styles.topIconBtn}>
              <ChevronLeft size={28} color="#ffffff" strokeWidth={2.4} />
            </Pressable>
            <Text style={styles.topTitle} numberOfLines={1}>{topTitle}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              {/* Cast to TV */}
              <CastButton item={item} currentPosition={currentTime} size={20} color="#ffffff" />
              {/* Mute button */}
              <Pressable onPress={toggleMute} hitSlop={14} style={styles.topIconBtn}>
                {muted 
                  ? <VolumeX size={20} color="#a1a1aa" strokeWidth={2} /> 
                  : <Volume2 size={20} color="#ffffff" strokeWidth={2} />}
              </Pressable>
              {/* Lock button */}
              <Pressable onPress={toggleLock} hitSlop={14} style={styles.topIconBtn}>
                {locked
                  ? <Lock size={20} color={NF_RED} strokeWidth={2} />
                  : <Unlock size={20} color="#ffffff" strokeWidth={2} />}
              </Pressable>
            </View>
          </View>
        </LinearGradient>

        {/* CENTER transport */}
        <View style={styles.centerRow} pointerEvents="box-none">
          <Pressable onPress={() => skipBy(-SKIP_SECONDS)} style={styles.centerHit} hitSlop={20}>
            <SkipIcon direction="back" />
          </Pressable>
          <Pressable onPress={togglePlayPause} style={styles.playHit} hitSlop={16}>
            {isPlaying
              ? <Pause size={58} color="#ffffff" fill="#ffffff" />
              : <Play size={58} color="#ffffff" fill="#ffffff" style={{ marginLeft: 5 }} />}
          </Pressable>
          <Pressable onPress={() => skipBy(SKIP_SECONDS)} style={styles.centerHit} hitSlop={20}>
            <SkipIcon direction="forward" />
          </Pressable>
        </View>

        {/* BOTTOM scrubber + action row */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
          locations={[0, 0.35, 1]}
          style={[styles.bottomGradient, { paddingBottom: padBot, paddingHorizontal: padH }]}
          pointerEvents="box-none"
        >
          {/* Scrubber — no thumb, animated track height */}
          <View style={styles.scrubRow}>
            <View style={styles.sliderWrap}>
              {/* Track background */}
              <View style={styles.trackBg} />
              {/* Animated red fill — tall when controls visible, slim when hidden */}
              <Animated.View
                style={[styles.trackFillBase, trackFillAnimStyle, { width: `${progressPct}%` }]}
              />
              {/* Invisible Slider on top for touch interaction (no thumb) */}
              <Slider
                key={sliderResetKey}
                style={styles.slider}
                minimumValue={0}
                maximumValue={sliderMax}
                value={sliderSeedRef.current}
                onSlidingStart={(v) => {
                  setIsSeeking(true);
                  setSeekPreview(v);
                  if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
                }}
                onValueChange={(v) => setSeekPreview(v)}
                onSlidingComplete={handleSeekComplete}
                minimumTrackTintColor="transparent"
                maximumTrackTintColor="transparent"
                thumbTintColor="transparent"
              />
            </View>
            <Text style={styles.remainingTime}>
              {duration > 0 ? formatClock(Math.max(0, duration - scrubValue)) : '0:00'}
            </Text>
          </View>

          {/* Action row */}
          <View style={styles.actionRow}>
            {/* Previous episode */}
            {prevEpisode ? (
              <Pressable style={styles.actionBtn} onPress={handlePrevEpisode}>
                <SkipBack size={20} color="#ffffff" strokeWidth={1.8} fill="#ffffff" />
                <Text style={styles.actionLabel} numberOfLines={1}>Prev episode</Text>
              </Pressable>
            ) : (
              <View style={[styles.actionBtn, { opacity: 0.28 }]} pointerEvents="none">
                <SkipBack size={20} color="#ffffff" strokeWidth={1.8} />
                <Text style={styles.actionLabel} numberOfLines={1}>Prev episode</Text>
              </View>
            )}

            {/* Episodes — TV only */}
            {item.type === 'tv' && episodes.length > 0 ? (
              <Pressable style={styles.actionBtn} onPress={() => { setEpisodesOpen(true); if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current); }}>
                <ListVideo size={20} color="#ffffff" strokeWidth={1.8} />
                <Text style={styles.actionLabel} numberOfLines={1}>Episodes</Text>
              </Pressable>
            ) : (
              <View style={styles.actionBtn} pointerEvents="none" />
            )}

            {/* Subtitles */}
            <Pressable style={styles.actionBtn} onPress={() => { setSubtitleOpen(true); if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current); }}>
              <Captions size={20} color={subtitles.loadState === 'ready' && subtitles.enabled ? NF_RED : '#ffffff'} strokeWidth={1.8} />
              <Text style={[styles.actionLabel, subtitles.loadState === 'ready' && subtitles.enabled && { color: NF_RED }]} numberOfLines={1}>Subtitles</Text>
            </Pressable>

            {/* Next episode */}
            {nextEpisode ? (
              <Pressable style={styles.actionBtn} onPress={handleNextEpisode}>
                <SkipForward size={20} color="#ffffff" strokeWidth={1.8} fill="#ffffff" />
                <Text style={styles.actionLabel} numberOfLines={1}>Next episode</Text>
              </Pressable>
            ) : (
              <View style={[styles.actionBtn, { opacity: 0.28 }]} pointerEvents="none">
                <SkipForward size={20} color="#ffffff" strokeWidth={1.8} />
                <Text style={styles.actionLabel} numberOfLines={1}>Next episode</Text>
              </View>
            )}
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Next episode end-card */}
      {showNextUp && nextEpisode && !showControls && (
        <Animated.View
          entering={FadeInUp.duration(280)}
          style={[styles.nextUpCard, { bottom: padBot + 16, right: padH }]}
        >
          {/* Dismiss X */}
          <Pressable
            onPress={() => setShowNextUp(false)}
            hitSlop={10}
            style={styles.nextUpDismiss}
          >
            <X size={14} color="#71717a" strokeWidth={2.5} />
          </Pressable>
          <Text style={styles.nextUpLabel}>Next Episode</Text>
          <Text style={styles.nextUpTitle} numberOfLines={2}>{nextEpisodeLabel}</Text>
          <NextUpCountdownBar onComplete={handleNextEpisode} />
          <Pressable style={styles.nextUpBtn} onPress={handleNextEpisode}>
            <Play size={14} color="#000" fill="#000" />
            <Text style={styles.nextUpBtnText}>Play Now</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* ── Episodes panel (slides in from the right) ─────────────────────── */}
      <Modal
        visible={episodesOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEpisodesOpen(false)}
        statusBarTranslucent
      >
        <View style={[styles.sideModalRoot, { justifyContent: 'flex-end' }]}>
          <Pressable style={styles.sideBackdrop} onPress={() => { setEpisodesOpen(false); if (player?.playing) scheduleHide(); }} />
          <Animated.View
            entering={SlideInRight.duration(280)}
            exiting={SlideOutRight.duration(260)}
            style={[
              styles.sidePanel,
              {
                width: episodesPanelW,
                marginTop: 0,
                marginBottom: 0,
                marginRight: 0,
                borderRadius: 0,
              }
            ]}
          >
            <BlurView intensity={75} tint="dark" style={StyleSheet.absoluteFillObject} />

            {/* Header — elevated so season dropdown paints above episode list */}
            <View style={styles.panelHeaderWrap}>
              <View style={styles.panelHeaderInner}>
                <View style={styles.panelHeaderText}>
                  <Text style={styles.panelTitle}>Episodes</Text>
                  <Text style={styles.panelSubtitle} numberOfLines={1}>
                    {initialItem.title.replace(/\s*-\s*S\d+E\d+.*$/i, '')}
                  </Text>
                </View>

                <Pressable
                  onPress={() => { setEpisodesOpen(false); if (player?.playing) scheduleHide(); }}
                  style={styles.panelCloseBtn}
                  hitSlop={10}
                >
                  <X size={18} color="#a1a1aa" />
                </Pressable>
              </View>

              {/* Season picker — horizontal scroll of pills */}
              {seasonNumbers.length > 1 && (
                <View style={styles.seasonPillWrap}>
                  <ScrollView
                    horizontal={true}
                    showsHorizontalScrollIndicator={false}
                    scrollEventThrottle={16}
                    contentContainerStyle={styles.seasonPillScrollContent}
                    style={styles.seasonPillScroll}
                  >
                    {seasonNumbers.map((s) => {
                      const isActive = s === selectedSeason;
                      const epCount = episodes.filter((e) => e.seasonNumber === s).length;
                      return (
                        <Pressable
                          key={s}
                          style={[
                            styles.seasonPill,
                            isActive && styles.seasonPillActive,
                          ]}
                          onPress={() => setSelectedSeason(s)}
                        >
                          <Text style={[
                            styles.seasonPillText,
                            isActive && styles.seasonPillTextActive,
                          ]}>
                            {s === 0 ? 'Extras' : `Season ${s}`}
                          </Text>
                          <Text style={[
                            styles.seasonPillEpCount,
                            isActive && styles.seasonPillEpCountActive,
                          ]}>
                            {epCount} ep{epCount !== 1 ? 's' : ''}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              <View style={styles.panelHeaderDivider} />
            </View>

            <ScrollView
              ref={episodesScrollRef}
              style={styles.panelScroll}
              contentContainerStyle={[styles.panelScrollContent, { paddingBottom: Math.max(padBot, 24) + 12 }]}
              showsVerticalScrollIndicator={false}
            >
              {visibleEpisodes.length === 0 && (
                <View style={styles.panelEmptyWrap}>
                  <ListVideo size={32} color="#3f3f46" strokeWidth={1.5} />
                  <Text style={styles.panelEmpty}>No matched episodes in your library for this title.</Text>
                </View>
              )}
              {visibleEpisodes.map((ep, i) => {
                const active = activeFile && fileKey(ep) === fileKey(activeFile);
                const isCompleted = completedEpisodes.has(fileKey(ep));
                const displayName =
                  ep.episodeName?.trim() ||
                  (ep.episodeNumber != null ? `Episode ${ep.episodeNumber}` : epCode(ep) || `Episode ${i + 1}`);
                const code = epCode(ep) || `Episode ${i + 1}`;
                return (
                  <Pressable
                    key={fileKey(ep)}
                    style={({ pressed }) => [styles.epCard, active && styles.epCardActive, { opacity: pressed ? 0.75 : 1 }]}
                    onPress={() => playEpisode(ep)}
                    onLayout={i === 0 ? (e) => {
                      const h = e.nativeEvent.layout.height;
                      if (h > 0) epCardHeightRef.current = h + 10; // add marginBottom
                    } : undefined}
                  >
                    {ep.stillUrl && (
                      <Image source={{ uri: ep.stillUrl }} style={styles.epCardBg} blurRadius={18} />
                    )}
                    <View style={styles.epCardOverlay} />

                    <View style={styles.epCardInner}>
                      <View style={styles.epStillWrap}>
                        {ep.stillUrl ? (
                          <Image source={{ uri: ep.stillUrl }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                        ) : (
                          <View style={styles.epStillPlaceholder} />
                        )}
                        <View style={styles.epPlayOverlay}>
                          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
                          <Play size={14} color="#fff" fill="#fff" />
                        </View>
                        {active && <View style={styles.epActiveDot} />}
                        {isCompleted && !active && (
                          <View style={styles.epCompletedBadge}>
                            <Check size={12} color="#4ade80" strokeWidth={2.5} />
                          </View>
                        )}
                      </View>

                      <View style={styles.epMeta}>
                        <Text style={styles.epCode}>
                          {code}
                          {active ? '  ·  Now Playing' : isCompleted ? '  ·  Watched' : ''}
                        </Text>
                        <Text style={styles.epName} numberOfLines={2}>{displayName}</Text>
                      </View>

                      {active && <Check size={16} color={NF_RED} strokeWidth={2.5} />}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      {/* ── Subtitles panel — slides in from the RIGHT ── */}
      <Modal
        visible={subtitleOpen}
        transparent
        animationType="fade"
        onRequestClose={() => { setSubtitleOpen(false); if (player?.playing) scheduleHide(); }}
        statusBarTranslucent
      >
        <View style={[styles.sideModalRoot, { justifyContent: 'flex-end' }]}>
          <Pressable style={styles.sideBackdrop} onPress={() => { setSubtitleOpen(false); setSubLangPickerOpen(false); if (player?.playing) scheduleHide(); }} />
          <Animated.View
            entering={SlideInRight.duration(280)}
            exiting={SlideOutRight.duration(260)}
            style={[
              styles.sidePanel,
              {
                width: Math.min(320, Math.max(300, Math.round(episodesPanelW * 1.05))),
                marginTop: 0,
                marginBottom: 0,
                marginRight: 0,
              }
            ]}
          >
            <BlurView intensity={75} tint="dark" style={StyleSheet.absoluteFillObject} />
            {/* ── Header ── */}
            <View style={styles.panelHeaderWrap}>
              <View style={styles.panelHeaderInner}>
                <View style={styles.panelHeaderText}>
                  <Text style={styles.panelTitle}>Subtitles</Text>
                  <Text style={styles.panelSubtitle} numberOfLines={1}>
                    {subtitles.loadState === 'ready' ? `${subtitles.cueCount} cues · ${subtitles.filename ?? ''}` : topTitle}
                  </Text>
                </View>
                <Pressable onPress={() => { setSubtitleOpen(false); setSubLangPickerOpen(false); if (player?.playing) scheduleHide(); }} style={styles.panelCloseBtn} hitSlop={10}>
                  <X size={18} color="#a1a1aa" />
                </Pressable>
              </View>

              {/* ── Tab bar: Load / Style / Search ── */}
              <View style={styles.subTabBar}>
                {(['load', 'style', 'search'] as const).map((tab) => (
                  <Pressable
                    key={tab}
                    style={[styles.subTab, subTab === tab && styles.subTabActive]}
                    onPress={() => setSubTab(tab)}
                  >
                    <Text style={[styles.subTabText, subTab === tab && styles.subTabTextActive]}>
                      {tab === 'load' ? 'Load SRT' : tab === 'style' ? 'Style' : 'Auto-Fetch'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.panelHeaderDivider} />
            </View>

            <ScrollView
              style={styles.panelScroll}
              contentContainerStyle={[styles.panelScrollContent, { paddingBottom: Math.max(padBot, 24) + 12 }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >

              {/* ══════════════ LOAD TAB ══════════════ */}
              {subTab === 'load' && (
                <>
                  {/* Pick SRT from device */}
                  <Text style={styles.audioSectionLabel}>From Device</Text>
                  <Pressable
                    style={({ pressed }) => [styles.audioOptionRow, { opacity: pressed ? 0.7 : 1 }]}
                    onPress={subtitles.pickSubtitleFile}
                  >
                    <View style={[styles.audioOptionIcon, subtitles.loadState === 'ready' && styles.audioOptionIconActive]}>
                      <Captions size={16} color={subtitles.loadState === 'ready' ? NF_RED : '#a1a1aa'} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.audioOptionText}>
                        {subtitles.loadState === 'loading' ? 'Opening…' : subtitles.loadState === 'ready' ? (subtitles.filename ?? 'Subtitle loaded') : 'Load .srt file…'}
                      </Text>
                      {subtitles.loadState === 'ready' && <Text style={styles.audioTrackSub}>{subtitles.cueCount} cues · tap to replace</Text>}
                      {subtitles.loadState === 'idle' && <Text style={styles.audioTrackSub}>Pick a .srt subtitle file from your device</Text>}
                      {subtitles.loadState === 'error' && <Text style={[styles.audioTrackSub, { color: '#f87171' }]}>{subtitles.error}</Text>}
                    </View>
                  </Pressable>

                  {/* Enable / disable */}
                  {subtitles.loadState === 'ready' && (
                    <Pressable
                      style={({ pressed }) => [styles.audioOptionRow, { opacity: pressed ? 0.7 : 1, marginTop: 6 }]}
                      onPress={subtitles.toggleEnabled}
                    >
                      <View style={[styles.audioOptionIcon, subtitles.enabled && styles.audioOptionIconActive]}>
                        {subtitles.enabled ? <Check size={16} color={NF_RED} strokeWidth={2.5} /> : <X size={16} color="#52525b" strokeWidth={2} />}
                      </View>
                      <Text style={[styles.audioOptionText, !subtitles.enabled && styles.audioOptionTextMuted]}>
                        {subtitles.enabled ? 'Subtitles on' : 'Subtitles off'}
                      </Text>
                    </Pressable>
                  )}

                  {/* Clear */}
                  {subtitles.loadState === 'ready' && (
                    <Pressable
                      style={({ pressed }) => [styles.audioOptionRow, { opacity: pressed ? 0.7 : 1, marginTop: 6 }]}
                      onPress={handleClearSubtitles}
                    >
                      <View style={styles.audioOptionIcon}>
                        <X size={16} color="#52525b" strokeWidth={2} />
                      </View>
                      <Text style={[styles.audioOptionText, styles.audioOptionTextMuted]}>Remove subtitles</Text>
                    </Pressable>
                  )}

                  {/* Playback speed — moved here from the old Audio panel */}
                  <Text style={[styles.audioSectionLabel, { marginTop: 24 }]}>Playback Speed</Text>
                  <View style={styles.speedGrid}>
                    {[0.75, 1, 1.25, 1.5, 2].map((r) => {
                      const active = playbackSpeed === r;
                      return (
                        <Pressable key={r} style={[styles.speedTile, active && styles.speedTileActive]} onPress={() => setSpeed(r)}>
                          {active && <BlurView intensity={0} tint="dark" style={StyleSheet.absoluteFillObject} />}
                          <Gauge size={13} color={active ? '#000000' : '#71717a'} strokeWidth={2} />
                          <Text style={[styles.speedTileText, active && styles.speedTileTextActive]}>{r === 1 ? '1×' : `${r}×`}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              {/* ══════════════ STYLE TAB ══════════════ */}
              {subTab === 'style' && (
                <>
                  {/* Font size */}
                  <Text style={styles.audioSectionLabel}>Font Size</Text>
                  <View style={styles.subStyleRow}>
                    <Text style={styles.subStyleValueLabel}>{subStyle.fontSize ?? 16}px</Text>
                    <Slider
                      style={{ flex: 1, height: 36 }}
                      minimumValue={12}
                      maximumValue={28}
                      step={1}
                      value={subStyle.fontSize ?? 16}
                      onValueChange={(v) => setSubStyle((s) => ({ ...s, fontSize: Math.round(v) }))}
                      minimumTrackTintColor={NF_RED}
                      maximumTrackTintColor="rgba(255,255,255,0.18)"
                      thumbTintColor="#ffffff"
                    />
                  </View>

                  {/* Vertical position drag */}
                  <Text style={[styles.audioSectionLabel, { marginTop: 20 }]}>Vertical Position</Text>
                  <View style={styles.subStyleRow}>
                    <Text style={styles.subStyleValueLabel}>{subBottomOffset}px</Text>
                    <Slider
                      style={{ flex: 1, height: 36 }}
                      minimumValue={5}
                      maximumValue={Math.round(windowH * 0.79)}
                      step={4}
                      value={subBottomOffset}
                      onValueChange={(v) => setSubBottomOffset(Math.round(v))}
                      minimumTrackTintColor={NF_RED}
                      maximumTrackTintColor="rgba(255,255,255,0.18)"
                      thumbTintColor="#ffffff"
                    />
                  </View>
                  <View style={styles.subPositionHint}>
                    <MoveVertical size={14} color="#52525b" strokeWidth={1.8} />
                    <Text style={styles.subPositionHintText}>Drag the slider to position subtitles anywhere on screen</Text>
                  </View>

                  {/* Font weight */}
                  <Text style={[styles.audioSectionLabel, { marginTop: 20 }]}>Font Weight</Text>
                  <View style={styles.subWeightGrid}>
                    {(['normal', 'semibold', 'bold'] as SubtitleFontWeight[]).map((w) => (
                      <Pressable
                        key={w}
                        style={[styles.subWeightTile, subStyle.fontWeight === w && styles.subWeightTileActive]}
                        onPress={() => setSubStyle((s) => ({ ...s, fontWeight: w }))}
                      >
                        <Text style={[
                          styles.subWeightTileText,
                          { fontWeight: w === 'normal' ? '400' : w === 'semibold' ? '600' : '700' },
                          subStyle.fontWeight === w && styles.subWeightTileTextActive,
                        ]}>
                          {w.charAt(0).toUpperCase() + w.slice(1)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Background opacity */}
                  <Text style={[styles.audioSectionLabel, { marginTop: 20 }]}>Background</Text>
                  <View style={styles.subWeightGrid}>
                    {([{ v: 0 as SubtitleBgOpacity, label: 'None' }, { v: 0.45 as SubtitleBgOpacity, label: 'Dim' }, { v: 0.78 as SubtitleBgOpacity, label: 'Solid' }]).map(({ v, label }) => (
                      <Pressable
                        key={label}
                        style={[styles.subWeightTile, subStyle.bgOpacity === v && styles.subWeightTileActive]}
                        onPress={() => setSubStyle((s) => ({ ...s, bgOpacity: v }))}
                      >
                        <Text style={[styles.subWeightTileText, subStyle.bgOpacity === v && styles.subWeightTileTextActive]}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Live preview pill */}
                  <Text style={[styles.audioSectionLabel, { marginTop: 20 }]}>Preview</Text>
                  <View style={styles.subPreviewWrap}>
                    <View style={[
                      styles.subPreviewPill,
                      { backgroundColor: subStyle.bgOpacity === 0 ? 'transparent' : `rgba(8,8,10,${subStyle.bgOpacity ?? 0.78})` },
                    ]}>
                      <Text
                        style={{
                          color: '#ffffff',
                          fontSize: subStyle.fontSize ?? 16,
                          fontWeight: subStyle.fontWeight === 'normal' ? '400' : subStyle.fontWeight === 'semibold' ? '600' : '700',
                          textAlign: 'center',
                          textShadowColor: 'rgba(0,0,0,0.85)',
                          textShadowOffset: { width: 0, height: 1 },
                          textShadowRadius: 3,
                        }}
                        allowFontScaling={false}
                      >
                        The quick brown fox
                      </Text>
                    </View>
                  </View>
                </>
              )}

              {/* ══════════════ AUTO-FETCH TAB ══════════════ */}
              {subTab === 'search' && (
                <>
                  <Text style={styles.audioSectionLabel}>Language</Text>

                  {/* Language picker */}
                  <View style={{ position: 'relative', zIndex: 30, marginBottom: 12 }}>
                    <Pressable
                      style={[styles.audioOptionRow, subLangPickerOpen && { borderColor: 'rgba(229,9,20,0.4)', backgroundColor: 'rgba(229,9,20,0.06)' }]}
                      onPress={() => setSubLangPickerOpen((v) => !v)}
                    >
                      <View style={styles.audioOptionIcon}>
                        <AlignCenter size={15} color="#a1a1aa" strokeWidth={2} />
                      </View>
                      <Text style={styles.audioOptionText}>
                        {SUBTITLE_LANGUAGES.find((l) => l.code === subSearchLang)?.label ?? subSearchLang}
                      </Text>
                      <ChevronDown size={14} color="#71717a" strokeWidth={2.5}
                        style={{ transform: [{ rotate: subLangPickerOpen ? '180deg' : '0deg' }] }}
                      />
                    </Pressable>

                    {subLangPickerOpen && (
                      <Animated.View entering={FadeIn.duration(130)} style={styles.subLangDropdown}>
                        <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                          {SUBTITLE_LANGUAGES.map((lang) => (
                            <Pressable
                              key={lang.code}
                              style={[styles.subLangItem, lang.code === subSearchLang && styles.subLangItemActive]}
                              onPress={() => { setSubSearchLang(lang.code); setSubLangPickerOpen(false); }}
                            >
                              {lang.code === subSearchLang && <View style={styles.seasonDropdownActiveDot} />}
                              <Text style={[styles.subLangItemText, lang.code === subSearchLang && { color: '#ffffff', fontWeight: '700' }]}>
                                {lang.label}
                              </Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </Animated.View>
                    )}
                  </View>

                  {/* Search bar */}
                  <Text style={styles.audioSectionLabel}>Search</Text>
                  <View style={styles.subSearchRow}>
                    <Pressable
                      style={({ pressed }) => [styles.subSearchBtn, { opacity: pressed ? 0.75 : 1 }]}
                      onPress={handleSubtitleSearch}
                    >
                      <Search size={15} color="#ffffff" strokeWidth={2} />
                      <Text style={styles.subSearchBtnText}>
                        {subSearchState === 'loading' ? 'Searching…' : 'Search'}
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.audioTrackSub}>
                    Searching for: <Text style={{ color: '#a1a1aa' }}>{item.title}{activeFile?.seasonNumber != null ? ` S${activeFile.seasonNumber}E${activeFile.episodeNumber ?? ''}` : ''}</Text>
                  </Text>

                  {/* Error */}
                  {subSearchState === 'error' && (
                    <View style={[styles.audioInfoRow, { marginTop: 12 }]}>
                      <Text style={[styles.audioTrackSub, { color: '#f87171', flex: 1 }]}>{subSearchError}</Text>
                    </View>
                  )}

                  {/* Results */}
                  {subSearchState === 'done' && subSearchResults.length === 0 && (
                    <View style={styles.panelEmptyWrap}>
                      <Search size={28} color="#3f3f46" strokeWidth={1.5} />
                      <Text style={styles.panelEmpty}>No subtitles found.{'\n'}Try a different language or check the title.</Text>
                    </View>
                  )}

                  {subSearchResults.length > 0 && (
                    <>
                      <Text style={[styles.audioSectionLabel, { marginTop: 16 }]}>{subSearchResults.length} Results</Text>
                      {subSearchResults.map((hit) => {
                        const isDownloading = subDownloadingId === hit.fileId;
                        const isLoaded = subtitles.loadState === 'ready' && subtitles.filename === hit.fileName;
                        return (
                          <Pressable
                            key={`${hit.fileId}`}
                            style={({ pressed }) => [
                              styles.subResultRow,
                              isLoaded && styles.subResultRowActive,
                              { opacity: pressed ? 0.75 : 1 },
                            ]}
                            onPress={() => !isDownloading && handleSubtitleDownload(hit)}
                          >
                            <View style={[styles.audioOptionIcon, isLoaded && styles.audioOptionIconActive]}>
                              {isLoaded
                                ? <Check size={15} color={NF_RED} strokeWidth={2.5} />
                                : isDownloading
                                ? <Download size={15} color="#71717a" strokeWidth={2} />
                                : <Download size={15} color="#a1a1aa" strokeWidth={2} />}
                            </View>
                            <View style={{ flex: 1, gap: 3 }}>
                              <Text style={styles.audioOptionText} numberOfLines={2}>{hit.release || hit.fileName}</Text>
                              <Text style={styles.audioTrackSub}>
                                {hit.language.toUpperCase()} · {hit.downloads.toLocaleString()} downloads
                                {hit.rating != null && hit.rating > 0 ? ` · ★ ${hit.rating.toFixed(1)}` : ''}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </>
                  )}
                </>
              )}

            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      {/* Persistent lock button — rendered outside the controls overlay so it's
          always tappable when locked, even when controls are hidden */}
      {locked && (
        <Pressable
          onPress={toggleLock}
          hitSlop={16}
          style={[styles.persistentLockBtn, { top: Math.max(insets.top, 8), right: padH }]}
        >
          <Lock size={20} color={NF_RED} strokeWidth={2} />
        </Pressable>
      )}

      {/* Lock hint — shown when user taps while controls are locked */}
      {showLockHint && (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(300)}
          style={[styles.lockHint, { top: Math.max(insets.top, 16) + 48, right: padH }]}
          pointerEvents="none"
        >
          <Lock size={16} color={NF_RED} strokeWidth={2.5} />
          <Text style={styles.lockHintText}>Tap lock to unlock</Text>
        </Animated.View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },

  // Video
  videoWrap: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  video: { width: '100%', height: '100%' },

  // FIX: zones at zIndex 2, controls at zIndex 6 — controls win touch dispatch
  zones: { ...StyleSheet.absoluteFillObject, zIndex: 2 },

  // Gesture HUD
  gestureHudAnchor: {
    position: 'absolute', top: 0, bottom: 0, width: '38%',
    alignItems: 'center', justifyContent: 'center', zIndex: 5,
  },
  gestureHudRight: { right: 0 },
  gestureHud: {
    alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)', minWidth: 72,
  },
  gestureBarTrack: {
    width: 6, height: 100, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden', justifyContent: 'flex-end',
  },
  gestureBarFill: { width: '100%', backgroundColor: '#ffffff', borderRadius: 3 },
  gestureHudText: { color: '#ffffff', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },

  // Controls root — zIndex 6 so it sits above gesture zones
  controlsRoot: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', zIndex: 6 },

  // Top bar
  topGradient: { paddingBottom: 28 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topIconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: {
    flex: 1, textAlign: 'center', color: '#ffffff', fontSize: 15, fontWeight: '600',
    letterSpacing: 0.1, textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },

  // Center transport
  centerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 56 },
  centerHit: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  playHit: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },

  // Skip icon (RotateCcw / RotateCw + "10" label)
  skipIconWrap: {
    width: 68, height: 68, alignItems: 'center', justifyContent: 'center',
  },
  skipIconNum: {
    position: 'absolute',
    color: '#ffffff', fontSize: 12, fontWeight: '800', letterSpacing: -0.3,
  },

  // Bottom bar
  bottomGradient: { paddingTop: 36 },
  scrubRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  sliderWrap: { flex: 1, height: 28, justifyContent: 'center' },
  trackBg: {
    position: 'absolute', left: 0, right: 0, height: 3, borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  // Animated fill — height controlled by trackH shared value (2px hidden → 4px visible)
  trackFillBase: {
    position: 'absolute', left: 0, backgroundColor: NF_RED,
    borderRadius: 2,
  },
  slider: { width: '100%', height: 28 },
  remainingTime: {
    color: '#ffffff', fontSize: 12, fontWeight: '600',
    fontVariant: ['tabular-nums'], minWidth: 52, textAlign: 'right',
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 4,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 8, paddingHorizontal: 4,
  },
  actionLabel: { color: '#ffffff', fontSize: 12, fontWeight: '500' },

  // Next-up card
  nextUpCard: {
    position: 'absolute', width: 220, padding: 14, borderRadius: 8,
    backgroundColor: 'rgba(20,20,20,0.95)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)', gap: 6, zIndex: 7,
  },
  nextUpLabel: {
    color: '#a1a1aa', fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  nextUpTitle: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  nextUpBtn: {
    marginTop: 6, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, backgroundColor: '#ffffff',
    paddingVertical: 8, borderRadius: 4,
  },
  nextUpBtnText: { color: '#000000', fontSize: 13, fontWeight: '800' },
  nextUpDismiss: {
    position: 'absolute', top: 8, right: 8,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Lock hint toast
  lockHint: {
    position: 'absolute',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(10,10,12,0.88)',
    borderWidth: 1, borderColor: 'rgba(229,9,20,0.35)',
    zIndex: 8,
  },
  lockHintText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },

  // Persistent lock button (outside controls overlay, always tappable when locked)
  persistentLockBtn: {
    position: 'absolute',
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(10,10,12,0.7)',
    borderWidth: 1, borderColor: 'rgba(229,9,20,0.4)',
    zIndex: 8,
  },

  // ── Countdown Overlay ─────────────────────────────────────────────────────
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    zIndex: 10,
    gap: 16,
  },
  countdownReady: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  countdownNumber: {
    color: '#ffffff',
    fontSize: 120,
    fontWeight: '900',
    textShadowColor: 'rgba(229,9,20,0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },

  // ── Shared right-side panel layout (Episodes + Audio) ─────────────────────
  sideModalRoot: {
    flex: 1,
    flexDirection: 'row',
    // Ensure the modal root always fills the full screen including status bar area
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sideBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  sidePanel: {
    alignSelf: 'stretch',
    maxWidth: 300,
    backgroundColor: 'rgba(0, 0, 0, 0.45)', // glassmorphic translucent base
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingLeft: 0,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 32,
    shadowOffset: { width: -8, height: 8 },
    elevation: 20,
    overflow: 'hidden', // clips the blur view nicely to the rounded corners
  },

  // Panel header — above the episode list (zIndex) so the season menu floats on top
  panelHeaderWrap: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 14,
    overflow: 'visible',
    borderBottomWidth: 0,
    zIndex: 40,
    elevation: 40,
  },
  panelHeaderInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  panelHeaderText: { flex: 1, gap: 3, minWidth: 0 },
  panelTitle: {
    color: '#ffffff', fontSize: 17, fontWeight: '800', letterSpacing: -0.3,
  },
  panelSubtitle: { color: '#52525b', fontSize: 11, fontWeight: '600' },
  panelCloseBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  panelHeaderDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginTop: 12,
    marginHorizontal: -14,
  },

  // Panel scroll — under header so season dropdown covers it
  panelScroll: { flex: 1, zIndex: 1, elevation: 0 },
  panelScrollContent: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 24, gap: 6 },

  // Empty state
  panelEmptyWrap: {
    alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingVertical: 40,
  },
  panelEmpty: {
    color: '#3f3f46', fontSize: 13, fontWeight: '600',
    textAlign: 'center', lineHeight: 20,
  },

  // ── Episode cards (matches DetailsScreen EpisodeCard style) ───────────────
  epCard: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 10,
  },
  epCardActive: {
    borderColor: 'rgba(229,9,20,0.4)',
    backgroundColor: 'rgba(229,9,20,0.12)',
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  epCardBg: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.12,
  },
  epCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,12,0.68)',
  },
  epCardInner: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, padding: 8,
  },
  epStillWrap: {
    width: 76, height: 44, borderRadius: 8,
    overflow: 'hidden', backgroundColor: '#27272a', flexShrink: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  epStillPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1c1c1e',
  },
  epPlayOverlay: {
    width: 28, height: 28, borderRadius: 14,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  epActiveDot: {
    position: 'absolute', top: 6, right: 6,
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: NF_RED,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.4)',
  },
  epCompletedBadge: {
    position: 'absolute', bottom: 6, left: 6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(74,222,128,0.2)',
    borderWidth: 1.5, borderColor: '#4ade80',
    alignItems: 'center', justifyContent: 'center',
  },
  epMeta: { flex: 1, gap: 3 },
  epCode: {
    color: '#52525b', fontSize: 10, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  epName: { color: '#e4e4e7', fontSize: 12, fontWeight: '700', lineHeight: 16 },

  // ── Audio & Subtitles rows ─────────────────────────────────────────────────
  audioSectionLabel: {
    color: '#52525b', fontSize: 10, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 8, marginTop: 4, paddingHorizontal: 2,
  },
  audioOptionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 14, marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  audioOptionIcon: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  audioOptionIconActive: {
    backgroundColor: 'rgba(229,9,20,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.3)',
  },
  audioOptionText: { flex: 1, color: '#ffffff', fontSize: 14, fontWeight: '600' },
  audioOptionTextMuted: { color: '#71717a' },
  audioInfoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 12, marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  audioInfoIcon: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center', justifyContent: 'center',
  },
  audioInfoText: { flex: 1, gap: 2 },
  audioTrackLabel: { color: '#a1a1aa', fontSize: 13, fontWeight: '600' },
  audioTrackSub: { color: '#3f3f46', fontSize: 11, fontWeight: '500', lineHeight: 15 },

  // Speed grid — 5 equal tiles in a row
  speedGrid: {
    flexDirection: 'row', gap: 6,
  },
  speedTile: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 12, borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  speedTileActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  speedTileText: { color: '#71717a', fontSize: 12, fontWeight: '800' },
  speedTileTextActive: { color: '#000000' },

  // ── Season picker (pill + dropdown) ───────────────────────────────────────
  // Own row under the title; menu is absolute and elevated above the episode list.
  seasonPillWrap: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  seasonPillScroll: {
    height: 40,
  },
  seasonPillScrollContent: {
    gap: 8,
    paddingHorizontal: 0,
  },
  seasonPill: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minWidth: 50,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  seasonPillActive: {
    backgroundColor: '#e50914',
    borderColor: '#e50914',
  },
  seasonPillText: {
    color: '#a1a1aa',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  seasonPillTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  seasonPillEpCount: {
    color: '#52525b',
    fontSize: 9,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  seasonPillEpCountActive: {
    color: 'rgba(255,255,255,0.85)',
  },

  // ── Subtitle panel ────────────────────────────────────────────────────────
  subTabBar: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
  },
  subTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  subTabActive: {
    backgroundColor: 'rgba(229,9,20,0.15)',
    borderColor: 'rgba(229,9,20,0.35)',
  },
  subTabText: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subTabTextActive: {
    color: '#ffffff',
  },

  // Style tab
  subStyleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  subStyleValueLabel: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 36,
    textAlign: 'right',
  },
  subWeightGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  subWeightTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  subWeightTileActive: {
    backgroundColor: 'rgba(229,9,20,0.15)',
    borderColor: 'rgba(229,9,20,0.3)',
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  subWeightTileText: {
    color: '#71717a',
    fontSize: 12,
    fontWeight: '600',
  },
  subWeightTileTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  subPositionHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  subPositionHintText: {
    color: '#3f3f46',
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
    lineHeight: 16,
  },
  subPreviewWrap: {
    alignItems: 'center',
    paddingVertical: 18,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  subPreviewPill: {
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },

  // Auto-fetch tab
  subSearchRow: {
    marginBottom: 8,
  },
  subSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: NF_RED,
  },
  subSearchBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  subLangDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: '#141416',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.75,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 48,
    zIndex: 60,
  },
  subLangItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  subLangItemActive: {
    backgroundColor: 'rgba(229,9,20,0.10)',
  },
  seasonDropdownActiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34d399',
    marginRight: 8,
  },
  subLangItemText: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '600',
  },
  subResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  subResultRowActive: {
    backgroundColor: 'rgba(229,9,20,0.07)',
    borderColor: 'rgba(229,9,20,0.3)',
  },
});

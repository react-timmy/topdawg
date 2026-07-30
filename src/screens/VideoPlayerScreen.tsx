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
  withRepeat,
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
} from 'lucide-react-native';

import { RootStackParamList, MediaItem, LocalFile } from '../types';
import { watchProgressService, COMPLETED_FRACTION } from '../storage/watchProgressService';
import { watchHistoryService } from '../storage/watchHistoryService';
import { useBadgeUnlock } from '../context/BadgeUnlockContext';

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
  const insets = useSafeAreaInsets();
  const { width: windowW, height: windowH } = useWindowDimensions();
  const episodesPanelW = Math.min(420, Math.max(280, windowW * 0.4));
  const { checkForNewBadges } = useBadgeUnlock();

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
    for (const ep of episodes) {
      if (ep.seasonNumber != null) nums.add(ep.seasonNumber);
    }
    return [...nums].sort((a, b) => a - b);
  }, [episodes]);

  // Default: the season of the currently playing episode, else first season
  const defaultSeason = activeFile?.seasonNumber ?? seasonNumbers[0] ?? null;
  const [selectedSeason, setSelectedSeason] = useState<number | null>(defaultSeason);
  const [seasonDropdownOpen, setSeasonDropdownOpen] = useState(false);

  // Episodes visible in the panel — filtered to selected season (or all if no seasons)
  const visibleEpisodes = useMemo(() => {
    if (seasonNumbers.length === 0 || selectedSeason === null) return episodes;
    return episodes.filter((ep) => ep.seasonNumber === selectedSeason);
  }, [episodes, seasonNumbers, selectedSeason]);

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
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false); // mirror for use inside gesture callbacks
  const [showLockHint, setShowLockHint] = useState(false);
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
  const [episodesOpen, setEpisodesOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);

  // ── Season/scroll effects (episodesOpen must be declared above these) ────
  // Reset season to the playing episode's season when panel opens
  useEffect(() => {
    if (!episodesOpen) return;
    setSelectedSeason(activeFile?.seasonNumber ?? seasonNumbers[0] ?? null);
    setSeasonDropdownOpen(false);
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
  const pinchScale = useSharedValue(1);
  const panSideSV = useSharedValue(0);

  const [volume, setVolume] = useState(1);
  const [gestureHud, setGestureHud] = useState<number | null>(null); // volume 0-1
  const volumeStart = useRef(1);
  const gestureHudTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const overlayOpacity = useSharedValue(0); // starts hidden — tap to reveal
  // Track height animates between thin (hidden) and bold (visible)
  const trackH = useSharedValue(2); // starts thin
  // Whether controls layer should receive touches (1 = yes, 0 = no)
  const controlsPointer = useSharedValue(1);

  const uri = activeFile?.uri || '';

  // FIX: do NOT call p.play() in the initializer — let the status event handle it
  // to avoid the orientation lock racing with the initial play call and pausing video.
  const player = useVideoPlayer(uri, (p) => {
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

  // ── FIX: subscribe to player status → play as soon as video is ready ──────
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        // Only auto-play if we haven't manually paused
        if (!isPlaying) {
          player.play();
          setIsPlaying(true);
        }
      }
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

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

  // ── Episode source change ──────────────────────────────────────────────────
  const sourceReady = useRef(false);
  useEffect(() => {
    if (!player || !uri) return;
    if (!sourceReady.current) { sourceReady.current = true; return; }
    (async () => {
      try {
        didSeekToStart.current = true;
        startPositionRef.current = 0;
        if (activeFile) {
          const saved = await watchProgressService.get(progressMediaId, activeFile);
          if (saved && saved.positionSeconds > 30) {
            startPositionRef.current = saved.positionSeconds;
            didSeekToStart.current = false;
          }
        }
        await player.replaceAsync(uri);
        // statusChange listener will call play() when readyToPlay fires
        setIsPlaying(false);
        setCurrentTime(0);
        setShowNextUp(false);
        sliderMaxRef.current = 0;
        sliderSeedRef.current = 0;
        setSliderResetKey((k) => k + 1);
        // Reset completion tracking so the new episode can also be recorded
        hasRecordedCompletionRef.current = false;
        activePlayedSecondsRef.current = 0;
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
        }).then(() => watchHistoryService.getHistory()).then(checkForNewBadges);
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
      if (nextEpisode && d > 0 && t >= d - 30 && t < d - 0.5) setShowNextUp(true);
    }, 250);
    return () => clearInterval(interval);
  }, [player, isSeeking, nextEpisode]);

  // ── FIX: auto-hide only fires when actually playing ───────────────────────
  const scheduleHide = useCallback(() => {
    if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
    hideControlsTimeout.current = setTimeout(() => {
      // Re-read player.playing at fire time — never hide while paused
      if (player?.playing && !episodesOpen && !audioOpen) {
        setShowControls(false);
        overlayOpacity.value = withTiming(0, { duration: 500 });
        trackH.value = withTiming(2, { duration: 500 });
        controlsPointer.value = 0;
      }
    }, HIDE_MS);
  }, [player, overlayOpacity, trackH, controlsPointer, episodesOpen, audioOpen]);

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

  const skipBy = (delta: number) => {
    if (!player || lockedRef.current) return;
    const wasPlaying = player.playing;
    const next = Math.max(0, Math.min(player.duration || 0, player.currentTime + delta));
    player.currentTime = next;
    setCurrentTime(next);
    teleportSlider(next);
    // Restore play state — some expo-video versions internally pause on currentTime assignment
    if (wasPlaying) {
      player.play();
    }
    revealControls();
  };

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
      setShowControls(false);
      overlayOpacity.value = withTiming(0, { duration: 380 });
      trackH.value = withTiming(2, { duration: 380 });
      controlsPointer.value = 0;
      if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
    } else {
      revealControls();
    }
  }, [locked, showControls, overlayOpacity, trackH, controlsPointer, revealControls]);

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

  const handleBack = async () => {
    try { if (player && activeFile) await persistProgress(player.currentTime, player.duration || 0); } catch { /* ignore */ }
    try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); } catch { /* ignore */ }
    navigation.goBack();
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
  // Lock slider max once — changing maximumValue mid-play causes the native
  // slider to rescale and visually jump the thumb.
  if (duration > 0 && sliderMaxRef.current === 0) sliderMaxRef.current = duration;
  const sliderMax = sliderMaxRef.current > 0 ? sliderMaxRef.current : 1;
  const scrubValue = isSeeking ? seekPreview : currentTime;
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (scrubValue / duration) * 100)) : 0;
  const padH = Math.max(insets.left, insets.right, 16);
  const padTop = Math.max(insets.top, 8);
  const padBot = Math.max(insets.bottom, 10);
  const nextEpisodeLabel = nextEpisode
    ? nextEpisode.episodeName?.trim() || (nextEpisode.episodeNumber != null ? `Episode ${nextEpisode.episodeNumber}` : epCode(nextEpisode) || 'Next')
    : '';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar hidden barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Video layer — zIndex 0 */}
      <Animated.View style={[styles.videoWrap, videoPinchStyle]}>
        <VideoView
          style={styles.video}
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

      {/* Gesture HUD — zIndex 5, pointer-events none */}
      {/* Volume HUD — always on the right side */}
      {gestureHud !== null && (
        <View style={[styles.gestureHudAnchor, styles.gestureHudRight]} pointerEvents="none">
          <GestureHud value={gestureHud} />
        </View>
      )}

      {/* Skip flash removed — double-tap still works, no overlay shown */}

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
            {/* Prev episode — TV only, before Episodes */}
            {item.type === 'tv' && prevEpisode ? (
              <Pressable style={styles.actionBtn} onPress={handlePrevEpisode}>
                <SkipBack size={20} color="#ffffff" strokeWidth={1.8} fill="#ffffff" />
                <Text style={styles.actionLabel} numberOfLines={1}>Prev episode</Text>
              </Pressable>
            ) : item.type === 'tv' ? (
              <View style={[styles.actionBtn, { opacity: 0.28 }]} pointerEvents="none">
                <SkipBack size={20} color="#ffffff" strokeWidth={1.8} />
                <Text style={styles.actionLabel} numberOfLines={1}>Prev episode</Text>
              </View>
            ) : (
              <View style={styles.actionBtn} pointerEvents="none" />
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

            {/* Audio & Subtitles */}
            <Pressable style={styles.actionBtn} onPress={() => { setAudioOpen(true); if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current); }}>
              <Captions size={20} color="#ffffff" strokeWidth={1.8} />
              <Text style={styles.actionLabel} numberOfLines={1}>Audio & Subtitles</Text>
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
        <View style={styles.sideModalRoot}>
          <Pressable style={styles.sideBackdrop} onPress={() => { setEpisodesOpen(false); if (player?.playing) scheduleHide(); }} />
          <Animated.View
            entering={SlideInRight.duration(280)}
            exiting={SlideOutRight.duration(220)}
            style={[styles.sidePanel, { width: episodesPanelW }]}
          >
            {/* Header — frosted glass bar */}
            <View style={[styles.panelHeaderWrap, { paddingTop: Math.max(insets.top, 16) }]}>
              <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />

              {/* Title row: "Episodes" + optional season pill + X */}
              <View style={styles.panelHeaderInner}>
                <View style={styles.panelHeaderText}>
                  <Text style={styles.panelTitle}>Episodes</Text>
                  <Text style={styles.panelSubtitle} numberOfLines={1}>
                    {initialItem.title.replace(/\s*-\s*S\d+E\d+.*$/i, '')}
                  </Text>
                </View>

                {/* Season pill — inline, only when multiple seasons exist */}
                {seasonNumbers.length > 1 && (
                  <View style={styles.seasonPillWrap}>
                    <Pressable
                      style={[styles.seasonPill, seasonDropdownOpen && styles.seasonPillOpen]}
                      onPress={() => setSeasonDropdownOpen((v) => !v)}
                      hitSlop={8}
                    >
                      <Text style={styles.seasonPillText}>
                        {selectedSeason !== null ? `S${selectedSeason}` : 'All'}
                      </Text>
                      <ChevronDown
                        size={12}
                        color={seasonDropdownOpen ? '#ffffff' : '#a1a1aa'}
                        strokeWidth={2.5}
                        style={{ transform: [{ rotate: seasonDropdownOpen ? '180deg' : '0deg' }] }}
                      />
                    </Pressable>

                    {/* Dropdown — absolutely positioned below the pill */}
                    {seasonDropdownOpen && (
                      <Animated.View entering={FadeIn.duration(140)} style={styles.seasonDropdownList}>
                        {seasonNumbers.map((s) => {
                          const isActive = s === selectedSeason;
                          const epCount = episodes.filter((e) => e.seasonNumber === s).length;
                          return (
                            <Pressable
                              key={s}
                              style={({ pressed }) => [
                                styles.seasonDropdownItem,
                                isActive && styles.seasonDropdownItemActive,
                                pressed && { opacity: 0.75 },
                              ]}
                              onPress={() => {
                                setSelectedSeason(s);
                                setSeasonDropdownOpen(false);
                              }}
                            >
                              <View style={styles.seasonDropdownItemLeft}>
                                {isActive && (
                                  <View style={styles.seasonDropdownActiveDot} />
                                )}
                                <Text style={[
                                  styles.seasonDropdownItemText,
                                  isActive && styles.seasonDropdownItemTextActive,
                                ]}>
                                  Season {s}
                                </Text>
                              </View>
                              <Text style={styles.seasonDropdownItemCount}>
                                {epCount} ep{epCount !== 1 ? 's' : ''}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </Animated.View>
                    )}
                  </View>
                )}

                <Pressable
                  onPress={() => { setEpisodesOpen(false); setSeasonDropdownOpen(false); if (player?.playing) scheduleHide(); }}
                  style={styles.panelCloseBtn}
                  hitSlop={10}
                >
                  <X size={18} color="#a1a1aa" />
                </Pressable>
              </View>

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
                      if (h > 0) epCardHeightRef.current = h;
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
                      </View>

                      <View style={styles.epMeta}>
                        <Text style={styles.epCode}>{code}{active ? '  ·  Now Playing' : ''}</Text>
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

      {/* ── Audio & Subtitles panel — slides in from the RIGHT ── */}
      <Modal
        visible={audioOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAudioOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.sideModalRoot}>
          <Pressable style={styles.sideBackdrop} onPress={() => { setAudioOpen(false); if (player?.playing) scheduleHide(); }} />
          <Animated.View
            entering={SlideInRight.duration(280)}
            exiting={SlideOutRight.duration(220)}
            style={[
              styles.sidePanel,
              {
                width: episodesPanelW,
                paddingTop: Math.max(insets.top, 0),
                paddingBottom: padBot + 12,
              },
            ]}
          >
            {/* Header */}
            <View style={[styles.panelHeaderWrap, { paddingTop: Math.max(insets.top, 16) }]}>
              <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
              <View style={styles.panelHeaderInner}>
                <View style={styles.panelHeaderText}>
                  <Text style={styles.panelTitle}>Audio & Subtitles</Text>
                  <Text style={styles.panelSubtitle} numberOfLines={1}>{topTitle}</Text>
                </View>
                <Pressable onPress={() => { setAudioOpen(false); if (player?.playing) scheduleHide(); }} style={styles.panelCloseBtn} hitSlop={10}>
                  <X size={18} color="#a1a1aa" />
                </Pressable>
              </View>
              <View style={styles.panelHeaderDivider} />
            </View>

            <ScrollView
              style={styles.panelScroll}
              contentContainerStyle={styles.panelScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* ── Audio ── */}
              <Text style={styles.audioSectionLabel}>Audio</Text>

              {/* Track info */}
              <View style={styles.audioInfoRow}>
                <View style={styles.audioInfoIcon}>
                  <Volume2 size={16} color="#52525b" />
                </View>
                <View style={styles.audioInfoText}>
                  <Text style={styles.audioTrackLabel}>Audio track switching not currently available</Text>
                  <Text style={styles.audioTrackSub}>Plays the default audio track embedded in the local file</Text>
                </View>
              </View>

              {/* ── Subtitles ── */}
              <Text style={[styles.audioSectionLabel, { marginTop: 24 }]}>Subtitles</Text>

              <View style={styles.audioInfoRow}>
                <View style={styles.audioInfoIcon}>
                  <Captions size={16} color="#52525b" />
                </View>
                <View style={styles.audioInfoText}>
                  <Text style={styles.audioTrackLabel}>Subtitles not currently available</Text>
                  <Text style={styles.audioTrackSub}>Subtitle track selection is not supported in this version</Text>
                </View>
              </View>

              {/* ── Playback speed ── */}
              <Text style={[styles.audioSectionLabel, { marginTop: 24 }]}>Playback Speed</Text>

              <View style={styles.speedGrid}>
                {[0.75, 1, 1.25, 1.5, 2].map((r) => {
                  const active = playbackSpeed === r;
                  return (
                    <Pressable
                      key={r}
                      style={[styles.speedTile, active && styles.speedTileActive]}
                      onPress={() => setSpeed(r)}
                    >
                      {active && (
                        <BlurView intensity={0} tint="dark" style={StyleSheet.absoluteFillObject} />
                      )}
                      <Gauge size={13} color={active ? '#000000' : '#71717a'} strokeWidth={2} />
                      <Text style={[styles.speedTileText, active && styles.speedTileTextActive]}>
                        {r === 1 ? '1×' : `${r}×`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
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
          <Text style={styles.lockHintText}>Controls locked · tap lock to unlock</Text>
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
  sideBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sidePanel: {
    flex: 1,                   // fills all remaining height — no percentage needed
    maxWidth: 420,             // cap width so it doesn't go wider than episodesPanelW
    backgroundColor: '#0d0d0f',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.07)',
    paddingLeft: 0,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: -6, height: 0 },
    elevation: 20,
    overflow: 'hidden',
  },

  // Panel header — frosted glass bar
  panelHeaderWrap: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    overflow: 'hidden',
    borderBottomWidth: 0,
  },
  panelHeaderInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  panelHeaderText: { flex: 1, gap: 3 },
  panelTitle: {
    color: '#ffffff', fontSize: 20, fontWeight: '800', letterSpacing: -0.3,
  },
  panelSubtitle: { color: '#52525b', fontSize: 12, fontWeight: '600' },
  panelCloseBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  panelHeaderDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginTop: 14,
    marginHorizontal: -16,
  },

  // Panel scroll
  panelScroll: { flex: 1 },
  panelScrollContent: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 24, gap: 8 },

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
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#111113',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 8,
  },
  epCardActive: {
    borderColor: `rgba(229,9,20,0.35)`,
    backgroundColor: 'rgba(229,9,20,0.06)',
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
    gap: 10, padding: 10,
  },
  epStillWrap: {
    width: 88, height: 50, borderRadius: 9,
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
  epMeta: { flex: 1, gap: 3 },
  epCode: {
    color: '#52525b', fontSize: 10, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  epName: { color: '#e4e4e7', fontSize: 13, fontWeight: '700', lineHeight: 18 },

  // ── Audio & Subtitles rows ─────────────────────────────────────────────────
  audioSectionLabel: {
    color: '#52525b', fontSize: 10, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 8, marginTop: 4, paddingHorizontal: 2,
  },
  audioOptionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 12, marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  audioOptionIcon: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
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
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  speedTileActive: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  speedTileText: { color: '#71717a', fontSize: 12, fontWeight: '800' },
  speedTileTextActive: { color: '#000000' },

  // ── Season picker (pill + dropdown) ───────────────────────────────────────
  // The pill sits inline between the title block and the X button.
  // The dropdown is absolutely positioned below the pill.
  seasonPillWrap: {
    position: 'relative',
    zIndex: 20, // dropdown must float above episode cards
  },
  seasonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  seasonPillOpen: {
    backgroundColor: 'rgba(229,9,20,0.15)',
    borderColor: 'rgba(229,9,20,0.5)',
  },
  seasonPillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  seasonDropdownList: {
    position: 'absolute',
    top: 36, // pill height + 4px gap
    right: 0,
    minWidth: 160,
    backgroundColor: '#18181b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 16,
  },
  seasonDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  seasonDropdownItemActive: {
    backgroundColor: 'rgba(229,9,20,0.08)',
  },
  seasonDropdownItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  seasonDropdownActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: NF_RED,
  },
  seasonDropdownItemText: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '600',
  },
  seasonDropdownItemTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  seasonDropdownItemCount: {
    color: '#3f3f46',
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});

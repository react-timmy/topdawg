/**
 * WrappedModal — WhatsApp-status style FilmSort Wrapped (Pro).
 *
 * • Auto-advance every 6s with filling progress bars
 * • Tap right half → next · tap left half → previous
 * • Press & hold → pause timer (like statuses)
 * • Nostalgic film-grain slides + movie/TV mix percentages
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  Image,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {
  X,
  Share2,
  Clock,
  Film,
  Tv,
  Flame,
  Sparkles,
  Crown,
  Heart,
} from 'lucide-react-native';
import { MediaItem } from '../types';
import { WatchEvent } from '../storage/watchHistoryService';
import { UniqueTitleEntry } from '../services/memoriesService';
import { wrappedService, WrappedRecap } from '../services/wrappedService';

const { width: W, height: H } = Dimensions.get('window');
const SLIDE_MS = 6000;
const POSTER_COLS = 3;
const POSTER_GAP = 10;
const POSTER_CARD_W = (W - 56 - POSTER_GAP * (POSTER_COLS - 1)) / POSTER_COLS;
const POSTER_CARD_H = POSTER_CARD_W * 1.45;

// ─── Progress segment ────────────────────────────────────────────────────────

function StatusPip({
  index,
  activeIndex,
  progress,
}: {
  index: number;
  activeIndex: number;
  progress: SharedValue<number>;
}) {
  const fillStyle = useAnimatedStyle(() => {
    let w = 0;
    if (index < activeIndex) w = 1;
    else if (index === activeIndex) w = progress.value;
    else w = 0;
    return { width: `${Math.min(1, Math.max(0, w)) * 100}%` };
  });

  return (
    <View style={styles.pipTrack}>
      <Animated.View style={[styles.pipFill, fillStyle]} />
    </View>
  );
}

// ─── Percent bar ─────────────────────────────────────────────────────────────

function MixBar({
  moviePct,
  tvPct,
  delay = 200,
}: {
  moviePct: number;
  tvPct: number;
  delay?: number;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(500)} style={styles.mixWrap}>
      <View style={styles.mixLabels}>
        <Text style={styles.mixLabelMovie}>Movies {moviePct}%</Text>
        <Text style={styles.mixLabelTv}>TV {tvPct}%</Text>
      </View>
      <View style={styles.mixTrack}>
        <View
          style={[
            styles.mixMovie,
            { flex: Math.max(moviePct, 1) },
          ]}
        />
        <View
          style={[
            styles.mixTv,
            { flex: Math.max(tvPct, 1) },
          ]}
        />
      </View>
    </Animated.View>
  );
}

// ─── Movies / TV poster tabs ─────────────────────────────────────────────────

function PosterTabs({
  movies,
  shows,
}: {
  movies: UniqueTitleEntry[];
  shows: UniqueTitleEntry[];
}) {
  const [tab, setTab] = useState<'movies' | 'tv'>(
    movies.length > 0 ? 'movies' : 'tv',
  );
  const list = tab === 'movies' ? movies : shows;

  return (
    <View style={styles.posterTabsRoot}>
      <View style={styles.tabBar}>
        <Pressable
          onPress={() => setTab('movies')}
          style={[styles.tabChip, tab === 'movies' && styles.tabChipOnMovie]}
        >
          <Film
            size={14}
            color={tab === 'movies' ? '#0a0a0a' : '#fbbf24'}
            strokeWidth={2.4}
          />
          <Text style={[styles.tabChipText, tab === 'movies' && styles.tabChipTextOn]}>
            Movies
          </Text>
          <Text style={[styles.tabCount, tab === 'movies' && styles.tabCountOn]}>
            {movies.length}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('tv')}
          style={[styles.tabChip, tab === 'tv' && styles.tabChipOnTv]}
        >
          <Tv
            size={14}
            color={tab === 'tv' ? '#0a0a0a' : '#34d399'}
            strokeWidth={2.4}
          />
          <Text style={[styles.tabChipText, tab === 'tv' && styles.tabChipTextOn]}>
            TV Shows
          </Text>
          <Text style={[styles.tabCount, tab === 'tv' && styles.tabCountOn]}>
            {shows.length}
          </Text>
        </Pressable>
      </View>

      {list.length === 0 ? (
        <Text style={styles.posterEmpty}>
          {tab === 'movies' ? 'No movies on your shelf yet.' : 'No TV shows on your shelf yet.'}
        </Text>
      ) : (
        <ScrollView
          style={styles.posterScroll}
          contentContainerStyle={styles.posterGrid}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {list.map((t, i) => {
            const watched = !!(t.watched || t.watchCount > 0);
            return (
              <Animated.View
                key={t.mediaId}
                entering={FadeInUp.delay(Math.min(i, 12) * 40).duration(320)}
                style={styles.posterCard}
              >
                <View>
                  {t.posterUrl ? (
                    <Image
                      source={{ uri: t.posterUrl }}
                      style={styles.posterImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.posterImg, styles.posterPh]}>
                      <Text style={styles.posterInitial}>
                        {t.title.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  {watched && (
                    <View style={styles.watchedBadge}>
                      <Text style={styles.watchedBadgeText}>Watched</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.posterName} numberOfLines={2}>
                  {t.title}
                </Text>
                {t.releaseYear ? (
                  <Text style={styles.posterYear}>{t.releaseYear}</Text>
                ) : watched && t.watchCount > 1 ? (
                  <Text style={styles.posterYear}>×{t.watchCount}</Text>
                ) : null}
              </Animated.View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Slide content ───────────────────────────────────────────────────────────

type SlideSpec = {
  key: string;
  colors: [string, string, ...string[]];
  accent: string;
  render: () => React.ReactNode;
};

function buildSlides(recap: WrappedRecap): SlideSpec[] {
  const slides: SlideSpec[] = [];

  slides.push({
    key: 'intro',
    colors: ['#2a1548', '#12081f', '#050308'],
    accent: '#c4b5fd',
    render: () => (
      <>
        <Animated.View entering={FadeIn.duration(600)}>
          <Crown size={32} color="#c4b5fd" strokeWidth={1.8} />
        </Animated.View>
        <Animated.Text entering={FadeInDown.delay(120).duration(500)} style={styles.kicker}>
          REMEMBER THIS YEAR
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(220).duration(550)} style={styles.heroYear}>
          {recap.year}
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(320).duration(550)} style={styles.heroTitle}>
          Wrapped
        </Animated.Text>
        <Animated.Text entering={FadeInUp.delay(450).duration(500)} style={styles.bodyMuted}>
          A little nostalgia from your FilmSort nights
        </Animated.Text>
      </>
    ),
  });

  slides.push({
    key: 'hours',
    colors: ['#0c1929', '#061018', '#020617'],
    accent: '#60a5fa',
    render: () => (
      <>
        <Animated.View entering={FadeIn.duration(400)}>
          <Clock size={28} color="#60a5fa" strokeWidth={2} />
        </Animated.View>
        <Animated.Text entering={FadeInDown.delay(80).duration(400)} style={styles.kicker}>
          TIME WATCHED
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(160).springify()} style={styles.bigStat}>
          {recap.totalHours > 0 ? recap.totalHours : '0'}
          <Text style={styles.bigStatUnit}>h</Text>
        </Animated.Text>
        <Animated.Text entering={FadeInUp.delay(280).duration(450)} style={styles.body}>
          {recap.totalHours >= 24
            ? `About ${Math.round(recap.totalHours / 24)} full days of stories.`
            : recap.totalHours > 0
              ? 'Quiet hours that added up to a whole mood.'
              : 'Your next watch starts the clock.'}
        </Animated.Text>
      </>
    ),
  });

  slides.push({
    key: 'mix',
    colors: ['#1a1408', '#0c0a06', '#050403'],
    accent: '#fbbf24',
    render: () => (
      <>
        <Animated.View entering={FadeIn.duration(400)} style={styles.rowIcons}>
          <Film size={24} color="#fbbf24" strokeWidth={2} />
          <Tv size={24} color="#34d399" strokeWidth={2} />
        </Animated.View>
        <Animated.Text entering={FadeInDown.delay(80).duration(400)} style={styles.kicker}>
          MOVIES & TV
        </Animated.Text>
        <View style={styles.statRow}>
          <Animated.View entering={FadeInUp.delay(140).duration(450)} style={styles.statBox}>
            <Text style={[styles.midStat, { color: '#fbbf24' }]}>{recap.uniqueMovies}</Text>
            <Text style={styles.statLabel}>Movies watched</Text>
            <Text style={styles.statHint}>{recap.moviesWatched} plays</Text>
          </Animated.View>
          <Animated.View entering={FadeInUp.delay(220).duration(450)} style={styles.statBox}>
            <Text style={[styles.midStat, { color: '#34d399' }]}>{recap.uniqueShows}</Text>
            <Text style={styles.statLabel}>TV shows</Text>
            <Text style={styles.statHint}>{recap.episodesWatched} episodes</Text>
          </Animated.View>
        </View>
        <MixBar moviePct={recap.movieWatchPercent} tvPct={recap.tvWatchPercent} delay={320} />
        <Animated.Text entering={FadeIn.delay(400).duration(400)} style={styles.bodyMuted}>
          Of all plays: {recap.movieWatchPercent}% movies · {recap.tvWatchPercent}% TV
        </Animated.Text>
      </>
    ),
  });

  // Poster gallery — Movies / TV Shows tabs
  if (recap.movieTitles.length > 0 || recap.showTitles.length > 0) {
    slides.push({
      key: 'library',
      colors: ['#1a1025', '#0d0814', '#050308'],
      accent: '#c4b5fd',
      render: () => (
        <>
          <Animated.Text entering={FadeInDown.delay(60).duration(400)} style={styles.kicker}>
            YOUR SHELF
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(120).duration(400)} style={styles.heroTitleSm}>
            Legends in your library
          </Animated.Text>
          <Animated.Text entering={FadeIn.delay(160).duration(400)} style={styles.bodyMuted}>
            Scanned titles from your collection — watched ones glow first
          </Animated.Text>
          <PosterTabs movies={recap.movieTitles} shows={recap.showTitles} />
        </>
      ),
    });
  }

  // TV shows by episode share
  if (recap.topShowsByEpisodes.length > 0) {
    slides.push({
      key: 'shows',
      colors: ['#052e1c', '#021a12', '#010d09'],
      accent: '#34d399',
      render: () => (
        <>
          <Animated.View entering={FadeIn.duration(400)}>
            <Tv size={28} color="#34d399" strokeWidth={2} />
          </Animated.View>
          <Animated.Text entering={FadeInDown.delay(80).duration(400)} style={styles.kicker}>
            YOUR SHOWS
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(140).duration(400)} style={styles.heroTitleSm}>
            Episode share
          </Animated.Text>
          <View style={styles.showList}>
            {recap.topShowsByEpisodes.slice(0, 5).map((s, i) => (
              <Animated.View
                key={s.mediaId}
                entering={FadeInUp.delay(160 + i * 70).duration(400)}
                style={styles.showRow}
              >
                <View style={styles.showRowTop}>
                  <Text style={styles.showName} numberOfLines={1}>
                    {s.title}
                  </Text>
                  <Text style={styles.showPct}>{s.ofTvPercent}%</Text>
                </View>
                <View style={styles.showTrack}>
                  <View
                    style={[
                      styles.showFill,
                      { width: `${Math.max(4, Math.min(100, s.ofTvPercent))}%` },
                    ]}
                  />
                </View>
                <Text style={styles.showEps}>
                  {s.episodesLogged} episode{s.episodesLogged === 1 ? '' : 's'} of your TV time
                </Text>
              </Animated.View>
            ))}
          </View>
        </>
      ),
    });
  }

  if (recap.topGenre || recap.genreBreakdown.length > 0) {
    slides.push({
      key: 'genre',
      colors: ['#2e1065', '#15082f', '#080414'],
      accent: '#e9d5ff',
      render: () => (
        <>
          <Animated.View entering={FadeIn.duration(400)}>
            <Sparkles size={28} color="#e9d5ff" strokeWidth={2} />
          </Animated.View>
          <Animated.Text entering={FadeInDown.delay(80).duration(400)} style={styles.kicker}>
            YOUR MOOD
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(160).springify()} style={styles.heroTitleSm}>
            {recap.topGenre ?? 'Unknown'}
          </Animated.Text>
          <View style={styles.genreList}>
            {recap.genreBreakdown.slice(0, 5).map((g, i) => (
              <Animated.View
                key={g.genre}
                entering={FadeInUp.delay(180 + i * 60).duration(380)}
                style={styles.genreRow}
              >
                <Text style={styles.genreName}>{g.genre}</Text>
                <Text style={styles.genreCount}>{g.count}</Text>
              </Animated.View>
            ))}
          </View>
        </>
      ),
    });
  }

  if (recap.animeHours > 0 || recap.animeEpisodes > 0) {
    slides.push({
      key: 'anime',
      colors: ['#4c0519', '#1f0410', '#0a0206'],
      accent: '#fda4af',
      render: () => (
        <>
          <Animated.Text entering={FadeIn.duration(500)} style={styles.emoji}>
            ✨
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(80).duration(400)} style={styles.kicker}>
            ANIME ARC
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(160).springify()} style={styles.bigStat}>
            {recap.animeHours}
            <Text style={styles.bigStatUnit}>h</Text>
          </Animated.Text>
          <Animated.Text entering={FadeInUp.delay(280).duration(400)} style={styles.body}>
            {recap.animeEpisodes} episode{recap.animeEpisodes === 1 ? '' : 's'} — the binge
            that felt personal
          </Animated.Text>
        </>
      ),
    });
  }

  slides.push({
    key: 'streak',
    colors: ['#431407', '#1c0a05', '#0a0402'],
    accent: '#fb923c',
    render: () => (
      <>
        <Animated.View entering={FadeIn.duration(400)}>
          <Flame size={32} color="#fb923c" strokeWidth={2} />
        </Animated.View>
        <Animated.Text entering={FadeInDown.delay(80).duration(400)} style={styles.kicker}>
          ON A ROLL
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(160).springify()} style={styles.bigStat}>
          {recap.longestStreak}
        </Animated.Text>
        <Animated.Text entering={FadeInUp.delay(280).duration(400)} style={styles.body}>
          Best streak: {recap.longestStreak} day
          {recap.longestStreak === 1 ? '' : 's'}
          {recap.currentStreak > 0
            ? `\nStill going: ${recap.currentStreak} day${recap.currentStreak === 1 ? '' : 's'}`
            : ''}
        </Animated.Text>
      </>
    ),
  });

  if (recap.topTitles.length > 0) {
    slides.push({
      key: 'tops',
      colors: ['#042f2e', '#021c1b', '#010f0e'],
      accent: '#5eead4',
      render: () => (
        <>
          <Animated.View entering={FadeIn.duration(400)}>
            <Heart size={28} color="#5eead4" strokeWidth={2} />
          </Animated.View>
          <Animated.Text entering={FadeInDown.delay(80).duration(400)} style={styles.kicker}>
            CAME BACK FOR
          </Animated.Text>
          <View style={styles.topList}>
            {recap.topTitles.slice(0, 5).map((t, i) => (
              <Animated.View
                key={t.mediaId}
                entering={FadeInUp.delay(120 + i * 70).duration(400)}
                style={styles.topRow}
              >
                <Text style={styles.topRank}>{i + 1}</Text>
                {t.posterUrl ? (
                  <Image source={{ uri: t.posterUrl }} style={styles.topPoster} />
                ) : (
                  <View style={[styles.topPoster, styles.topPosterPh]} />
                )}
                <View style={styles.topMeta}>
                  <Text style={styles.topTitle} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <Text style={styles.topSub}>
                    {t.type === 'movie' ? 'Movie' : 'Show'}
                    {t.watchCount > 1 ? ` · ×${t.watchCount}` : ''}
                  </Text>
                </View>
              </Animated.View>
            ))}
          </View>
        </>
      ),
    });
  }

  slides.push({
    key: 'outro',
    colors: ['#1e1b4b', '#0f0a24', '#05040f'],
    accent: '#a78bfa',
    render: () => (
      <>
        <Animated.Text entering={FadeInDown.delay(80).duration(400)} style={styles.kicker}>
          THAT’S A WRAP
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(160).duration(500)} style={styles.heroTitleSm}>
          {recap.headline}
        </Animated.Text>
        <Animated.Text entering={FadeInUp.delay(280).duration(400)} style={styles.bodyMuted}>
          {recap.subhead}
        </Animated.Text>
        <Animated.Text entering={FadeInUp.delay(360).duration(400)} style={styles.bodyMuted}>
          Hold to pause · tap edges to skip
        </Animated.Text>
      </>
    ),
  });

  return slides;
}

// ─── Modal ───────────────────────────────────────────────────────────────────

interface WrappedModalProps {
  visible: boolean;
  history: WatchEvent[];
  /** Scanned library — included for nostalgia even if never played */
  library?: MediaItem[];
  onClose: () => void;
}

export function WrappedModal({
  visible,
  history,
  library = [],
  onClose,
}: WrappedModalProps) {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [holding, setHolding] = useState(false);
  const progress = useSharedValue(0);
  const pageRef = useRef(0);
  const holdingRef = useRef(false);
  const slidesLenRef = useRef(1);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const recap = useMemo(
    () => wrappedService.buildWrappedRecap(history, library),
    [history, library],
  );

  const handleShare = useCallback(async () => {
    if (sharing || recap.eventCount === 0) return;
    setSharing(true);
    try {
      await wrappedService.shareWrapped(recap);
    } catch {
      /* cancelled */
    } finally {
      setSharing(false);
    }
  }, [recap, sharing]);

  const slides = useMemo(() => buildSlides(recap), [recap]);

  slidesLenRef.current = slides.length;

  const clearPaused = useCallback(() => {
    holdingRef.current = false;
    setHolding(false);
  }, []);

  const exitWrapped = useCallback(() => {
    cancelAnimation(progress);
    progress.value = 0;
    clearPaused();
    onCloseRef.current();
  }, [clearPaused, progress]);

  const goTo = useCallback(
    (next: number) => {
      const len = slidesLenRef.current;
      clearPaused(); // hide “Paused” when changing slides
      if (next < 0) {
        setPage(0);
        pageRef.current = 0;
        return;
      }
      if (next >= len) {
        // Tap past the last slide → leave Wrapped
        exitWrapped();
        return;
      }
      setPage(next);
      pageRef.current = next;
    },
    [clearPaused, exitWrapped],
  );

  const advance = useCallback(() => {
    const len = slidesLenRef.current;
    const cur = pageRef.current;
    clearPaused();
    if (cur >= len - 1) {
      // Timer finished on the last wrap → exit
      exitWrapped();
      return;
    }
    goTo(cur + 1);
  }, [clearPaused, exitWrapped, goTo]);

  const startProgress = useCallback(() => {
    cancelAnimation(progress);
    progress.value = 0;
    if (holdingRef.current) return;
    progress.value = withTiming(
      1,
      { duration: SLIDE_MS, easing: Easing.linear },
      (finished) => {
        if (finished && !holdingRef.current) {
          runOnJS(advance)();
        }
      },
    );
  }, [advance, progress]);

  // Reset when opened
  useEffect(() => {
    if (!visible) {
      cancelAnimation(progress);
      progress.value = 0;
      setPage(0);
      pageRef.current = 0;
      clearPaused();
      return;
    }
    setPage(0);
    pageRef.current = 0;
    clearPaused();
    startProgress();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // New page → restart timer (and clear pause chip)
  useEffect(() => {
    if (!visible) return;
    pageRef.current = page;
    clearPaused();
    startProgress();
  }, [page, visible, startProgress, clearPaused]);

  const onHoldStart = () => {
    holdingRef.current = true;
    setHolding(true);
    cancelAnimation(progress);
  };

  const onHoldEnd = () => {
    if (!holdingRef.current) return;
    // Hide “Paused” as soon as the timer starts again
    clearPaused();
    // Resume remaining portion of the 6s
    const remaining = Math.max(0.05, 1 - progress.value) * SLIDE_MS;
    progress.value = withTiming(
      1,
      { duration: remaining, easing: Easing.linear },
      (finished) => {
        if (finished && !holdingRef.current) {
          runOnJS(advance)();
        }
      },
    );
  };

  const onTapZone = (side: 'left' | 'right') => {
    // If releasing from a hold, don't also treat as a tap advance
    if (holdingRef.current) return;
    clearPaused();
    if (side === 'left') {
      goTo(pageRef.current - 1);
    } else {
      goTo(pageRef.current + 1);
    }
  };

  const active = slides[page] ?? slides[0];
  if (!active) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <LinearGradient colors={active.colors} style={StyleSheet.absoluteFill} />

        {/* Soft vignette + film feel */}
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'transparent', 'transparent', 'rgba(0,0,0,0.75)']}
          locations={[0, 0.2, 0.65, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.grain} pointerEvents="none" />

        {/* Status bars */}
        <View style={[styles.pips, { paddingTop: insets.top + 8 }]}>
          {slides.map((s, i) => (
            <StatusPip key={s.key} index={i} activeIndex={page} progress={progress} />
          ))}
        </View>

        <Pressable
          style={[styles.close, { top: insets.top + 22 }]}
          onPress={onClose}
          hitSlop={12}
        >
          <X size={20} color="#ffffff" strokeWidth={2.5} />
        </Pressable>

        {/* Content — high enough for Share; gestures leave a bottom gap */}
        <View
          style={[
            styles.slide,
            { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 28 },
          ]}
          pointerEvents="box-none"
        >
          <View key={active.key} style={styles.slideInner} pointerEvents="box-none">
            {active.render()}
          </View>
          <Text style={styles.slideWatermark}>FilmSort · {recap.year}</Text>
        </View>

        {/*
          Tap zones: left = back, right = next.
          Hold anywhere on a zone to pause (WhatsApp status style).
          Bottom strip is clear so Share remains tappable.
        */}
        <View style={styles.gestureLayer} pointerEvents="box-none">
          {/* Edge-only hit targets so center (poster tabs / share) stays interactive */}
          <View style={styles.gestureZones} pointerEvents="box-none">
            <Pressable
              style={styles.zoneLeft}
              onPress={() => onTapZone('left')}
              onLongPress={onHoldStart}
              onPressOut={onHoldEnd}
              delayLongPress={140}
            />
            <View style={styles.zoneCenter} pointerEvents="none" />
            <Pressable
              style={styles.zoneRight}
              onPress={() => onTapZone('right')}
              onLongPress={onHoldStart}
              onPressOut={onHoldEnd}
              delayLongPress={140}
            />
          </View>
          <View style={styles.gestureBottomClear} pointerEvents="none" />
        </View>

        {holding && (
          <View style={[styles.holdHint, { top: insets.top + 52 }]} pointerEvents="none">
            <Text style={styles.holdHintText}>Paused</Text>
          </View>
        )}

        {/* Share sits above gesture zones so it always receives taps */}
        {page === slides.length - 1 && (
          <View
            style={[styles.shareDock, { paddingBottom: insets.bottom + 16 }]}
            pointerEvents="box-none"
          >
            <Pressable
              style={[styles.shareCta, sharing && { opacity: 0.7 }]}
              disabled={sharing || recap.eventCount === 0}
              onPress={handleShare}
            >
              {sharing ? (
                <ActivityIndicator color="#0a0a0a" />
              ) : (
                <>
                  <Share2 size={18} color="#0a0a0a" strokeWidth={2.5} />
                  <Text style={styles.shareCtaText}>Share Wrapped</Text>
                </>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  grain: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.06,
    backgroundColor: 'transparent',
    // Subtle noise substitute: dotted grid via borders on empty overlay
    borderWidth: 0,
  },
  pips: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 12,
    zIndex: 20,
  },
  pipTrack: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  pipFill: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
  close: {
    position: 'absolute',
    right: 12,
    zIndex: 30,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gestureLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 15,
    justifyContent: 'flex-start',
  },
  gestureZones: {
    flex: 1,
    flexDirection: 'row',
  },
  gestureBottomClear: {
    height: Math.max(160, H * 0.22),
  },
  zoneLeft: {
    width: Math.max(56, W * 0.18),
  },
  zoneCenter: {
    flex: 1,
  },
  zoneRight: {
    width: Math.max(56, W * 0.18),
  },
  holdHint: {
    position: 'absolute',
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 25,
  },
  holdHintText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  slide: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    zIndex: 5,
  },
  slideInner: {
    gap: 12,
    alignItems: 'flex-start',
    maxWidth: W * 0.9,
  },
  slideWatermark: {
    position: 'absolute',
    // Higher on the slide so it sits above the share dock / home area
    bottom: 96,
    left: 28,
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.42)',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  posterTabsRoot: {
    width: '100%',
    marginTop: 8,
    gap: 12,
    maxHeight: H * 0.48,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
  },
  tabChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  tabChipOnMovie: {
    backgroundColor: '#fbbf24',
    borderColor: '#fbbf24',
  },
  tabChipOnTv: {
    backgroundColor: '#34d399',
    borderColor: '#34d399',
  },
  tabChipText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '800',
  },
  tabChipTextOn: {
    color: '#0a0a0a',
  },
  tabCount: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '800',
  },
  tabCountOn: {
    color: 'rgba(0,0,0,0.55)',
  },
  posterScroll: {
    flexGrow: 0,
  },
  posterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: POSTER_GAP,
    paddingBottom: 12,
  },
  posterCard: {
    width: POSTER_CARD_W,
    gap: 6,
  },
  posterImg: {
    width: POSTER_CARD_W,
    height: POSTER_CARD_H,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
  },
  posterPh: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27272a',
  },
  posterInitial: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 28,
    fontWeight: '900',
  },
  posterName: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  posterYear: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '700',
  },
  watchedBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(52,211,153,0.92)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  watchedBadgeText: {
    color: '#052e16',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  posterEmpty: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 2.2,
  },
  heroYear: {
    fontSize: 64,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -2.5,
    marginTop: -6,
  },
  heroTitle: {
    fontSize: 42,
    fontWeight: '900',
    color: '#c4b5fd',
    letterSpacing: -1.2,
    marginTop: -8,
  },
  heroTitleSm: {
    fontSize: 30,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.7,
    lineHeight: 36,
  },
  bigStat: {
    fontSize: 76,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -3,
  },
  bigStatUnit: {
    fontSize: 34,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.5)',
  },
  midStat: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  body: {
    fontSize: 17,
    lineHeight: 26,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
    maxWidth: W * 0.85,
  },
  bodyMuted: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.48)',
    fontWeight: '500',
    maxWidth: W * 0.85,
  },
  rowIcons: { flexDirection: 'row', gap: 14 },
  statRow: { flexDirection: 'row', gap: 20, marginTop: 6, width: '100%' },
  statBox: { flex: 1, minWidth: 0 },
  statLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  statHint: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.32)',
    marginTop: 2,
  },
  mixWrap: { width: '100%', gap: 8, marginTop: 10 },
  mixLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mixLabelMovie: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '800',
  },
  mixLabelTv: {
    color: '#34d399',
    fontSize: 12,
    fontWeight: '800',
  },
  mixTrack: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  mixMovie: {
    backgroundColor: '#fbbf24',
    height: '100%',
  },
  mixTv: {
    backgroundColor: '#34d399',
    height: '100%',
  },
  showList: { width: '100%', gap: 14, marginTop: 6 },
  showRow: { gap: 5 },
  showRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  showName: {
    flex: 1,
    color: '#ecfdf5',
    fontSize: 15,
    fontWeight: '800',
  },
  showPct: {
    color: '#34d399',
    fontSize: 15,
    fontWeight: '900',
  },
  showTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  showFill: {
    height: '100%',
    backgroundColor: '#34d399',
    borderRadius: 999,
  },
  showEps: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.38)',
  },
  genreList: { width: '100%', gap: 8, marginTop: 6 },
  genreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  genreName: { color: '#f5f3ff', fontSize: 16, fontWeight: '700' },
  genreCount: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 15,
    fontWeight: '700',
  },
  emoji: { fontSize: 36 },
  topList: { width: '100%', gap: 12, marginTop: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  topRank: {
    width: 22,
    fontSize: 18,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.35)',
  },
  topPoster: {
    width: 40,
    height: 60,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
  },
  topPosterPh: { backgroundColor: '#27272a' },
  topMeta: { flex: 1, gap: 3 },
  topTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  topSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '600',
  },
  shareDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    elevation: 40,
    paddingHorizontal: 28,
    paddingTop: 8,
    alignItems: 'stretch',
  },
  shareCta: {
    backgroundColor: '#a78bfa',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  shareCtaText: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: '900',
  },
});

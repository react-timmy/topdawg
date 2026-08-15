/**
 * MemoriesCard
 *
 * Profile card for Advanced Memories:
 *  - Free: basic recap (counts + recent titles list)
 *  - Pro: full mosaic hero, open FilmSort Wrapped, share recap
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Share2, Lock, Crown, Sparkles } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { MediaItem } from '../types';
import { WatchEvent } from '../storage/watchHistoryService';
import { memoriesService, UniqueTitleEntry } from '../services/memoriesService';
import { wrappedService } from '../services/wrappedService';
import { usePro } from '../context/ProContext';
import { WrappedModal } from './WrappedModal';
import { ProPaywallModal } from './ProPaywallModal';

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_W = SCREEN_WIDTH - 32;
const HERO_H = Math.round(CARD_W * 0.58);
const MOSAIC_COLS = 6;
const MOSAIC_ROWS = 3;
const POSTER_COUNT = MOSAIC_COLS * MOSAIC_ROWS;
const POSTER_W = Math.floor(CARD_W / MOSAIC_COLS);

// ─── MosaicBackground ────────────────────────────────────────────────────────

function MosaicBackground({ titles }: { titles: UniqueTitleEntry[] }) {
  const withPoster = titles.filter((t) => !!t.posterUrl);
  const slots = Array.from({ length: POSTER_COUNT }, (_, i) => withPoster[i] ?? null);

  return (
    <View style={styles.mosaicWrap}>
      {Array.from({ length: MOSAIC_ROWS }, (_, row) => (
        <View key={row} style={styles.mosaicRow}>
          {Array.from({ length: MOSAIC_COLS }, (_, col) => {
            const entry = slots[row * MOSAIC_COLS + col];
            if (entry?.posterUrl) {
              return (
                <Image
                  key={`${row}-${col}`}
                  source={{ uri: entry.posterUrl }}
                  style={styles.mosaicPoster}
                  resizeMode="cover"
                />
              );
            }
            const hue = entry
              ? (entry.title.charCodeAt(0) * 37) % 360
              : (row * MOSAIC_COLS + col) * 23;
            return (
              <View
                key={`${row}-${col}`}
                style={[styles.mosaicPoster, { backgroundColor: `hsl(${hue}, 25%, 12%)` }]}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── ProLockOverlay ───────────────────────────────────────────────────────────

function ProLockOverlay({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      style={styles.lockOverlay}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Unlock Pro for Wrapped"
    >
      <View style={styles.lockBg} />
      <View style={styles.lockContent}>
        <View style={styles.lockIconRing}>
          <Lock size={22} color="#a78bfa" strokeWidth={2} />
        </View>
        <Text style={styles.lockTitle}>Pro · Wrapped</Text>
        <Text style={styles.lockSub}>Deep stats & shareable{'\n'}year recap</Text>
        <View style={styles.lockCta}>
          <Crown size={13} color="#000000" strokeWidth={2.5} />
          <Text style={styles.lockCtaText}>Unlock Pro</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── MemoriesCard ─────────────────────────────────────────────────────────────

interface MemoriesCardProps {
  history: WatchEvent[];
  /** Scanned library shelf — shown in Memories even if never played */
  library?: MediaItem[];
  animDelay?: number;
}

export function MemoriesCard({
  history,
  library = [],
  animDelay = 200,
}: MemoriesCardProps) {
  const { isPro, refreshPro } = usePro();
  const [sharing, setSharing] = useState(false);
  const [wrappedOpen, setWrappedOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const year = new Date().getFullYear();
  const historyTitles = useMemo(
    () => memoriesService.buildUniqueTitles(history),
    [history],
  );
  const recap = useMemo(
    () => wrappedService.buildWrappedRecap(history, library, year),
    [history, library, year],
  );

  // Mosaic + free list: library shelf merged with watched (nostalgia first)
  const titles = useMemo(() => {
    const { all } = wrappedService.mergeLibraryAndHistory(
      library,
      historyTitles,
      year,
    );
    return all;
  }, [library, historyTitles, year]);

  const movies = recap.libraryMovies;
  const shows = recap.libraryShows;
  const empty =
    titles.length === 0 &&
    history.length === 0 &&
    library.length === 0;
  const recent = titles.slice(0, 8);

  const statsLine = [
    movies > 0 ? `${movies} film${movies !== 1 ? 's' : ''}` : '',
    shows > 0 ? `${shows} show${shows !== 1 ? 's' : ''}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ');

  const openWrapped = useCallback(() => {
    if (!isPro) {
      setPaywallOpen(true);
      return;
    }
    if (empty) {
      Alert.alert('Nothing yet', 'Scan or watch titles to build Memories.');
      return;
    }
    setWrappedOpen(true);
  }, [isPro, empty]);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    if (!isPro) {
      setPaywallOpen(true);
      return;
    }
    if (empty) {
      Alert.alert('Nothing to share yet', 'Scan or watch titles first.');
      return;
    }
    setSharing(true);
    try {
      await wrappedService.shareWrapped(recap);
    } catch (err: unknown) {
      const msg = String((err as { message?: string })?.message ?? '');
      if (msg !== 'NO_HISTORY') Alert.alert('Could not share', 'Please try again.');
    } finally {
      setSharing(false);
    }
  }, [recap, sharing, isPro, empty]);

  return (
    <>
      <Animated.View
        entering={FadeInDown.delay(animDelay).duration(340)}
        style={styles.card}
      >
        {/* ── Hero ── */}
        <Pressable onPress={openWrapped} disabled={empty && isPro}>
          <View style={styles.hero}>
            <MosaicBackground titles={titles} />
            <View style={styles.heroScrim} />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.9)']}
              locations={[0, 0.55, 1]}
              style={styles.heroGradientBottom}
            />
            <LinearGradient
              colors={['rgba(0,0,0,0.5)', 'transparent']}
              locations={[0, 1]}
              style={styles.heroGradientTop}
            />

            {/* Center CTA */}
            <View style={styles.playCenter}>
              {isPro ? (
                <View style={styles.wrappedPill}>
                  <Sparkles size={14} color="#c4b5fd" strokeWidth={2.5} />
                  <Text style={styles.wrappedPillText}>
                    {empty ? 'Scan or watch' : `Open Wrapped ${recap.year}`}
                  </Text>
                </View>
              ) : null}
            </View>

            {!empty && (
              <View style={styles.countBadge}>
                <Text style={styles.countNum}>{titles.length}</Text>
                <Text style={styles.countLabel}>titles</Text>
              </View>
            )}

            {!empty && statsLine ? (
              <View style={styles.statsBadge}>
                <Text style={styles.statsText}>{statsLine}</Text>
              </View>
            ) : null}

            <View style={styles.topLabel}>
              <Crown size={11} color="#3f3f3fff" strokeWidth={2.5} />
              <Text style={styles.topLabelText}>MEMORIES</Text>
            </View>

            <View style={styles.watermarkWrap}>
              <Text style={styles.watermark}>FilmSort</Text>
            </View>

            {!isPro && <ProLockOverlay onPress={() => setPaywallOpen(true)} />}
          </View>
        </Pressable>

        {/* ── Free: basic recent list ── */}
        {!isPro && (
          <View style={styles.freeBlock}>
            <Text style={styles.freeTitle}>Your shelf</Text>
            {empty ? (
              <Text style={styles.freeEmpty}>Scan videos to fill your nostalgic shelf.</Text>
            ) : (
              recent.map((t) => (
                <View key={t.mediaId} style={styles.freeRow}>
                  {t.posterUrl ? (
                    <Image source={{ uri: t.posterUrl }} style={styles.freePoster} />
                  ) : (
                    <View style={[styles.freePoster, styles.freePosterPh]} />
                  )}
                  <View style={styles.freeMeta}>
                    <Text style={styles.freeName} numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text style={styles.freeSub}>
                      {t.type === 'movie' ? 'Movie' : 'Show'}
                      {t.watched || t.watchCount > 0
                        ? t.watchCount > 1
                          ? ` · Watched ×${t.watchCount}`
                          : ' · Watched'
                        : ' · On shelf'}
                    </Text>
                  </View>
                </View>
              ))
            )}
            <Text style={styles.freeHint}>Pro unlocks Wrapped stats & share</Text>
          </View>
        )}

        {/* ── Pro footer ── */}
        {isPro && (
          <View style={styles.footer}>
            <View style={styles.footerLeft}>
              <Text style={styles.footerTitle}>Your Wrapped</Text>
              <Text style={styles.footerSub}>
                {empty
                  ? 'Scan or watch to build your recap'
                  : recap.headline.length > 48
                    ? `${recap.totalHours}h · ${recap.libraryMovies + recap.libraryShows} on shelf`
                    : recap.headline}
              </Text>
            </View>

            <View style={styles.footerActions}>
              <Pressable
                onPress={openWrapped}
                disabled={empty}
                style={({ pressed }) => [
                  styles.wrapBtn,
                  empty && styles.shareBtnDisabled,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Sparkles size={13} color={empty ? '#52525b' : '#c4b5fd'} strokeWidth={2.5} />
                <Text style={[styles.wrapBtnText, empty && styles.shareBtnTextDisabled]}>
                  Open
                </Text>
              </Pressable>
              <Pressable
                onPress={handleShare}
                disabled={sharing || empty}
                style={({ pressed }) => [
                  styles.shareBtn,
                  empty && styles.shareBtnDisabled,
                  pressed && { opacity: 0.75 },
                ]}
              >
                {sharing ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Share2
                      size={13}
                      color={empty ? '#52525b' : '#ffffff'}
                      strokeWidth={2.5}
                    />
                    <Text
                      style={[styles.shareBtnText, empty && styles.shareBtnTextDisabled]}
                    >
                      Share
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </Animated.View>

      <WrappedModal
        visible={wrappedOpen}
        history={history}
        library={library}
        onClose={() => setWrappedOpen(false)}
      />

      <ProPaywallModal
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onPurchaseSuccess={async () => {
          await refreshPro();
          setPaywallOpen(false);
        }}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CARD_BG = 'rgba(255,255,255,0.04)';
const CARD_BORDER = 'rgba(255,255,255,0.08)';

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 16,
    overflow: 'hidden',
  },
  hero: {
    height: HERO_H,
    overflow: 'hidden',
    backgroundColor: '#080808',
  },
  mosaicWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.45,
  },
  mosaicRow: { flexDirection: 'row', flex: 1 },
  mosaicPoster: {
    width: POSTER_W,
    flex: 1,
    backgroundColor: '#111111',
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.30)',
  },
  heroGradientBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: HERO_H * 0.65,
  },
  heroGradientTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: HERO_H * 0.35,
  },
  playCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrappedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.45)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
  },
  wrappedPillText: {
    color: '#f5f3ff',
    fontSize: 14,
    fontWeight: '800',
  },
  countBadge: {
    position: 'absolute',
    bottom: 14,
    left: 16,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  countNum: {
    fontSize: 30,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -1,
  },
  countLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.70)',
  },
  statsBadge: {
    position: 'absolute',
    bottom: 14,
    right: 14,
  },
  statsText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
  },
  topLabel: {
    position: 'absolute',
    top: 12,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  topLabelText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1.8,
  },
  watermarkWrap: {
    position: 'absolute',
    top: 12,
    right: 14,
  },
  watermark: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  lockContent: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  lockIconRing: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(167,139,250,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  lockTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
  },
  lockSub: {
    color: '#a1a1aa',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  lockCta: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#a78bfa',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  lockCtaText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '900',
  },

  freeBlock: {
    padding: 14,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: CARD_BORDER,
  },
  freeTitle: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  freeEmpty: {
    color: '#52525b',
    fontSize: 13,
  },
  freeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  freePoster: {
    width: 32,
    height: 48,
    borderRadius: 4,
    backgroundColor: '#1a1a1a',
  },
  freePosterPh: {
    backgroundColor: '#27272a',
  },
  freeMeta: { flex: 1, gap: 2 },
  freeName: {
    color: '#f4f4f5',
    fontSize: 14,
    fontWeight: '700',
  },
  freeSub: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '600',
  },
  freeHint: {
    marginTop: 4,
    color: '#52525b',
    fontSize: 12,
    fontWeight: '600',
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: CARD_BORDER,
  },
  footerLeft: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  footerTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  footerSub: {
    color: '#71717a',
    fontSize: 12,
    fontWeight: '500',
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wrapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(167,139,250,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
  },
  wrapBtnText: {
    color: '#c4b5fd',
    fontSize: 12,
    fontWeight: '800',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
  },
  shareBtnDisabled: {
    opacity: 0.5,
  },
  shareBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  shareBtnTextDisabled: {
    color: '#52525b',
  },
});

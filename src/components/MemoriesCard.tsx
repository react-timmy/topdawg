/**
 * MemoriesCard
 *
 * A premium-styled card shown in ProfileScreen.
 * Displays a mosaic of poster thumbnails behind rich gradient overlays,
 * a YouTube Silver Play Button-inspired control, and a share CTA.
 *
 * PRO-ONLY: Shows a lock overlay when user is not Pro.
 */

import React, { useCallback, useState } from 'react';
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
import { Share2, Lock, Crown } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { WatchEvent } from '../storage/watchHistoryService';
import { memoriesService, UniqueTitleEntry } from '../services/memoriesService';
import { usePro } from '../context/ProContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_W = SCREEN_WIDTH - 32;          // 16px padding each side
const HERO_H = Math.round(CARD_W * 0.58); // slightly taller for more impact
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

// ─── PlayButton ───────────────────────────────────────────────────────────────
/**
 * YouTube Silver Play Button-inspired control.
 * Dark outer shell → bright top/left rim + dark bottom/right rim (3-D embossed)
 * → recessed inner area → white triangle.
 */
function PlayButton() {
  return (
    <View style={styles.playOuter}>
      {/* Rim highlights — top and left catch the light */}
      <View style={styles.playRimTop} />
      <View style={styles.playRimLeft} />
      {/* Rim shadows — bottom and right recede */}
      <View style={styles.playRimBottom} />
      <View style={styles.playRimRight} />
      {/* Recessed inner area */}
      <View style={styles.playInner}>
        <View style={styles.playTriangle} />
      </View>
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
      accessibilityLabel="Unlock Pro to access Memories"
    >
      {/* Frosted dark layer */}
      <View style={styles.lockBg} />
      <View style={styles.lockContent}>
        <View style={styles.lockIconRing}>
          <Lock size={22} color="#a78bfa" strokeWidth={2} />
        </View>
        <Text style={styles.lockTitle}>Pro Feature</Text>
        <Text style={styles.lockSub}>Unlock Pro to share{'\n'}your watch memories</Text>
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
  animDelay?: number;
}

export function MemoriesCard({ history, animDelay = 200 }: MemoriesCardProps) {
  const { isPro } = usePro();
  const [sharing, setSharing] = useState(false);

  const titles = React.useMemo(
    () => memoriesService.buildUniqueTitles(history),
    [history],
  );

  const movies = titles.filter((t) => t.type === 'movie').length;
  const shows  = titles.filter((t) => t.type === 'tv').length;
  const empty  = titles.length === 0;

  const handleShare = useCallback(async () => {
    if (sharing || !isPro) return;
    if (empty) {
      Alert.alert('Nothing to share yet', 'Watch some titles first and come back!');
      return;
    }
    setSharing(true);
    try {
      await memoriesService.shareMemories(history);
    } catch (err: unknown) {
      const msg = String((err as any)?.message ?? '');
      if (msg !== 'NO_HISTORY') Alert.alert('Could not share', 'Please try again.');
    } finally {
      setSharing(false);
    }
  }, [history, titles.length, sharing, isPro, empty]);

  // Stats line
  const statsLine = [
    movies > 0 ? `${movies} film${movies !== 1 ? 's' : ''}` : '',
    shows  > 0 ? `${shows} show${shows  !== 1 ? 's' : ''}` : '',
  ].filter(Boolean).join('  ·  ');

  return (
    <Animated.View
      entering={FadeInDown.delay(animDelay).duration(340)}
      style={styles.card}
    >
      {/* ── Hero ── */}
      <View style={styles.hero}>
        {/* Poster mosaic — slightly desaturated base */}
        <MosaicBackground titles={titles} />

        {/* Layer 1: base dark scrim to unify mosaic colors */}
        <View style={styles.heroScrim} />

        {/* Layer 2: bottom-to-top gradient so bottom text is readable */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.88)']}
          locations={[0, 0.55, 1]}
          style={styles.heroGradientBottom}
        />

        {/* Layer 3: top fade for watermark legibility */}
        <LinearGradient
          colors={['rgba(0,0,0,0.5)', 'transparent']}
          locations={[0, 1]}
          style={styles.heroGradientTop}
        />

        {/* Centre play button */}
        <View style={styles.playCenter}>
          {sharing ? (
            <ActivityIndicator color="#ffffff" size="large" />
          ) : (
            <Pressable
              onPress={handleShare}
              disabled={sharing || empty || !isPro}
              style={({ pressed }) => pressed ? { opacity: 0.8 } : undefined}
              accessibilityRole="button"
              accessibilityLabel="Share watch memories"
            >
              <PlayButton />
            </Pressable>
          )}
        </View>

        {/* Bottom-left: title count */}
        {!empty && (
          <View style={styles.countBadge}>
            <Text style={styles.countNum}>{titles.length}</Text>
            <Text style={styles.countLabel}>titles</Text>
          </View>
        )}

        {/* Bottom-right: movie / show split */}
        {!empty && statsLine ? (
          <View style={styles.statsBadge}>
            <Text style={styles.statsText}>{statsLine}</Text>
          </View>
        ) : null}

        {/* Top-left: section label */}
        <View style={styles.topLabel}>
          <Crown size={11} color="#a78bfa" strokeWidth={2.5} />
          <Text style={styles.topLabelText}>MEMORIES</Text>
        </View>

        {/* Top-right: app watermark */}
        <View style={styles.watermarkWrap}>
          <Text style={styles.watermark}>FilmSort</Text>
        </View>

        {/* Pro lock overlay — sits on top of everything */}
        {!isPro && <ProLockOverlay onPress={() => {}} />}
      </View>

      {/* ── Footer ── */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Text style={styles.footerTitle}>Your Memories</Text>
          <Text style={styles.footerSub}>
            {empty
              ? 'Watch titles to build your recap'
              : !isPro
              ? 'Upgrade to Pro to share your recap'
              : 'Tap the play button to share'}
          </Text>
        </View>

        <Pressable
          onPress={handleShare}
          disabled={sharing || empty || !isPro}
          style={({ pressed }) => [
            styles.shareBtn,
            (!isPro || empty) && styles.shareBtnDisabled,
            pressed && { opacity: 0.75 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Share memories"
        >
          {sharing ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <>
              <Share2 size={13} color={!isPro || empty ? '#52525b' : '#ffffff'} strokeWidth={2.5} />
              <Text style={[styles.shareBtnText, (!isPro || empty) && styles.shareBtnTextDisabled]}>
                Share
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CARD_BG     = 'rgba(255,255,255,0.04)';
const CARD_BORDER = 'rgba(255,255,255,0.08)';

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 16,
    overflow: 'hidden',
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    height: HERO_H,
    overflow: 'hidden',
    backgroundColor: '#080808',
  },
  mosaicWrap: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0.45,
  },
  mosaicRow: { flexDirection: 'row', flex: 1 },
  mosaicPoster: {
    width: POSTER_W,
    flex: 1,
    backgroundColor: '#111111',
  },
  // Base scrim — unifies mosaic brightness before gradients
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.30)',
  },
  // Bottom gradient — makes lower text always readable
  heroGradientBottom: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: HERO_H * 0.65,
  },
  // Top gradient — gives watermark / label area a subtle fade
  heroGradientTop: {
    position: 'absolute',
    left: 0, right: 0, top: 0,
    height: HERO_H * 0.35,
  },

  // ── Play button ────────────────────────────────────────────────────────────
  playCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Outer shell — dark charcoal with embossed rim
  playOuter: {
    width: 76,
    height: 54,
    borderRadius: 12,
    backgroundColor: '#1c1c1e',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.75,
    shadowRadius: 14,
    elevation: 14,
  },
  // Top highlight rim — light source from above-left
  playRimTop: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 1.5,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.30)',
  },
  playRimLeft: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0,
    width: 1.5,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  // Bottom/right shadow rims
  playRimBottom: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 1.5,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  playRimRight: {
    position: 'absolute',
    top: 0, right: 0, bottom: 0,
    width: 1.5,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.50)',
  },
  // Recessed inner area — stamped cavity effect
  playInner: {
    width: 62,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#2a2a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // White triangle — CSS border trick, nudged right for optical centre
  playTriangle: {
    width: 0,
    height: 0,
    marginLeft: 4,
    borderTopWidth: 12,
    borderBottomWidth: 12,
    borderLeftWidth: 21,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#ffffff',
  },

  // ── Hero overlays ──────────────────────────────────────────────────────────
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
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  countLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.70)',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
    fontSize: 10,
    fontWeight: '800',
    color: '#a78bfa',
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

  // ── Pro lock overlay ──────────────────────────────────────────────────────
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
  },
  lockIconRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(167,139,250,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  lockTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  lockSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 19,
    fontWeight: '500',
  },
  lockCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#a78bfa',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
    marginTop: 4,
  },
  lockCtaText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  footerLeft: {
    flex: 1,
    gap: 3,
  },
  footerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.1,
  },
  footerSub: {
    fontSize: 12,
    color: '#52525b',
    fontWeight: '500',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    minWidth: 76,
    justifyContent: 'center',
  },
  shareBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.07)',
  },
  shareBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  shareBtnTextDisabled: {
    color: '#52525b',
  },
});

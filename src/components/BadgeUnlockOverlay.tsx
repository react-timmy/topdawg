/**
 * BadgeUnlockOverlay
 *
 * Phase "floating": A small animated gift box floats in the bottom-right corner.
 *   - Bounces in with a spring
 *   - Gentle bob/pulse loop to attract attention
 *   - X button to snooze it to Notifications / Profile
 *   - Tap the box to advance to "reveal"
 *
 * Phase "reveal": Full-screen animation:
 *   Phase A (0–400ms) : Gift box scales up to centre
 *   Phase B (400–800ms): Lid pops open, particles burst
 *   Phase C (800–1400ms): Badge icon springs in, confetti rains, text slides up
 *   Phase D: Tap anywhere or auto-dismiss after 5 s
 */
import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Modal,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  Easing,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import {
  Play, Film, Tv, Zap, Star, Sparkles, Heart, Eye,
  Moon, Trophy, Clock, Clapperboard, Gift, X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBadgeUnlock } from '../context/BadgeUnlockContext';
import { BadgeResult } from '../utils/badgeEngine';

const { width: W, height: H } = Dimensions.get('window');

// ─── Icon resolver ────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ size: number; color: string; strokeWidth?: number }>> = {
  Play, Film, Tv, Zap, Star, Sparkles, Heart, Eye, Moon, Trophy, Clock, Clapperboard,
};

function BadgeIcon({ name, size, color }: { name: string; size: number; color: string }) {
  const Icon = ICON_MAP[name] ?? Star;
  const nudge = name === 'Play' ? { marginLeft: 4 } : undefined;
  return (
    <View style={nudge}>
      <Icon size={size} color={color} strokeWidth={2} />
    </View>
  );
}

// ─── Particle ─────────────────────────────────────────────────────────────────

const PARTICLE_COLORS = [
  '#f59e0b', '#60a5fa', '#f472b6', '#34d399',
  '#a78bfa', '#fb7185', '#fbbf24', '#2dd4bf',
];

function Particle({ index, color, trigger }: {
  index: number; color: string; trigger: SharedValue<number>;
}) {
  const angle  = (index / 16) * Math.PI * 2;
  const radius = 90 + (index % 4) * 35;
  const dx = Math.cos(angle) * radius;
  const dy = Math.sin(angle) * radius;
  const size = 6 + (index % 3) * 4;

  const style = useAnimatedStyle(() => {
    const t = interpolate(trigger.value, [0, 1], [0, 1], Extrapolation.CLAMP);
    const opacity = interpolate(t, [0, 0.1, 0.7, 1], [0, 1, 1, 0]);
    return {
      opacity,
      transform: [
        { translateX: dx * t },
        { translateY: dy * t - 40 * t * t },
        { rotate: `${t * 360}deg` },
      ],
    };
  });

  return (
    <Animated.View style={[
      styles.particle, style,
      { width: size, height: size, borderRadius: index % 2 === 0 ? size : 2, backgroundColor: color },
    ]} />
  );
}

// ─── Confetti ─────────────────────────────────────────────────────────────────

function Confetti({ index, trigger }: { index: number; trigger: SharedValue<number> }) {
  const startX = -W / 2 + (index / 28) * W;
  const color  = PARTICLE_COLORS[index % PARTICLE_COLORS.length];
  const w = 6 + (index % 4) * 3;
  const delay = (index % 7) * 0.06;

  const style = useAnimatedStyle(() => {
    const raw = Math.max(0, trigger.value - delay);
    const t   = Math.min(1, raw / (1 - delay));
    const opacity = interpolate(t, [0, 0.05, 0.7, 1], [0, 1, 1, 0]);
    return {
      opacity,
      transform: [
        { translateX: startX + Math.sin(t * Math.PI * 2 + index) * 40 },
        { translateY: -H * 0.3 + t * (H * 0.6) },
        { rotate: `${t * (180 + index * 15)}deg` },
      ],
    };
  });

  return <Animated.View style={[styles.confetti, style, { width: w, height: w * 0.5, backgroundColor: color }]} />;
}

// ─── Gift box lid ─────────────────────────────────────────────────────────────

function GiftBoxLid({ openProgress, color }: { openProgress: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(openProgress.value, [0, 0.6, 1], [1, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(openProgress.value, [0, 1], [0, -30], Extrapolation.CLAMP) },
      { rotate: `${interpolate(openProgress.value, [0, 1], [0, -70], Extrapolation.CLAMP)}deg` },
    ],
  }));
  return (
    <Animated.View style={[styles.giftLid, { borderColor: color }, style]}>
      <View style={[styles.giftLidRibbon, { backgroundColor: color }]} />
    </Animated.View>
  );
}

// ─── PHASE 1: Floating gift box ───────────────────────────────────────────────

function FloatingGiftBox({ badge, onOpen, onSnooze }: {
  badge: BadgeResult;
  onOpen: () => void;
  onSnooze: () => void;
}) {
  const insets  = useSafeAreaInsets();
  const enterY  = useSharedValue(120);
  const enterX  = useSharedValue(0);
  const opacity = useSharedValue(0);
  const bob     = useSharedValue(0);
  const pulse   = useSharedValue(1);

  useEffect(() => {
    // Bounce in from bottom-right
    enterY.value  = withSpring(0, { damping: 10, stiffness: 160, mass: 0.9 });
    enterX.value  = withSpring(0, { damping: 14, stiffness: 140 });
    opacity.value = withTiming(1, { duration: 280 });

    // Gentle bob loop (starts after entry)
    bob.value = withDelay(600,
      withRepeat(
        withSequence(
          withTiming(-8, { duration: 700, easing: Easing.inOut(Easing.sin) }),
          withTiming(0,  { duration: 700, easing: Easing.inOut(Easing.sin) }),
        ),
        -1, // infinite
        false,
      ),
    );

    // Subtle scale pulse
    pulse.value = withDelay(600,
      withRepeat(
        withSequence(
          withTiming(1.06, { duration: 900, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.0,  { duration: 900, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: enterY.value + bob.value },
      { translateX: enterX.value },
      { scale: pulse.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.floatingContainer,
        { bottom: insets.bottom + 88 }, // above tab bar
        containerStyle,
      ]}
    >
      {/* Dismiss X */}
      <Pressable style={styles.floatingX} onPress={onSnooze} hitSlop={8}>
        <X size={11} color="#71717a" strokeWidth={2.5} />
      </Pressable>

      {/* Tappable box */}
      <Pressable onPress={onOpen} style={styles.floatingBox}>
        <View style={[styles.floatingGiftWrap, { borderColor: badge.color, shadowColor: badge.color }]}>
          {/* Ribbons */}
          <View style={[styles.floatRibbonV, { backgroundColor: badge.color }]} />
          <View style={[styles.floatRibbonH, { backgroundColor: badge.color }]} />
          <Gift size={28} color={badge.color} strokeWidth={1.8} />
        </View>
        <Text style={styles.floatingLabel}>Tap to open!</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── PHASE 2: Full reveal ─────────────────────────────────────────────────────

function BadgeReveal({ badge, onDismiss }: { badge: BadgeResult; onDismiss: () => void }) {
  const boxScale     = useSharedValue(0.35);  // starts small (the floating box size)
  const boxY         = useSharedValue(0);
  const openProgress = useSharedValue(0);
  const particleTrig = useSharedValue(0);
  const badgeScale   = useSharedValue(0);
  const badgeOpacity = useSharedValue(0);
  const labelOpacity = useSharedValue(0);
  const labelY       = useSharedValue(20);
  const glowOpacity  = useSharedValue(0);
  const bgOpacity    = useSharedValue(0);
  const confettiTrig = useSharedValue(0);

  const autoDismiss = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    bgOpacity.value = withTiming(1, { duration: 250 });

    // Box scales up to centre from small
    boxScale.value = withSpring(1, { damping: 10, stiffness: 200, mass: 0.7 });

    openProgress.value = withDelay(380,
      withTiming(1, { duration: 380, easing: Easing.out(Easing.back(1.5)) }),
    );
    particleTrig.value = withDelay(460,
      withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }),
    );
    badgeScale.value   = withDelay(720, withSpring(1, { damping: 8, stiffness: 220, mass: 0.6 }));
    badgeOpacity.value = withDelay(720, withTiming(1, { duration: 180 }));
    glowOpacity.value  = withDelay(840,
      withRepeat(
        withSequence(
          withTiming(0.7, { duration: 600 }),
          withTiming(0.3, { duration: 600 }),
        ), -1, false,
      ),
    );
    labelOpacity.value = withDelay(900, withTiming(1, { duration: 320 }));
    labelY.value       = withDelay(900, withSpring(0, { damping: 14, stiffness: 200 }));
    confettiTrig.value = withDelay(950,
      withTiming(1, { duration: 2400, easing: Easing.out(Easing.cubic) }),
    );

    autoDismiss.current = setTimeout(onDismiss, 5000);
    return () => { if (autoDismiss.current) clearTimeout(autoDismiss.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const bgStyle    = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));
  const boxStyle   = useAnimatedStyle(() => ({ transform: [{ scale: boxScale.value }, { translateY: boxY.value }] }));
  const badgeStyle = useAnimatedStyle(() => ({ opacity: badgeOpacity.value, transform: [{ scale: badgeScale.value }] }));
  const glowStyle  = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: labelOpacity.value, transform: [{ translateY: labelY.value }] }));

  return (
    <Pressable style={styles.overlay} onPress={onDismiss}>
      <Animated.View style={[StyleSheet.absoluteFillObject, styles.overlayBg, bgStyle]} />

      {/* Confetti */}
      <View style={styles.confettiLayer} pointerEvents="none">
        {Array.from({ length: 28 }).map((_, i) => <Confetti key={i} index={i} trigger={confettiTrig} />)}
      </View>

      <View style={styles.stage}>
        {/* Glow ring */}
        <Animated.View style={[styles.glowRing, { borderColor: badge.color, shadowColor: badge.color }, glowStyle]} pointerEvents="none" />

        {/* Gift box */}
        <Animated.View style={[styles.revealBoxContainer, boxStyle]}>
          <View style={styles.particleOrigin} pointerEvents="none">
            {Array.from({ length: 16 }).map((_, i) => (
              <Particle key={i} index={i} color={PARTICLE_COLORS[i % PARTICLE_COLORS.length]} trigger={particleTrig} />
            ))}
          </View>
          <View style={[styles.revealBox, { borderColor: badge.color }]}>
            <View style={[styles.giftRibbonV, { backgroundColor: badge.color }]} />
            <View style={[styles.giftRibbonH, { backgroundColor: badge.color }]} />
            <Gift size={36} color={badge.color} strokeWidth={1.8} />
          </View>
          <GiftBoxLid openProgress={openProgress} color={badge.color} />
        </Animated.View>

        {/* Badge icon */}
        <Animated.View style={[styles.badgeReveal, badgeStyle]}>
          <View style={[styles.badgeIconCircle, { borderColor: badge.color, backgroundColor: `${badge.color}18`, shadowColor: badge.color }]}>
            <BadgeIcon name={badge.icon} size={38} color={badge.color} />
          </View>
        </Animated.View>

        {/* Text */}
        <Animated.View style={[styles.textBlock, labelStyle]}>
          <Text style={styles.unlockedLabel}>Achievement Unlocked!</Text>
          <Text style={[styles.badgeName, { color: badge.color }]}>{badge.name}</Text>
          <Text style={styles.badgeDesc}>{badge.description}</Text>
        </Animated.View>

        <Animated.View style={[styles.dismissHint, labelStyle]}>
          <Text style={styles.dismissHintText}>Tap anywhere to continue</Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

// ─── Exported overlay ─────────────────────────────────────────────────────────

export function BadgeUnlockOverlay() {
  const { phase, currentUnlock, openGiftBox, snooze, dismissReveal } = useBadgeUnlock();

  if (!currentUnlock || phase === 'hidden') return null;

  if (phase === 'floating') {
    return (
      <FloatingGiftBox
        key={`float-${currentUnlock.id}`}
        badge={currentUnlock}
        onOpen={openGiftBox}
        onSnooze={snooze}
      />
    );
  }

  // phase === 'reveal'
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={dismissReveal}>
      <BadgeReveal
        key={`reveal-${currentUnlock.id}`}
        badge={currentUnlock}
        onDismiss={dismissReveal}
      />
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  // ── Floating gift box ──
  floatingContainer: {
    position: 'absolute',
    right: 16,
    alignItems: 'center',
    zIndex: 999,
  },
  floatingX: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  floatingBox: {
    alignItems: 'center',
    gap: 6,
  },
  floatingGiftWrap: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
  },
  floatRibbonV: {
    position: 'absolute',
    width: 2,
    top: 0,
    bottom: 0,
    opacity: 0.5,
  },
  floatRibbonH: {
    position: 'absolute',
    height: 2,
    left: 0,
    right: 0,
    top: '47%',
    opacity: 0.5,
  },
  floatingLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#a1a1aa',
    letterSpacing: 0.3,
  },

  // ── Reveal overlay ──
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayBg: {
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  confettiLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confetti: {
    position: 'absolute',
    borderRadius: 2,
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    width: W * 0.8,
  },

  // Gift box (reveal phase)
  revealBoxContainer: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  particleOrigin: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: { position: 'absolute' },
  revealBox: {
    width: 100,
    height: 90,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  giftRibbonV: {
    position: 'absolute',
    width: 3,
    top: 0,
    bottom: 0,
    opacity: 0.5,
  },
  giftRibbonH: {
    position: 'absolute',
    height: 3,
    left: 0,
    right: 0,
    top: '45%',
    opacity: 0.5,
  },
  giftLid: {
    position: 'absolute',
    top: -20,
    width: 110,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftLidRibbon: {
    width: 3,
    height: '100%',
    opacity: 0.5,
  },

  // Glow ring
  glowRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 40,
    elevation: 0,
  },

  // Badge icon
  badgeReveal: {
    marginTop: -30,
    marginBottom: 20,
    zIndex: 10,
  },
  badgeIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 12,
  },

  // Text
  textBlock: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
  },
  unlockedLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 4,
  },
  badgeName: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  badgeDesc: {
    fontSize: 14,
    color: '#a1a1aa',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 4,
  },
  dismissHint: {
    marginTop: 36,
  },
  dismissHintText: {
    fontSize: 12,
    color: '#3f3f46',
    letterSpacing: 0.5,
  },
});

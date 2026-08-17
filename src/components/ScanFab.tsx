import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, withRepeat, withSequence, withDelay, Easing } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { ScanLine, Check } from 'lucide-react-native';
import { storageService, setOnScanStatusChanged } from '../storage/asyncStorage';

/**
 * Bottom-right FAB for Scanner. Pulses while scanning, shows check when complete.
 * When status === 'attention' the FAB turns yellow to prompt the user to return
 * and resolve disambiguations.
 */
export function ScanFab({ visible = true }: { visible?: boolean }) {
  const nav = useNavigation<any>();
  const [status, setStatus] = useState<string | null>(null);

  const btnScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.12);

  // Orbit rotations
  const orbitRot1 = useSharedValue(0);
  const orbitRot2 = useSharedValue(0);

  // Streaming data progress
  const streamProg = useSharedValue(0);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const s = await storageService.getScanStatus();
      if (mounted) setStatus(s);
    })();
    setOnScanStatusChanged((s) => {
      if (mounted) setStatus(s);
    });
    return () => { mounted = false; setOnScanStatusChanged(null); };
  }, []);

  const completeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // When status becomes 'complete', show checkmark briefly then clear stored status
    if (status === 'complete') {
      // clear any existing timer
      if (completeTimerRef.current) {
        clearTimeout(completeTimerRef.current);
        completeTimerRef.current = null;
      }
      // keep check visible for ~3 seconds, then clear scan status so FAB returns to normal
      completeTimerRef.current = setTimeout(() => {
        try { storageService.clearScanStatus(); } catch (e) { /* ignore */ }
        // local state will be updated by setOnScanStatusChanged callback
        completeTimerRef.current = null;
      }, 3000);
    } else {
      // if we leave 'complete' before timer fires, cancel it
      if (completeTimerRef.current) {
        clearTimeout(completeTimerRef.current);
        completeTimerRef.current = null;
      }
    }

    if (status === 'scanning' || status === 'attention') {
      const easing = Easing.bezier(0.25, 0.1, 0.25, 1);

      // Subtle button breath
      btnScale.value = withRepeat(
        withSequence(withTiming(1.05, { duration: 1000, easing }), withTiming(1.0, { duration: 1000, easing })),
        -1, false
      );

      // Base ring glow
      ringOpacity.value = withRepeat(
        withSequence(withTiming(0.4, { duration: 1000, easing }), withTiming(0.1, { duration: 1000, easing })),
        -1, false
      );

      // Orbit 1: Fast clockwise
      orbitRot1.value = withRepeat(withTiming(360, { duration: 2200, easing: Easing.linear }), -1, false);
      
      // Orbit 2: Slower counter-clockwise
      orbitRot2.value = withRepeat(withTiming(-360, { duration: 3400, easing: Easing.linear }), -1, false);

      // Data stream shooting outwards
      streamProg.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) }), -1, false);

    } else {
      btnScale.value = withTiming(1, { duration: 240 });
      ringOpacity.value = withTiming(0.12, { duration: 300 });
      orbitRot1.value = 0; // reset
      orbitRot2.value = 0;
      streamProg.value = 0;
    }

    return () => {
      if (completeTimerRef.current) {
        clearTimeout(completeTimerRef.current);
        completeTimerRef.current = null;
      }
    };
  }, [status, btnScale, ringOpacity, orbitRot1, orbitRot2, streamProg]);

  const animatedBtn = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));
  const animatedRing = useAnimatedStyle(() => ({ opacity: ringOpacity.value }));
  const animOrbit1 = useAnimatedStyle(() => ({ transform: [{ rotate: `${orbitRot1.value}deg` }] }));
  const animOrbit2 = useAnimatedStyle(() => ({ transform: [{ rotate: `${orbitRot2.value}deg` }] }));

  // Stream styles for 4 directions
  const animStreamUp = useAnimatedStyle(() => ({
    opacity: status === 'scanning' ? (1 - streamProg.value) : 0,
    transform: [{ translateY: -30 - (streamProg.value * 45) }]
  }));
  const animStreamRight = useAnimatedStyle(() => ({
    opacity: status === 'scanning' ? (1 - streamProg.value) : 0,
    transform: [{ translateX: 30 + (streamProg.value * 45) }]
  }));
  const animStreamDown = useAnimatedStyle(() => ({
    opacity: status === 'scanning' ? (1 - streamProg.value) : 0,
    transform: [{ translateY: 30 + (streamProg.value * 45) }]
  }));
  const animStreamLeft = useAnimatedStyle(() => ({
    opacity: status === 'scanning' ? (1 - streamProg.value) : 0,
    transform: [{ translateX: -30 - (streamProg.value * 45) }]
  }));

  const visibilityScale = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    if (visible) {
      visibilityScale.value = withSpring(1, { damping: 14, stiffness: 150 });
    } else {
      visibilityScale.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
    }
  }, [visible, visibilityScale]);

  const animVisibility = useAnimatedStyle(() => ({
    transform: [{ scale: visibilityScale.value }],
    opacity: visibilityScale.value === 0 ? 0 : 1, // just to prevent clicks when hidden if pointerEvents doesn't catch it
  }));

  const isAttention = status === 'attention';

  return (
    <Animated.View pointerEvents={visible ? "box-none" : "none"} style={[styles.outer, { right: -55, bottom: -61 }, animVisibility] }>
      {/* Base glow ring */}
      <Animated.View style={[styles.ringBase, isAttention && styles.ringAttention, animatedRing]} pointerEvents="none" />

      {/* Orbit Rings (only visible when scanning/attention) */}
      <Animated.View style={[styles.orbitContainer, animOrbit1, (status !== 'scanning' && !isAttention) && {opacity: 0}]} pointerEvents="none">
        <View style={styles.orbitDot} />
      </Animated.View>
      <Animated.View style={[styles.orbitContainerRev, animOrbit2, (status !== 'scanning' && !isAttention) && {opacity: 0}]} pointerEvents="none">
        <View style={styles.orbitDotSmall} />
      </Animated.View>

      {/* Data Stream Particles */}
      <Animated.View style={[styles.streamDot, animStreamUp]} pointerEvents="none" />
      <Animated.View style={[styles.streamDot, animStreamRight]} pointerEvents="none" />
      <Animated.View style={[styles.streamDot, animStreamDown]} pointerEvents="none" />
      <Animated.View style={[styles.streamDot, animStreamLeft]} pointerEvents="none" />

      <Animated.View style={animatedBtn}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Scanner"
          onPress={() => {
            try {
              const parent = (nav as any).getParent?.() ?? null;
              const rootCandidate = (parent && parent.getParent) ? parent.getParent() : null;
              const finalNav = rootCandidate ?? parent ?? nav;
              finalNav.navigate?.('Scanner');
            } catch (e) {
              try { nav.navigate('Scanner'); } catch (err) { console.warn('nav to Scanner failed', err); }
            }
          }}
          style={({ pressed }) => [isAttention ? styles.attentionBtn : styles.btn, pressed && { opacity: 0.86 }]}
        >
          <BlurView intensity={65} tint={isAttention ? "light" : "dark"} style={StyleSheet.absoluteFillObject} />
          {status === 'complete' ? (
            <Check size={26} color="#4ade80" />
          ) : (
            <ScanLine size={26} color={isAttention ? '#000000' : '#ffffff'} strokeWidth={2.4} />
          )}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    zIndex: 140,
    elevation: 140,
    width: 220, // expanded to allow pulse rings to grow without clipping
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'box-none',
  },

  btn: {
    width: 66,
    height: 66,
    borderRadius: 33,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(28, 28, 30, 0.75)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 12,
  },
  attentionBtn: {
    width: 66,
    height: 66,
    borderRadius: 33,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(250, 204, 21, 0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 12,
  },
  ringBase: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  ringAttention: {
    backgroundColor: 'rgba(250,204,21,0.28)'
  },
  orbitContainer: {
    position: 'absolute',
    width: 110,
    height: 110,
    alignItems: 'center', // top
    justifyContent: 'flex-start',
    zIndex: 130,
  },
  orbitContainerRev: {
    position: 'absolute',
    width: 140,
    height: 140,
    alignItems: 'flex-end', // right
    justifyContent: 'center',
    zIndex: 130,
  },
  orbitDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },
  orbitDotSmall: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#60a5fa', // slight blue tint
    shadowColor: '#60a5fa',
    shadowOpacity: 1,
    shadowRadius: 5,
  },
  streamDot: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#ffffff',
    opacity: 0.8,
  },
});
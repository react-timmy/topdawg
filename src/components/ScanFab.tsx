import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, Easing } from 'react-native-reanimated';
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
  const ring1Scale = useSharedValue(0);
  const ring1Opacity = useSharedValue(0.18);
  const ring2Scale = useSharedValue(0);
  const ring2Opacity = useSharedValue(0.12);

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
      // pulse the button when active (including attention)
      btnScale.value = withRepeat(withTiming(1.06, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true);

      // Ring 1: faster, smaller pulse
      ring1Scale.value = withRepeat(withTiming(2.0, { duration: 900, easing: Easing.out(Easing.quad) }), -1, false);
      ring1Opacity.value = withRepeat(withTiming(0.0, { duration: 900, easing: Easing.out(Easing.quad) }), -1, false);

      // Ring 2: slower, larger pulse
      ring2Scale.value = withRepeat(withTiming(2.8, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
      ring2Opacity.value = withRepeat(withTiming(0.0, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
    } else {
      btnScale.value = withTiming(1, { duration: 240 });
      ring1Scale.value = withTiming(0, { duration: 300 });
      ring1Opacity.value = withTiming(0.18, { duration: 300 });
      ring2Scale.value = withTiming(0, { duration: 300 });
      ring2Opacity.value = withTiming(0.12, { duration: 300 });
    }

    return () => {
      if (completeTimerRef.current) {
        clearTimeout(completeTimerRef.current);
        completeTimerRef.current = null;
      }
    };
  }, [status, btnScale, ring1Scale, ring1Opacity, ring2Scale, ring2Opacity]);

  const animatedBtn = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));
  const animatedRing1 = useAnimatedStyle(() => ({ transform: [{ scale: ring1Scale.value }], opacity: ring1Opacity.value }));
  const animatedRing2 = useAnimatedStyle(() => ({ transform: [{ scale: ring2Scale.value }], opacity: ring2Opacity.value }));

  const isAttention = status === 'attention';

  return (
    <View pointerEvents="box-none" style={[styles.outer, { right: -55, bottom: -61 }] }>
      {/* Blue/yellow fading rings behind the FAB */}
      <Animated.View style={[styles.ringPulse, isAttention && styles.ringAttention, animatedRing2]} pointerEvents="none" />
      <Animated.View style={[styles.ringPulse, styles.ringPulseSmall, isAttention && styles.ringAttentionSmall, animatedRing1]} pointerEvents="none" />

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
          style={({ pressed }) => [isAttention ? styles.attentionBtn : styles.btn, pressed && { opacity: 0.86 }, !visible && { opacity: 0 }]}
        >
          <BlurView intensity={65} tint={isAttention ? "light" : "dark"} style={StyleSheet.absoluteFillObject} />
          {status === 'complete' ? (
            <Check size={26} color="#4ade80" />
          ) : (
            <ScanLine size={26} color={isAttention ? '#000000' : '#ffffff'} strokeWidth={2.4} />
          )}
        </Pressable>
      </Animated.View>
    </View>
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
  ringPulse: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(96, 165, 250, 0.22)',
  },
  ringPulseSmall: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(96, 165, 250, 0.32)',
  },
  ringAttention: {
    backgroundColor: 'rgba(250,204,21,0.22)'
  },
  ringAttentionSmall: {
    backgroundColor: 'rgba(250,204,21,0.28)'
  },
});
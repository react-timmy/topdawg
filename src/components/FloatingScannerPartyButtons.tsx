import React, { useRef, useEffect } from 'react';
import { View, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { ScanLine } from 'lucide-react-native';

/**
 * Simple centered scan button that appears above the tab bar.
 * Accepts `visible` to control pop-in/out (used by screens when user scrolls up).
 */
export function FloatingScannerPartyButtons({
  visible = true,
}: {
  visible?: boolean;
}) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const bottom = insets.bottom + -30;

  const scale = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(scale, {
      toValue: visible ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, scale]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.container, { bottom, transform: [{ scale }] }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Scanner"
        onPress={() => {
          // Try to navigate on the nearest parent that owns the Scanner route.
          // Some screens are inside the bottom tabs; root stack contains Scanner.
          try {
            const parent = (navigation as any).getParent?.() ?? null;
            // If immediate parent has Scanner, use it; otherwise climb one level.
            const targetNav = (parent && parent.navigate) ? (parent.navigate ? parent : null) : null;
            // Prefer the parent's parent if available (root stack)
            const rootCandidate = (parent && parent.getParent) ? parent.getParent() : null;
            const finalNav = rootCandidate ?? parent ?? navigation;
            finalNav.navigate?.('Scanner');
          } catch (e) {
            // Fallback — attempt direct navigation (may throw if route absent)
            try { navigation.navigate('Scanner'); } catch (err) { console.warn('Navigation to Scanner failed', err); }
          }
        }}
        style={({ pressed }) => [styles.scannerButton, pressed && styles.pressed]}
      >
        <BlurView intensity={12} tint="light" style={StyleSheet.absoluteFillObject} />
        <ScanLine size={28} color="#000000" strokeWidth={2.4} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 80,
    elevation: 80,
  },
  scannerButton: {
    width: 66,
    height: 66,
    borderRadius: 33,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.42,
    shadowRadius: 18,
    elevation: 12,
  },
  pressed: {
    opacity: 0.78,
  },
});
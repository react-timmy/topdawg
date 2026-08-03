/**
 * SubtitleOverlay
 *
 * Renders the active subtitle cue as styled caption pills over the video.
 *
 * Supports:
 *  - Custom font size (12–28 px)
 *  - Font weight preset: 'normal' | 'semibold' | 'bold'
 *  - Background opacity: 0 (none) | 0.45 (dim) | 0.78 (solid, default)
 *  - Vertical position offset in pixels from the bottom (draggable by the user)
 *  - Smooth fade-in / fade-out via Reanimated
 *
 * zIndex 4 — above video (0) and gesture zones (2), below controls (6).
 * pointerEvents="none" — never intercepts taps.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SubtitleCue } from '../utils/srtParser';

// ─── Style types ──────────────────────────────────────────────────────────────

export type SubtitleFontWeight = 'normal' | 'semibold' | 'bold';
export type SubtitleBgOpacity  = 0 | 0.45 | 0.78;

export interface SubtitleStyleConfig {
  /** Font size in px. Clamped to [12, 28]. Default 15. */
  fontSize?: number;
  /** Font weight preset. Default 'semibold'. */
  fontWeight?: SubtitleFontWeight;
  /** Pill background opacity. Default 0.78. */
  bgOpacity?: SubtitleBgOpacity;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SubtitleOverlayProps {
  /** The cue to display, or null/undefined to hide the overlay */
  cue: SubtitleCue | null | undefined;
  /** Style customisation */
  subtitleStyle?: SubtitleStyleConfig;
  /**
   * Distance from the bottom of the screen in pixels (the drag handle
   * maps directly to this value).  Default 72.
   */
  bottomOffset?: number;
  /** Horizontal padding on each side. Default 24. */
  horizontalPadding?: number;
}

// ─── Weight map ───────────────────────────────────────────────────────────────

const WEIGHT_MAP: Record<SubtitleFontWeight, '400' | '600' | '700'> = {
  normal:   '400',
  semibold: '600',
  bold:     '700',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function SubtitleOverlay({
  cue,
  subtitleStyle = {},
  bottomOffset = 72,
  horizontalPadding = 24,
}: SubtitleOverlayProps) {
  if (!cue) return null;

  const fontSize   = Math.min(28, Math.max(12, subtitleStyle.fontSize ?? 15));
  const fontWeight = WEIGHT_MAP[subtitleStyle.fontWeight ?? 'semibold'];
  const bgOpacity  = subtitleStyle.bgOpacity ?? 0.78;
  const lineHeight = Math.round(fontSize * 1.48);

  const pillBg = bgOpacity === 0
    ? 'transparent'
    : `rgba(8, 8, 10, ${bgOpacity})`;

  const pillBorder = bgOpacity === 0
    ? 'transparent'
    : 'rgba(255,255,255,0.06)';

  return (
    <Animated.View
      entering={FadeIn.duration(120)}
      exiting={FadeOut.duration(160)}
      style={[
        styles.container,
        { bottom: bottomOffset, left: horizontalPadding, right: horizontalPadding },
      ]}
      pointerEvents="none"
    >
      {cue.text.split('\n').map((line, i) => (
        <View
          key={i}
          style={[
            styles.linePill,
            {
              backgroundColor: pillBg,
              borderColor: pillBorder,
            },
          ]}
        >
          <Text
            style={[styles.text, { fontSize, fontWeight, lineHeight }]}
            allowFontScaling={false}
          >
            {line}
          </Text>
        </View>
      ))}
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignItems: 'center',
    gap: 4,
    zIndex: 4,
  },
  linePill: {
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    color: '#ffffff',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    letterSpacing: 0.1,
  },
});

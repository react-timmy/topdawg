/**
 * AppSheetModal — FilmSort-styled bottom sheet (matches Pro paywall / dark UI).
 *
 * Use instead of system Alert.alert for settings confirmations and results.
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 8 ? normalized.slice(0, 6) : normalized;
  if (value.length !== 6) return `rgba(167,139,250,${alpha})`;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(167,139,250,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

export type AppSheetAction = {
  label: string;
  onPress: () => void;
  /** primary = filled accent, secondary = muted fill, destructive = red, ghost = outline */
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  /** Optional per-action accent color (hex) used for ghost/outline buttons */
  accentColor?: string;
};

export type AppSheetModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  /** Optional icon node (lucide, etc.) shown in the tinted ring */
  icon?: React.ReactNode;
  /** Accent for the icon ring (default violet) */
  iconColor?: string;
  actions?: AppSheetAction[];
  /** When no actions provided, show a single dismiss button with this label */
  dismissLabel?: string;
};

export function AppSheetModal({
  visible,
  onClose,
  title,
  message,
  icon,
  iconColor = '#a78bfa',
  actions,
  dismissLabel = 'Got it',
}: AppSheetModalProps) {
  const insets = useSafeAreaInsets();
  const buttons: AppSheetAction[] =
    actions && actions.length > 0
      ? actions
      : [{ label: dismissLabel, onPress: onClose, variant: 'primary' }];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={onClose} accessibilityLabel="Dismiss" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
          <View style={styles.handle} />

          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <X size={18} color="#71717a" strokeWidth={2.5} />
          </Pressable>

          {icon ? (
            <View
              style={[
                styles.iconRing,
                {
                  backgroundColor: hexToRgba(iconColor, 0.12),
                  borderColor: hexToRgba(iconColor, 0.28),
                },
              ]}
            >
              {icon}
            </View>
          ) : null}

          <Text style={styles.title}>{title}</Text>

          {message ? (
            <ScrollView
              style={styles.messageScroll}
              contentContainerStyle={styles.messageContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Text style={styles.message}>{message}</Text>
            </ScrollView>
          ) : null}

          <View style={styles.actions}>
            {buttons.map((a, i) => {
              const variant = a.variant ?? (i === buttons.length - 1 ? 'primary' : 'ghost');
              return (
                <Pressable
                  key={`${a.label}-${i}`}
                  style={({ pressed }) => [
                    styles.btn,
                    variant === 'primary' && styles.btnPrimary,
                    variant === 'secondary' && styles.btnSecondary,
                    variant === 'destructive' && styles.btnDestructive,
                    variant === 'ghost' && styles.btnGhost,
                    (a.disabled || a.loading) && styles.btnDisabled,
                    pressed && !a.disabled && !a.loading && styles.btnPressed,
                    // If this is a ghost button with a custom accentColor, apply it
                    variant === 'ghost' && a.accentColor ? { borderColor: hexToRgba(a.accentColor, 1) } : null,
                  ]}
                  onPress={a.onPress}
                  disabled={a.disabled || a.loading}
                  accessibilityRole="button"
                  accessibilityLabel={a.label}
                >
                  {a.loading ? (
                    <ActivityIndicator
                      color={
                        variant === 'primary'
                          ? '#0a0a0a'
                          : variant === 'destructive'
                            ? '#fecaca'
                            : '#ffffff'
                      }
                      size="small"
                    />
                  ) : (
                    <Text
                      style={[
                        styles.btnText,
                        variant === 'primary' && styles.btnTextPrimary,
                        variant === 'secondary' && styles.btnTextSecondary,
                        variant === 'destructive' && styles.btnTextDestructive,
                        variant === 'ghost' && styles.btnTextGhost,
                        // If ghost + accentColor, color the text accordingly
                        variant === 'ghost' && a.accentColor ? { color: a.accentColor } : null,
                      ]}
                    >
                      {a.label}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'flex-end',
  },
  backdropTap: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderBottomWidth: 0,
    paddingHorizontal: 22,
    paddingTop: 10,
    alignItems: 'center',
    maxHeight: '88%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    zIndex: 2,
  },
  iconRing: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 14,
    marginTop: 4,
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  messageScroll: {
    width: '100%',
    maxHeight: 220,
    marginBottom: 6,
  },
  messageContent: {
    paddingHorizontal: 4,
  },
  message: {
    color: '#a1a1aa',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    gap: 10,
    marginTop: 16,
  },
  btn: {
    width: '100%',
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  btnPrimary: {
    backgroundColor: '#a78bfa',
  },
  btnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  btnDestructive: {
    backgroundColor: 'rgba(248,113,113,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
  },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  btnPressed: {
    opacity: 0.88,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  btnTextPrimary: {
    color: '#0a0a0a',
  },
  btnTextSecondary: {
    color: '#f4f4f5',
  },
  btnTextDestructive: {
    color: '#fca5a5',
  },
  btnTextGhost: {
    color: '#a1a1aa',
  },
});

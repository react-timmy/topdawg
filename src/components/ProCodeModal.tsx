/**
 * ProCodeModal
 *
 * Bottom-sheet for entering a Pro redemption code.
 * Validates against the 25 hardcoded codes in proStatusService.
 *
 * States:
 *  idle     → input field + submit button
 *  loading  → spinner while validating
 *  success  → checkmark + "Pro unlocked" confirmation
 *  error    → red shake + descriptive error line
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Animated,
  Platform,
  UIManager,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, KeyRound, CheckCircle2, Crown, AlertCircle } from 'lucide-react-native';
import { redeemProCode } from '../storage/proStatusService';
import { usePro } from '../context/ProContext';

const ICON_COLOR = '#3f3f3fff';
const ICON_TINT = 'rgba(63,63,63,0.16)';
const ICON_BORDER = 'rgba(63,63,63,0.36)';

try {
  if (Platform.OS === 'android' && typeof UIManager.setLayoutAnimationEnabledExperimental === 'function') {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
} catch (e) {
  // ignore - no-op on new architecture
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProCodeModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type ModalState = 'idle' | 'loading' | 'success' | 'error';

const ERROR_MESSAGES: Record<string, string> = {
  invalid: 'That code isn\'t valid. Double-check it and try again.',
  used: 'A Pro code has already been redeemed on this device.',
  already_pro: 'This device already has Pro active.',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ProCodeModal({ visible, onClose, onSuccess }: ProCodeModalProps) {
  const insets = useSafeAreaInsets();
  const { refreshPro } = usePro();

  const [code, setCode] = useState('');
  const [modalState, setModalState] = useState<ModalState>('idle');
  const [errorReason, setErrorReason] = useState<string>('invalid');

  const shakeX = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  // Reset state every time the modal opens
  useEffect(() => {
    if (visible) {
      setCode('');
      setModalState('idle');
      setErrorReason('invalid');
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [visible]);

  // Auto-close after success
  useEffect(() => {
    if (modalState === 'success') {
      const t = setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1800);
      return () => clearTimeout(t);
    }
  }, [modalState]);

  const triggerShake = () => {
    shakeX.setValue(0);
    Animated.sequence([
      Animated.timing(shakeX, { toValue: 9,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -9, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 6,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -6, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0,  duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const handleSubmit = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setModalState('loading');

    const result = await redeemProCode(trimmed);

    if (result.success) {
      await refreshPro();
      setModalState('success');
    } else {
      setErrorReason(result.reason);
      setModalState('error');
      triggerShake();
    }
  };

  const handleChangeText = (raw: string) => {
    // Keep uppercase letters, digits, hyphens only
    const clean = raw.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    setCode(clean);
    if (modalState === 'error') setModalState('idle');
  };

  const isLoading = modalState === 'loading';
  const isSuccess = modalState === 'success';
  const isError   = modalState === 'error';
  const canSubmit = code.trim().length > 0 && !isLoading && !isSuccess;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1 }}>
        <Pressable
          style={styles.backdropTap}
          onPress={Keyboard.dismiss}
          accessibilityLabel="Dismiss keyboard"
        />
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.sheet}>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <X size={18} color={ICON_COLOR} strokeWidth={2.5} />
          </Pressable>

          {isSuccess ? (
            <View style={styles.successBlock}>
              <View style={[styles.successRing, { backgroundColor: ICON_TINT, borderColor: ICON_BORDER }]}>
                <CheckCircle2 size={36} color={ICON_COLOR} strokeWidth={2} />
              </View>
              <Text style={styles.successTitle}>Pro Unlocked!</Text>
              <Text style={styles.successSub}>
                Welcome to FilmSort Pro. Enjoy every feature.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.iconRing}>
                <KeyRound size={28} color={ICON_COLOR} strokeWidth={1.8} />
              </View>
              <Text style={styles.title}>Enter Pro Code</Text>
              <Text style={styles.subtitle}>
                Enter the unique code you received to unlock FilmSort Pro on this device.
              </Text>

              <Animated.View
                style={[
                  styles.inputWrap,
                  isError && styles.inputWrapError,
                  { transform: [{ translateX: shakeX }] },
                ]}
              >
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  value={code}
                  onChangeText={handleChangeText}
                  placeholder="XXXX-XXXX-XXXX"
                  placeholderTextColor="#3f3f46"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  spellCheck={false}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  editable={!isLoading}
                  maxLength={20}
                  selectionColor={ICON_COLOR}
                />
              </Animated.View>

              {isError && (
                <View style={styles.errorRow}>
                  <AlertCircle size={13} color={ICON_COLOR} strokeWidth={2.5} />
                  <Text style={styles.errorText}>
                    {ERROR_MESSAGES[errorReason] ?? ERROR_MESSAGES.invalid}
                  </Text>
                </View>
              )}

              <Pressable
                style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit}
                accessibilityRole="button"
                accessibilityLabel="Redeem code"
              >
                {isLoading ? (
                  <ActivityIndicator color="#000000" size="small" />
                ) : (
                  <>
                    <Crown size={16} color={ICON_COLOR} strokeWidth={2.5} />
                    <Text style={styles.submitBtnText}>Redeem Code</Text>
                  </>
                )}
              </Pressable>

              <Text style={styles.footNote}>
                Each code is unique and can only be used once per device.
              </Text>
            </>
          )}
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdropTap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  sheet: {
    width: '85%',
    backgroundColor: '#111113',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: 18,
    paddingVertical: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginBottom: 18,
  },
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    zIndex: 2,
  },

  // Icon
  iconRing: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ICON_TINT,
    borderWidth: 1,
    borderColor: ICON_BORDER,
    marginBottom: 10,
  },

  // Headings
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.2,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    color: '#71717a',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginBottom: 18,
    paddingHorizontal: 4,
  },

  // Input
  inputWrap: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: 8,
  },
  inputWrapError: {
    borderColor: 'rgba(239,68,68,0.55)',
    backgroundColor: 'rgba(239,68,68,0.05)',
  },
  input: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 12,
    textAlign: 'center',
  },

  // Error
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
    alignSelf: 'flex-start',
    paddingHorizontal: 2,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    lineHeight: 17,
  },

  // Submit button
  submitBtn: {
    width: '100%',
    height: 44,
    borderRadius: 12,
    backgroundColor: '#a78bfa',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 2,
  },
  submitBtnDisabled: {
    opacity: 0.38,
  },
  submitBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '900',
  },
  footNote: {
    marginTop: 14,
    color: '#3f3f46',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },

  // Success
  successBlock: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  successRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ICON_TINT,
    borderWidth: 1,
    borderColor: ICON_BORDER,
    marginBottom: 4,
  },
  successTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  successSub: {
    color: '#71717a',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});

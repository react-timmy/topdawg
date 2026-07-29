/**
 * PinPadModal — 4-digit PIN entry / setup pad.
 *
 * modes:
 *   verify  — enter existing PIN (success → onSuccess)
 *   set     — create new PIN (enter + confirm)
 *   change  — verify current, then set new (enter + confirm)
 *   remove  — verify current, then wipe PIN
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Delete, Lock, X } from 'lucide-react-native';
import { pinService } from '../storage/pinService';

export type PinPadMode = 'verify' | 'set' | 'change' | 'remove';

export interface PinPadModalProps {
  visible: boolean;
  mode: PinPadMode;
  title?: string;
  subtitle?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

type Step = 'enter' | 'confirm' | 'current';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

export function PinPadModal({
  visible,
  mode,
  title,
  subtitle,
  onSuccess,
  onCancel,
}: PinPadModalProps) {
  const [step, setStep] = useState<Step>('enter');
  const [digits, setDigits] = useState('');
  const [pending, setPending] = useState(''); // first entry when setting
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset when opened / mode changes
  useEffect(() => {
    if (!visible) return;
    setDigits('');
    setPending('');
    setError(null);
    setBusy(false);
    if (mode === 'change' || mode === 'remove' || mode === 'verify') {
      setStep(mode === 'change' ? 'current' : 'enter');
    } else {
      setStep('enter');
    }
  }, [visible, mode]);

  const headerTitle =
    title ??
    (mode === 'set'
      ? step === 'confirm'
        ? 'Confirm PIN'
        : 'Create a PIN'
      : mode === 'change'
        ? step === 'current'
          ? 'Enter current PIN'
          : step === 'confirm'
            ? 'Confirm new PIN'
            : 'Choose a new PIN'
        : mode === 'remove'
          ? 'Enter PIN to remove'
          : 'Enter PIN');

  const headerSub =
    subtitle ??
    (mode === 'set'
      ? step === 'confirm'
        ? 'Re-enter the same 4 digits'
        : 'Used before clearing library, cache, or history'
      : mode === 'verify'
        ? 'Required to continue this action'
        : mode === 'change' && step === 'current'
          ? 'Verify it’s you'
          : mode === 'remove'
            ? 'This turns off PIN protection'
            : '4 digits · local only');

  const finishWithPin = async (pin: string) => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'verify') {
        const ok = await pinService.verifyPin(pin);
        if (!ok) {
          setError('Wrong PIN');
          setDigits('');
          return;
        }
        onSuccess();
        return;
      }

      if (mode === 'remove') {
        const ok = await pinService.verifyPin(pin);
        if (!ok) {
          setError('Wrong PIN');
          setDigits('');
          return;
        }
        await pinService.clearPin();
        onSuccess();
        return;
      }

      if (mode === 'change' && step === 'current') {
        const ok = await pinService.verifyPin(pin);
        if (!ok) {
          setError('Wrong PIN');
          setDigits('');
          return;
        }
        setPending('');
        setDigits('');
        setStep('enter');
        return;
      }

      // set or change → enter / confirm new pin
      if (step === 'enter') {
        setPending(pin);
        setDigits('');
        setStep('confirm');
        return;
      }

      if (step === 'confirm') {
        if (pin !== pending) {
          setError('PINs do not match — try again');
          setDigits('');
          setPending('');
          setStep('enter');
          return;
        }
        await pinService.setPin(pin);
        onSuccess();
      }
    } catch (e: unknown) {
      setError(String((e as Error)?.message ?? 'Something went wrong'));
      setDigits('');
    } finally {
      setBusy(false);
    }
  };

  const pushDigit = (d: string) => {
    if (busy || digits.length >= 4) return;
    setError(null);
    const next = digits + d;
    setDigits(next);
    if (next.length === 4) {
      // slight delay so the 4th dot paints
      setTimeout(() => void finishWithPin(next), 80);
    }
  };

  const popDigit = () => {
    if (busy) return;
    setError(null);
    setDigits((d) => d.slice(0, -1));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.topRow}>
            <View style={styles.lockRing}>
              <Lock size={18} color="#a78bfa" strokeWidth={2.2} />
            </View>
            <Pressable onPress={onCancel} hitSlop={12} style={styles.closeBtn}>
              <X size={18} color="#71717a" strokeWidth={2.2} />
            </Pressable>
          </View>

          <Text style={styles.title}>{headerTitle}</Text>
          <Text style={styles.subtitle}>{headerSub}</Text>

          {/* Dots */}
          <View style={styles.dots}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i < digits.length && styles.dotFilled,
                  error && styles.dotError,
                ]}
              />
            ))}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : <View style={styles.errorSpacer} />}

          {busy ? (
            <ActivityIndicator color="#a78bfa" style={{ marginVertical: 24 }} />
          ) : (
            <View style={styles.pad}>
              {KEYS.map((key, idx) => {
                if (key === '') {
                  return <View key={`empty-${idx}`} style={styles.key} />;
                }
                if (key === 'del') {
                  return (
                    <Pressable
                      key="del"
                      style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                      onPress={popDigit}
                    >
                      <Delete size={22} color="#a1a1aa" strokeWidth={2} />
                    </Pressable>
                  );
                }
                return (
                  <Pressable
                    key={key}
                    style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                    onPress={() => pushDigit(key)}
                  >
                    <Text style={styles.keyText}>{key}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0c0c0e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 36,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  lockRing: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: '#71717a',
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
    marginBottom: 22,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 8,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: '#a78bfa',
    borderColor: '#a78bfa',
  },
  dotError: {
    borderColor: '#f87171',
    backgroundColor: 'rgba(248,113,113,0.35)',
  },
  error: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    minHeight: 20,
    marginBottom: 10,
  },
  errorSpacer: {
    minHeight: 20,
    marginBottom: 10,
  },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  key: {
    width: '30%',
    maxWidth: 96,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  keyText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
  },
});

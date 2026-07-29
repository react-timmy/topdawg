/**
 * ProPaywallModal
 *
 * Shown when a free user hits their monthly AI scan file limit.
 * Unlock is local (no Play / App Store IAP) — ready to swap for external
 * checkout (Payoneer, etc.) later without store billing.
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Sparkles,
  Zap,
  Infinity,
  CheckCircle2,
  X,
} from 'lucide-react-native';
import { FREE_SCAN_LIMIT, setPro } from '../storage/proStatusService';
import { usePro } from '../context/ProContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProPaywallModalProps {
  visible: boolean;
  /** Called when the user dismisses without unlocking. */
  onClose: () => void;
  /** Called after Pro is successfully granted. */
  onPurchaseSuccess: () => void;
}

// ─── Feature list ─────────────────────────────────────────────────────────────

const PRO_FEATURES = [
  {
    icon: <Infinity size={16} color="#a78bfa" strokeWidth={2} />,
    text: 'Unlimited AI filename parsing',
  },
  {
    icon: <Zap size={16} color="#facc15" strokeWidth={2} />,
    text: 'Unlimited Fix Match corrections',
  },
  {
    icon: <Sparkles size={16} color="#34d399" strokeWidth={2} />,
    text: 'Priority support & all future Pro features',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function ProPaywallModal({
  visible,
  onClose,
  onPurchaseSuccess,
}: ProPaywallModalProps) {
  const insets = useSafeAreaInsets();
  const { refreshPro, scansUsed } = usePro();
  const [purchasing, setPurchasing] = useState(false);

  const handleUnlock = async () => {
    setPurchasing(true);
    try {
      await setPro();
      await refreshPro();
      onPurchaseSuccess();
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>

          {/* Dismiss */}
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <X size={20} color="#71717a" strokeWidth={2.5} />
          </Pressable>

          {/* Icon */}
          <View style={styles.iconRing}>
            <Sparkles size={32} color="#a78bfa" strokeWidth={1.8} />
          </View>

          {/* Heading */}
          <Text style={styles.title}>Unlock FilmSort Pro</Text>
          <Text style={styles.subtitle}>
            You've used {scansUsed}/{FREE_SCAN_LIMIT} free AI scans this month.{'\n'}
            Go Pro for unlimited everything.
          </Text>

          {/* Feature list */}
          <View style={styles.featureList}>
            {PRO_FEATURES.map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <View style={styles.featureIcon}>{f.icon}</View>
                <Text style={styles.featureText}>{f.text}</Text>
              </View>
            ))}
          </View>

          {/* Unlock CTA */}
          <Pressable
            style={[styles.unlockBtn, purchasing && styles.btnDisabled]}
            onPress={handleUnlock}
            disabled={purchasing}
            accessibilityRole="button"
            accessibilityLabel="Unlock Pro"
          >
            {purchasing ? (
              <ActivityIndicator color="#000000" size="small" />
            ) : (
              <>
                <CheckCircle2 size={18} color="#000000" strokeWidth={2.5} />
                <Text style={styles.unlockBtnText}>Unlock Pro — Free</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#18181b',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderBottomWidth: 0,
    paddingHorizontal: 24,
    paddingTop: 32,
    alignItems: 'center',
    gap: 16,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    color: '#a1a1aa',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  featureList: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIcon: {
    width: 28,
    alignItems: 'center',
  },
  featureText: {
    color: '#e4e4e7',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  unlockBtn: {
    width: '100%',
    height: 54,
    borderRadius: 16,
    backgroundColor: '#a78bfa',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  unlockBtnText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '900',
  },
  btnDisabled: {
    opacity: 0.5,
  },
});

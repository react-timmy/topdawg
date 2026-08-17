/**
 * ProPaywallModal
 *
 * Shown when a free user hits their monthly AI scan file limit or taps Unlock.
 * Each feature expands into a full explanation; the open feature jumps to the
 * top and the others hide so the copy has room.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Sparkles,
  Zap,
  Infinity,
  CheckCircle2,
  X,
  FolderTree,
  Rocket,
  ChevronDown,
  ChevronUp,
  Bell,
} from 'lucide-react-native';
import { FREE_SCAN_LIMIT } from '../storage/proStatusService';
import { usePro } from '../context/ProContext';
import { ProCodeModal } from './ProCodeModal';

// LayoutAnimation experimental toggle is a no-op under the New Architecture.
// Keep safe guard for older RN but avoid logging the warning: only call when
// the function exists and the runtime indicates support.
try {
  if (Platform.OS === 'android' && typeof UIManager.setLayoutAnimationEnabledExperimental === 'function') {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
} catch (e) {
  // ignore - no-op on new architecture
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProPaywallModalProps {
  visible: boolean;
  onClose: () => void;
  onPurchaseSuccess: () => void;
}

type FeatureId =
  | 'priority'
  | 'folders'
  | 'unlimited'
  | 'wrapped'
  | 'notifications'
  | 'future';

type FeatureDef = {
  id: FeatureId;
  title: string;
  summary: string;
  detail: string;
  bullets: string[];
  color: string;
  Icon: typeof Rocket;
};

// ─── Feature list ─────────────────────────────────────────────────────────────

const PRO_FEATURES: FeatureDef[] = [
  {
    id: 'priority',
    title: 'Priority Queue',
    summary: 'Skip the free-tier line',
    color: '#facc15',
    Icon: Rocket,
    detail:
      'Free users share a rotating pool of AI keys. When traffic is high, scans wait in a short queue. Pro uses a dedicated VIP key so your files parse first — no “high traffic” wait behind free users.',
    bullets: [
      'Dedicated Pro API key (Skip the Line)',
      'Free users never share your VIP lane',
      'Same accurate filename AI — just faster when busy',
    ],
  },
  {
    id: 'folders',
    title: 'Auto-Rename & Folders',
    summary: 'Clean names + Movies / TV layout',
    color: '#60a5fa',
    Icon: FolderTree,
    detail:
      'One tap organizes messy release names into Plex-style labels inside FilmSort. Export writes a real folder tree on your device: Movies/ and TV Shows/Show/Season — you pick the destination folder.',
    bullets: [
      'Clean names like “Show - S01E02 - Title”',
      'Export to a folder you choose (Android Files app)',
      'Skips files already exported; re-exports if you delete them',
      'FilmSort still plays from the original files',
    ],
  },
  {
    id: 'unlimited',
    title: 'Unlimited AI scanning',
    summary: 'No monthly free cap',
    color: '#a78bfa',
    Icon: Infinity,
    detail:
      'Free accounts get a monthly limit on AI-powered filename parses. Pro removes that cap so big libraries and daily rescans never hit a wall — local parse still works either way.',
    bullets: [
      `Free: ${FREE_SCAN_LIMIT} AI scans / month`,
      'Pro: unlimited AI filename parsing',
      'Local offline parse always available',
    ],
  },
  {
    id: 'wrapped',
    title: 'Memories & Wrapped',
    summary: 'Shareable year-in-review stats',
    color: '#34d399',
    Icon: Zap,
    detail:
      'Free users see a simple recent list. Pro unlocks FilmSort Wrapped: swipeable cards for hours watched, genres, anime, streaks, top titles — plus a shareable recap for socials or friends.',
    bullets: [
      'Free: basic recent titles list',
      'Pro: full Wrapped story experience',
      'Hours, genres, streaks, top rewatches',
      'Share as a text recap in one tap',
    ],
  },
  {
    id: 'notifications',
    title: 'Advanced Release Alerts',
    summary: 'Get notified about new seasons & episodes',
    color: '#f59e0b',
    Icon: Bell,
    detail:
      'Everyone gets streak reminders and basic alerts. Pro users get advanced notifications: automatic new season alerts for shows in your library, streaming availability updates for starred items, and early access to new notification features.',
    bullets: [
      'New season alerts for your library shows (Pro)',
      'Streaming availability for starred items (Pro)',
      'Priority notification queue (Pro)',
      'Free: streak reminders + basic in-app alerts',
    ],
  },
  {
    id: 'future',
    title: 'All future Pro features',
    summary: 'Everything we ship next',
    color: '#c4b5fd',
    Icon: Sparkles,
    detail:
      'Pro is your seat for what comes next — new tools land for Pro first. Unlock once and you stay covered as FilmSort grows (smart recommendations, cloud extras, and more).',
    bullets: [
      'New Pro tools as we release them',
      'No extra unlock steps for listed Pro perks',
      'Built for power users and big libraries',
    ],
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
  const [expandedId, setExpandedId] = useState<FeatureId | null>(null);
  const [codeModalOpen, setCodeModalOpen] = useState(false);

  useEffect(() => {
    if (!visible) setExpandedId(null);
  }, [visible]);

  const orderedFeatures = useMemo(() => {
    if (!expandedId) return PRO_FEATURES;
    const open = PRO_FEATURES.find((f) => f.id === expandedId);
    if (!open) return PRO_FEATURES;
    // Expanded feature alone at the top — others disappear while explaining
    return [open];
  }, [expandedId]);

  const handleCodeSuccess = async () => {
    await refreshPro();
    onPurchaseSuccess();
    setCodeModalOpen(false);
  };

  const toggleFeature = (id: FeatureId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((cur) => (cur === id ? null : id));
  };

  return (
    <>
      <Modal
        visible={visible && !codeModalOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={onClose}
      >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.handle} />

          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <X size={20} color="#71717a" strokeWidth={2.5} />
          </Pressable>

          <View style={styles.iconRing}>
            <Sparkles size={30} color="#a78bfa" strokeWidth={1.8} />
          </View>

          <Text style={styles.title}>Unlock FilmSort Pro</Text>
          <Text style={styles.subtitle}>
            {scansUsed > 0
              ? `You've used ${scansUsed}/${FREE_SCAN_LIMIT} free AI scans this month.\nTap a feature to learn more.`
              : 'Tap any feature for details. Unlock for the full set.'}
          </Text>

          <ScrollView
            style={styles.featureScroll}
            contentContainerStyle={styles.featureScrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.featureList}>
              {orderedFeatures.map((f) => {
                const open = expandedId === f.id;
                const Icon = f.Icon;
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => toggleFeature(f.id)}
                    style={[styles.featureCard, open && styles.featureCardOpen]}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    accessibilityLabel={`${f.title}. ${open ? 'Collapse' : 'Expand'} details`}
                  >
                    <View style={styles.featureHeader}>
                      <View
                        style={[
                          styles.featureIconWrap,
                          {
                            backgroundColor: `${f.color}18`,
                            borderColor: `${f.color}44`,
                          },
                        ]}
                      >
                        <Icon size={16} color={f.color} strokeWidth={2.2} />
                      </View>
                      <View style={styles.featureTitleBlock}>
                        <Text style={styles.featureTitle}>{f.title}</Text>
                        {!open && (
                          <Text style={styles.featureSummary} numberOfLines={1}>
                            {f.summary}
                          </Text>
                        )}
                      </View>
                      {open ? (
                        <ChevronUp size={18} color="#71717a" strokeWidth={2.2} />
                      ) : (
                        <ChevronDown size={18} color="#52525b" strokeWidth={2.2} />
                      )}
                    </View>

                    {open && (
                      <View style={styles.featureBody}>
                        <Text style={styles.featureDetail}>{f.detail}</Text>
                        {f.bullets.map((b) => (
                          <View key={b} style={styles.bulletRow}>
                            <View
                              style={[styles.bulletDot, { backgroundColor: f.color }]}
                            />
                            <Text style={styles.bulletText}>{b}</Text>
                          </View>
                        ))}
                        <Pressable
                          onPress={() => toggleFeature(f.id)}
                          style={styles.showAllBtn}
                          hitSlop={8}
                        >
                          <Text style={styles.showAllText}>Show all features</Text>
                        </Pressable>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Pressable
            style={styles.unlockBtn}
            onPress={() => setCodeModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Enter Pro code"
          >
            <CheckCircle2 size={18} color="#3f3f3fff" strokeWidth={2.5} />
            <Text style={styles.unlockBtnText}>Enter Pro Code</Text>
          </Pressable>
        </View>
      </View>
      </Modal>
      <ProCodeModal
        visible={codeModalOpen}
        onClose={() => {
          setCodeModalOpen(false);
          onClose();
        }}
        onSuccess={handleCodeSuccess}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderBottomWidth: 0,
    paddingHorizontal: 22,
    paddingTop: 10,
    alignItems: 'center',
    maxHeight: '92%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
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
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
    marginBottom: 10,
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: '#a1a1aa',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  featureScroll: {
    width: '100%',
    maxHeight: 360,
  },
  featureScrollContent: {
    paddingBottom: 4,
  },
  featureList: {
    width: '100%',
    gap: 8,
  },
  featureCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  featureCardOpen: {
    borderColor: 'rgba(167,139,250,0.35)',
    backgroundColor: 'rgba(167,139,250,0.08)',
  },
  featureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  featureTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  featureTitle: {
    color: '#f4f4f5',
    fontSize: 14,
    fontWeight: '800',
  },
  featureSummary: {
    color: '#71717a',
    fontSize: 12,
    fontWeight: '500',
  },
  featureBody: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    gap: 10,
  },
  featureDetail: {
    color: '#d4d4d8',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  bulletText: {
    flex: 1,
    color: '#a1a1aa',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  showAllBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingVertical: 4,
  },
  showAllText: {
    color: '#a78bfa',
    fontSize: 13,
    fontWeight: '700',
  },
  unlockBtn: {
    width: '100%',
    height: 52,
    borderRadius: 16,
    backgroundColor: '#a78bfa',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 14,
  },
  unlockBtnText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '900',
  },
});

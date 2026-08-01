/**
 * LegalConsentGate
 *
 * Full-screen overlay shown when the user has not yet accepted the current
 * versions of the Privacy Policy and Terms of Use.
 *
 * Props:
 *   onAccept  — called after consent is persisted; parent hides the gate
 *   onDecline — called if user taps "Not now"; parent stays on Scan tab
 *               with a blocked state message
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShieldCheck, ChevronRight, Square, CheckSquare, AlertCircle } from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { legalConsentService } from '../services/legalConsentService';

interface LegalConsentGateProps {
  onAccept: () => void;
  onDecline: () => void;
}

export function LegalConsentGate({ onAccept, onDecline }: LegalConsentGateProps) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [agreed, setAgreed] = useState(false);
  const [dataAware, setDataAware] = useState(false);
  const [saving, setSaving] = useState(false);
  const [declined, setDeclined] = useState(false);

  const canAccept = agreed && dataAware;

  const handleAccept = async () => {
    if (!canAccept || saving) return;
    setSaving(true);
    try {
      await legalConsentService.saveConsent();
      onAccept();
    } catch {
      setSaving(false);
    }
  };

  const handleDecline = () => {
    setDeclined(true);
    onDecline();
  };

  // Gate fills the tab scene (already above the custom tab bar). Don't add
  // safe-area bottom padding here — that floats the CTAs away from the tabs.
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      style={[styles.root, { paddingTop: insets.top }]}
    >
      {/* ── Scrollable content: hero + data card + legal links ── */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
        style={styles.scrollFlex}
      >
        {/* ── Icon + heading ── */}
        <Animated.View entering={FadeInDown.delay(60).duration(380)} style={styles.heroBlock}>
          <View style={styles.iconRing}>
            <ShieldCheck size={36} color="#60a5fa" strokeWidth={1.8} />
          </View>
          <Text style={styles.heroTitle}>Quick consent</Text>
          <Text style={styles.heroSubtitle}>
            We only send video <Text style={styles.bold}>names</Text> to find posters — never the video itself.
          </Text>
        </Animated.View>

        {/* ── Data summary card ── */}
        <Animated.View entering={FadeInDown.delay(120).duration(380)} style={styles.card}>
          <Text style={styles.cardTitle}>What we use</Text>
          {[
            { dot: '#60a5fa', text: 'Names → AI (title guess)' },
            { dot: '#a78bfa', text: 'Titles → TMDB (posters)' },
            { dot: '#34d399', text: 'Videos stay on your phone' },
          ].map((row, i) => (
            <View key={i} style={styles.cardRow}>
              <View style={[styles.dot, { backgroundColor: row.dot }]} />
              <Text style={styles.cardRowText}>{row.text}</Text>
            </View>
          ))}
        </Animated.View>

        {/* ── Legal links ── */}
        <Animated.View entering={FadeInDown.delay(180).duration(380)} style={styles.linksBlock}>
          <Text style={styles.linksLabel}>Policies</Text>

          <Pressable
            style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
            onPress={() => navigation.navigate('PrivacyPolicy')}
          >
            <Text style={styles.linkRowText}>Privacy Policy</Text>
            <ChevronRight size={16} color="#60a5fa" strokeWidth={2.2} />
          </Pressable>

          <View style={styles.linkDivider} />

          <Pressable
            style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
            onPress={() => navigation.navigate('TermsOfUse')}
          >
            <Text style={styles.linkRowText}>Terms of Use</Text>
            <ChevronRight size={16} color="#60a5fa" strokeWidth={2.2} />
          </Pressable>
        </Animated.View>
      </ScrollView>

      {/* ── Sticky bottom: checkboxes + CTAs — tight to tab bar ── */}
      <Animated.View
        entering={FadeInDown.delay(240).duration(380)}
        style={styles.stickyBottom}
      >
        <View style={styles.stickyDivider} />

        <View style={styles.checkboxBlock}>
          <Pressable style={styles.checkboxRow} onPress={() => setAgreed((v) => !v)}>
            {agreed
              ? <CheckSquare size={22} color="#60a5fa" strokeWidth={2} />
              : <Square size={22} color="#52525b" strokeWidth={2} />}
            <Text style={styles.checkboxText}>
              I agree to the{' '}
              <Text style={styles.checkboxLink} onPress={() => navigation.navigate('TermsOfUse')}>
                Terms
              </Text>
              {' '}and{' '}
              <Text style={styles.checkboxLink} onPress={() => navigation.navigate('PrivacyPolicy')}>
                Privacy
              </Text>
            </Text>
          </Pressable>

          <Pressable style={styles.checkboxRow} onPress={() => setDataAware((v) => !v)}>
            {dataAware
              ? <CheckSquare size={22} color="#60a5fa" strokeWidth={2} />
              : <Square size={22} color="#52525b" strokeWidth={2} />}
            <Text style={styles.checkboxText}>
              Only file <Text style={styles.bold}>names</Text> may leave this device for matching
            </Text>
          </Pressable>
        </View>

        <View style={styles.ctaBlock}>
          <Pressable
            style={[styles.acceptBtn, !canAccept && styles.acceptBtnDisabled]}
            onPress={handleAccept}
            disabled={!canAccept || saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#000000" />
              : <Text style={styles.acceptBtnText}>Accept &amp; Continue</Text>}
          </Pressable>

          <Pressable style={styles.declineBtn} onPress={handleDecline}>
            <Text style={styles.declineBtnText}>Later</Text>
          </Pressable>

          {declined && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.declinedNotice}>
              <AlertCircle size={15} color="#f59e0b" strokeWidth={2} />
              <Text style={styles.declinedNoticeText}>
                Accept to scan. Tap Accept &amp; Continue above.
              </Text>
            </Animated.View>
          )}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 100,
  },
  scrollFlex: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
    flexGrow: 1,
  },

  // Sticky bottom — snug against the tab bar
  stickyBottom: {
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: '#000000',
  },
  stickyDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginBottom: 12,
  },

  // Hero
  heroBlock: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(96,165,250,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.7,
    marginBottom: 12,
    textAlign: 'center',
  },
  heroSubtitle: {
    color: '#a1a1aa',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  bold: {
    color: '#e4e4e7',
    fontWeight: '700',
  },

  // Data summary card
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    marginBottom: 20,
    gap: 10,
  },
  cardTitle: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginTop: 5,
    flexShrink: 0,
  },
  cardRowText: {
    color: '#a1a1aa',
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },

  // Legal links
  linksBlock: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 20,
    overflow: 'hidden',
  },
  linksLabel: {
    color: '#52525b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  linkRowPressed: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  linkRowText: {
    color: '#60a5fa',
    fontSize: 15,
    fontWeight: '600',
  },
  linkDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 16,
  },

  // Checkboxes
  checkboxBlock: {
    gap: 12,
    marginBottom: 12,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkboxText: {
    flex: 1,
    color: '#a1a1aa',
    fontSize: 14,
    lineHeight: 21,
  },
  checkboxLink: {
    color: '#60a5fa',
    fontWeight: '600',
  },

  // CTAs
  ctaBlock: {
    gap: 4,
  },
  acceptBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  acceptBtnText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  declineBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  declineBtnText: {
    color: '#52525b',
    fontSize: 15,
    fontWeight: '600',
  },
  declinedNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  declinedNoticeText: {
    flex: 1,
    color: '#d97706',
    fontSize: 13,
    lineHeight: 19,
  },
});

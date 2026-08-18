import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Text, Pressable } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Crown } from 'lucide-react-native';
import { Scanner } from '../components/Scanner';
import { FloatingHeader } from '../components/FloatingHeader';
import { UnmatchedFilesList } from '../components/UnmatchedFilesList';
import { RecentlyAddedList } from '../components/RecentlyAddedList';
import { LegalConsentGate } from '../components/LegalConsentGate';
import { MediaScanResult, LocalFile, MediaItem } from '../types';
import { storageService } from '../storage/asyncStorage';
import { legalConsentService } from '../services/legalConsentService';
import { usePro } from '../context/ProContext';
import { FREE_SCAN_LIMIT } from '../storage/proStatusService';

function matchedFileKey(item: MediaItem): string {
  return `${item.id}::${item.localFile?.uri ?? ''}::${item.localFile?.filename ?? ''}`;
}

// ─── ScansBanner ──────────────────────────────────────────────────────────────
// Shows "You've used X/Y free AI Scans" above the scanner when not Pro.

function ScansBanner() {
  const navigation = useNavigation<any>();
  const { isPro, scansUsed, scansRemaining } = usePro();
  if (isPro) return null;
  return (
    <Animated.View entering={FadeInDown.duration(320)}>
      <Pressable
        style={({ pressed }) => [scansBannerStyles.card, pressed && { opacity: 0.85 }]}
        onPress={() => navigation.navigate('Settings')}
      >
        <View style={scansBannerStyles.iconRing}>
          <Crown size={16} color="#a78bfa" strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={scansBannerStyles.title}>
            {scansRemaining > 0
              ? `You've used ${scansUsed}/${FREE_SCAN_LIMIT} free AI Scans`
              : 'Monthly scan limit reached'}
          </Text>
          <Text style={scansBannerStyles.subtitle}>Tap to unlock unlimited Pro scanning</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const scansBannerStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(167,139,250,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.22)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  iconRing: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(167,139,250,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 13, fontWeight: '700', color: '#e4e4e7' },
  subtitle: { fontSize: 11, color: '#71717a', marginTop: 2 },
});

export function ScannerScreen() {
  const mountedRef = React.useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const [headerHeight, setHeaderHeight] = useState(0);
  const [unmatchedFiles, setUnmatchedFiles] = useState<LocalFile[]>([]);
  const [recentlyMatched, setRecentlyMatched] = useState<MediaItem[]>([]);
  const [recentLoaded, setRecentLoaded] = useState(false);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  // ── Consent gate state ────────────────────────────────────────────────────
  // null = still checking; true = gate open (needs consent); false = consented
  const [consentRequired, setConsentRequired] = useState<boolean | null>(null);

  // Check consent every time this tab comes into focus so that:
  // 1. Fresh installs are blocked immediately.
  // 2. Returning from the PrivacyPolicy / TermsOfUse screens re-checks in case
  //    the user read the docs and came back to accept.
  // 3. A version bump in legalContent re-prompts automatically.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      legalConsentService.hasValidConsent().then((valid) => {
        if (active && mountedRef.current) setConsentRequired(!valid);
      });
      return () => { active = false; };
    }, []),
  );

  // Restore recently matched history across app restarts
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await storageService.getRecentlyMatched();
      if (!cancelled && mountedRef.current) {
        setRecentlyMatched(saved);
        setRecentLoaded(true);
      }

      // Also restore unmatched files from last scan summary.
      // (Recently matched is already restored above from getRecentlyMatched)
      try {
        const last = await storageService.getLastScanResult();
        if (last) {
          if (!cancelled && mountedRef.current) {
            setUnmatchedFiles((last.unmatched || []).map((u) => ({ uri: u.uri ?? '', filename: u.filename ?? '' })));
          }
        }
      } catch (e) {
        // ignore
      }

    })();
    return () => { cancelled = true; };
  }, []);

  const persistRecentlyMatched = useCallback(async (items: MediaItem[]) => {
    if (mountedRef.current) setRecentlyMatched(items);
    await storageService.saveRecentlyMatched(items);
  }, []);

  const handleScanComplete = useCallback(async (result?: MediaScanResult) => {
    // 1. Persist all matches in one write so multi-episode shows keep every file
    if (result?.matched?.length) {
      try {
        try {
          console.log(`[ScannerScreen] handleScanComplete: matched ${result.matched.length} item(s): ${result.matched.map(m => m.id).join(',')}`);
        } catch (e) {}

        // Diagnostic: library size before save
        try {
          const before = await storageService.getLibrary();
          console.log(`[ScannerScreen] library before save: ${before.length}`);
        } catch (e) {
          console.warn('[ScannerScreen] Failed to read library before save', e);
        }

        await storageService.addItems(result.matched);

        try {
          const after = await storageService.getLibrary();
          console.log(`[ScannerScreen] library after save: ${after.length}`);
        } catch (e) {
          console.warn('[ScannerScreen] Failed to read library after save', e);
        }

        console.log(`[ScannerScreen] Saved ${result.matched.length} matched file(s) to library`);
      } catch (err) {
        console.error('[ScannerScreen] Failed to save matched items:', err);
      }

      // Build next recently-matched list off the main render path, then commit once
      try {
        const prev = await storageService.getRecentlyMatched();
        const existing = new Set(prev.map(matchedFileKey));
        const newItems = result.matched.filter((m) => !existing.has(matchedFileKey(m)));
        const next = [...newItems, ...prev];
        await storageService.saveRecentlyMatched(next);
        if (mountedRef.current) setRecentlyMatched(next);
      } catch (err) {
        console.error('[ScannerScreen] Failed to update recently matched:', err);
        if (mountedRef.current) {
          setRecentlyMatched((prev) => {
            const existing = new Set(prev.map(matchedFileKey));
            const newItems = result.matched!.filter((m) => !existing.has(matchedFileKey(m)));
            return [...newItems, ...prev];
          });
        }
      }
    }

    // 2. Capture unmatched files to display below the scanner card
    if (result?.unmatched) {
      if (mountedRef.current) setUnmatchedFiles(result.unmatched);
    } else {
      if (mountedRef.current) setUnmatchedFiles([]);
    }
  }, []);

  const handleClearUnmatched = useCallback(async () => {
    if (mountedRef.current) setUnmatchedFiles([]);
    try {
      const last = await storageService.getLastScanResult();
      if (last) {
        last.unmatched = [];
        await storageService.saveLastScanResult(last);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const handleMatchSuccess = useCallback(async (file: LocalFile, matchedItem: MediaItem) => {
    await storageService.addItem(matchedItem);
    if (mountedRef.current) setUnmatchedFiles((prev) => prev.filter((f) => f.uri !== file.uri));
    setRecentlyMatched((prev) => {
      const next = [matchedItem, ...prev.filter((p) => matchedFileKey(p) !== matchedFileKey(matchedItem))];
      void storageService.saveRecentlyMatched(next);
      return next;
    });
  }, []);

  const handleIgnore = useCallback((file: LocalFile) => {
    if (mountedRef.current) setUnmatchedFiles((prev) => prev.filter((f) => f.uri !== file.uri));
  }, []);

  const handleDismissRecentlyMatched = useCallback(async () => {
    await persistRecentlyMatched([]);
  }, [persistRecentlyMatched]);

  const handleRematchSuccess = useCallback(async (oldItem: MediaItem, newItem: MediaItem) => {
    await storageService.rematchItem(oldItem, newItem);
    setRecentlyMatched((prev) => {
      const next = prev.map((item) =>
        item.localFile?.uri === oldItem.localFile?.uri ? newItem : item,
      );
      void storageService.saveRecentlyMatched(next);
      return next;
    });
  }, []);

  // ── Consent gate handlers ─────────────────────────────────────────────────

  const handleConsentAccepted = useCallback(() => {
    // LegalConsentGate already saved consent — unhide the scanner immediately.
    setConsentRequired(false);
  }, []);

  const handleConsentDeclined = useCallback(() => {
    // Leave the gate open — user stays on the Scan tab but can't scan
    // They can always tap "Accept & Continue" after reading the docs
    setConsentRequired(true);
  }, []);

  // Still loading consent state — keep background, avoid blank “loading forever” feel
  if (consentRequired === null) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <FloatingHeader
        title="Scan"
        subtitle="Find your videos"
        onHeightChange={setHeaderHeight}
        onSettingsPress={() => navigation.navigate('Settings')}
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: headerHeight + 24, paddingBottom: insets.bottom + 160 }]}
        showsVerticalScrollIndicator={false}
      >
        <Scanner onScanComplete={handleScanComplete} />

        {recentLoaded && (
          <RecentlyAddedList
            items={recentlyMatched}
            onDismiss={handleDismissRecentlyMatched}
            onRematchSuccess={handleRematchSuccess}
          />
        )}

        {unmatchedFiles.length > 0 && (
          <UnmatchedFilesList
            files={unmatchedFiles}
            onMatchSuccess={handleMatchSuccess}
            onIgnore={handleIgnore}
            onClear={handleClearUnmatched}
          />
        )}
      </ScrollView>

      {/* Gate renders on top of the scanner when consent is missing or outdated */}
      {consentRequired && (
        <LegalConsentGate
          onAccept={handleConsentAccepted}
          onDecline={handleConsentDeclined}
        />
      )}

      {/* Scanner is now a first-class tab inside MainTabs — no embedded TabNavigator here. */}
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  scroll: { paddingHorizontal: 16 },
});


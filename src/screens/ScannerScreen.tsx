import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Scanner } from '../components/Scanner';
import { FloatingHeader } from '../components/FloatingHeader';
import { UnmatchedFilesList } from '../components/UnmatchedFilesList';
import { RecentlyAddedList } from '../components/RecentlyAddedList';
import { LegalConsentGate } from '../components/LegalConsentGate';
import { MediaScanResult, LocalFile, MediaItem } from '../types';
import { storageService } from '../storage/asyncStorage';
import { legalConsentService } from '../services/legalConsentService';

function matchedFileKey(item: MediaItem): string {
  return `${item.id}::${item.localFile?.uri ?? ''}::${item.localFile?.filename ?? ''}`;
}

export function ScannerScreen() {
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
        if (active) setConsentRequired(!valid);
      });
      return () => { active = false; };
    }, []),
  );

  // Restore recently matched history across app restarts
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await storageService.getRecentlyMatched();
      if (!cancelled) {
        setRecentlyMatched(saved);
        setRecentLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const persistRecentlyMatched = useCallback(async (items: MediaItem[]) => {
    setRecentlyMatched(items);
    await storageService.saveRecentlyMatched(items);
  }, []);

  const handleScanComplete = useCallback(async (result?: MediaScanResult) => {
    // 1. Persist all matches in one write so multi-episode shows keep every file
    if (result?.matched?.length) {
      try {
        await storageService.addItems(result.matched);
        console.log(
          `[ScannerScreen] Saved ${result.matched.length} matched file(s) to library`,
        );
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
        setRecentlyMatched(next);
      } catch (err) {
        console.error('[ScannerScreen] Failed to update recently matched:', err);
        setRecentlyMatched((prev) => {
          const existing = new Set(prev.map(matchedFileKey));
          const newItems = result.matched!.filter((m) => !existing.has(matchedFileKey(m)));
          return [...newItems, ...prev];
        });
      }
    }

    // 2. Capture unmatched files to display below the scanner card
    if (result?.unmatched) {
      setUnmatchedFiles(result.unmatched);
    } else {
      setUnmatchedFiles([]);
    }
  }, []);

  const handleMatchSuccess = useCallback(async (file: LocalFile, matchedItem: MediaItem) => {
    await storageService.addItem(matchedItem);
    setUnmatchedFiles((prev) => prev.filter((f) => f.uri !== file.uri));
    setRecentlyMatched((prev) => {
      const next = [matchedItem, ...prev.filter((p) => matchedFileKey(p) !== matchedFileKey(matchedItem))];
      void storageService.saveRecentlyMatched(next);
      return next;
    });
  }, []);

  const handleIgnore = useCallback((file: LocalFile) => {
    setUnmatchedFiles((prev) => prev.filter((f) => f.uri !== file.uri));
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
    // saveConsent() was already called inside LegalConsentGate before this fires
    setConsentRequired(false);
  }, []);

  const handleConsentDeclined = useCallback(() => {
    // Leave the gate open — user stays on the Scan tab but can't scan
    // They can always tap "Accept & Continue" after reading the docs
    setConsentRequired(true);
  }, []);

  // Still loading consent state — render nothing to avoid flash
  if (consentRequired === null) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <FloatingHeader
        title="Scanner"
        subtitle="Scan local video files"
        onHeightChange={setHeaderHeight}
        onSettingsPress={() => navigation.navigate('Settings')}
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: headerHeight + 24, paddingBottom: insets.bottom + 24 }]}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  scroll: { paddingHorizontal: 16 },
});

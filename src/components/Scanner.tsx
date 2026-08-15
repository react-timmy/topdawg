import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  InteractionManager,
  Modal,
  FlatList,
  Image,
  AppState,
  Linking,
  type AppStateStatus,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  withTiming,
  useAnimatedStyle,
  Easing,
  withRepeat,
} from "react-native-reanimated";
import {
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
  FilePlus,
  FileVideo2,
  Film,
  HelpCircle,
  RotateCcw,
  Scan,
  ShieldAlert,
  Sparkles,
  Zap,
} from "lucide-react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from "expo-document-picker";
import * as MediaLibrary from "expo-media-library";
import { filenameParse } from "@ctrl/video-filename-parser";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { MediaScanProgress, MediaScanResult, MediaItem, LocalFile } from "../types";
import { useNotifications } from "../context/NotificationContext";
import { storageService } from "../storage/asyncStorage";
import { tmdbService } from "../services/tmdbService";
import { animeService } from "../services/animeService";
import { geminiAIService, ParsedFilename } from "../services/geminiAIService";
import { rankSearchResults, resolveIsAnime } from "../utils/mediaHints";
import { parseLocalFilename } from "../utils/localFilenameParser";
import { usePro } from "../context/ProContext";
import { incrementScansUsed } from "../storage/proStatusService";

type ScanState = "idle" | "scanning" | "complete" | "permission_denied" | "error";

export interface ScannerProps {
  onScanComplete: (result?: MediaScanResult) => void;
}

const AI_ENABLED_STORAGE_KEY = "@cinescan:ai_parsing_enabled";

// Persisted pending disambiguation so modal + resolution survives navigation
const PENDING_DISAMBIG_KEY = "@cinescan:pending_disambiguation";
// Module-level registry: pendingId -> resolve function. Keeps promise alive across
// Scanner component unmount/remount within the same app session (not app restart).
const pendingDisambiguationResolves: Map<string, (id: string | null) => void> = new Map();

/** Seconds the on-screen Cancel control stays available. */
const CANCEL_WINDOW_MS = 5000;

const INITIAL_SCAN_PROGRESS: MediaScanProgress = {
  phase: "preparing",
  total: 0,
  processed: 0,
  scanned: 0,
  matched: 0,
  added: 0,
  skipped: 0,
};

/**
 * Lives outside the component so a scan survives leaving Scanner (stack pop).
 * Leaving the screen means "go ahead" — never treat blur as cancel.
 */
type ScanUiSnapshot = { state: ScanState; progress: MediaScanProgress };
const scanSession = {
  active: false,
  cancelRequested: false,
  /** Seconds remaining in the cancel window. */
  cancelUntil: 5,
  focused: true,
};
let scanUiSnapshot: ScanUiSnapshot = { state: "idle", progress: { ...INITIAL_SCAN_PROGRESS } };
const scanUiListeners = new Set<(s: ScanUiSnapshot) => void>();

function publishScanUi(partial: Partial<ScanUiSnapshot>) {
  scanUiSnapshot = {
    state: partial.state ?? scanUiSnapshot.state,
    progress: partial.progress ?? scanUiSnapshot.progress,
  };
  scanUiListeners.forEach((l) => {
    try { l(scanUiSnapshot); } catch (e) {}
  });
}

function userLeftScanner(): boolean {
  return !scanSession.focused || AppState.currentState !== "active";
}

async function notifyScanAway(
  kind: "progress" | "complete",
  payload: Record<string, unknown>,
) {
  if (!userLeftScanner()) return;
  try {
    const ns = await import("../services/notificationService");
    if (kind === "complete") {
      await ns.showScanCompleteNotification(payload as { matchedCount: number; unmatchedCount?: number });
    } else {
      await ns.showScanNotification(payload as { phase?: string; processed?: number; total?: number; matched?: number });
    }
  } catch {
    /* ignore */
  }
}

/** Match app.config.js expo-media-library granularPermissions: video only. */
const VIDEO_GRANULAR: MediaLibrary.GranularPermission[] = ["video"];

/**
 * Ask for video library access. Re-shows the system sheet while canAskAgain;
 * when the OS has permanently denied, returns canAskAgain:false so the UI can
 * deep-link to Settings (requestPermissionsAsync alone would silently fail).
 */
async function requestVideoLibraryAccess(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  const current = await MediaLibrary.getPermissionsAsync(false, VIDEO_GRANULAR);
  if (current.granted) {
    return { granted: true, canAskAgain: true };
  }

  // Still allowed to show the system permission dialog — request again even if
  // the user dismissed/denied earlier without a permanent block.
  if (current.canAskAgain) {
    const req = await MediaLibrary.requestPermissionsAsync(false, VIDEO_GRANULAR);
    return { granted: !!req.granted, canAskAgain: req.canAskAgain !== false };
  }

  // Permanently denied / "Don't ask again" — only Settings can re-enable.
  return { granted: false, canAskAgain: false };
}

/**
 * Skip only junk / status clips. Was 20 minutes — that dropped most TV episodes
 * from Media Library scans while Select Files (no duration) added everything.
 * 90s is enough to skip boomerangs / screen recordings without killing real media.
 */
const MIN_DURATION_SECONDS = 90;


function CountUpText({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    setDisplay(target);
  }, [target]);
  return (
    <Text style={styles.statNumber}>
      {display}
      {suffix}
    </Text>
  );
}



function getPhaseLabel(progress: MediaScanProgress): string {
  const phase = progress.phase ?? "";
  if (phase === "preparing") return "Starting";
  if (phase === "selecting") return "Picking";
  if (phase === "loading_library") return "Reading";
  if (phase === "saving") return "Saving";
  if (phase === "complete") return "Done";
  if (phase.startsWith("Cancel")) return "Stopping";
  if (phase.startsWith("Saving partial")) return "Saving";
  // Prefer short labels over raw pipeline messages
  if (/queue|High traffic/i.test(phase)) return "Waiting";
  if (/cache|Cache/i.test(phase)) return "Cache";
  if (/[Ll]ocal/i.test(phase)) return "Offline";
  if (/[Gg]emini|[Aa]I|Sending|Waiting for Gemini|Got AI/i.test(phase)) return "AI";
  if (/[Mm]atch/i.test(phase)) return "Matching";
  if (/[Pp]ars/i.test(phase)) return "Parsing";
  if (progress.total && progress.total > 0) {
    return `${progress.processed ?? 0}/${progress.total}`;
  }
  return "Working";
}

/** Visible only while countdown > 0, then unmounts (display none). */
function CancelButton({ countdown, onCancel }: { countdown: number; onCancel: () => void }) {
  if (countdown <= 0) return null;
  return (
    <Pressable
      style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.8 }]}
      onPress={onCancel}
      accessibilityRole="button"
      accessibilityLabel={`Cancel scan, ${countdown} seconds remaining`}
    >
      <Text style={styles.cancelBtnText}>Cancel · {countdown}s</Text>
    </Pressable>
  );
}


/** Yield so the UI thread can paint progress between network-heavy steps. */
function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Paginate through the entire device media library (not just first 50). */
async function fetchAllVideoFiles(): Promise<LocalFile[]> {
  const files: LocalFile[] = [];
  let hasNextPage = true;
  let endCursor: string | undefined;
  let page = 0;

  while (hasNextPage) {
    page += 1;
    const result = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.video,
      first: 100,
      after: endCursor,
    });

    for (const asset of result.assets) {
      files.push({
        uri: asset.uri,
        filename: asset.filename || `video_${asset.id}.mp4`,
        // Needed later for export: open local file without MediaDocumentsProvider denial
        mediaAssetId: asset.id,
        // expo-media-library duration is in seconds
        duration: typeof asset.duration === "number" ? asset.duration : undefined,
      });
    }

    hasNextPage = result.hasNextPage;
    endCursor = result.endCursor;

    // Safety: avoid infinite loops on buggy platforms
    if (page > 200) {
      console.warn("[Scanner] Media library pagination capped at 200 pages");
      break;
    }
  }

  console.log(`[Scanner] Media library: collected ${files.length} video asset(s)`);
  return files;
}

export function Scanner({ onScanComplete }: ScannerProps) {
  const [localScanState, setLocalScanState] = useState<ScanState>(scanUiSnapshot.state);
  const [localProgress, setLocalProgress] = useState<MediaScanProgress>(scanUiSnapshot.progress);

  const setScanState = useCallback((s: ScanState | ((prev: ScanState) => ScanState)) => {
    const nextState = typeof s === 'function' ? s(scanUiSnapshot.state) : s;
    publishScanUi({ state: nextState });
  }, []);

  const setProgress = useCallback((p: MediaScanProgress | ((prev: MediaScanProgress) => MediaScanProgress)) => {
    const nextProgress = typeof p === 'function' ? p(scanUiSnapshot.progress) : p;
    publishScanUi({ progress: nextProgress });
  }, []);

  const scanState = localScanState;
  const progress = localProgress;

  const navigation = useNavigation<any>();

  useEffect(() => {
    scanSession.focused = true;
    const unsubscribeFocus = navigation.addListener('focus', () => {
      scanSession.focused = true;
    });
    const unsubscribeBlur = navigation.addListener('blur', () => {
      scanSession.focused = false;
    });
    return () => {
      scanSession.focused = false;
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation]);

  useEffect(() => {
    // Sync initial state from the global snapshot
    setLocalScanState(scanUiSnapshot.state);
    setLocalProgress(scanUiSnapshot.progress);

    const listener = (snapshot: ScanUiSnapshot) => {
      setLocalScanState(snapshot.state);
      setLocalProgress(snapshot.progress);
    };
    scanUiListeners.add(listener);

    return () => {
      scanUiListeners.delete(listener);
    };
  }, []);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [hasScanned, setHasScanned] = useState(false);
  const [aiToast, setAiToast] = useState<string | null>(null);

  // Displayed percent smooths jumps (esp. during AI batching) so the UI grows gradually
  const initialRaw = scanUiSnapshot.progress.total && scanUiSnapshot.progress.total > 0 
    ? (scanUiSnapshot.progress.processed ?? 0) / scanUiSnapshot.progress.total 
    : 0;
  const [displayedPercent, setDisplayedPercent] = useState(initialRaw);
  const displayedPercentRef = useRef(initialRaw);
  useEffect(() => { displayedPercentRef.current = displayedPercent; }, [displayedPercent]);

  useEffect(() => {
    const raw = progress.total && progress.total > 0 ? (progress.processed ?? 0) / progress.total : 0;
    const aiPhase = /[Gg]emini|[Aa]I|Sending|Waiting for Gemini|Parsing/i.test(progress.phase ?? '');
    const cap = aiPhase ? 0.97 : 1;
    const target = Math.min(raw, cap);
    let cancelled = false;
    let timer: any = null;
    function step() {
      if (cancelled) return;
      const cur = displayedPercentRef.current;
      const diff = target - cur;
      if (Math.abs(diff) < 0.001) {
        setDisplayedPercent(target);
        return;
      }
      let next;
      if (diff > 0) {
        next = Math.min(target, cur + Math.max(diff * 0.2, 0.01));
      } else {
        next = Math.max(target, cur + Math.min(diff * 0.2, -0.01));
      }
      setDisplayedPercent(next);
      displayedPercentRef.current = next;
      timer = setTimeout(step, 80);
    }
    step();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [progress.processed, progress.total, progress.phase]);

  // Drawer animation state — created before usePro binding below
  const drawerOpenRef = useRef(false);
  const drawerAnim = useSharedValue(0); // 0 closed, 1 open
  function toggleDrawer() {
    drawerOpenRef.current = !drawerOpenRef.current;
    drawerAnim.value = withTiming(drawerOpenRef.current ? 1 : 0, { duration: 280 });
  }
  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: withTiming(drawerAnim.value === 1 ? 0 : 8) }],
    opacity: withTiming(drawerAnim.value === 1 ? 1 : 0.98),
  }));

  function ScansDrawer({ isProLocal, scansRemainingLocal }: { isProLocal: boolean; scansRemainingLocal: number }) {
    // If Pro, hide drawer and just show a tiny spacer so layout unchanged
    if (isProLocal) return <View style={styles.scanningTips} />;
    return (
      <Animated.View style={[styles.scansDrawerWrap, drawerStyle]}>
        <Pressable
          onPress={toggleDrawer}
          style={({ pressed }) => [styles.scansDrawerHeader, pressed && { opacity: 0.9 }]}
        >
          <Zap size={13} color="#71717a" />
          <Text style={styles.scansHeaderText}>Scans left · {scansRemainingLocal}</Text>
        </Pressable>
        <Animated.View
          style={[styles.scansDrawerBody, { height: drawerAnim.value ? 72 : 0, overflow: 'hidden' }]}
        >
          <Text style={styles.scansBodyText}>
            Monthly free AI scans remaining: {scansRemainingLocal}. Upgrade to Pro for unlimited scanning.
          </Text>
        </Animated.View>
      </Animated.View>
    );
  }

  // Pulse animation for the AI icon: when AI is enabled and a scan is running
  const aiPulse = useSharedValue(1);
  useEffect(() => {
    if (aiEnabled && scanState === "scanning") {
      aiPulse.value = withRepeat(
        withTiming(1.12, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      aiPulse.value = withTiming(1, { duration: 180 });
    }
  }, [aiEnabled, scanState, aiPulse]);
  const animatedAiStyle = useAnimatedStyle(() => ({ transform: [{ scale: aiPulse.value }] }));

  /** False when OS won't show the permission sheet again — open Settings instead. */
  const [permissionCanAskAgain, setPermissionCanAskAgain] = useState(true);
  const { addNotification } = useNotifications();
  const { isPro, scansRemaining, refreshPro } = usePro();
  const insets = useSafeAreaInsets();
  const scanningRef = {
    get current() { return scanSession.active; },
    set current(v: boolean) { scanSession.active = v; }
  };
  const cancelRequestedRef = {
    get current() { return scanSession.cancelRequested; },
    set current(v: boolean) { scanSession.cancelRequested = v; }
  };
  const cancelCountdownRef = {
    get current() { return scanSession.cancelUntil; },
    set current(v: number) { scanSession.cancelUntil = v; }
  };
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanStateRef = {
    get current() { return scanUiSnapshot.state; },
    set current(v: ScanState) { /* no-op since it's published via setter wrapper */ }
  };
  const handleScanLibraryRef = useRef<() => Promise<void>>(async () => {});
  const [cancelCountdown, setCancelCountdown] = useState(scanSession.cancelUntil);

  type DisambiguationOption = { title: string; year: string; id: string; posterUrl?: string };
  type DisambiguationData = {
    id?: string;
    filename: string;
    title: string;
    options: DisambiguationOption[];
  };
  const [disambiguation, setDisambiguation] = useState<DisambiguationData | null>(null);

  useEffect(() => {
    scanStateRef.current = scanState;
    // Persist scan state for global UI indicators (ScanFab)
    try {
      void storageService.saveScanStatus(scanState);
    } catch (e) {
      /* ignore */
    }
  }, [scanState]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedAiEnabled = await AsyncStorage.getItem(AI_ENABLED_STORAGE_KEY);
        if (savedAiEnabled !== null) setAiEnabled(savedAiEnabled === "true");

        // Restore any pending disambiguation if present. The promise resolver
        // should be alive in the module-level registry when navigation caused
        // the Scanner component to unmount and remount within the same session.
        try {
          const raw = await AsyncStorage.getItem(PENDING_DISAMBIG_KEY);
          if (raw) {
            let parsedArray = JSON.parse(raw);
            if (!Array.isArray(parsedArray)) parsedArray = [parsedArray].filter(Boolean);
            
            if (parsedArray.length > 0) {
              const parsed = parsedArray[0];
              if (parsed && pendingDisambiguationResolves.has(parsed.id)) {
                setDisambiguation({ id: parsed.id, filename: parsed.filename, title: parsed.title, options: parsed.options });
              } else if (parsed) {
                // No in-memory resolver (e.g., after full app restart) — clear stale pending
                try { await AsyncStorage.removeItem(PENDING_DISAMBIG_KEY); } catch (e) {}
              }
            }
          }
        } catch (e) {
          console.error('[Scanner] failed to restore pending disambiguation', e);
        }

        // Restore last completed scan summary so the scanning UI shows final progress
        try {
          // storageService was augmented with getLastScanResult in asyncStorage
          // Use optional chaining to be robust in case augmentation failed
          // Do not overwrite an in-progress scan
          if (!scanningRef.current) {
            // @ts-ignore
            const last = await storageService.getLastScanResult?.();
            if (last && last.progress) {
              setProgress((prev) => ({
                ...prev,
                phase: last.progress?.phase ?? 'complete',
                total: last.progress?.total ?? prev.total,
                processed: last.progress?.processed ?? prev.processed,
                scanned: last.progress?.scanned ?? prev.scanned,
                matched: last.progress?.matched ?? prev.matched,
                added: last.progress?.added ?? prev.added,
                skipped: last.progress?.skipped ?? prev.skipped,
              }));
              setScanState('complete');
              setHasScanned(true);
              try { void storageService.saveScanStatus('complete'); } catch (e) { /* ignore */ }
            }
          }
        } catch (e) {
          console.error('[Scanner] failed to restore last scan summary', e);
        }

      } catch (e) {
        console.error("Failed to load scanner settings:", e);
      }
    };
    loadSettings();
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // After returning from Settings (or any resume), if we're on the no-access
  // screen and permission is now granted, continue the library scan.
  useEffect(() => {
    const onAppStateChange = (next: AppStateStatus) => {
      if (next !== "active") return;
      if (scanStateRef.current !== "permission_denied") {
        // If becoming active, check for any pending disambiguations written by notifications
        void (async () => {
          try {
            const pendingRaw = await AsyncStorage.getItem(PENDING_DISAMBIG_KEY);
            if (pendingRaw) {
              const pending = JSON.parse(pendingRaw) as Array<any>;
              if (pending && pending.length > 0 && !disambiguation) {
                // Pop first pending and show modal to let the user resolve it
                const next = pending.shift();
                await AsyncStorage.setItem(PENDING_DISAMBIG_KEY, JSON.stringify(pending));
                // Reconstruct minimal disambiguation data — full options will be re-fetched when user interacts
                setDisambiguation({ id: next.id, filename: next.filename, title: next.title || next.filename, options: next.options || [] });
              }
            }
          } catch (e) {
            /* ignore */
          }
        })();
      }

      if (scanStateRef.current === "permission_denied") {
        if (scanningRef.current) return;

        void (async () => {
          try {
            const perm = await MediaLibrary.getPermissionsAsync(false, VIDEO_GRANULAR);
            if (perm.granted) {
              setPermissionCanAskAgain(true);
              await handleScanLibraryRef.current();
              return;
            }
            setPermissionCanAskAgain(perm.canAskAgain !== false);
          } catch {
            /* ignore */
          }
        })();
      }
    };

    const sub = AppState.addEventListener("change", onAppStateChange);
    return () => sub.remove();
  }, [disambiguation]);

  // While scanning: 10s window where Cancel is visible, then hide (countdown → 0).
  useEffect(() => {
    if (scanState !== "scanning") {
      cancelCountdownRef.current = 5;
      setCancelCountdown(5);
      return;
    }
    if (cancelCountdown <= 0) return;
    const timer = setTimeout(() => {
      cancelCountdownRef.current = Math.max(0, cancelCountdownRef.current - 1);
      setCancelCountdown((c) => c - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [scanState, cancelCountdown]);

  const handleCancelScan = () => {
    if (cancelRequestedRef.current) return;
    cancelRequestedRef.current = true;
    // Hide button immediately; scan loop will stop at the next safe checkpoint
    cancelCountdownRef.current = 0;
    setCancelCountdown(0);
    setProgress((prev) => ({
      ...prev,
      phase: "Cancelling…",
      currentFile: "Stopping after the current step…",
    }));
  };

  const showAiToast = (message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setAiToast(message);
    toastTimerRef.current = setTimeout(() => setAiToast(null), 1800);
  };

  const handleToggleAi = async () => {
    const nextVal = !aiEnabled;
    setAiEnabled(nextVal);
    showAiToast(
      nextVal ? "AI on" : "AI off",
    );
    try {
      await AsyncStorage.setItem(AI_ENABLED_STORAGE_KEY, nextVal ? "true" : "false");
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectFiles = async () => {
    if (scanningRef.current) return;

    try {
      // IMPORTANT: open picker BEFORE entering scanning UI, and never copy
      // multi-GB video files into the app cache (that freezes / blank-screens).
      // Flag picker so App.tsx skips ProfilePicker reset while the system UI is up.
      (globalThis as any).__setPickerActive?.(true);
      let result: DocumentPicker.DocumentPickerResult;
      try {
        result = await DocumentPicker.getDocumentAsync({
          type: "video/*",
          multiple: true,
          copyToCacheDirectory: false,
        });
      } finally {
        // Start grace window — AppState "active" often fires after this resolves.
        (globalThis as any).__setPickerActive?.(false);
      }

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const files: LocalFile[] = result.assets.map((asset, index) => ({
        uri: asset.uri,
        // Prefer real name; fall back uniquely so duplicates don't collapse
        filename: asset.name?.trim() || `selected_${index + 1}.mp4`,
        // Document picker has no reliable duration — do not invent one
        duration: undefined,
      }));

      console.log(`[Scanner] Select files: ${files.length} chosen`);
      try {
        // Ensure global scan status reflects that a scan will run even if the
        // Scanner UI is backgrounded or navigated away from.
        try { void storageService.saveScanStatus('scanning'); } catch (e) { /* ignore */ }
      } catch (e) {}
      await runScan(files);
    } catch (e) {
      (globalThis as any).__setPickerActive?.(false);
      console.error("[Scanner] Select files failed:", e);
      setScanState("error");
      scanningRef.current = false;
    }
  };

  const handleScanLibrary = async () => {
    if (scanningRef.current) return;

    try {
      setScanState("scanning");
      try { void storageService.saveScanStatus('scanning'); } catch (e) { /* ignore */ }
      setProgress({
        ...INITIAL_SCAN_PROGRESS,
        phase: "preparing",
      });

      // Permission sheet also backgrounds the app — same picker flag.
      (globalThis as any).__setPickerActive?.(true);
      let granted = false;
      let canAskAgain = true;
      try {
        const result = await requestVideoLibraryAccess();
        granted = result.granted;
        canAskAgain = result.canAskAgain;
      } finally {
        (globalThis as any).__setPickerActive?.(false);
      }
      if (!granted) {
        setPermissionCanAskAgain(canAskAgain);
        setScanState("permission_denied");
        return;
      }
      setPermissionCanAskAgain(true);

      setProgress((prev) => ({ ...prev, phase: "loading_library" }));
      const files = await fetchAllVideoFiles();

      if (files.length === 0) {
        // No video files found in the media library — show a clean empty result
        setScanState("complete");
        setProgress({
          phase: "complete",
          total: 0,
          processed: 0,
          scanned: 0,
          matched: 0,
          added: 0,
          skipped: 0,
        });
        setHasScanned(true);
        onScanComplete({ matched: [], unmatched: [] });
        scanningRef.current = false;
        return;
      }

      await runScan(files);
    } catch (e) {
      console.error("[Scanner] Media library scan failed:", e);
      setScanState("error");
      scanningRef.current = false;
    }
  };

  /**
   * No-access "Allow" CTA: always try the system permission sheet again.
   * If the OS blocked re-prompts (user never gets a second dialog), open Settings
   * so they can turn video access on — don't silently re-deny.
   */
  const handleAllowPermission = async () => {
    if (scanningRef.current) return;

    // Fresh check — canAskAgain may have changed after a prior denial.
    let current: MediaLibrary.PermissionResponse;
    try {
      current = await MediaLibrary.getPermissionsAsync(false, VIDEO_GRANULAR);
    } catch (e) {
      console.error("[Scanner] getPermissionsAsync failed:", e);
      setScanState("permission_denied");
      return;
    }

    if (current.granted) {
      await handleScanLibrary();
      return;
    }

    if (current.canAskAgain) {
      // Re-show the system allow/deny sheet (user may have denied without
      // permanently blocking — request again, don't just stay denied).
      await handleScanLibrary();
      return;
    }

    // OS will not show the dialog again — send them to app Settings.
    setPermissionCanAskAgain(false);
    try {
      await Linking.openSettings();
    } catch (e) {
      console.error("[Scanner] openSettings failed:", e);
    }
  };

  handleScanLibraryRef.current = handleScanLibrary;

  const runScan = async (files: LocalFile[]) => {
    if (scanningRef.current) {
      console.warn("[Scanner] Scan already in progress, ignoring");
      return;
    }
    scanningRef.current = true;
    // Clear any previous last-scan summary so UI will reflect this new run
    try { await storageService.saveLastScanResult(null); } catch (e) { /* ignore */ }
    // If a cancel was requested during permission/picking phase, honor it and abort
    if (cancelRequestedRef.current) {
      console.log("[Scanner] Cancel requested before runScan started — aborting");
      setProgress((prev) => ({ ...prev, phase: "cancelled", currentFile: "" }));
      setScanState("idle");
      scanningRef.current = false;
      // clear flag so future scans are not cancelled immediately
      cancelRequestedRef.current = false;
      return;
    }
    setScanState("scanning");

    // Start the countdown timer. The UI will reflect this, and the loop
    // below will independently wait for the remaining time.
    const startMs = Date.now();
    const waitMs = cancelCountdownRef.current * 1000;

    const matchedItems: MediaItem[] = [];
    const unmatchedFiles: LocalFile[] = [];

    // Wait for the countdown to finish before starting heavy work. If the user
    // cancels during the countdown nothing should start.
    while (!cancelRequestedRef.current) {
      const elapsed = Date.now() - startMs;
      const remainingSecs = Math.ceil((waitMs - elapsed) / 1000);
      
      if (remainingSecs <= 0) {
        cancelCountdownRef.current = 0;
        break;
      }
      
      // Update global ref for the UI to read if it remounts
      cancelCountdownRef.current = remainingSecs;
      
      // small sleep
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 200));
    }

    if (cancelRequestedRef.current) {
      console.log('[Scanner] Cancelled during countdown');
      setProgress((prev) => ({ ...prev, phase: 'cancelled', currentFile: '' }));
      setScanState('idle');
      scanningRef.current = false;
      // Clear the cancel flag so future scans are not immediately aborted
      cancelRequestedRef.current = false;
      return;
    }
    // Defer inbox spam until the end so we don't re-render the whole app per file
    const pendingNotifications: Parameters<typeof addNotification>[0][] = [];

    try {
      setProgress({
        phase: "preparing",
        total: files.length,
        processed: 0,
        scanned: 0,
        matched: 0,
        added: 0,
        skipped: 0,
        currentFile: "",
      });
      try { void notifyScanAway('progress', { phase: 'preparing', total: files.length }); } catch (e) { /* ignore */ }

      // Let the scanning UI paint before heavy work
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => resolve());
      });
      await yieldToUI();

      // If user cancelled during the initial countdown / UI paint, abort now
      if (cancelRequestedRef.current) {
        console.log("[Scanner] Cancelled before starting heavy work");
        setProgress((prev) => ({ ...prev, phase: "cancelled", currentFile: "" }));
        setScanState("idle");
        scanningRef.current = false;
        return;
      }

      const currentLibrary = await storageService.getLibrary();

      // ── Step 1: Filter already-in-library / junk clips ────────────────────
      const newFiles: LocalFile[] = [];
      let skippedShort = 0;
      let skippedExists = 0;

      for (const file of files) {
        // Only skip tiny clips when duration is known (Media Library path).
        // Select Files has duration=undefined → nothing skipped here (parity).
        if (
          typeof file.duration === "number" &&
          file.duration > 0 &&
          file.duration < MIN_DURATION_SECONDS
        ) {
          skippedShort += 1;
          continue;
        }

        const alreadyExists = currentLibrary.some((item) => {
          const filesList =
            item.localFiles ?? (item.localFile ? [item.localFile] : []);
          return filesList.some(
            (f) => f.uri === file.uri || (f.filename && f.filename === file.filename),
          );
        });

        if (alreadyExists) {
          skippedExists += 1;
        } else {
          newFiles.push(file);
        }
      }

      setProgress((prev) => ({
        ...prev,
        skipped: skippedShort + skippedExists,
        scanned: skippedShort + skippedExists,
        processed: skippedShort + skippedExists,
        total: files.length,
        phase:
          newFiles.length === 0
            ? "complete"
            : `Queued ${newFiles.length} new file(s)`,
      }));
      try { void notifyScanAway('progress', { phase: newFiles.length === 0 ? 'complete' : `Queued ${newFiles.length} new file(s)`, processed: skippedShort + skippedExists, total: files.length }); } catch (e) { /* ignore */ }

      console.log(
        `[Scanner] Input ${files.length} → new ${newFiles.length}, ` +
          `skip short ${skippedShort}, skip exists ${skippedExists}`,
      );

      if (newFiles.length === 0) {
        setProgress((prev) => ({
          ...prev,
          phase: "complete",
          scanned: files.length,
          skipped: skippedShort + skippedExists,
        }));
        setScanState("complete");
        setHasScanned(true);
        onScanComplete({ matched: [], unmatched: [] });
        return;
      }

      // Honour cancel between filter and AI / matching
      if (cancelRequestedRef.current) {
        console.log("[Scanner] Cancelled before matching");
        setProgress((prev) => ({
          ...prev,
          phase: "complete",
          currentFile: "",
        }));
        setScanState("complete");
        setHasScanned(true);
        onScanComplete({ matched: [], unmatched: [] });
        return;
      }

      // ── Step 2: Batch AI parse ────────────────────────────────────────────
      let aiResults: Record<string, ParsedFilename> = {};

      if (aiEnabled && !cancelRequestedRef.current) {
        // Freemium: Pro unlimited. Free users may still scan — Gemini is only
        // used while monthly quota remains; local parse always works.
        if (!isPro && scansRemaining <= 0) {
          setProgress((prev) => ({
            ...prev,
            phase: "Free AI limit reached — local parse only",
            currentFile: "Still matching with the offline parser…",
          }));
        }

        setProgress((prev) => ({
          ...prev,
          phase: "Parsing filenames…",
          currentFile: `Preparing ${newFiles.length} file(s)`,
          processed: 0,
          total: newFiles.length,
        }));
        await yieldToUI();

        try {
          // Soft-cap AI: when free quota is low, still parse everything but
          // batchParseFilenames prefers local; we gate hard AI spend via aiRequested charge.
          // If over quota, skip Gemini entirely (local + cache only).
          const allowGemini = isPro || scansRemaining > 0;

          const batchResult = await geminiAIService.batchParseFilenames(
            newFiles.map((f) => f.filename),
            (p) => {
              if (cancelRequestedRef.current) return;
              setProgress((prev) => ({
                ...prev,
                phase: p.message,
                currentFile:
                  p.stage === "waiting"
                    ? "Gemini is thinking — hang tight…"
                    : p.stage === "sending"
                      ? `Sending ${p.sending ?? 0} name(s) to AI`
                      : p.stage === "local"
                        ? "Fast local parse (no network)…"
                        : p.stage === "cache"
                          ? "Reading parse cache…"
                          : p.stage === "received"
                            ? "Got AI response — applying…"
                            : prev.currentFile,
                processed: p.parsed ?? prev.processed,
                total: newFiles.length,
              }));
            },
            {
              allowGemini,
              maxAiFiles: isPro ? undefined : Math.max(0, scansRemaining),
              isPro,
            },
          );
          // If user cancelled mid-AI wait, drop results and finish early
          if (cancelRequestedRef.current) {
            console.log("[Scanner] Cancelled during AI parse");
            setProgress((prev) => ({
              ...prev,
              phase: "complete",
              currentFile: "",
            }));
            setScanState("complete");
            setHasScanned(true);
            onScanComplete({ matched: [], unmatched: [] });
            return;
          }
          aiResults = batchResult.results;

          // Freemium: only count files that actually hit Gemini (not cache / local).
          const aiUsed = batchResult.aiRequested ?? 0;
          if (aiUsed > 0) {
            await incrementScansUsed(aiUsed);
            await refreshPro();
          }

          setProgress((prev) => ({
            ...prev,
            phase: `Parsed ${Object.keys(aiResults).length}/${newFiles.length} filenames`,
            currentFile: "Starting metadata match…",
          }));
          await yieldToUI();

          console.log(
            `[GeminiAI] Parsed ${Object.keys(aiResults).length}/${newFiles.length} filenames`,
          );
          if (batchResult.failed.length > 0) {
            console.warn(
              `[GeminiAI] Failed to parse: ${batchResult.failed.join(", ")}`,
            );
          }
        } catch (err) {
          console.warn("AI batch parse failed, falling back to local:", err);
          setProgress((prev) => ({
            ...prev,
            phase: "AI failed — using local parser…",
            currentFile: "Continuing without Gemini",
          }));
        }
      }

      // ── Step 3: Match each file ───────────────────────────────────────────
      const hasMetadataLeak = (str: string) =>
        /\b(1080p|720p|2160p|4k|bluray|web-?dl|x264|x265|h264|h265|hevc|dd5\.1|dts|360p|480p|eng_dub|dual.?audio)\b/i.test(
          str,
        );

      const cleanTitle = (raw: string) =>
        raw
          // Site/group prefix — underscore after name is a word char, so no \b
          .replace(
            /^(AnimePahe|SubsPlease|Erai-?raws|HorribleSubs|Judas|ASW|TaigaSubs|Yameii|PSA|CRUCiBLE|EMBER|YTS(?:\.MX)?|YIFY|RARBG|TGx|ETTV|EZTV|NaijaPrey|NetNaija)[\s._-]*/i,
            "",
          )
          .replace(
            /\[(?:netflix|nf|hulu|disney\+?|hbo|max|peacock|paramount\+?|amzn|amazon|web-?dl)\]/gi,
            "",
          )
          .replace(
            /\b(1080p|720p|2160p|360p|480p|4k|uhd|bluray|brrip|bdrip|web-?dl|webrip|hdtv|x264|x265|h264|h265|hevc|aac|dts|dd5\.1|ac3|multi|dual-audio|eng(?:lish)?\s*dub)\b/gi,
            "",
          )
          .replace(/[._]+/g, " ")
          .replace(/\s*-?\s*$/, "")
          .replace(/\s+/g, " ")
          .trim();

      const metadataCache = new Map<string, MediaItem | null>();
      const episodeCache = new Map<
        string,
        { episodeName?: string; stillUrl?: string }
      >();
      const notifiedIds = new Set<string>();

      const resolveMetadata = async (
        filename: string,
        title: string,
        type: "movie" | "tv",
        year: number | null,
        isAnimeFile: boolean,
      ): Promise<MediaItem | null> => {
        const cacheKey = `${title.toLowerCase()}|${type}|${year ?? ""}|${isAnimeFile ? "a" : "n"}`;
        if (metadataCache.has(cacheKey)) {
          return metadataCache.get(cacheKey) ?? null;
        }

        let found: MediaItem | null = null;

        const pick = (results: MediaItem[]) => {
          if (results.length === 0) return null;
          return rankSearchResults(results, isAnimeFile)[0];
        };

        const needsUserClarification = (results: MediaItem[]) => {
          if (results.length < 2) return false;

          const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
          const searchTitle = normalize(title);

          // Check if multiple results are "relevant" — meaning they either exactly
          // match the search title OR contain the search title as a substring.
          // If more than one result is relevant, we have genuine ambiguity and
          // should ask the user instead of silently picking the top result.
          const relevantResults = results.filter((r) => {
            const t = normalize(r.title);
            return t === searchTitle || t.includes(searchTitle) || searchTitle.includes(t);
          });

          if (relevantResults.length >= 2) return true;

          // Fallback: multiple results with different release years and no year
          // hint in the filename → also ambiguous.
          if (year === null) {
            const years = new Set(
              results.map((r) => r.releaseDate?.split("-")[0]).filter(Boolean),
            );
            if (years.size >= 2) return true;
          }

          return false;
        };

        const askUser = async (results: MediaItem[]): Promise<string | null> => {
          const pendingId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
          // Show UI and create an externally-resolvable promise kept in module scope
          const options = results.slice(0, 5).map((r) => ({
            title: r.title,
            year: r.releaseDate ? r.releaseDate.split("-")[0] : "Unknown",
            id: r.id,
            posterUrl: r.posterUrl,
          }));

          // Persist pending disambiguation so a remounted Scanner can restore UI
          try {
            const raw = await AsyncStorage.getItem(PENDING_DISAMBIG_KEY);
            let existing = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(existing)) existing = [existing].filter(Boolean);
            existing.push({ id: pendingId, filename, title, options });
            await AsyncStorage.setItem(PENDING_DISAMBIG_KEY, JSON.stringify(existing));
          } catch (e) {
            console.error('[Scanner] failed to persist pending disambiguation', e);
          }

          // Mark attention state so UI + FAB show unresolved disambiguation
          try { void storageService.saveScanStatus('attention'); } catch (e) { /* ignore */ }

          // If app is backgrounded, schedule an OS notification and continue scanning
          try {
            if (AppState.currentState !== 'active') {
              void (await import('../services/notificationService')).showDisambiguationNotification({ filename, title, optionsCount: results.length, entryId: pendingId });
            }
          } catch (e) {
            console.warn('[Scanner] scheduling disambiguation notification failed', e);
          }

          // App is active — show modal and wait for user choice
          setDisambiguation({ id: pendingId, filename, title, options });

          return new Promise<string | null>((resolve) => {
            pendingDisambiguationResolves.set(pendingId, (val: string | null) => {
              // cleanup persisted state
              try { AsyncStorage.removeItem(PENDING_DISAMBIG_KEY); } catch (e) {}
              pendingDisambiguationResolves.delete(pendingId);
              resolve(val);
            });
          });
        };

        let results = await tmdbService.search(title, type, year);
        if (results.length === 0 && year) {
          results = await tmdbService.search(title, type);
        }

        let first: MediaItem | null = null;
        if (needsUserClarification(results)) {
          const chosenId = await askUser(results);
          setDisambiguation(null);
          try { void storageService.saveScanStatus(scanStateRef.current === 'scanning' ? 'scanning' : scanStateRef.current ?? 'idle'); } catch (e) { /* ignore */ }
          if (chosenId) {
            first = results.find((r) => String(r.id) === String(chosenId)) ?? null;
          }
          if (!first) first = pick(results);
        } else {
          first = pick(results);
        }

        if (!first && type === "tv" && isAnimeFile) {
          const animeResults = await animeService.search(title);
          if (animeResults.length > 0) first = animeResults[0];
        }

        if (!first) {
          const fallbackType = type === "movie" ? "tv" : "movie";
          let fallback = await tmdbService.search(title, fallbackType, year);
          if (fallback.length === 0 && year) {
            fallback = await tmdbService.search(title, fallbackType);
          }

          if (needsUserClarification(fallback)) {
            const chosenId = await askUser(fallback);
            setDisambiguation(null);
            try { void storageService.saveScanStatus(scanStateRef.current === 'scanning' ? 'scanning' : scanStateRef.current ?? 'idle'); } catch (e) { /* ignore */ }
            if (chosenId) {
              first = fallback.find((r) => String(r.id) === String(chosenId)) ?? null;
            }
            if (!first) first = pick(fallback);
          } else {
            first = pick(fallback);
          }

          if (!first && fallbackType === "tv" && isAnimeFile) {
            const animeResults = await animeService.search(title);
            if (animeResults.length > 0) first = animeResults[0];
          }
        }

        if (first) {
          if (first.id.startsWith("anime:")) {
            found = first;
          } else {
            const details = await tmdbService.getDetails(first.id, first.type);
            found = { ...first, ...details };
          }
        }

        metadataCache.set(cacheKey, found);
        return found;
      };

      // Progress total should reflect new files being matched
      setProgress((prev) => ({
        ...prev,
        total: newFiles.length,
        processed: 0,
        // keep prior skip counts in skipped; scanned starts from skips
        scanned: skippedShort + skippedExists,
      }));

      for (let i = 0; i < newFiles.length; i++) {
        // Stop before starting the next file (and after yield points)
        if (cancelRequestedRef.current) {
          console.log("[Scanner] Cancelled by user before file", i + 1);
          break;
        }

        const file = newFiles[i];

        setProgress((prev) => ({
          ...prev,
          processed: i + 1,
          currentFile: file.filename,
          phase: `Matching ${i + 1}/${newFiles.length} with TMDB / anime…`,
        }));
        try { void notifyScanAway('progress', { phase: `Matching ${i + 1}/${newFiles.length}`, processed: i + 1, total: newFiles.length, matched: (progress.matched ?? 0) }); } catch (e) { /* ignore */ }

        // Yield every file so the scanning UI stays responsive
        await yieldToUI();

        if (cancelRequestedRef.current) {
          console.log("[Scanner] Cancelled by user during file", i + 1);
          break;
        }

        let title = "";
        let type: "movie" | "tv" = "movie";
        let year: number | null = null;
        let season: number | null = null;
        let episode: number | null = null;

        const aiParsed = aiResults[file.filename];
        if (aiParsed && aiParsed.title && !hasMetadataLeak(aiParsed.title)) {
          title = aiParsed.title;
          type = aiParsed.type;
          year = aiParsed.year;
          season = aiParsed.season;
          episode = aiParsed.episode;
        }

        // Local fallbacks when AI misses / fails (common for fansub names)
        if (!title || hasMetadataLeak(title)) {
          // 1) Dedicated AnimePahe / fansub parser — handles underscore forms
          const local = parseLocalFilename(file.filename);
          // Debug: log local parser result to help diagnose preview vs dev differences
          try {
            console.log('[Scanner][debug] parseLocalFilename', { filename: file.filename, result: local });
          } catch (e) {
            /* ignore logging failures */
          }
          if (local?.title && !hasMetadataLeak(local.title)) {
            title = local.title;
            type = local.type;
            year = local.year;
            season = local.season;
            episode = local.episode;
          }
        }

        if (!title || hasMetadataLeak(title)) {
          try {
            // Debug: ensure the parser exists and record input
            try { console.log('[Scanner][debug] filenameParse typeof', typeof filenameParse, { filename: file.filename }); } catch(e){}
            const parsed = filenameParse ? filenameParse(file.filename) : null;
            try { console.log('[Scanner][debug] filenameParse result', parsed); } catch(e){}
            if (parsed && parsed.title && !hasMetadataLeak(parsed.title)) {
              title = parsed.title;
              year = parsed.year ? parseInt(parsed.year, 10) : null;
              const isTv = "isTv" in parsed && parsed.isTv;
              type = isTv ? "tv" : "movie";
              if (isTv) {
                const showResult = parsed as any;
                if (showResult.seasons?.length > 0) season = showResult.seasons[0];
                if (showResult.episodes?.length > 0) episode = showResult.episodes[0];
              }
            }
          } catch (err) {
            // @ctrl parser optional — surface error for preview diagnostics
            try { console.warn('[Scanner][warn] filenameParse threw', err); } catch (e) {}
          }
        }

        if (!title || hasMetadataLeak(title)) {
          let tempName = file.filename.replace(/\.[a-zA-Z0-9]+$/, "");
          tempName = tempName.replace(/^\[[^\]]+\]\s*/g, "");
          tempName = tempName.replace(/\s*\[[^\]]+\]/g, "");
          tempName = tempName.replace(/\s*\([^)]+\)/g, "");
          tempName = tempName.replace(/[\._\+]/g, " ").trim();

          const seMatch =
            tempName.match(/(.*?)\b[sS]([0-9]{1,2})[eE]([0-9]{1,2})\b/i) ||
            tempName.match(/(.*?)\b([0-9]{1,2})x([0-9]{1,2})\b/i);

          if (seMatch) {
            title = seMatch[1].trim();
            season = parseInt(seMatch[2], 10);
            episode = parseInt(seMatch[3], 10);
            type = "tv";
          } else {
            const animeMatch = tempName.match(/(.*?)\s*-\s*([0-9]{1,3})\b/);
            if (animeMatch) {
              title = animeMatch[1].trim();
              episode = parseInt(animeMatch[2], 10);
              season = 1;
              type = "tv";
            } else {
              title = tempName;
              type = "movie";
            }
          }

          const yearMatch = tempName.match(/\b(19[0-9]{2}|20[0-9]{2})\b/);
          if (yearMatch) {
            year = parseInt(yearMatch[1], 10);
            const yearIdx = title.search(/\b(19[0-9]{2}|20[0-9]{2})\b/);
            if (yearIdx > 0) title = title.substring(0, yearIdx).trim();
          }
        }

        if (title) title = cleanTitle(title);

        let matchedItem: MediaItem | null = null;
        try {
          if (title) {
            const isAnimeFile = resolveIsAnime(file.filename, aiParsed?.isAnime);
            const meta = await resolveMetadata(file.filename, title, type, year, isAnimeFile);

            if (meta) {
              let episodeName: string | undefined;
              let stillUrl: string | undefined;

              if (
                meta.type === "tv" &&
                !meta.id.startsWith("anime:") &&
                season !== null &&
                episode !== null
              ) {
                // ── Absolute episode resolution ──────────────────────────────
                // Filenames like "ShowName - 14" have no season marker, so
                // every parser defaults to season=1. If the show has multiple
                // seasons, episode 14 might actually be S02E01 (or similar).
                // Walk TMDB seasons to find the real season/episode pair.
                let resolvedSeason = season;
                let resolvedEpisode = episode;

                if (season === 1 && (meta.numberOfSeasons ?? 1) > 1) {
                  const resolved = await tmdbService.resolveAbsoluteEpisode(
                    meta.id,
                    meta.numberOfSeasons!,
                    episode,
                  );
                  if (resolved) {
                    resolvedSeason = resolved.season;
                    resolvedEpisode = resolved.episode;
                    console.log(
                      `[Scanner] Absolute ep ${episode} → S${resolvedSeason}E${resolvedEpisode} for "${meta.title}"`,
                    );
                  }
                }
                // ─────────────────────────────────────────────────────────────

                const epKey = `${meta.id}|${resolvedSeason}|${resolvedEpisode}`;
                if (episodeCache.has(epKey)) {
                  const cached = episodeCache.get(epKey)!;
                  episodeName = cached.episodeName;
                  stillUrl = cached.stillUrl;
                } else {
                  const epDetails = await tmdbService.getEpisodeDetails(
                    meta.id,
                    resolvedSeason,
                    resolvedEpisode,
                  );
                  if (epDetails) {
                    episodeName = epDetails.name;
                    stillUrl = epDetails.stillUrl;
                  }
                  episodeCache.set(epKey, { episodeName, stillUrl });
                }

                // Update season/episode to the resolved values so they're
                // stored correctly in the library.
                season = resolvedSeason;
                episode = resolvedEpisode;
              }

              matchedItem = {
                ...meta,
                localFile: {
                  ...file,
                  seasonNumber: season ?? undefined,
                  episodeNumber: episode ?? undefined,
                  episodeName,
                  stillUrl,
                },
              };
            } else {
              console.warn(
                `[Scanner] No TMDB/anime match for "${title}" ← ${file.filename}`,
              );
            }
          } else {
            console.warn(`[Scanner] Empty title after parse for ${file.filename}`);
          }
        } catch (err) {
          console.error(
            `[Scanner] Metadata search failed for ${file.filename}:`,
            err,
          );
        }

        if (matchedItem) {
          matchedItems.push(matchedItem);

          // Diagnostic log: matched item from parse/search
          try {
            console.log(`[Scanner] Matched item: ${matchedItem.id} - ${matchedItem.title}`);
          } catch (e) {
            /* ignore logging failures */
          }

          // Persist match immediately to reduce race conditions with modal/foreground state
          try {
            // await here so we know persistence succeeded for this item
            // Note: storageService.addItem merges files for existing items
            // and returns the updated library array.
            const persisted = await storageService.addItem(matchedItem);
            try { console.log(`[Scanner] Persisted matched item: ${matchedItem.id} (library now ${persisted.length})`); } catch (e) {}
          } catch (err) {
            console.error('[Scanner] Failed to persist matched item', matchedItem.id, err);
          }

          setProgress((prev) => ({
            ...prev,
            matched: (prev.matched ?? 0) + 1,
            added: (prev.added ?? 0) + 1,
            scanned: (prev.scanned ?? 0) + 1,
          }));

          if (!notifiedIds.has(matchedItem.id)) {
            notifiedIds.add(matchedItem.id);
            pendingNotifications.push({
              type: "added",
              tag: "NEW_ARRIVAL",
              title: `Matched: ${matchedItem.title}`,
              body: `Added ${matchedItem.title} (${year || matchedItem.releaseDate?.split("-")[0] || "Unknown"}) to your library.`,
              mediaTitle: matchedItem.title,
              posterUrl: matchedItem.posterUrl,
              backdropUrl: matchedItem.backdropUrl,
            });
          }
        } else {
          unmatchedFiles.push(file);
          setProgress((prev) => ({
            ...prev,
            skipped: (prev.skipped ?? 0) + 1,
            scanned: (prev.scanned ?? 0) + 1,
          }));
        }

        // Check for cancel request after each file
        if (cancelRequestedRef.current) {
          console.log("[Scanner] Cancelled by user after file", i + 1);
          break;
        }
      }

      const uniqueTitles = new Set(matchedItems.map((m) => m.id)).size;
      console.log(
        `[Scanner] Done: ${matchedItems.length}/${newFiles.length} files matched → ` +
          `${uniqueTitles} library title(s), ${unmatchedFiles.length} unmatched`,
      );

      const wasCancelled = cancelRequestedRef.current;
      setProgress((prev) => ({
        ...prev,
        phase: wasCancelled ? "Saving partial results…" : "saving",
        currentFile: wasCancelled ? "Keeping matches found so far…" : "Writing library…",
      }));

      // Save library BEFORE flipping to complete so UI can't race
      // (also saves partial matches if the user cancelled mid-scan)
      // Persist final scan summary so the ScannerScreen can restore full state
      try {
        // Ensure library persistence even if parent onScanComplete is not available
        if (matchedItems.length > 0) {
          try { await storageService.addItems(matchedItems); } catch (e) { console.error('[Scanner] addItems final persist failed', e); }
        }

        const totalFiles = files.length;
        const skippedCount = (typeof skippedShort === 'number' ? skippedShort : 0) + (typeof skippedExists === 'number' ? skippedExists : 0);
        const scannedCount = skippedCount + matchedItems.length + unmatchedFiles.length;

        const summary = {
          timestamp: new Date().toISOString(),
          progress: {
            total: totalFiles,
            processed: scannedCount,
            scanned: scannedCount,
            matched: matchedItems.length,
            added: matchedItems.length,
            skipped: skippedCount,
            phase: 'complete',
          },
          matched: matchedItems.map((m) => ({ id: m.id, title: m.title, posterUrl: m.posterUrl, filename: m.localFile?.filename })),
          unmatched: unmatchedFiles.map((u) => ({ uri: u.uri, filename: u.filename })),
        };
        try { await storageService.saveLastScanResult(summary as any); } catch (e) { /* ignore */ }

        // Also mark global scan status complete so other screens (FAB) show checkmark
        try { await storageService.saveScanStatus('complete'); } catch (e) { /* ignore */ }
      } catch (e) {
        console.error('[Scanner] failed to persist last scan summary', e);
      }

      try {
        await Promise.resolve(onScanComplete({ matched: matchedItems, unmatched: unmatchedFiles }));
      } catch (e) {
        // parent may be unmounted — that's fine, we've already persisted
        console.warn('[Scanner] onScanComplete failed (parent may be unmounted):', e);
      }

      for (const n of pendingNotifications) {
        try {
          addNotification(n);
        } catch {
          // non-fatal
        }
      }

      setProgress((prev) => ({ ...prev, phase: "complete", currentFile: "" }));
      setScanState("complete");
      setHasScanned(true);
      try { void notifyScanAway('complete', { matchedCount: matchedItems.length, unmatchedCount: unmatchedFiles.length }); } catch (e) { /* ignore */ }
    } catch (err) {
      console.error("[Scanner] runScan fatal error:", err);
      setScanState("error");
      // Still try to persist whatever we matched
      if (matchedItems.length > 0) {
        try {
          onScanComplete({ matched: matchedItems, unmatched: unmatchedFiles });
        } catch {
          // ignore
        }
      }
    } finally {
      scanningRef.current = false;
      // Ensure cancel flag is reset after a scan finishes so the next scan starts clean
      cancelRequestedRef.current = false;
    };  };


  const renderContent = () => {
    switch (scanState) {
      case "idle":
        return (
          <View style={styles.content}>
            {/* Title row: heading + AI icon toggle */}
            <View style={styles.idleHeader}>
              <View style={[styles.iconRing, hasScanned && styles.iconRingOrange]}>
                <Clapperboard size={28} color={hasScanned ? "#f97316" : "#ffffff"} />
              </View>
              <Pressable
                onPress={handleToggleAi}
                hitSlop={10}
                accessibilityRole="switch"
                accessibilityState={{ checked: aiEnabled }}
                accessibilityLabel="AI"
                style={({ pressed }) => [
                  styles.aiIconBtn,
                  aiEnabled && styles.aiIconBtnOn,
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Animated.View style={animatedAiStyle}>
                  <Sparkles
                    size={18}
                    color={aiEnabled ? "#4ade80" : "#71717a"}
                    strokeWidth={2.2}
                  />
                </Animated.View>
              </Pressable>
            </View>

            <Text style={styles.heading}>Scan</Text>
            <Text style={styles.subtext}>Add videos to your library.</Text>

            {hasScanned && (
              <View style={styles.lastScanSummary}>
                <Text style={styles.lastScanText}>
                  Last · {progress.scanned} found · {progress.matched} added · {progress.skipped} skip
                </Text>
              </View>
            )}

            {/* Side-by-side actions */}
            <View style={styles.btnRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  styles.halfBtn,
                  pressed && { opacity: 0.88 },
                ]}
                onPress={handleSelectFiles}
              >
                <FilePlus size={16} color="#000000" />
                <Text style={styles.primaryBtnText} numberOfLines={1}>
                  Files
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  styles.halfBtn,
                  pressed && { opacity: 0.88 },
                ]}
                onPress={handleScanLibrary}
              >
                <Scan size={15} color="#ffffff" />
                <Text style={styles.secondaryBtnText} numberOfLines={1}>
                  Library
                </Text>
              </Pressable>
            </View>

            <ScansDrawer isProLocal={isPro} scansRemainingLocal={scansRemaining} />
          </View>
        );

      case "scanning": {
        const percent = displayedPercent;
        return (
          <View style={[styles.content, styles.scanningContent]}>
            <View style={[styles.iconRing, styles.iconRingScanning, styles.scanningIcon]}>
              <Zap size={36} color="#60a5fa" />
            </View>

            <Text style={styles.heading}>Scanning</Text>



            <View style={styles.progressPanel}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressTitle} numberOfLines={1}>
                  {getPhaseLabel(progress)}
                </Text>
                {progress.total && progress.total > 0 ? (
                  <Text style={styles.progressPercent}>
                    {Math.round(percent * 100)}%
                  </Text>
                ) : null}
              </View>

              <View style={styles.progressTrackInline}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(100, Math.round(percent * 100))}%` },
                  ]}
                />
              </View>

              {progress.currentFile ? (
                <Text style={styles.currentFile} numberOfLines={1}>
                  {progress.currentFile}
                </Text>
              ) : null}
            </View>

            <View style={styles.scanStatsGrid}>
              <View style={styles.scanStatCard}>
                <CountUpText target={progress.scanned ?? 0} />
                <Text style={styles.scanStatLabel}>Found</Text>
              </View>
              <View style={styles.scanStatCard}>
                <CountUpText target={progress.matched ?? 0} />
                <Text style={styles.scanStatLabel}>Added</Text>
              </View>
              <View style={styles.scanStatCard}>
                <CountUpText target={progress.skipped ?? 0} />
                <Text style={styles.scanStatLabel}>Skip</Text>
              </View>
            </View>


            <CancelButton
              countdown={cancelCountdown}
              onCancel={handleCancelScan}
            />
          </View>
        );
      }

      case "complete":
        return (
          <View style={styles.content}>
            <View style={[styles.iconRing, styles.iconRingSuccess]}>
              <CheckCircle2 size={36} color="#4ade80" />
            </View>

            <Text style={styles.heading}>Done</Text>
            <Text style={styles.subtext}>Videos are in your library.</Text>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{progress.scanned ?? 0}</Text>
                <Text style={styles.statLabel}>Found</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{progress.matched ?? 0}</Text>
                <Text style={styles.statLabel}>Added</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{progress.skipped ?? 0}</Text>
                <Text style={styles.statLabel}>Skip</Text>
              </View>
            </View>

            <Pressable style={[styles.primaryBtn, styles.fullBtn]} onPress={() => setScanState("idle")}>
              <RotateCcw size={18} color="#000000" />
              <Text style={styles.primaryBtnText}>Again</Text>
            </Pressable>
          </View>
        );

      case "permission_denied":
        return (
          <View style={styles.content}>
            <View style={[styles.iconRing, styles.iconRingError]}>
              <ShieldAlert size={36} color="#f87171" />
            </View>
            <Text style={styles.heading}>No access</Text>
            <Text style={styles.subtext}>
              {permissionCanAskAgain
                ? "Allow video access to scan."
                : "Video access is blocked. Enable it in Settings, then return here."}
            </Text>

            <Pressable
              style={[styles.primaryBtn, styles.fullBtn]}
              onPress={handleAllowPermission}
            >
              <RotateCcw size={18} color="#000000" />
              <Text style={styles.primaryBtnText}>
                {permissionCanAskAgain ? "Allow" : "Open Settings"}
              </Text>
            </Pressable>

            <Pressable style={[styles.secondaryBtn, styles.fullBtn]} onPress={() => setScanState("idle")}>
              <Text style={styles.secondaryBtnText}>Back</Text>
            </Pressable>
          </View>
        );

      case "error":
        return (
          <View style={styles.content}>
            <View style={[styles.iconRing, styles.iconRingError]}>
              <ShieldAlert size={36} color="#f87171" />
            </View>
            <Text style={styles.heading}>Failed</Text>
            <Text style={styles.subtext}>Something went wrong. Try again.</Text>

            <Pressable style={[styles.primaryBtn, styles.fullBtn]} onPress={() => setScanState("idle")}>
              <RotateCcw size={18} color="#000000" />
              <Text style={styles.primaryBtnText}>Retry</Text>
            </Pressable>
          </View>
        );
    }
  };

  return (
    <View style={styles.container}>
      {renderContent()}

      {/* Disambiguation Modal — bottom-sheet poster-card picker */}
      <Modal
        transparent
        animationType="slide"
        visible={disambiguation !== null}
        statusBarTranslucent
        onRequestClose={() => {
          if (disambiguation) {
            const id = disambiguation.id;
            setDisambiguation(null);
            const resolver = id ? pendingDisambiguationResolves.get(id) : undefined;
            try { AsyncStorage.removeItem(PENDING_DISAMBIG_KEY); } catch (e) {}
            if (resolver) {
              resolver(null);
            }
          }
        }}
      >
        <View style={styles.disambigOverlay}>
          <View style={[styles.disambigSheet, { paddingBottom: insets.bottom + 20 }]}>
            {/* Drag handle */}
            <View style={styles.disambigHandle} />

            {/* Header */}
            <View style={styles.disambigHeader}>
              <View style={styles.disambigIconWrap}>
                <HelpCircle size={22} color="#fbbf24" strokeWidth={2} />
              </View>
              <View style={styles.disambigTitleBlock}>
                <Text style={styles.disambigTitle}>Which one?</Text>
                <Text style={styles.disambigSubtitle}>Pick the match</Text>
              </View>
            </View>

            {/* Filename chip */}
            {disambiguation && (
              <View style={styles.disambigFileChip}>
                <FileVideo2 size={14} color="#52525b" />
                <Text style={styles.disambigFileText} numberOfLines={1} ellipsizeMode="middle">
                  {disambiguation.filename}
                </Text>
              </View>
            )}

            {/* Poster card row */}
            {disambiguation && (
              <FlatList
                data={disambiguation.options}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.disambigCardsList}
                contentContainerStyle={styles.disambigCardsContent}
                renderItem={({ item: option }) => (
                  <Pressable
                    style={({ pressed }) => [
                      styles.disambigCard,
                      pressed && styles.disambigCardPressed,
                    ]}
                    onPress={() => {
                      const id = disambiguation?.id;
                      setDisambiguation(null);
                      const resolver = id ? pendingDisambiguationResolves.get(id) : undefined;
                      try { AsyncStorage.removeItem(PENDING_DISAMBIG_KEY); } catch (e) {}
                      if (resolver) {
                        resolver(option.id);
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${option.title}, ${option.year}`}
                  >
                    {option.posterUrl ? (
                      <Image
                        source={{ uri: option.posterUrl }}
                        style={styles.disambigPoster}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.disambigPosterPlaceholder}>
                        <Film size={28} color="#3f3f46" />
                      </View>
                    )}
                    <View style={styles.disambigCardInfo}>
                      <Text style={styles.disambigCardTitle} numberOfLines={2}>
                        {option.title}
                      </Text>
                      <View style={styles.disambigYearBadge}>
                        <Text style={styles.disambigYearText}>{option.year}</Text>
                      </View>
                    </View>
                  </Pressable>
                )}
              />
            )}

            {/* Skip button */}
            <Pressable
              style={styles.disambigSkipBtn}
              onPress={() => {
                const id = disambiguation?.id;
                setDisambiguation(null);
                const resolver = id ? pendingDisambiguationResolves.get(id) : undefined;
                try { AsyncStorage.removeItem(PENDING_DISAMBIG_KEY); } catch (e) {}
                if (resolver) {
                  resolver(null);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Skip, let AI decide"
            >
              <Text style={styles.disambigSkipText}>Not sure — let AI decide</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {aiToast ? (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(220)}
          style={styles.aiToast}
          pointerEvents="none"
        >
          <Sparkles size={14} color="#4ade80" strokeWidth={2.2} />
          <Text style={styles.aiToastText}>{aiToast}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  card: {
    width: "100%",
    backgroundColor: "#121214",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderRadius: 24,
    padding: 24,
    overflow: "hidden",
    position: "relative",
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    minHeight: 0,
  },
  idleHeader: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginBottom: 4,
  },
  iconRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  iconRingScanning: {
    backgroundColor: "rgba(96,165,250,0.08)",
  },
  iconRingSuccess: {
    backgroundColor: "rgba(74,222,128,0.08)",
  },
  iconRingError: {
    backgroundColor: "rgba(248,113,113,0.08)",
  },
  heading: {
    color: "#f4f4f5",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  subtext: {
    color: "#a1a1aa",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 8,
    fontWeight: "400",
  },
  btnRow: {
    flexDirection: "row",
    width: "100%",
    gap: 12,
    marginTop: 8,
  },
  halfBtn: {
    flex: 1,
    minWidth: 0,
  },
  fullBtn: {
    width: "100%",
    marginTop: 8,
  },
  primaryBtn: {
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "#f8f8f8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryBtnText: {
    color: "#09090b",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  secondaryBtn: {
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryBtnText: {
    color: "#e4e4e7",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  aiIconBtn: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  aiIconBtnOn: {
    backgroundColor: "rgba(74,222,128,0.08)",
  },
  aiToast: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(24,24,27,0.98)",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.2)",
    zIndex: 20,
  },
  aiToastText: {
    color: "#f4f4f5",
    fontSize: 13,
    fontWeight: "600",
  },
  blinkingText: {
    color: "#93c5fd",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 12,
    letterSpacing: 0.2,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#60a5fa",
  },
  scanningContent: {
    alignItems: "stretch",
  },
  scanningIcon: {
    alignSelf: "center",
  },
  progressPanel: {
    width: "100%",
    gap: 12,
    padding: 20,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  progressTitle: {
    flex: 1,
    color: "#e4e4e7",
    fontSize: 14,
    fontWeight: "600",
  },
  progressPercent: {
    color: "#93c5fd",
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  progressTrackInline: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  currentFile: {
    color: "#a1a1aa",
    fontSize: 13,
    fontWeight: "500",
  },
  scanStatsGrid: {
    width: "100%",
    flexDirection: "row",
    gap: 12,
  },
  scanStatCard: {
    flex: 1,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  scanStatLabel: {
    color: "#71717a",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
    width: "100%",
    paddingHorizontal: 12,
    marginVertical: 4,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  statNumber: {
    color: "#ffffff",
    fontSize: 36,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: -1,
  },
  statLabel: {
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  scanningTips: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 12,
    marginTop: 4,
    width: "100%",
  },
  tipText: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
  },
  scansDrawerWrap: {
    width: "100%",
    marginTop: 4,
  },
  scansDrawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  scansHeaderText: {
    color: "#a1a1aa",
    fontSize: 13,
    fontWeight: "600",
  },
  scansDrawerBody: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  scansBodyText: {
    color: "#a1a1aa",
    fontSize: 13,
    lineHeight: 20,
  },
  iconRingOrange: {
    backgroundColor: "rgba(249,115,22,0.08)",
  },
  lastScanSummary: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: "100%",
    alignItems: "center",
  },
  lastScanText: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  cancelBtn: {
    marginTop: 8,
    width: "100%",
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(248,113,113,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    color: "#f87171",
    fontSize: 14,
    fontWeight: "600",
  },
  // ── Disambiguation bottom-sheet ────────────────────────────────────────────
  disambigOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end",
  },
  disambigSheet: {
    backgroundColor: "#121214",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 12,
    paddingHorizontal: 24,
    maxHeight: "85%",
  },
  disambigHandle: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignSelf: "center",
    marginBottom: 24,
  },
  disambigHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 16,
  },
  disambigIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(251,191,36,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  disambigTitleBlock: {
    flex: 1,
  },
  disambigTitle: {
    color: "#f4f4f5",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 24,
  },
  disambigSubtitle: {
    color: "#a1a1aa",
    fontSize: 14,
    fontWeight: "500",
    marginTop: 4,
  },
  disambigFileChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
  },
  disambigFileText: {
    flex: 1,
    color: "#a1a1aa",
    fontSize: 13,
    fontWeight: "500",
  },
  disambigCardsList: {
    marginHorizontal: -24,
    marginBottom: 20,
  },
  disambigCardsContent: {
    paddingHorizontal: 24,
    gap: 16,
  },
  disambigCard: {
    width: 130,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  disambigCardPressed: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  disambigPoster: {
    width: "100%",
    height: 180,
    backgroundColor: "#18181b",
  },
  disambigPosterPlaceholder: {
    width: "100%",
    height: 180,
    backgroundColor: "#18181b",
    alignItems: "center",
    justifyContent: "center",
  },
  disambigCardInfo: {
    padding: 12,
    gap: 8,
  },
  disambigCardTitle: {
    color: "#f4f4f5",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
  disambigYearBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  disambigYearText: {
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  disambigSkipBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    marginBottom: 12,
  },
  disambigSkipText: {
    color: "#a1a1aa",
    fontSize: 14,
    fontWeight: "600",
  },
});

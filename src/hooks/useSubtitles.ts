/**
 * useSubtitles
 *
 * Manages the full subtitle lifecycle for the video player:
 *   - Picking an SRT file via expo-document-picker
 *   - Reading + parsing it via expo-file-system
 *   - Tracking enabled/disabled state
 *   - Exposing the currently active cue for a given playhead position
 *
 * The hook is self-contained — VideoPlayerScreen just calls it, passes
 * `currentTime`, and reads back `activeCue` to drive the overlay.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { parseSRT, findActiveCue, SubtitleCue } from '../utils/srtParser';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubtitleLoadState =
  | 'idle'        // nothing loaded yet
  | 'loading'     // picker open or file being read
  | 'ready'       // cues parsed, subtitles available
  | 'error';      // something went wrong

export interface SubtitleState {
  /** Current load / parse state */
  loadState: SubtitleLoadState;
  /** Human-readable filename of the loaded SRT (e.g. "Movie.srt") */
  filename: string | null;
  /** Device URI of the currently loaded SRT file — used for persistence */
  srtUri: string | null;
  /** Total number of parsed cues — useful for a "N lines loaded" hint */
  cueCount: number;
  /** Whether subtitle display is enabled (user can toggle off without losing the file) */
  enabled: boolean;
  /** The cue that should be on screen right now, or null */
  activeCue: SubtitleCue | null;
  /** Error message when loadState === 'error' */
  error: string | null;

  // ── Actions ──
  /** Open the system file picker and load an SRT */
  pickSubtitleFile: () => Promise<void>;
  /** Directly inject pre-parsed cues (used by the auto-fetch flow) */
  injectCues: (cues: SubtitleCue[], filename: string) => void;
  /** Toggle subtitle display on/off */
  toggleEnabled: () => void;
  /** Clear the loaded subtitle file and reset to idle */
  clearSubtitles: () => void;
  /** Manually advance the active-cue pointer (call with currentTime in seconds) */
  seek: (currentSeconds: number) => void;
}

// ─── Tick interval ────────────────────────────────────────────────────────────

/** How often (ms) we re-evaluate the active cue while playing. */
const TICK_MS = 250;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSubtitles(
  /** Current playhead position in seconds — drives active-cue selection */
  currentTime: number,
  /** Pass `true` while the video is actually playing to start/stop the tick */
  isPlaying: boolean,
): SubtitleState {
  const [loadState, setLoadState] = useState<SubtitleLoadState>('idle');
  const [filename, setFilename] = useState<string | null>(null);
  const [srtUri, setSrtUri] = useState<string | null>(null);
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [activeCue, setActiveCue] = useState<SubtitleCue | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep a ref to the latest cues so the interval callback is never stale
  const cuesRef = useRef<SubtitleCue[]>([]);
  useEffect(() => { cuesRef.current = cues; }, [cues]);

  // Keep a ref to enabled so the interval doesn't close over a stale value
  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  // ── Active-cue tick ──────────────────────────────────────────────────────

  // We use a ref for currentTime inside the interval to avoid restarting it
  // every 250 ms render — the interval reads fresh values via the ref.
  const currentTimeRef = useRef(currentTime);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

  useEffect(() => {
    if (!isPlaying || cues.length === 0) return;

    const id = setInterval(() => {
      if (!enabledRef.current) {
        setActiveCue(null);
        return;
      }
      const next = findActiveCue(cuesRef.current, currentTimeRef.current);
      setActiveCue((prev) => {
        // Avoid re-renders when the cue hasn't changed
        if (prev?.index === next?.index && prev?.text === next?.text) return prev;
        return next;
      });
    }, TICK_MS);

    return () => clearInterval(id);
  }, [isPlaying, cues.length]);

  // When paused, do a one-shot lookup so the cue stays in sync after seeks
  useEffect(() => {
    if (isPlaying) return; // interval handles it while playing
    if (cues.length === 0 || !enabled) {
      setActiveCue(null);
      return;
    }
    setActiveCue(findActiveCue(cues, currentTime));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, isPlaying, enabled]);

  // Clear active cue immediately when subtitles are disabled
  useEffect(() => {
    if (!enabled) setActiveCue(null);
  }, [enabled]);

  // ── File picking + parsing ───────────────────────────────────────────────

  const pickSubtitleFile = useCallback(async () => {
    setLoadState('loading');
    setError(null);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        // SRT files are plain text — accept text/* and a broad wildcard so
        // Android file managers that don't know the MIME type still show them.
        type: ['text/plain', 'text/x-srt', 'application/x-subrip', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.length) {
        // User dismissed the picker — go back to previous state
        setLoadState(cuesRef.current.length > 0 ? 'ready' : 'idle');
        return;
      }

      const asset = result.assets[0];
      const uri = asset.uri;
      const name = asset.name ?? uri.split('/').pop() ?? 'subtitle.srt';

      // Validate extension — accept .srt only (for now)
      if (!name.toLowerCase().endsWith('.srt')) {
        setError(`"${name}" doesn't look like an SRT file. Please pick a .srt file.`);
        setLoadState('error');
        return;
      }

      // Read the file contents
      const content = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const parsed = parseSRT(content);

      if (parsed.length === 0) {
        setError('No subtitle cues found. Make sure the file is a valid SRT.');
        setLoadState('error');
        return;
      }

      setCues(parsed);
      cuesRef.current = parsed;
      setFilename(name);
      setSrtUri(uri);
      setEnabled(true);
      setLoadState('ready');
      // Snap to the current position immediately
      setActiveCue(findActiveCue(parsed, currentTimeRef.current));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to load subtitle file: ${msg}`);
      setLoadState('error');
    }
  }, []);

  // ── Public actions ───────────────────────────────────────────────────────

  const toggleEnabled = useCallback(() => {
    setEnabled((v) => !v);
  }, []);

  const injectCues = useCallback((newCues: SubtitleCue[], name: string) => {
    setCues(newCues);
    cuesRef.current = newCues;
    setFilename(name);
    setEnabled(true);
    setError(null);
    setLoadState('ready');
    setActiveCue(findActiveCue(newCues, currentTimeRef.current));
  }, []);

  const clearSubtitles = useCallback(() => {
    setCues([]);
    cuesRef.current = [];
    setFilename(null);
    setEnabled(true);
    setActiveCue(null);
    setError(null);
    setLoadState('idle');
  }, []);

  const seek = useCallback((currentSeconds: number) => {
    if (cuesRef.current.length === 0 || !enabledRef.current) return;
    setActiveCue(findActiveCue(cuesRef.current, currentSeconds));
  }, []);

  return {
    loadState,
    filename,
    srtUri,
    cueCount: cues.length,
    enabled,
    activeCue,
    error,
    pickSubtitleFile,
    injectCues,
    toggleEnabled,
    clearSubtitles,
    seek,
  };
}

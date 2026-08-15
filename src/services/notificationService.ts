import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UpcomingItem } from '../types';
import { navigateToNotificationsUpcoming, navigateToScanner } from '../navigation/navigationRef';

// ─── Channel setup (Android) ──────────────────────────────────────────────────

if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('upcoming', {
    name: 'Upcoming Releases',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#60a5fa',
  });
  Notifications.setNotificationChannelAsync('scan', {
    name: 'Scanning',
    importance: Notifications.AndroidImportance.DEFAULT,
  }).catch(() => {});
}

// ─── Notification handler ────────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Hours before release to fire the reminder
const HOURS_BEFORE_RELEASE = 3;

// Pending disambiguations key
const PENDING_DISAMBIG_KEY = '@cinescan:pending_disambiguation';

// Last scan notification id (so updates replace previous)
let _lastScanNotificationId: string | null = null;
let _lastScanNotifAt = 0;
const SCAN_NOTIF_MIN_INTERVAL_MS = 4000;

// ─── Request permissions ──────────────────────────────────────────────────────

/** Read-only — never prompts. Safe to call mid-scan. */
export async function hasNotificationPermission(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

async function requestPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  // System permission sheet backgrounds the app. Flag so App.tsx does not
  // remount navigation back to ProfilePicker when the user returns.
  (globalThis as any).__setPickerActive?.(true);
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } finally {
    (globalThis as any).__setPickerActive?.(false);
  }
}

/**
 * Ask once while the user is still on the Scanner screen (e.g. cancel window).
 * Do not call this from per-file progress updates — the OS sheet would pause the scan.
 */
export async function requestScanNotificationPermission(): Promise<boolean> {
  return requestPermissions();
}

/**
 * Parse release date. Date-only strings (YYYY-MM-DD) are treated as local midnight.
 * Full ISO timestamps keep their time component.
 */
function parseReleaseDate(dateString: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [y, m, d] = dateString.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  return new Date(dateString);
}

// ─── Schedule a reminder for an upcoming item ────────────────────────────────

export async function scheduleUpcomingNotification(
  item: UpcomingItem,
): Promise<{ ids: string[]; reason?: 'no_permission' | 'already_released' }> {
  const granted = await requestPermissions();
  if (!granted) return { ids: [], reason: 'no_permission' };

  const releaseDate = parseReleaseDate(item.releaseDate);
  const now = new Date();

  // Don't schedule if release is already past
  if (releaseDate <= now) return { ids: [], reason: 'already_released' };

  // Notify a few hours before release date/time
  const trigger = new Date(releaseDate.getTime() - HOURS_BEFORE_RELEASE * 60 * 60 * 1000);

  // If the "few hours before" window already passed, fire in ~30s so the user still gets it
  const fireAt =
    trigger > now
      ? trigger
      : new Date(now.getTime() + 30 * 1000);

  // Skip if release is already over by the time we'd fire
  if (fireAt >= releaseDate && releaseDate <= now) return { ids: [], reason: 'already_released' };

  const isEpisode = item.type === 'episode';
  const hoursLabel = `${HOURS_BEFORE_RELEASE} hours`;

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: isEpisode
          ? `Coming soon: ${item.sourceTitle}`
          : `${item.title} drops soon`,
        body: isEpisode
          ? `${item.episodeName ?? `S${item.seasonNumber}E${item.episodeNumber}`} releases in about ${hoursLabel}. Tap to open Upcoming.`
          : `${item.title} releases in about ${hoursLabel}. Tap to open Upcoming.`,
        data: {
          itemId: item.id,
          type: item.type,
          screen: 'Notifications',
          tab: 'upcoming',
        },
        ...(Platform.OS === 'android' && { channelId: 'upcoming' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
    return { ids: [id] };
  } catch {
    return { ids: [] };
  }
}

// ─── Cancel all notifications for an item ────────────────────────────────────

export async function cancelNotificationsForItem(itemId: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const toCancel = scheduled.filter((n) => n.content.data?.itemId === itemId);
  await Promise.all(toCancel.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

// ─── Immediate / scan notifications ──────────────────────────────────────────

export async function showScanNotification(progress: { phase?: string; processed?: number; total?: number; matched?: number; added?: number; scanned?: number }) {
  // Never prompt here — a permission sheet mid-scan backgrounds the app and stalls work.
  const granted = await hasNotificationPermission();
  if (!granted) return null;

  const phase = progress.phase ?? '';
  const isMilestone = /preparing|complete|Queued|Saving|Done|Starting/i.test(phase);
  const now = Date.now();
  if (!isMilestone && now - _lastScanNotifAt < SCAN_NOTIF_MIN_INTERVAL_MS) {
    return _lastScanNotificationId;
  }
  _lastScanNotifAt = now;

  const title = 'Scanning your library';
  const body = progress.total
    ? `${progress.processed ?? 0}/${progress.total} processed · ${progress.matched ?? 0} matched`
    : (phase || 'Working…');

  try {
    const scheduleOpts: any = {
      content: {
        title,
        body,
        data: { screen: 'Scanner', type: 'scan_progress', progress },
        ...(Platform.OS === 'android' && { channelId: 'scan' }),
      },
      trigger: null,
    };
    if (_lastScanNotificationId) {
      scheduleOpts.identifier = _lastScanNotificationId;
    }

    const id = await Notifications.scheduleNotificationAsync(scheduleOpts);
    _lastScanNotificationId = id;
    return id;
  } catch (e) {
    console.warn('[Notification] showScanNotification failed', e);
    return null;
  }
}

export async function showScanCompleteNotification(summary: { matchedCount: number; unmatchedCount?: number }) {
  const granted = await hasNotificationPermission();
  if (!granted) return null;
  try {
    const unmatched = summary.unmatchedCount ?? 0;
    const body =
      unmatched > 0
        ? `Added ${summary.matchedCount} · ${unmatched} still need a match.`
        : `Added ${summary.matchedCount} items to your library.`;
    const scheduleOpts: any = {
      content: {
        title: 'Scan complete',
        body,
        data: { screen: 'Scanner', type: 'scan_complete', summary },
        ...(Platform.OS === 'android' && { channelId: 'scan' }),
      },
      trigger: null,
    };
    if (_lastScanNotificationId) scheduleOpts.identifier = _lastScanNotificationId;
    const id = await Notifications.scheduleNotificationAsync(scheduleOpts);
    _lastScanNotificationId = id;
    return id;
  } catch (e) {
    console.warn('[Notification] showScanCompleteNotification failed', e);
    return null;
  }
}

export async function dismissScanProgressNotification(): Promise<void> {
  if (!_lastScanNotificationId) return;
  try {
    await Notifications.dismissNotificationAsync(_lastScanNotificationId);
  } catch {
    /* ignore */
  }
}

export async function showDisambiguationNotification(payload: { filename: string; title?: string; optionsCount?: number; entryId?: string }) {
  const granted = await hasNotificationPermission();
  if (!granted) return null;

  try {
    // Note: Scanner.tsx already persists the disambiguation state with full options.
    // We do not persist here to avoid overwriting it with a partial entry.

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Which match for ${payload.filename}?`,
        body: `Tap to open app and choose the correct match (${payload.optionsCount ?? 0} choices).`,
        data: { screen: 'Scanner', action: 'disambiguate', entryId: entry.id },
        ...(Platform.OS === 'android' && { channelId: 'scan' }),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1 },
    });
    return id;
  } catch (e) {
    console.warn('[Notification] showDisambiguationNotification failed', e);
    return null;
  }
}

// ─── Tap handler (deep-link) ─────────────────────────────────────────────────

let handledResponseId: string | null = null;

function shouldOpenUpcoming(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as { screen?: string; tab?: string; itemId?: string };
  return d.tab === 'upcoming' || d.screen === 'Notifications' || !!d.itemId;
}

function openUpcomingFromNotification() {
  const tryNav = (attempt = 0) => {
    try {
      navigateToNotificationsUpcoming();
    } catch {
      if (attempt < 10) {
        setTimeout(() => tryNav(attempt + 1), 200);
      }
    }
  };
  setTimeout(() => tryNav(), 150);
}

function handleScannerNotification(data: any) {
  const tryNav = (attempt = 0) => {
    try {
      navigateToScanner();
    } catch {
      if (attempt < 10) setTimeout(() => tryNav(attempt + 1), 200);
    }
  };
  setTimeout(() => tryNav(), 150);
}

export function setupNotificationTapHandler(): () => void {
  const handleResponse = (response: Notifications.NotificationResponse) => {
    const id = response.notification.request.identifier;
    if (handledResponseId === id) return;
    handledResponseId = id;
    const data = response.notification.request.content.data;
    if (shouldOpenUpcoming(data)) {
      openUpcomingFromNotification();
      return;
    }
    if (data && typeof data === 'object' && data.screen === 'Scanner') {
      handleScannerNotification(data);
      return;
    }
  };

  const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);

  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (!response) return;
    const notifDate = response.notification.date;
    const ms = notifDate < 1e12 ? notifDate * 1000 : notifDate;
    if (Date.now() - ms > 20_000) return;
    handleResponse(response);
  });

  return () => sub.remove();
}

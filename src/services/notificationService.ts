import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { UpcomingItem } from '../types';
import { navigateToNotificationsUpcoming } from '../navigation/navigationRef';

// ─── Channel setup (Android) ──────────────────────────────────────────────────

if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('upcoming', {
    name: 'Upcoming Releases',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#60a5fa',
  });
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

// ─── Request permissions ──────────────────────────────────────────────────────

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

export async function scheduleUpcomingNotification(item: UpcomingItem): Promise<string[]> {
  const granted = await requestPermissions();
  if (!granted) return [];

  const releaseDate = parseReleaseDate(item.releaseDate);
  const now = new Date();

  // Don't schedule if release is already past
  if (releaseDate <= now) return [];

  // Notify a few hours before release date/time
  const trigger = new Date(releaseDate.getTime() - HOURS_BEFORE_RELEASE * 60 * 60 * 1000);

  // If the "few hours before" window already passed, fire in ~30s so the user still gets it
  const fireAt =
    trigger > now
      ? trigger
      : new Date(now.getTime() + 30 * 1000);

  // Skip if release is already over by the time we'd fire
  if (fireAt >= releaseDate && releaseDate <= now) return [];

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
    return [id];
  } catch {
    return [];
  }
}

// ─── Cancel all notifications for an item ────────────────────────────────────

export async function cancelNotificationsForItem(itemId: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const toCancel = scheduled.filter((n) => n.content.data?.itemId === itemId);
  await Promise.all(toCancel.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

// ─── Tap handler (deep-link → Notifications → Upcoming) ──────────────────────

let handledResponseId: string | null = null;

function shouldOpenUpcoming(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as { screen?: string; tab?: string; itemId?: string };
  return d.tab === 'upcoming' || d.screen === 'Notifications' || !!d.itemId;
}

function openUpcomingFromNotification() {
  // Retry until NavigationContainer is ready (cold start)
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

export function setupNotificationTapHandler(): () => void {
  const handleResponse = (response: Notifications.NotificationResponse) => {
    const id = response.notification.request.identifier;
    if (handledResponseId === id) return;
    handledResponseId = id;
    if (shouldOpenUpcoming(response.notification.request.content.data)) {
      openUpcomingFromNotification();
    }
  };

  // Fires for warm taps and typically also when app is opened from a killed state
  const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);

  // Cold start fallback — only if interaction was within the last 20 seconds
  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (!response) return;
    const notifDate = response.notification.date;
    // expo may return seconds or ms depending on platform
    const ms = notifDate < 1e12 ? notifDate * 1000 : notifDate;
    if (Date.now() - ms > 20_000) return;
    handleResponse(response);
  });

  return () => sub.remove();
}

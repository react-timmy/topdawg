/**
 * Streak Notification Service (Pro Feature)
 *
 * Schedules daily reminders to maintain watch streaks.
 * Only active for Pro users who have an active streak (3+ days).
 *
 * Strategy:
 *  - Schedule notification for 8 PM local time if user hasn't watched today
 *  - Cancel if user watches something (streak extends naturally)
 *  - Reschedule next day's reminder after each watch
 *  - Only fire if streak is 3+ days (early streaks don't need reminders)
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY_LAST_SCHEDULED = '@filmsort:streak_reminder_scheduled';
const NOTIFICATION_ID_PREFIX = 'streak-reminder-';
const REMINDER_HOUR = 20; // 8 PM local time
const MIN_STREAK_FOR_REMINDER = 3; // Only remind users with 3+ day streaks

// ─── Android Channel Setup ────────────────────────────────────────────────────

if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('streak', {
    name: 'Streak Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#f59e0b',
    description: 'Reminders to maintain your watch streak',
  }).catch(() => {
    // Silent fail if channel creation fails
  });
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Get today at 8 PM local time.
 * If it's already past 8 PM, returns tomorrow at 8 PM.
 */
function getNextReminderTime(): Date {
  const now = new Date();
  const reminder = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    REMINDER_HOUR,
    0,
    0,
    0,
  );

  // If it's already past 8 PM today, schedule for tomorrow
  if (reminder <= now) {
    reminder.setDate(reminder.getDate() + 1);
  }

  return reminder;
}

/**
 * Check if user has watched anything today by looking at local storage.
 * Returns true if last watch event is today.
 */
async function hasWatchedToday(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem('@filmsort:watch_history');
    if (!raw) return false;

    const history = JSON.parse(raw) as Array<{ watchedAt: string }>;
    if (history.length === 0) return false;

    const lastWatch = new Date(history[0].watchedAt);
    const today = new Date();

    return (
      lastWatch.getFullYear() === today.getFullYear() &&
      lastWatch.getMonth() === today.getMonth() &&
      lastWatch.getDate() === today.getDate()
    );
  } catch {
    return false;
  }
}

/**
 * Get the last scheduled date from storage.
 * Returns null if never scheduled or if the stored value is invalid.
 */
async function getLastScheduledDate(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY_LAST_SCHEDULED);
  } catch {
    return null;
  }
}

/**
 * Save the scheduled date to storage.
 */
async function saveScheduledDate(dateString: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_LAST_SCHEDULED, dateString);
  } catch {
    // Silent fail
  }
}

/**
 * Cancel all existing streak reminder notifications.
 */
async function cancelExistingReminders(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const streakReminders = scheduled.filter((n) =>
      n.identifier.startsWith(NOTIFICATION_ID_PREFIX),
    );
    await Promise.all(
      streakReminders.map((n) =>
        Notifications.cancelScheduledNotificationAsync(n.identifier),
      ),
    );
  } catch {
    // Silent fail
  }
}

// ─── Request Permissions ──────────────────────────────────────────────────────

async function requestPermissions(): Promise<boolean> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Schedule a streak reminder notification for users with active streaks.
 *
 * Only schedules if:
 *  - Current streak >= 3 days
 *  - User hasn't watched today
 *  - Not already scheduled for today
 *
 * @param currentStreak - User's current streak count
 * @returns notification ID if scheduled, null otherwise
 */
export async function scheduleStreakReminder(
  currentStreak: number,
): Promise<string | null> {
  // Only remind users with established streaks
  if (currentStreak < MIN_STREAK_FOR_REMINDER) return null;

  // Don't remind if user already watched today
  const watchedToday = await hasWatchedToday();
  if (watchedToday) return null;

  // Check if we already scheduled for today
  const lastScheduled = await getLastScheduledDate();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  if (lastScheduled === today) return null;

  // Request notification permissions
  const granted = await requestPermissions();
  if (!granted) return null;

  // Cancel any existing reminders first
  await cancelExistingReminders();

  const reminderTime = getNextReminderTime();
  const notificationId = `${NOTIFICATION_ID_PREFIX}${Date.now()}`;

  try {
    const id = await Notifications.scheduleNotificationAsync({
      identifier: notificationId,
      content: {
        title: `🔥 ${currentStreak}-day streak!`,
        body: `Don't break it! Watch something tonight to keep your streak alive.`,
        data: {
          type: 'streak_reminder',
          streak: currentStreak,
          screen: 'Profile',
        },
        ...(Platform.OS === 'android' && { channelId: 'streak' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderTime,
      },
    });

    // Save today's date so we don't reschedule
    await saveScheduledDate(today);

    return id;
  } catch (error) {
    console.error('Failed to schedule streak reminder:', error);
    return null;
  }
}

/**
 * Cancel all streak reminders.
 * Call this when:
 *  - User watches something (streak naturally continues)
 *  - User manually disables reminders in settings
 */
export async function cancelStreakReminders(): Promise<void> {
  await cancelExistingReminders();
  // Clear the last scheduled date
  try {
    await AsyncStorage.removeItem(STORAGE_KEY_LAST_SCHEDULED);
  } catch {
    // Silent fail
  }
}

/**
 * Check and reschedule streak reminder after a watch event.
 * This should be called from watchHistoryService after recording a watch.
 *
 * Logic:
 *  - If user watched today, cancel reminder (no need to remind)
 *  - Schedule tomorrow's reminder if streak continues
 */
export async function handleWatchEvent(newStreak: number): Promise<void> {
  // Cancel today's reminder since user watched
  await cancelExistingReminders();

  // Clear the scheduled date so tomorrow's check can schedule a new one
  try {
    await AsyncStorage.removeItem(STORAGE_KEY_LAST_SCHEDULED);
  } catch {
    // Silent fail
  }

  // The next reminder will be scheduled when the app opens tomorrow
  // and ProfileScreen calculates the updated streak
}

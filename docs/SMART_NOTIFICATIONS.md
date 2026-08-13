# Smart Notifications (Free Feature + Pro Enhancements)

## Overview

Smart Notifications sends intelligent, timely push notifications to help users maintain their watch streaks and stay informed about new content.

**Free users get:**
- Streak reminders (3+ day streaks)
- Basic in-app notifications
- Upcoming release alerts (manual subscriptions)

**Pro users get:**
- Everything in Free
- Automatic new season alerts for library shows
- Streaming availability notifications for starred items
- Priority notification delivery
- Early access to new notification features

## Features

### 1. Streak Reminders 🔥 (FREE)

**What it does:**
- Sends a push notification at 8 PM local time if the user hasn't watched anything today
- Only activates for users with 3+ day streaks (early streaks don't need reminders)
- Automatically cancels when the user watches something
- **Available to all users** - helps with engagement and retention

**User Experience:**
```
Notification at 8:00 PM:
🔥 12-day streak!
Don't break it! Watch something tonight to keep your streak alive.
```

**Implementation Details:**
- Service: `src/services/streakNotificationService.ts`
- Integration: `src/context/ProContext.tsx` registers watch hooks
- Scheduling: ProfileScreen triggers scheduling when stats are calculated
- Cancellation: Automatic via `watchHistoryService` hook when user watches

**Scheduling Logic:**
1. Check if current streak >= 3 days
2. Check if user hasn't watched today
3. Check if not already scheduled for today
4. Request notification permissions
5. Schedule for 8 PM (or 30s if already past 8 PM)

**Storage Keys:**
- `@filmsort:streak_reminder_scheduled` - Last scheduled date (YYYY-MM-DD)

### 2. New Season/Episode Alerts (Pro Only - Planned)

**What it will do:**
- Monitor TMDB for new seasons of TV shows in the user's library
- Send notification when a new season drops
- Include show poster and season details
- **Pro exclusive** - automatic monitoring vs manual subscriptions for free users

**Example:**
```
Notification:
📺 Stranger Things S5 just released!
You have S1-S4 in your library. Tap to explore the new season.
```

**Implementation Plan:**
- Weekly background check (Expo Background Fetch)
- Compare library TV shows against TMDB latest season data
- Store last-checked season numbers to detect new releases
- Only notify for shows marked as "starred" or with watch history

### 3. Starred Item Availability (Pro Only - Future)

**What it will do:**
- Notify when a starred movie/show becomes available on streaming services
- Integrate with JustWatch or TMDB streaming availability API
- Allow users to set watchlist items with "notify me when available"
- **Pro exclusive** - free users can manually check availability

**Example:**
```
Notification:
⭐ Dune: Part Two is now on Max
You starred this movie 3 months ago. Tap to watch now.
```

## Technical Architecture

### Notification Channels (Android)

```typescript
// Streak reminders
Channel: 'streak'
Importance: DEFAULT
Vibration: [0, 250, 250, 250]
Light Color: #f59e0b (amber)

// Upcoming releases (existing)
Channel: 'upcoming'
Importance: HIGH
Vibration: [0, 250, 250, 250]
Light Color: #60a5fa (blue)
```

### Permission Flow

1. **First notification attempt**: App requests notification permissions
2. **If granted**: Notifications schedule normally
3. **If denied**: Feature silently fails, no error shown to user
4. **iOS**: Requires explicit permission request
5. **Android 13+**: Requires runtime permission

### Hook Architecture

The notification system uses a hook pattern to avoid circular dependencies:

```typescript
// Watch History Service
export function setOnStreakUpdate(cb: (() => void) | null): void

// ProContext registers the hook for all users
useEffect(() => {
  setOnStreakUpdate(async () => {
    await cancelStreakReminders();
  });
  return () => setOnStreakUpdate(null);
}, []);
```

### Scheduling State Machine

```
[App Opens] 
  ↓
[ProfileScreen loads stats]
  ↓
[Streak >= 3 days?] → NO → [Do nothing]
  ↓ YES
[Already watched today?] → YES → [Do nothing]
  ↓ NO
[Already scheduled today?] → YES → [Do nothing]
  ↓ NO
[Schedule notification for 8 PM]
  ↓
[Save scheduled date to storage]

[User watches something]
  ↓
[watchHistoryService.recordCompletion()]
  ↓
[Trigger _onStreakUpdate hook]
  ↓
[cancelStreakReminders()]
  ↓
[Clear scheduled date from storage]
```

## User Settings (Future Enhancement)

Add settings to customize notifications:

```typescript
interface NotificationPreferences {
  streakReminders: boolean;          // Enable/disable streak reminders
  streakReminderTime: string;        // Custom time (e.g., "20:00")
  minStreakForReminder: number;      // Min streak days (default: 3)
  newSeasonAlerts: boolean;          // Enable/disable new season alerts
  starredItemAlerts: boolean;        // Enable/disable streaming availability
}
```

**Settings Screen Location:**
- Settings → Notifications (Pro)
- Toggle switches for each notification type
- Time picker for streak reminder customization

## Testing

### Manual Test Scenarios

**Test 1: Streak Reminder Scheduling**
1. Set device to user with 5-day streak (free or Pro)
2. Navigate to ProfileScreen
3. Check notification is scheduled for 8 PM today
4. Verify storage key `@filmsort:streak_reminder_scheduled` is set

**Test 2: Auto-Cancellation on Watch**
1. Schedule a streak reminder
2. Watch any movie/episode
3. Verify notification is cancelled
4. Verify storage key is cleared

**Test 3: Feature Available to All Users**
1. Use free account with 5-day streak
2. Navigate to ProfileScreen
3. Verify reminder is scheduled (not Pro-gated)
4. Watch something and verify cancellation works

**Test 4: Low Streak Threshold**
1. Set user to 2-day streak (Pro)
2. Navigate to ProfileScreen
3. Verify no reminder is scheduled (below 3-day threshold)

**Test 5: Pro Enhancement (Future)**
1. Pro user with starred show
2. New season releases on TMDB
3. Verify Pro user gets automatic notification
4. Free user must manually check (no auto-notification)

### Automated Testing

```typescript
// Unit tests for streakNotificationService.ts
describe('scheduleStreakReminder', () => {
  it('returns null for streaks < 3 days', async () => {
    const result = await scheduleStreakReminder(2);
    expect(result).toBeNull();
  });

  it('schedules notification for valid user with 3+ day streak', async () => {
    // Mock permissions granted
    const result = await scheduleStreakReminder(5);
    expect(result).toBeTruthy();
  });

  it('works for both free and Pro users', async () => {
    const resultFree = await scheduleStreakReminder(5);
    const resultPro = await scheduleStreakReminder(5);
    expect(resultFree).toBeTruthy();
    expect(resultPro).toBeTruthy();
  });
});
```

## Privacy & Permissions

### iOS (Info.plist)

No additional keys required beyond expo-notifications defaults:
- `NSUserNotificationsUsageDescription` - Already configured

### Android (AndroidManifest.xml)

Permissions added by expo-notifications:
- `android.permission.POST_NOTIFICATIONS` (Android 13+)
- Handled automatically by Expo config plugin

### Data Collection

**What we track:**
- Last scheduled notification date (local storage only)
- Watch streak count (calculated from local watch history)
- No differentiation between free/Pro for streak reminders

**What we DON'T track:**
- Notification open rates (no analytics)
- User notification preferences (all local)
- Push tokens (no remote push server)

**GDPR Compliance:**
- All notification data is stored locally
- No personal data sent to external servers
- User can disable notifications via system settings
- Notifications work the same for free and Pro users (streak reminders)
- Pro-exclusive features (new season alerts) clearly labeled

## Rollout Strategy

### Phase 1: Streak Reminders (Current) ✅
- ✅ Core notification service
- ✅ Scheduling logic
- ✅ Watch event hooks
- ✅ **Available to all users** (not Pro-gated)
- ✅ Permission handling

### Phase 2: Settings UI (Week 2)
- Add notification preferences screen
- Custom reminder time picker
- Toggle switches for each type
- Test notification button

### Phase 3: New Season Alerts (Week 3-4) - Pro Exclusive
- Background fetch implementation
- TMDB season comparison logic
- Starred show filtering
- Notification content with show posters
- **Pro users**: automatic monitoring
- **Free users**: manual "Upcoming" tab checks

### Phase 4: Analytics & Optimization (Week 5)
- Track notification effectiveness (local only)
- A/B test reminder timing
- Optimize notification copy
- Add custom notification sounds

## Future Enhancements

### Smart Timing
- Learn user's typical watch time
- Schedule reminders based on historical patterns
- Avoid reminders during busy hours (if history shows no watches)

### Contextual Notifications
```
🌙 Late Night Pick
You usually watch around 11 PM. Check out tonight's recommendations.
```

### Streak Recovery
```
💔 Your 15-day streak ended yesterday
Start a new one tonight! Here are some quick watches to get you back on track.
```

### Watch Party Invites
```
👥 [Friend] invited you to a Watch Party
Join now to watch [Movie] together in sync.
```

## Support & Troubleshooting

### Common Issues

**Notifications not appearing:**
1. Verify system notification permissions (Settings → Apps → FilmSort → Notifications)
2. Check Do Not Disturb mode
3. Ensure streak >= 3 days
4. Verify user hasn't watched today
5. Available to both free and Pro users

**Reminders not canceling after watch:**
1. Check watch event was recorded (Profile → Recently Watched)
2. Verify hook registration in ProContext
3. Check storage key is cleared after watch

**Duplicate notifications:**
1. Check scheduled date storage key
2. Verify deduplication logic in scheduling
3. Ensure only one ProfileScreen mount per session

### Debug Commands

```typescript
// Check if reminder is scheduled
const scheduled = await AsyncStorage.getItem('@filmsort:streak_reminder_scheduled');
console.log('Last scheduled:', scheduled);

// List all scheduled notifications
const all = await Notifications.getAllScheduledNotificationsAsync();
console.log('Scheduled notifications:', all);

// Force schedule (bypass checks)
await scheduleStreakReminder(5);

// Force cancel all
await cancelStreakReminders();
```

## Related Files

- **Service**: `src/services/streakNotificationService.ts`
- **Integration**: `src/context/ProContext.tsx`
- **Scheduling**: `src/screens/ProfileScreen.tsx`
- **Watch Hooks**: `src/storage/watchHistoryService.ts`
- **Existing Notifications**: `src/services/notificationService.ts`
- **Paywall**: `src/components/ProPaywallModal.tsx`

## Metrics to Track (Future)

- Streak reminder schedule rate
- Streak reminder delivery rate (vs permission denials)
- Notification tap-through rate
- Streak continuation rate (before/after reminder)
- Pro conversion impact (users who subscribed for notifications)

## Business Rationale

### Why Make Streak Reminders Free?

**Engagement & Retention:**
- Notifications drive daily active users (DAU)
- Streaks create habit loops → higher lifetime value
- Free users who engage more are more likely to convert to Pro

**Pro Differentiation:**
- Pro gets *smarter* notifications (new seasons, availability)
- Pro gets *automatic* vs *manual* discovery
- Pro gets *priority* delivery (no rate limiting)
- Quality over gatekeeping

**Competitive Advantage:**
- Most media apps don't have local-first architecture
- Streak reminders showcase the app's value immediately
- Word-of-mouth: "This app actually reminds me to watch!"

**Conversion Funnel:**
```
Free User → Gets streak reminder → Builds 7-day streak → 
Sees "Pro gets new season alerts" → Converts to Pro
```

---

**Version:** 1.1  
**Last Updated:** 2026-08-03  
**Status:** Phase 1 Complete (Streak Reminders - Free Feature)  
**Pro Enhancements:** Planned (New Season Alerts, Streaming Availability)

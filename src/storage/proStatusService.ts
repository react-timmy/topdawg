/**
 * Pro Status Service
 *
 * Manages:
 *  - Whether the user has unlocked Pro (one-time flag on device)
 *  - Monthly AI scan file count (resets on the 1st of each month)
 *
 * Storage keys (all under @filmsort: namespace):
 *  @filmsort:pro_unlocked        "true" | absent
 *  @filmsort:scan_month          "YYYY-MM" — the month the counter belongs to
 *  @filmsort:scan_files_used     number as string — files AI-parsed this month
 *
 * Billing note:
 *  FilmSort is not distributed via Play Console / App Store IAP.
 *  Pro is granted locally via setPro() (and later can be wired to an external
 *  checkout such as Payoneer / Airtm on a backend + webhook).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Constants ────────────────────────────────────────────────────────────────

const KEY_PRO   = '@filmsort:pro_unlocked';
const KEY_MONTH = '@filmsort:scan_month';
const KEY_FILES = '@filmsort:scan_files_used';

/** Free-tier monthly AI file limit. Raise or lower here only. */
export const FREE_SCAN_LIMIT = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if the user has unlocked Pro on this device.
 */
export async function isProUser(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(KEY_PRO);
    return val === 'true';
  } catch {
    return false;
  }
}

/**
 * How many AI-parsed files the user has consumed this month.
 * Automatically resets to 0 when the calendar month rolls over.
 */
export async function getScansUsedThisMonth(): Promise<number> {
  try {
    const [storedMonth, storedCount] = await AsyncStorage.multiGet([KEY_MONTH, KEY_FILES]);
    const month = storedMonth[1];
    const count = storedCount[1];

    if (month !== currentMonth()) {
      await AsyncStorage.multiSet([
        [KEY_MONTH, currentMonth()],
        [KEY_FILES, '0'],
      ]);
      return 0;
    }
    return count ? parseInt(count, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * How many more files the free user can AI-parse this month.
 * Always returns FREE_SCAN_LIMIT for Pro users (callers treat Pro as unlimited).
 */
export async function getScansRemaining(): Promise<number> {
  const pro = await isProUser();
  if (pro) return FREE_SCAN_LIMIT;
  const used = await getScansUsedThisMonth();
  return Math.max(0, FREE_SCAN_LIMIT - used);
}

/**
 * Increment the monthly scan file counter by `count`.
 * No-op for Pro users.
 */
export async function incrementScansUsed(count: number): Promise<void> {
  try {
    const pro = await isProUser();
    if (pro) return;

    const current = await getScansUsedThisMonth();
    await AsyncStorage.multiSet([
      [KEY_MONTH, currentMonth()],
      [KEY_FILES, String(current + count)],
    ]);
  } catch (err) {
    console.warn('[ProStatus] incrementScansUsed failed:', err);
  }
}

/**
 * Persist the Pro unlocked flag. Call after a successful purchase (external
 * checkout) or when unlocking from Settings / paywall. Safe to call repeatedly.
 */
export async function setPro(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PRO, 'true');
    console.log('[ProStatus] Pro status granted.');
  } catch (err) {
    console.warn('[ProStatus] setPro failed:', err);
  }
}

/**
 * Clear Pro and re-read entitlement.
 * Kept for API compatibility with older “purchase” call sites.
 * Returns true if Pro is active after unlock.
 */
export async function purchasePro(): Promise<boolean> {
  await setPro();
  return isProUser();
}

/**
 * Re-check local Pro flag (no store restore — sideload / external billing only).
 */
export async function restorePro(): Promise<boolean> {
  return isProUser();
}

/**
 * Reset Pro status and scan counters (dev/testing only).
 */
export async function resetProStatus(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([KEY_PRO, KEY_MONTH, KEY_FILES]);
    console.log('[ProStatus] Reset complete.');
  } catch (err) {
    console.warn('[ProStatus] reset failed:', err);
  }
}

export const proStatusService = {
  isProUser,
  getScansUsedThisMonth,
  getScansRemaining,
  incrementScansUsed,
  setPro,
  purchasePro,
  restorePro,
  resetProStatus,
  FREE_SCAN_LIMIT,
};

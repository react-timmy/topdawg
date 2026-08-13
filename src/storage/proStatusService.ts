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
import { authService } from '../services/authService';
import { syncService } from '../services/syncService';
import { profileService } from './profileService';

// ─── Constants ────────────────────────────────────────────────────────────────

const KEY_PRO         = '@filmsort:pro_unlocked';
const KEY_MONTH       = '@filmsort:scan_month';
const KEY_FILES       = '@filmsort:scan_files_used';
const KEY_REDEEMED    = '@filmsort:redeemed_code';
const KEY_ACCOUNT_PRO_PREFIX = '@filmsort:account_pro:'; // + uid => code

/** Free-tier monthly AI file limit. Raise or lower here only. */
export const FREE_SCAN_LIMIT = 30;

// ─── Redemption codes ─────────────────────────────────────────────────────────
// 25 unique one-time codes. Each code grants lifetime Pro on the device that
// redeems it. Once a code is stored in KEY_REDEEMED it is locked to that device
// and cannot be reused.  Only share these with users you choose.

const PRO_CODES: ReadonlySet<string> = new Set([
  'FILM-X9K2-PROA',
  'SORT-W7M4-PROB',
  'LENS-B3N8-PROC',
  'REEL-H6P1-PROD',
  'CINE-Q5T7-PROE',
  'SHOT-V2R9-PROF',
  'FADE-J4L3-PROG',
  'WRAP-U8C6-PROH',
  'CAST-Y1D5-PROI',
  'CLIP-Z0F2-PROJ',
  'TAKE-E7G4-PROK',
  'GRIP-S3A8-PROL',
  'ZOOM-M9K1-PROM',
  'IRIS-T6W3-PRON',
  'RACK-N2B7-PROO',
  'PULL-P4H0-PROP',
  'DOLLY-R8X5-PROQ',
  'SLATE-C1V9-PROR',
  'CRANE-L5Q2-PROS',
  'TILT-A7U6-PROT',
  'PANN-D3J4-PROU',
  'MARK-F9Y1-PROV',
  'BOOM-K2W8-PROW',
  'GAFF-H0S5-PROX',
  'DUPE-B6N3-PROY',
]);

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
    if (val === 'true') return true;

    // If no local Pro flag, only consider account-linked pro markers when a
    // Firebase user is currently signed in. This prevents a lingering local
    // profile with pro markers from keeping the device Pro after sign-out.
    let user = null;
    try {
      user = await authService.getCurrentFirebaseUser();
    } catch {
      user = null;
    }

    if (!user) return false;

    // Check local account→code mapping (set at redeem time)
    try {
      const mapped = await AsyncStorage.getItem(KEY_ACCOUNT_PRO_PREFIX + user.uid);
      if (mapped) return true;
    } catch {
      // ignore
    }

    // Last-resort: check the synced cloud profile cached locally
    try {
      const profile = await profileService.get();
      const p = profile as unknown as Record<string, unknown>;
      if (p.proCode || p.proGrantedAt) return true;
    } catch {
      // ignore profile read errors
    }

    return false;
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

/**
 * Remove the Pro flag only (used when the signed-in user signs out so the device
 * returns to the free plan). Does not clear redeemed-code lock or monthly counters.
 */
export async function clearProFlag(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_PRO);
    console.log('[ProStatus] Pro flag cleared (sign-out).');
  } catch (err) {
    console.warn('[ProStatus] clearProFlag failed:', err);
  }
}

/**
 * Attempt to redeem a Pro unlock code entered by the user.
 *
 * Returns:
 *  { success: true }                        — code valid, Pro granted
 *  { success: false, reason: 'invalid' }    — code not in the list
 *  { success: false, reason: 'used' }       — a code is already redeemed on this device
 *  { success: false, reason: 'already_pro'} — device already has Pro active
 */
export async function redeemProCode(
  rawCode: string,
): Promise<
  | { success: true }
  | { success: false; reason: 'invalid' | 'used' | 'already_pro' }
> {
  try {
    const alreadyPro = await isProUser();
    if (alreadyPro) return { success: false, reason: 'already_pro' };

    // Normalize: uppercase, strip leading/trailing whitespace
    const code = rawCode.trim().toUpperCase();

    if (!PRO_CODES.has(code)) return { success: false, reason: 'invalid' };

    // Check if this device already used a code
    const usedCode = await AsyncStorage.getItem(KEY_REDEEMED);
    if (usedCode) return { success: false, reason: 'used' };

    // All good — activate Pro and record which code was used
    await AsyncStorage.multiSet([
      [KEY_PRO, 'true'],
      [KEY_REDEEMED, code],
    ]);

    // If a Firebase user is currently signed in, attach the redeemed code to
    // their cloud profile and store an account→code mapping locally so the
    // account is recognized as Pro on other devices even if cloud sync fails.
    try {
      const user = await authService.getCurrentFirebaseUser();
      if (user) {
        try {
          // Local account mapping (fire-and-forget)
          await AsyncStorage.setItem(KEY_ACCOUNT_PRO_PREFIX + user.uid, code);
        } catch (e) {
          console.warn('[ProStatus] failed to write account→pro mapping locally:', e);
        }

        try {
          const localProfile = await profileService.get();
          const proProfile = {
            ...(localProfile as unknown as Record<string, unknown>),
            proCode: code,
            proGrantedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          // Fire-and-forget; syncService will noop if cloud sync disabled.
          void syncService.pushProfile(user.uid, proProfile as any);
        } catch (e) {
          console.warn('[ProStatus] failed to attach pro code to cloud profile:', e);
        }
      }
    } catch (e) {
      // ignore any auth errors
    }

    console.log('[ProStatus] Pro granted via code:', code);
    return { success: true };
  } catch (err) {
    console.warn('[ProStatus] redeemProCode failed:', err);
    return { success: false, reason: 'invalid' };
  }
}

export async function getAccountProCode(uid: string): Promise<string | null> {
  try {
    const val = await AsyncStorage.getItem(KEY_ACCOUNT_PRO_PREFIX + uid);
    return val ?? null;
  } catch {
    return null;
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
  clearProFlag,
  redeemProCode,
  getAccountProCode,
  FREE_SCAN_LIMIT,
};

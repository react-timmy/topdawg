/**
 * authService.ts
 *
 * Thin wrapper around @react-native-google-signin/google-signin and
 * @react-native-firebase/auth. No UI — just sign-in / sign-out / state.
 *
 * All methods are no-ops / return null when ENABLE_CLOUD_SYNC is false.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import auth, { FirebaseAuthTypes, GoogleAuthProvider } from '@react-native-firebase/auth';
import { GOOGLE_WEB_CLIENT_ID, ENABLE_CLOUD_SYNC } from '../config/env';
import { clearProFlag } from '../storage/proFlags';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FilmSortAccount {
  uid: string;
  displayName: string;
  email: string;
  photoUrl?: string;
}

const ACCOUNT_KEY = '@filmsort:account';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function userToAccount(user: FirebaseAuthTypes.User): FilmSortAccount {
  const email = user.email ?? '';
  // Prefer the Google display name; fall back to the part before the @ in the email
  const emailFallback = email.includes('@') ? email.split('@')[0] : email;
  const displayName = user.displayName ?? emailFallback ?? 'FilmSort User';
  return {
    uid: user.uid,
    displayName,
    email,
    photoUrl: user.photoURL ?? undefined,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const authService = {
  /**
   * Sign in with Google → Firebase Auth.
   *
   * Returns:
   *  - FilmSortAccount on success
   *  - null if the user cancelled
   *  - throws with a human-readable message on other errors
   */
  async signInWithGoogle(): Promise<FilmSortAccount | null> {
    if (!ENABLE_CLOUD_SYNC) return null;

    // Configure Google Sign-In — safe to call every time
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });

    try {
      // Ensure Google Play Services are available (Android)
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;
      if (!idToken) throw new Error('Sign-in failed');

      const credential = GoogleAuthProvider.credential(idToken);
      const result = await auth().signInWithCredential(credential);

      const account = userToAccount(result.user);
      await AsyncStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
      return account;
    } catch (err: any) {
      const code = err?.code;

      if (
        code === statusCodes.SIGN_IN_CANCELLED ||
        code === 'SIGN_IN_CANCELLED'
      ) {
        // User dismissed the picker — not an error
        return null;
      }

      if (
        code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE ||
        code === 'PLAY_SERVICES_NOT_AVAILABLE'
      ) {
        throw new Error('Google Play Services is not available on this device.');
      }

      // Re-throw everything else as-is so callers can surface the message
      throw err;
    }
  },

  /**
   * Sign out from both Google and Firebase, and clear the stored account.
   */
  async signOut(): Promise<void> {
    if (!ENABLE_CLOUD_SYNC) {
      try { await AsyncStorage.removeItem(ACCOUNT_KEY); } catch { /* ignore */ }
      try { await clearProFlag(); } catch { /* ignore */ }
      return;
    }

    try { await GoogleSignin.signOut(); } catch { /* ignore */ }
    try { await auth().signOut(); } catch { /* ignore */ }
    try { await AsyncStorage.removeItem(ACCOUNT_KEY); } catch { /* ignore */ }
    try { await clearProFlag(); } catch { /* ignore */ }
  },

  /**
   * Delete the Firebase Auth user (when signed in), then sign out locally.
   * If re-authentication is required by Firebase, falls back to sign-out only.
   */
  async deleteAccount(): Promise<{ deletedAuth: boolean }> {
    let deletedAuth = false;

    if (ENABLE_CLOUD_SYNC) {
      const user = auth().currentUser;
      if (user) {
        try {
          await user.delete();
          deletedAuth = true;
        } catch (err: any) {
          // requires-recent-login etc. — still wipe local / cloud data upstream
          console.warn('[authService] deleteAccount auth delete failed:', err?.code ?? err);
        }
      }
      try { await GoogleSignin.signOut(); } catch { /* ignore */ }
      try {
        if (auth().currentUser) await auth().signOut();
      } catch { /* ignore */ }
    }

    try { await AsyncStorage.removeItem(ACCOUNT_KEY); } catch { /* ignore */ }
    return { deletedAuth };
  },

  /**
   * Read the persisted account from AsyncStorage.
   * Returns null if not signed in or on parse error.
   */
  async getStoredAccount(): Promise<FilmSortAccount | null> {
    try {
      const raw = await AsyncStorage.getItem(ACCOUNT_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as FilmSortAccount;
    } catch {
      return null;
    }
  },

  /**
   * Returns the current Firebase user, or null if not authenticated.
   */
  async getCurrentFirebaseUser(): Promise<FirebaseAuthTypes.User | null> {
    if (!ENABLE_CLOUD_SYNC) return null;
    return auth().currentUser;
  },

  /**
   * Subscribe to Firebase auth state changes.
   * The callback receives a FilmSortAccount or null.
   * Returns the unsubscribe function.
   */
  onAuthStateChanged(
    cb: (account: FilmSortAccount | null) => void,
  ): () => void {
    if (!ENABLE_CLOUD_SYNC) return () => {};

    return auth().onAuthStateChanged((user) => {
      if (user) {
        cb(userToAccount(user));
      } else {
        cb(null);
      }
    });
  },
};

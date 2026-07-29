/**
 * pinService.ts
 *
 * Local 4-digit PIN for protecting destructive Settings actions
 * (clear library, metadata cache, watch history).
 *
 * Stored only on-device in AsyncStorage — not synced to the cloud.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PIN_KEY = '@filmsort:security_pin';

function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/**
 * Light obfuscation so the PIN is not stored as plain digits in a
 * casually readable dump. Not cryptographic-grade — this is a local
 * convenience lock, not banking security.
 */
function encodePin(pin: string): string {
  const salt = 'filmsort-pin-v1';
  let h = 2166136261;
  const s = `${salt}:${pin}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `v1:${(h >>> 0).toString(16)}`;
}

export const pinService = {
  async hasPin(): Promise<boolean> {
    try {
      const raw = await AsyncStorage.getItem(PIN_KEY);
      return !!raw;
    } catch {
      return false;
    }
  },

  async setPin(pin: string): Promise<void> {
    if (!isValidPin(pin)) {
      throw new Error('PIN must be exactly 4 digits');
    }
    await AsyncStorage.setItem(PIN_KEY, encodePin(pin));
  },

  async verifyPin(pin: string): Promise<boolean> {
    if (!isValidPin(pin)) return false;
    try {
      const stored = await AsyncStorage.getItem(PIN_KEY);
      if (!stored) return false;
      return stored === encodePin(pin);
    } catch {
      return false;
    }
  },

  async clearPin(): Promise<void> {
    await AsyncStorage.removeItem(PIN_KEY);
  },
};

export { isValidPin };

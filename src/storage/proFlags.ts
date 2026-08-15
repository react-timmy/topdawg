import AsyncStorage from '@react-native-async-storage/async-storage';

// Minimal helper module to hold small pro-related flags used across modules.
export const KEY_PRO = '@filmsort:pro_unlocked';

export async function clearProFlag(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_PRO);
    console.log('[ProFlags] Pro flag cleared (sign-out).');
  } catch (err) {
    console.warn('[ProFlags] clearProFlag failed:', err);
  }
}

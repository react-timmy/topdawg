import { requireNativeModule, Platform } from 'expo-modules-core';

type FilmsortSafCopyNative = {
  /**
   * Stream-copy from → to without loading the file into JS memory.
   * @returns bytes written
   */
  copyUriStreaming(fromUri: string, toUri: string): Promise<number>;
};

function loadNative(): FilmsortSafCopyNative | null {
  if (Platform.OS !== 'android') return null;
  try {
    return requireNativeModule<FilmsortSafCopyNative>('FilmsortSafCopy');
  } catch (e) {
    console.warn(
      '[filmsort-saf-copy] Native module not found. Rebuild the Android app (npx expo run:android).',
      e,
    );
    return null;
  }
}

const NativeModule = loadNative();

/**
 * Stream-copy any readable URI into a writable URI (file:// or SAF content://).
 * Android-only native path; throws on iOS/web (callers should use copyAsync there).
 */
export async function copyUriStreaming(
  fromUri: string,
  toUri: string,
): Promise<number> {
  if (!NativeModule) {
    throw new Error(
      'filmsort-saf-copy native module missing. Rebuild Android: npx expo run:android',
    );
  }
  const written = await NativeModule.copyUriStreaming(fromUri, toUri);
  return typeof written === 'number' ? written : Number(written);
}

export default {
  copyUriStreaming,
};

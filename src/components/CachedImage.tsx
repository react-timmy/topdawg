import React, { useEffect, useState } from 'react';
import { Image, ImageProps, Platform } from 'react-native';
import { cacheDirectory, makeDirectoryAsync, getInfoAsync, downloadAsync } from 'expo-file-system';

// Simple in-memory maps to avoid duplicate downloads per session
const localCache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

function djb2Hash(str: string) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + c
    hash = (hash << 5) + hash + str.charCodeAt(i);
    hash = hash & hash; // keep 32-bit
  }
  return (hash >>> 0).toString(36);
}

async function downloadToCache(uri: string): Promise<string | null> {
  try {
    const cacheDir = `${cacheDirectory}images/`;
    await makeDirectoryAsync(cacheDir, { intermediates: true });
    const filename = djb2Hash(uri) + '-' + encodeURIComponent(uri).slice(0, 40);
    const localPath = cacheDir + filename;

    // If file already exists, return its uri
    const info = await getInfoAsync(localPath);
    if (info.exists) return localPath;

    // Download
    const res = await downloadAsync(uri, localPath);
    if (res && res.status && (res.status >= 200 && res.status < 300)) {
      return res.uri;
    }
    return null;
  } catch (e) {
    // silent fallback
    return null;
  }
}

export default function CachedImage({ uri, ...rest }: { uri?: string | null } & Partial<ImageProps>) {
  const [localUri, setLocalUri] = useState<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    if (!uri) {
      setLocalUri(undefined);
      return;
    }

    // If we already resolved it in-memory, use it
    if (localCache.has(uri)) {
      const cached = localCache.get(uri) ?? undefined;
      if (mounted) setLocalUri(cached ?? undefined);
      return;
    }

    // If a pending download exists, await it
    if (pending.has(uri)) {
      (pending.get(uri) as Promise<string | null>).then((p) => {
        if (!mounted) return;
        localCache.set(uri, p);
        setLocalUri(p ?? undefined);
      });
      return;
    }

    const p = (async () => {
      // On web, FileSystem.cacheDirectory may be undefined; skip caching
      if (Platform.OS === 'web' || !cacheDirectory) {
        return null;
      }
      const downloaded = await downloadToCache(uri);
      return downloaded;
    })();

    pending.set(uri, p);
    p.then((result) => {
      pending.delete(uri);
      localCache.set(uri, result);
      if (mounted) setLocalUri(result ?? undefined);
    });

    return () => {
      mounted = false;
    };
  }, [uri]);

  // If there is a localUri (file://), use that; otherwise fall back to remote uri
  const source = localUri ? { uri: localUri } : uri ? { uri } : undefined;
  return <Image {...(rest as ImageProps)} source={source} />;
}

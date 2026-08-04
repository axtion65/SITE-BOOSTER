import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/auth';

const STORAGE_OBJECTS_PREFIX = '/api/storage/objects/';

// Refresh this many seconds before the signed URL actually expires
const REFRESH_BEFORE_EXPIRY_S = 180;

/**
 * Resolves a private storage object URL to a short-lived signed GCS URL.
 *
 * For non-storage URIs (local file://, content://, data:, https: CDN URLs,
 * etc.) the value is returned unchanged.  For `/api/storage/objects/…` paths
 * the hook fetches a 15-minute signed URL from the API and automatically
 * re-fetches a fresh URL before the current one expires so that product images
 * stay visible in long-running sessions.
 */
export function usePrivateImageUrl(src: string | null | undefined): string | null {
  const { token } = useAuth();
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!src) {
      setResolvedUrl(null);
      return;
    }

    // Local URIs (file://, content://, blob:, data:) or already-public URLs
    if (!src.startsWith(STORAGE_OBJECTS_PREFIX)) {
      setResolvedUrl(src);
      return;
    }

    const subPath = src.slice(STORAGE_OBJECTS_PREFIX.length);
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    const baseUrl = domain ? `https://${domain}/api` : '/api';
    const endpoint = `${baseUrl}/storage/object-signed-url/${subPath}`;

    let cancelled = false;

    const clearRefreshTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const fetchSignedUrl = () => {
      clearRefreshTimer();

      fetch(endpoint, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { url: string; expiresIn?: number } | null) => {
          if (cancelled || !data?.url) return;
          setResolvedUrl(data.url);

          // Schedule a refresh before the URL expires
          const ttlSeconds = data.expiresIn ?? 900;
          const refreshAfterMs = Math.max(0, (ttlSeconds - REFRESH_BEFORE_EXPIRY_S) * 1000);
          timerRef.current = setTimeout(fetchSignedUrl, refreshAfterMs);
        })
        .catch(() => {});
    };

    fetchSignedUrl();

    return () => {
      cancelled = true;
      clearRefreshTimer();
    };
  }, [src, token]);

  return resolvedUrl;
}

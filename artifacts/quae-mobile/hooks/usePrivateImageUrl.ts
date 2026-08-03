import { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth';

const STORAGE_OBJECTS_PREFIX = '/api/storage/objects/';

/**
 * Resolves a private storage object URL to a short-lived signed GCS URL.
 *
 * For non-storage URIs (local file://, content://, data:, https: CDN URLs,
 * etc.) the value is returned unchanged.  For `/api/storage/objects/…` paths
 * the hook fetches a 15-minute signed URL from the API so the caller can pass
 * it as an <Image source={{ uri }}> without needing auth headers.
 */
export function usePrivateImageUrl(src: string | null | undefined): string | null {
  const { token } = useAuth();
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

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

    fetch(endpoint, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { url: string } | null) => {
        if (!cancelled && data?.url) {
          setResolvedUrl(data.url);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [src, token]);

  return resolvedUrl;
}

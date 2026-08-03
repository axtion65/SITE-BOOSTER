import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

const STORAGE_OBJECTS_PREFIX = "/api/storage/objects/";
const SIGNED_URL_ENDPOINT = "/api/storage/object-signed-url/";

/**
 * Resolves a private storage object URL to a short-lived signed GCS URL.
 *
 * For URLs that are already public (blob:, data:, https:, etc.) the value is
 * returned as-is.  For `/api/storage/objects/…` paths the hook fetches a
 * 15-minute signed URL from the API (auth-gated, owner-checked) so the caller
 * can use it as an <img src> without needing to attach Authorization headers.
 */
export function usePrivateImageUrl(src: string | null | undefined): string | null {
  const { token } = useAuth();
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setResolvedUrl(null);
      return;
    }

    // Non-storage URLs: local blob previews, data URIs, external HTTPS — use directly
    if (!src.startsWith(STORAGE_OBJECTS_PREFIX)) {
      setResolvedUrl(src);
      return;
    }

    // Extract sub-path: "/api/storage/objects/uploads/uuid" → "uploads/uuid"
    const subPath = src.slice(STORAGE_OBJECTS_PREFIX.length);
    let cancelled = false;

    fetch(`${SIGNED_URL_ENDPOINT}${subPath}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { url: string } | null) => {
        if (!cancelled && data?.url) {
          setResolvedUrl(data.url);
        }
      })
      .catch(() => {
        // Leave resolvedUrl null — callers can hide the image via onError
      });

    return () => {
      cancelled = true;
    };
  }, [src, token]);

  return resolvedUrl;
}

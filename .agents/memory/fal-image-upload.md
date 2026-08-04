---
name: fal.ai image upload blocked in production
description: storage.fal.run is unreachable from Replit's production environment; the fix is to generate a signed GCS URL and pass it to fal.ai instead of uploading bytes
---

# fal.ai image upload blocked in production

## The rule
Never call `storage.fal.run` from the server. Generate a signed Replit object storage URL and pass that as `image_url` to fal.ai instead. fal.ai fetches the image themselves.

**Why:** `storage.fal.run` returns `ENOTFOUND` (DNS blocked) from Replit's production deployment environment. Every render with a product image silently failed before reaching fal.ai's queue.

**How to apply:** In `artifacts/api-server/src/lib/falvideo.ts`, the `uploadImageToFal` function handles GCS object paths (starting with `/objects/` or `/api/storage/objects/`). For these paths, call `svc.getSignedObjectEntityUrl(objectPath, 10800)` (3-hour TTL) and return the signed URL directly. The sidecar at `127.0.0.1:1106` handles signing with no outbound network calls.

`queue.fal.run` (the actual render submission endpoint) IS reachable from Replit production — returns 404 on GET to root, which means server is up. Only the storage subdomain is blocked.

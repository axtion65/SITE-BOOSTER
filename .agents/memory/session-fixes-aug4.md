---
name: Session fixes Aug 4 — all in dev, need one publish
description: Every fix made in the Aug 4 session. Do not re-implement. All ship together with one Publish. User has NOT yet published as of end of session.
---

# Aug 4 Session Fixes — All In Dev, Awaiting Publish

## Status: IN DEV. User has not yet published. One Publish ships all of these.

These are DONE. Do not re-fix them. If the user reports them still broken on quae.ai, ask if they have published since Aug 4.

## Fixes shipped in this session

### 1. Product image renders — `storage.fal.run` unreachable (ROOT CAUSE of all render failures)
- **File:** `artifacts/api-server/src/lib/falvideo.ts` — `uploadImageToFal()`
- **Fix:** GCS object paths now generate a signed URL (via local sidecar) instead of uploading bytes to `storage.fal.run`. fal.ai fetches the image itself.
- **Why it was broken:** `storage.fal.run` returns ENOTFOUND from Replit production. Every render with a product image failed before reaching fal.ai's queue.

### 2. Stuck renders never auto-failing — poll treats 404/405 as "still processing"
- **File:** `artifacts/api-server/src/lib/falvideo.ts` — `pollFalVideoRender()`
- **Fix:** When fal.ai returns 404 or 405 on status poll, return `{ status: 'failed' }` instead of `{ status: 'processing' }`. Projects stuck for 30+ mins now auto-fail and show Re-render button.

### 3. Duration picker showed impossible options (15s, 30s, 60s)
- **File:** `artifacts/quae/src/pages/studio/index.tsx` — duration Select around line 749
- **Fix:** Options now only show 5s and 10s (the actual max any model outputs). Default changed from "15s" to "10s".

### 4. Script written for wrong duration (e.g. 15s script for a 5s LTX render)
- **File:** `artifacts/api-server/src/routes/studio.ts` — `expand-prompt` route
- **Fix:** Reads `renderingModelId` from request, caps `effectiveDuration` to `MODEL_MAX_SECONDS[model]`, passes capped duration to Claude. Frontend sends `renderingModelId` in expand-prompt call.

### 5. Admin credit confirmation dialog blocked renders
- **File:** `artifacts/quae/src/pages/studio/index.tsx` — render confirm dialog
- **Fix:** Admin accounts now show "FREE (admin)" in green. Balance math hidden. Confirm button no longer disabled when admin credits < model cost.

### 6. Email from address
- **File:** `artifacts/api-server/src/lib/email.ts`
- **Fix:** `from` set to `noreply@quae.ai` (Resend domain verified). Emails now send from the quae.ai domain.

### 7. Broadcast email sent to all 4 users
- Sent manually to: axtion65@gmail.com, toioy27@gmail.com, jjkn2727@gmail.com, mgmarku123@outlook.com
- Subject: "🎬 Quae.ai is live — create your first AI video ad"
- No further action needed.

## What still needs to happen
- **User must Publish** — all of the above are in dev only. quae.ai runs the old code until published.
- After publish: user should delete stuck Kling project and create new one with Wan 2.5 or LTX.
- After publish: the next page refresh on any stuck "processing" project will auto-fail it (poll fix).

## User context
- Admin account: axtion65@gmail.com — 150 credits, agency plan, is_admin=true
- Admin renders are FREE (credits never deducted)
- User has NOT successfully created a video yet as of Aug 4 session end
- Completed videos exist for other users (Sims4 Mod Manager Ad — LTX, 4 min, toioy27@gmail.com)

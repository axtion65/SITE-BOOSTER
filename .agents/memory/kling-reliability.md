---
name: fal.ai async queue — use status_url from submission response
description: fal.ai returns status_url and response_url in the submission response. Always use those instead of constructing URLs manually. Also: never poll within 15s of submission.
---

# fal.ai Async Queue — Critical Rules

## Rule 1: Use status_url and response_url from submission response
fal.ai's queue submission returns `{ request_id, status_url, response_url, cancel_url }`.
**Always use these exact URLs for polling and result fetching — never construct them manually.**
Manually constructed URLs (e.g. `queue.fal.run/{model}/requests/{id}/status`) return 405 for versioned model paths like `fal-ai/kling-video/v2.5/standard/image-to-video`.

**Token format v2:** `fal2:<requestId>|||<statusUrl>|||<responseUrl>`
**Token format v1 (legacy):** `fal:<modelPath>:<requestId>` — kept for backwards compat with old projects.

**Why:** fal.ai normalizes model paths internally. The URL they give you is guaranteed correct; the URL you construct may not match their internal routing.

## Rule 2: Never poll within 15 seconds of submission
fal.ai needs ~15s to register a newly submitted job. Polling before that returns 405 even with the correct status_url.

**Fix is in `artifacts/api-server/src/routes/projects.ts`:** GET /projects/:id skips the fal.ai poll if `(Date.now() - project.updatedAt) / 1000 < 15`.

**Symptom without this:** Job submitted at T+0, poll at T+0.7s → 405 → project marked failed instantly.

## Rule 3: 405/404 after 15s = job genuinely gone
If we poll after the 15s hold-off and get 404 or 405, the job expired or was never queued on fal.ai's side. Mark as failed and refund credits.

## Context
- All render failures on Aug 4 were caused by Rules 1+2 combined
- Wan 2.5, Kling 2.5 confirmed affected; LTX may also be affected
- Admin account (axtion65@gmail.com): credits never deducted (is_admin=true)
- User has NOT yet successfully created a video as of this fix

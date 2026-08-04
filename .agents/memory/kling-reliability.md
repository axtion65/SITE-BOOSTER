---
name: fal.ai poll race condition — 15s hold-off required
description: fal.ai returns 405 on status poll if called within ~15s of submission. Root cause of all render failures on Aug 4.
---

# fal.ai Poll Race Condition

## The rule
Never poll `queue.fal.run/{model}/requests/{id}/status` within 15 seconds of submission. fal.ai needs time to register the job in their queue; polling too early returns 405.

**Why:** Submission to `queue.fal.run` is non-blocking — fal.ai returns a request_id before the job is actually registered in the queue backend. The status endpoint 405s until the job is registered (~15s).

**How to apply:** In `artifacts/api-server/src/routes/projects.ts`, the GET /projects/:id route checks `(Date.now() - project.updatedAt) / 1000 < 15` and skips the fal.ai poll entirely, returning current DB state. The `updatedAt` is set when the fal token is stored.

## Symptoms
- Job submission succeeds (returns request_id in < 1s)
- First status poll returns HTTP 405 immediately (~700ms after submission)
- Project marked failed; user sees "Render failed"
- Affects ALL models (Kling, Wan, Ovi) — any model that takes >1s to queue

## What does NOT cause this
- Wrong model path (submission succeeds, so the path is valid)
- Wrong FAL_KEY (submission would fail if key was wrong)
- fal.ai outage (would fail submission too)
- The `?logs=0` parameter (not the cause)

## Related
- Old fix (still valid): 404/405 on poll AFTER 15s = job genuinely gone → mark failed
- Wan 2.5 and Kling both confirmed affected; LTX not confirmed (may also be affected)

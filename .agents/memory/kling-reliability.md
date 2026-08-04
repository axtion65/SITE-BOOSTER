---
name: Kling queue reliability
description: Kling jobs can die silently on fal.ai with no webhook callback; status poll returns 405 when the job is gone
---

# Kling queue reliability

## The rule
Do not rely on Kling completing within the normal render window. When a status poll returns 405, the job no longer exists on fal.ai — treat it as failed and mark the project accordingly.

**Why:** Observed in production: Kling image-to-video job ran for 30+ minutes then returned 405 on status poll. fal.ai's Kling model backs up at peak hours and jobs can expire in the queue without firing a webhook.

**How to apply:**
- Task #35 (merged) adds stuck-render auto-recovery — projects stuck in "processing" for too long are auto-cancelled and credits refunded
- For users: recommend LTX (~60s) or Wan (~3 min) over Kling for reliability; Kling is premium quality but unpredictable queue times
- When polling returns a non-200 (especially 405), treat as failed rather than "still processing"
- Production polling endpoint: `GET https://queue.fal.run/{modelPath}/requests/{requestId}/status?logs=0`

---
name: fal.ai video token format
description: How fal.ai render jobs are tracked in the DB — token format and polling
---

fal.ai render jobs are tracked via a token stored in the project's `thumbnailUrl` column:

Format: `fal:<modelPath>:<requestId>`  
Example: `fal:fal-ai/ovi:abc123-uuid`

The modelPath may contain slashes (e.g. `fal-ai/kling-video/v2.5/standard/text-to-video`). The requestId is always the last segment (UUID). When polling, split on `:` and take the last segment as requestId, everything before as modelPath.

**Why:** We reuse the `thumbnailUrl` column (nullable text) as the render-in-progress indicator. When polling completes, `thumbnailUrl` is cleared and `videoUrl` is set.

**How to apply:** Always check `isFalToken(project.thumbnailUrl)` before polling. On done: set `status=completed`, `videoUrl=<url>`, `thumbnailUrl=null`. On failed: set `status=failed`, `thumbnailUrl=null`.

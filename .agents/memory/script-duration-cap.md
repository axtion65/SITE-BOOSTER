---
name: Script duration cap by model
description: Claude script generation must respect each model's hard output cap; free-tier LTX only outputs 5s so scripting 15s wastes render time and truncates narration
---

# Script duration cap by model

## The rule
When calling `POST /studio/expand-prompt`, pass `renderingModelId` in the request body. The server caps the effective script duration to `min(requestedDuration, MODEL_MAX_SECONDS[model])` before sending to Claude.

**Why:** LTX (free model) hard-caps at 5s output. Default UI duration is 15s. Without capping, Claude writes a 15s script, narration gets truncated, and the render wastes time on content that never appears.

**Model max seconds:** ltx=5, owi=10, wan=10, kling=10, veo3=8

**How to apply:**
- Frontend (`artifacts/quae/src/pages/studio/index.tsx` ~line 400): include `renderingModelId: modelId` in the expand-prompt mutation data
- Server (`artifacts/api-server/src/routes/studio.ts`): reads `renderingModelId` from `req.body as any`, looks up MODEL_MAX_SECONDS, computes `effectiveDuration`, passes that to Claude prompt with explicit instruction "this is a Xs video — be punchy, not padded"

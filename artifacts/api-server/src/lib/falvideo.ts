// fal.ai video generation
// Ovi: $0.20/video flat (video + native audio)
// Wan 2.5: $0.05/sec
// Kling 2.5: $0.07/sec (premium)

import { fal } from "@fal-ai/client";
import { compileVideoRenderBrief, modelSupportsImageConditioning, MODEL_NATIVE_DURATION_SECONDS, type VideoRenderBrief } from "./videoRenderBrief";

export interface ExpandedScript {
  script: string;
  hook: string;
  callToAction: string;
  scenes: Array<{
    sceneNumber: number;
    description: string;
    duration: string;
    visualDirection: string;
  }>;
  voiceoverText: string;
  suggestedMusic: string;
  estimatedDuration: string;
}

// Model IDs on fal.ai
const FAL_MODEL_IDS: Record<string, string> = {
  'ltx':         'fal-ai/ltx-video',
  'ltx-fast':    'fal-ai/ltx-2.3/text-to-video/fast',
  'ltx-fast-img':'fal-ai/ltx-2.3/image-to-video/fast',
  'ovi':         'fal-ai/ovi',
  'wan':         'fal-ai/wan/v2.2/text-to-video',
  'wan-img':     'fal-ai/wan/v2.2/image-to-video',
  'kling':       'fal-ai/kling-video/v2.5/standard/text-to-video',
  'kling-img':   'fal-ai/kling-video/v2.5/standard/image-to-video',
  'veo3':        'fal-ai/veo3',
};

// Credits charged per model (1 credit = $0.01)
// LTX Fast costs ~$0.015/clip → 15 credits = $0.15 → ~10x margin
// Ovi costs $0.20/clip flat → 30 credits = $0.30 → 1.5x margin
export const MODEL_CREDIT_COSTS: Record<string, number> = {
  'ltx':       15,
  'ltx-fast':  15,
  'quae-v1':   30,
  'ovi':       30,
  'wan':      200,
  'kling':    300,
  'kling-1.6': 300,
  'veo3':    1500,
};

// Estimated render time in seconds — shown in the waiting UI
export const MODEL_RENDER_ESTIMATE: Record<string, number> = {
  'ltx':      60,  // ~1 min (very fast)
  'ltx-fast': 30,  // ~30 sec (LTX 2.3 Fast — the new default)
  'ovi':     120,  // ~2 min
  'wan':     180,  // ~3 min
  'kling':   240,  // ~4 min
  'veo3':    480,  // ~8 min
};

// What each model actually outputs (max clip duration the API will honour)
// These are hard model limits — duration in prompt text is ignored by the AI video models
export const MODEL_MAX_SECONDS = MODEL_NATIVE_DURATION_SECONDS;

// Parse "15s" → 15, "1m" → 60
export function parseDurationSeconds(d: string): number {
  const s = d.toLowerCase().trim();
  if (s.endsWith('m')) return parseInt(s) * 60;
  if (s.endsWith('s')) return parseInt(s);
  return parseInt(s) || 10;
}

// Build model-specific body params beyond `prompt`
function buildModelParams(modelKey: string, durationSec: number): Record<string, unknown> {
  const capped = Math.min(durationSec, MODEL_MAX_SECONDS[modelKey] ?? 10);

  switch (modelKey) {
    case 'ltx-fast':
    case 'ltx':
      // LTX 2.3 Fast / LTX Video: 24fps, 121 frames ≈ 5 seconds
      return {
        num_frames: 121,
       negative_prompt:
  'text, words, letters, captions, subtitles, logos, watermarks, signs, labels, typography, written language, misspelled text, gibberish text, low quality, blurry, distorted faces',
      };

    case 'kling':
      // Kling only accepts "5" or "10" as a string
      return { duration: capped >= 8 ? '10' : '5' };

    case 'wan':
      // Wan uses num_frames; ~13 fps, max 129 frames (~10s)
      // 5s→65 frames, 10s→129 frames
      return { num_frames: Math.min(Math.round(capped * 13), 129) };

    case 'veo3':
      // Veo3 uses duration_seconds (float)
      return { duration_seconds: Math.min(capped, 8) };

    case 'ovi':
    default:
      // Ovi has no documented duration param — max is inherent in the model (~10s)
      return {};
  }
}

// Template-type specific cinematic direction
const TEMPLATE_VIDEO_DIRECTION: Record<string, string> = {
  "tiktok-viral-hook":
    "Vertical 9:16. Rapid cuts every 2-3 seconds. Strong visual emphasis in TikTok style. Never display any written text.. First frame is a pattern interrupt — something unexpected or shocking. High energy throughout. Trending audio feel.",

  "ugc-review":
    "Vertical 9:16. Handheld camera feel — slight shake, natural movement. Talking-to-camera framing. Natural home or outdoor lighting. Authentic, unpolished aesthetic. No product on white background. ...Real-life context throughout. No visible text, captions, subtitles, logos, labels, or written words. Tell the story using visuals only.",

  "before-after":
    "Vertical 9:16. Stark visual contrast between first half and second half. Before: muted colors, low energy environment. After: bright, warm, high energy. Consider split-screen or hard cut at midpoint....Transformation is VISUAL, not just narrated. No visible text, captions, subtitles, logos, labels, or written words. Tell the story using visuals only.",

  "product-demo":
    "Widescreen 16:9 or vertical 9:16. Close-up hands-on product shots. Multiple angles — overhead, close macro, side profile. Show the product in actual use, not just display. Clean but not sterile....Professional lighting. No visible text, captions, subtitles, logos, labels, or written words. Tell the story using visuals only.",
  "product-unboxing":
    "Close-up macro shots of packaging details. Camera starts on the shipping box, reveals inner packaging, then product. Slow deliberate movements at key moments (first reveal), faster during secondary reveals. ASMR-adjacent — show texture, weight, material quality visually. No visible text, captions, subtitles, logos, labels, or written words. Tell the story using visuals only.",

"flash-sale":
  "High contrast, high saturation. Fast-paced editing. Show customers rushing to buy, empty shelves, excitement, premium product shots, urgency, and scarcity using visuals only. Every frame should make viewers feel they might miss out. Never display written text, captions, prices, or countdown numbers.",
  "amazon-listing":
   "Premium commercial photography. Luxury lighting. Beautiful cinematic close-ups. Show realistic hands interacting with the product. Emphasize quality, craftsmanship, desirability, and emotional appeal. Make the product feel premium and irresistible. Never display written text, labels, captions, or logos.",

  "brand-story":
    "Cinematic luxury commercial. Tell an emotional story through realistic people and authentic moments. Begin with a relatable problem, then reveal the product naturally as the solution. Build trust with genuine reactions, beautiful lighting, premium camera movement, and emotionally satisfying visuals. End with the customer happy, confident, and transformed. Make the viewer imagine owning the product and wanting it immediately. Never display written text, captions, logos, labels, subtitles, or watermarks.",

  "testimonial-compilation":
    "Vertical 9:16. Quick cuts between different people in different settings — visual variety is key. Each face is centered, talking directly to camera. Show emotion through facial expressions only. Never display written text.. Builds to a montage crescendo of overlapping voices/faces.",

"shopify-promo":
  "Create an aspirational lifestyle commercial. Show a relatable customer using the product in a beautiful real-world setting and experiencing a clear emotional benefit. Use premium cinematic lighting, authentic reactions, smooth camera movement, and a strong product hero shot at the end. Make the viewer imagine owning the product and wanting it immediately. Never display written text, captions, prices, logos, or offer overlays.",

  "tutorial":
    "Step-by-step clarity. Overhead or close-up angles for technique shots. Hands prominently featured. Show each step visually only. Never display written instructions.. Before/during/after of each step shown. Clean, well-lit, distraction-free.",

  "instagram-reel":
    "Aesthetic-first. Every frame is Instagram-worthy on its own. Specific color grade direction matters. Mix of lifestyle shots, product close-ups, and one hero moment. Trending Reel format pacing — quick but deliberate.",
};

/**
 * The single last-mile guard for every prompt sent to fal.ai. It deliberately
 * rewrites risky concepts instead of merely appending a negative instruction,
 * while leaving ordinary cinematic language byte-for-byte unchanged.
 */
export function sanitizeVisualPrompt(prompt: string): string {
  let clean = prompt;
  clean = clean
    .replace(/https?:\/\/\S+|\bwww\.\S+|\b\S+\.(?:com|net|org|io)\b/gi, "a discreet off-camera destination")
    .replace(/(?:\$|€|£)\s?\d+(?:[.,]\d{1,2})?|\b\d+(?:[.,]\d{1,2})?\s?(?:dollars?|euros?|pounds?)\b/gi, "an irresistible offer conveyed by the customer's excited decision")
    .replace(/(?:five|5)[- ]star (?:reviews?|ratings?)|star ratings?/gi, "a montage of delighted customers reacting enthusiastically")
    .replace(/(?:computer|website|analytics|sales)?\s*dashboard/gi, "business owner celebrating results with all devices turned away from camera")
    .replace(/phone (?:ui|interface|screen)|mobile (?:ui|interface|screen)/gi, "customer interacting naturally with a phone kept facing away from camera")
    .replace(/countdown(?: timer)?(?: showing)?(?: \d+)?/gi, "rapidly dwindling inventory and accelerating fulfillment")
    .replace(/packaging (?:text|label|lettering)|product label/gi, "clean unmarked packaging with texture and shape emphasized")
    .replace(/(?:show|display|add|include|with|featuring)?\s*(?:an?\s*)?(?:caption|subtitle|text overlay|typography|written words?|price|url|website address|poster|menu|receipt|document|browser page|review|sign)(?:s)?(?:\s+(?:reading|showing|saying)\s+["“][^"”]*["”])?/gi, "use expressive action and composition")
    .replace(/\b(?:readable|visible) (?:words?|text|lettering|screens?)\b/gi, "abstract nonverbal detail")
    .replace(/\b(?:brand )?logos?\b/gi, "distinctive product silhouette")
    .replace(/\s{2,}/g, " ")
    .replace(/\.{2,}/g, ".")
    .trim();
  return clean;
}

export function buildVideoPrompt(script: ExpandedScript, platform: string, duration: string, templateType?: string, brief?: VideoRenderBrief): string {
  const isVertical = platform === 'tiktok' || platform === 'instagram';
  const baseFormat = isVertical
    ? 'vertical 9:16 format, mobile-first, designed for social media feeds'
    : 'widescreen 16:9, cinematic, professional production quality';

  // Pull template-specific visual direction if available
  const templateDirection = templateType
    ? (TEMPLATE_VIDEO_DIRECTION[templateType] ?? '')
    : '';

  const productionScript = brief?.shortened
    ? { ...script, scenes: brief.visualBeats.map((beat, index) => ({ sceneNumber: index + 1, description: beat, duration: `${brief.renderDurationSeconds / brief.visualBeats.length}s`, visualDirection: '' })), voiceoverText: brief.voiceoverText, callToAction: brief.marketingMessage }
    : script;

  // Build only the beats the selected model can execute.
  const sceneLines = productionScript.scenes.map((s, i) =>
    `Scene ${i + 1} (${s.duration}): ${s.description}. Camera/visuals: ${s.visualDirection}.`
  ).join(' ');

  const parts: string[] = [

  `You are an award-winning commercial director and viral marketing expert.

Your goal is not merely to generate a video. Your goal is to create a persuasive advertisement that makes the viewer want the product or service.

The first 2 seconds must stop the viewer from scrolling.

Show a clear problem, emotional tension, the product as the solution, and a satisfying transformation.

Use realistic people, authentic reactions, cinematic lighting, believable environments, premium camera movement, and natural facial expressions.

Focus on benefits, lifestyle, emotion, trust, and desire—not technical features.

Avoid generic AI-looking scenes, random imagery, distorted people, or disconnected shots.

Every scene must support the same product, customer, and story.

The viewer should finish the video thinking:

The viewer should immediately understand why the product matters.

Every scene should increase desire.

Build curiosity.

Build trust. 

Build excitement.

Show the product solving a real problem.

End with a premium hero shot that makes the viewer want to own it immediately.

IMPORTANT: Do NOT generate any visible text, captions, subtitles, logos, watermarks, signs, labels, website names, or written language of any kind. Use visuals only.`,

  // Template-specific direction takes priority
  templateDirection ? `Video format directive: ${templateDirection}` : '',
 

    // Opening hook — most important for AI to prioritize
    

    // Scene breakdown
    sceneLines ? `Scene breakdown: ${sceneLines}` : '',

    // Voiceover narrative arc
  

    // CTA
 

    // Base format if no template direction
    !templateDirection
      ? `Style: professional product advertisement, ${baseFormat}, high production value, ${duration} duration.`
      : `Format: ${baseFormat}. Duration: ${duration}.`,

    // Music
    // Approved marketing, price, brand, CTA and narration remain outside generated pixels.
    productionScript.suggestedMusic ? `Music/mood: ${productionScript.suggestedMusic}.` : '',

`
IMPORTANT:
Never generate any visible text, captions, subtitles, logos, labels, UI elements, signs, website addresses, or written words inside the video.
If text would normally appear, replace it with clean visuals instead.
The advertisement must persuade through emotion, trust, benefits, product use, and transformation rather than words on screen.
`,

];  

  if (brief?.shortened) {
    // Short models need a single executable shot, not the full-ad storytelling DNA
    // used by longer renders. Approved spoken/marketing copy is intentionally absent.
    parts.splice(0, parts.length,
      `VISUAL PRODUCTION BRIEF: ${brief.visualProductionBrief}`,
      sceneLines ? `Source visual context (adapt into the one shot; never reproduce written copy): ${sceneLines}` : "",
      `Style: premium believable product-ad draft, ${baseFormat}. Duration: ${brief.renderDurationSeconds}s.`,
      productionScript.suggestedMusic ? `Music/mood: ${productionScript.suggestedMusic}.` : "",
    );
  } else if (brief?.visualProductionBrief) {
    parts.unshift(`VISUAL PRODUCTION BRIEF: ${brief.visualProductionBrief}`);
  }
  const creativePrompt = sanitizeVisualPrompt(parts.filter(Boolean).join(' '));
  return `${creativePrompt} ABSOLUTE VISUAL CONSTRAINT: generate imagery only. No signs, posters, billboards, menus, text-facing screens, UI, captions, subtitles, invented labels, generated logos, random symbols, fake lettering, readable typography, watermark-like text, background writing, glyphs, letters, numbers, interface elements, or legible language anywhere in frame. Never create a title card or end card. Preserve text or artwork only when it is already physically present in the supplied authoritative product reference image; do not invent or rewrite it.`;
}

export interface FalRenderRequest {
  modelPath: string;
  input: Record<string, unknown>;
  brief: VideoRenderBrief;
}

/** Pure provider-payload builder used by submission and regression tests. */
export function buildFalRenderRequest(script: ExpandedScript, platform: string, duration: string, renderingModelId: string, templateType?: string, providerImageUrl?: string): FalRenderRequest {
  const supportsImage = modelSupportsImageConditioning(renderingModelId);
  const usableImage = supportsImage ? providerImageUrl : undefined;
  const brief = compileVideoRenderBrief(script, duration, renderingModelId);
  const prompt = buildVideoPrompt(script, platform, `${brief.renderDurationSeconds}s`, templateType, brief);
  const input: Record<string, unknown> = { prompt, ...buildModelParams(getModelKey(renderingModelId), parseDurationSeconds(duration)) };
  if (usableImage) input.image_url = usableImage;
  return { modelPath: getModelId(renderingModelId, Boolean(usableImage)), input, brief };
}

function getModelId(renderingModelId: string, hasImage = false): string {
  if (renderingModelId === 'ltx-fast') return hasImage ? FAL_MODEL_IDS['ltx-fast-img'] : FAL_MODEL_IDS['ltx-fast'];
  if (renderingModelId === 'ltx') return FAL_MODEL_IDS.ltx;
  if (renderingModelId === 'wan') return hasImage ? FAL_MODEL_IDS['wan-img'] : FAL_MODEL_IDS.wan;
  if (renderingModelId === 'kling' || renderingModelId === 'kling-1.6') return hasImage ? FAL_MODEL_IDS['kling-img'] : FAL_MODEL_IDS.kling;
  if (renderingModelId === 'veo3') return FAL_MODEL_IDS.veo3;
  return FAL_MODEL_IDS.ovi;
}

function getModelKey(renderingModelId: string): string {
  if (renderingModelId === 'ltx-fast') return 'ltx-fast';
  if (renderingModelId === 'ltx') return 'ltx';
  if (renderingModelId === 'wan') return 'wan';
  if (renderingModelId === 'kling' || renderingModelId === 'kling-1.6') return 'kling';
  if (renderingModelId === 'veo3') return 'veo3';
  return 'ovi';
}

// Returns a publicly reachable base URL for this server (used for fal.ai webhooks)
function getPublicBaseUrl(): string {
  // REPLIT_DOMAINS is comma-separated list of deployed domains
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) {
    const first = domains.split(',')[0]?.trim();
    if (first) return `https://${first}`;
  }
  // Fall back to the dev preview domain
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain) return `https://${devDomain}`;
  return '';
}

export function buildFalWebhookUrl(): string {
  const base = getPublicBaseUrl();
  return base ? `${base}/api/webhooks/fal` : '';
}

// Upload image bytes (as Buffer + mimeType) to fal.ai CDN storage.
// Returns a fal.ai CDN URL suitable for use as image_url in model requests.
async function uploadBytesToFal(buffer: Buffer, mimeType: string, falKey: string): Promise<string> {
  const ext = mimeType.split('/')[1]?.replace(/[^a-z0-9]/g, '') ?? 'jpg';
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  formData.append('file', blob, `product-image.${ext}`);

  const uploadRes = await fetch('https://storage.fal.run', {
    method: 'POST',
    headers: { 'Authorization': `Key ${falKey}` },
    body: formData,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    console.error('[fal-video] Image upload error:', err);
    throw new Error(`fal.ai image upload failed: ${uploadRes.status}`);
  }

  const uploadData = await uploadRes.json() as { url: string };
  console.log('[fal-video] Image uploaded to fal.ai CDN');
  return uploadData.url;
}

// Upload a product image to fal.ai CDN storage.
// Accepts: https URLs, base64 data URLs, or internal GCS object paths (/objects/... or /api/storage/objects/...).
// Returns a fal.ai CDN URL suitable for use as image_url in model requests.
async function uploadImageToFal(imageInput: string, falKey: string): Promise<string> {
  // If it's already a public https URL, return as-is (fal.ai can fetch it directly)
  if (imageInput.startsWith('http://') || imageInput.startsWith('https://')) {
    return imageInput;
  }

  // Internal GCS object path — generate a signed URL so fal.ai can fetch it directly.
  // We used to stream bytes and re-upload to storage.fal.run, but that hostname is
  // unreachable from Replit's production environment (ENOTFOUND). Generating a signed
  // URL only calls the local sidecar (127.0.0.1:1106) — no outbound DNS required.
  // Paths look like: /objects/uploads/uuid  OR  /api/storage/objects/uploads/uuid
  if (imageInput.startsWith('/objects/') || imageInput.startsWith('/api/storage/objects/')) {
    const { ObjectStorageService } = await import('./objectStorage');
    const svc = new ObjectStorageService();
    // Normalise to the /objects/... form that getSignedObjectEntityUrl expects
    const objectPath = imageInput.startsWith('/api/storage')
      ? imageInput.slice('/api/storage'.length)
      : imageInput;
    // 3-hour TTL — enough for fal.ai to fetch it during any queued render
    const signedUrl = await svc.getSignedObjectEntityUrl(objectPath, 10800);
    console.log(`[fal-video] Using signed GCS URL for product image (fal.ai will fetch directly)`);
    return signedUrl;
  }

  // base64 data URL
  const match = imageInput.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid image format — expected https URL, GCS object path, or data URL');
  const [, mimeType, base64Data] = match;
  const buffer = Buffer.from(base64Data as string, 'base64');
  return uploadBytesToFal(buffer, mimeType as string, falKey);
}

// Submit to fal.ai queue — returns `fal:<modelPath>:<requestId>`
export async function submitFalVideoRender(
  script: ExpandedScript,
  platform: string,
  duration: string,
  renderingModelId: string = 'quae-v1',
  templateType?: string,
  imageUrl?: string | null,
  webhookUrl?: string
): Promise<string> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) throw new Error('FAL_KEY not configured');

  // Upload image to fal.ai CDN if provided.
  // We intentionally do NOT silently swallow failures — if the caller supplied an image
  // and it can't be ingested, throw so the project gets marked failed (and credits refunded)
  // rather than silently rendering a text-only video when the user expected image conditioning.
  let falImageUrl: string | undefined;
  if (imageUrl && modelSupportsImageConditioning(renderingModelId)) {
    falImageUrl = await uploadImageToFal(imageUrl, falKey);
  }

  const hasImage = !!falImageUrl;
  const { modelPath, input, brief } = buildFalRenderRequest(script, platform, duration, renderingModelId, templateType, falImageUrl);

  console.log(`[fal-video] renderingModelId="${renderingModelId}" → fal="${modelPath}" | hasImage=${hasImage} | template=${templateType ?? 'generic'} | duration=${duration}`);

  // Use the official @fal-ai/client — no manual URL construction, no custom auth headers.
  fal.config({ credentials: falKey });

  const enqueued = await (fal.queue as any).submit(modelPath, { input });
  const requestId: string = enqueued.request_id;

  // Token: "fal:<modelPath>:<requestId>"
  // modelPath uses '/' separators — no colons — so split(':') works unambiguously.
  const token = `fal:${modelPath}:${requestId}`;
  console.log(`[fal-video] Submitted | modelPath="${modelPath}" | requestId="${requestId}"`);
  return token;
}

// Parse token → { modelPath, requestId }
// Supports:
//   current: "fal:<modelPath>:<requestId>"  (modelPath has no colons — uses '/')
//   legacy:  "fal2:<requestId>|||<statusUrl>|||<responseUrl>"

function parseToken(
  token: string,
): { modelPath: string; requestId: string } | null {
  if (!token.startsWith("fal:")) {
    return null;
  }

  const rest = token.substring(4);
  const lastColon = rest.lastIndexOf(":");

  if (lastColon === -1) {
    return null;
  }

  return {
    modelPath: rest.substring(0, lastColon),
    requestId: rest.substring(lastColon + 1),
  };
}




// Poll fal.ai for render status — called on every GET /projects/:id
export async function pollFalVideoRender(
  token: string
): Promise<{ status: 'processing' | 'done' | 'failed'; url?: string }> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) return { status: 'failed' };

  const parsed = parseToken(token);
  if (!parsed) {
    console.error('[fal-video] Unrecognised token format — marking failed');
    return { status: 'failed' };
  }
  const { modelPath, requestId } = parsed;

  // Use the official @fal-ai/client for all status and result calls.
  fal.config({ credentials: falKey });

  // ── Status check ──────────────────────────────────────────────────────────
  let pollStatus: string;
  try {
    const statusRes = await (fal.queue as any).status(modelPath, { requestId, logs: true });
    pollStatus = statusRes?.status ?? 'UNKNOWN';
  } catch (err: any) {
    const httpStatus = err?.status ?? 0;
    const body = err?.body ?? err?.message ?? String(err);
    // 404/405 = job no longer exists on fal.ai (expired or never queued)
    if (httpStatus === 404 || httpStatus === 405) {
      console.error(`[fal-video] Poll ${httpStatus} — job gone, marking failed. body: ${body}`);
      return { status: 'failed' };
    }
    console.error(`[fal-video] Poll error http=${httpStatus}:`, body);
    return { status: 'processing' };
  }

  console.log(`[fal-video] modelPath="${modelPath}" | requestId="${requestId}" | status="${pollStatus}"`);

  if (pollStatus === 'FAILED') return { status: 'failed' };
  if (pollStatus !== 'COMPLETED') return { status: 'processing' };

  // ── COMPLETED — fetch result ───────────────────────────────────────────────
  let raw: any;
  try {
    raw = await (fal.queue as any).result(modelPath, { requestId });
  } catch (err: any) {
    const body = err?.body ?? err?.message ?? String(err);
    console.error(`[fal-video] Result fetch error:`, body);
    return { status: 'processing' };
  }

  // result shape: { data: { video: { url } } } or flat { video: { url } }
  const out: any = raw?.data ?? raw;
  const url: string | null =
    out?.video?.url     ??
    out?.video_url      ??
    out?.url            ??
    out?.videos?.[0]?.url ??
    out?.video          ??
    raw?.video?.url     ??
    raw?.video_url      ??
    null;

  if (url && typeof url === 'string') {
    console.log(`[fal-video] Done — video_url="${url}"`);
    return { status: 'done', url };
  }

  console.error('[fal-video] COMPLETED but no video URL. raw keys:', Object.keys(raw ?? {}));
  console.error('[fal-video] raw:', JSON.stringify(raw).slice(0, 500));
  return { status: 'failed' };
}

export function isFalToken(value: string | null): boolean {
  return typeof value === "string" && value.startsWith("fal:");
}
/**
 * Extract the fal.ai request_id from a stored token.
 * current: "fal:<modelPath>:<requestId>"
 * legacy:  "fal2:<requestId>|||<statusUrl>|||<responseUrl>"
 */
export function extractFalRequestId(token: string): string | null {
  return parseToken(token)?.requestId ?? null;
}

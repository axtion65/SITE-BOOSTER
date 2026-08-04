// fal.ai video generation
// Ovi: $0.20/video flat (video + native audio)
// Wan 2.5: $0.05/sec
// Kling 2.5: $0.07/sec (premium)

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
  'ovi':         'fal-ai/ovi',
  'wan':         'fal-ai/wan/v2.2/text-to-video',
  'wan-img':     'fal-ai/wan/v2.2/image-to-video',
  'kling':       'fal-ai/kling-video/v2.5/standard/text-to-video',
  'kling-img':   'fal-ai/kling-video/v2.5/standard/image-to-video',
  'veo3':        'fal-ai/veo3',
};

// Credits charged per model (1 credit = $0.01)
// LTX costs ~$0.015/clip → 15 credits = $0.15 → ~10x margin
// Ovi costs $0.20/clip flat → 30 credits = $0.30 → 1.5x margin
export const MODEL_CREDIT_COSTS: Record<string, number> = {
  'ltx':       15,
  'quae-v1':   30,
  'ovi':       30,
  'wan':      200,
  'kling':    300,
  'kling-1.6': 300,
  'veo3':    1500,
};

// Plan credit allocations
export const PLAN_CREDITS: Record<string, number> = {
  'free':    90,
  'starter': 600,
  'pro':     2000,
  'agency':  6000,
};

// Estimated render time in seconds — shown in the waiting UI
export const MODEL_RENDER_ESTIMATE: Record<string, number> = {
  'ltx':    60,  // ~1 min (very fast)
  'ovi':   120,  // ~2 min
  'wan':   180,  // ~3 min
  'kling': 240,  // ~4 min
  'veo3':  480,  // ~8 min
};

// What each model actually outputs (max clip duration the API will honour)
// These are hard model limits — duration in prompt text is ignored by the AI video models
const MODEL_MAX_SECONDS: Record<string, number> = {
  'ltx':   5,    // LTX: 121 frames @ 24fps ≈ 5s
  'ovi':   10,
  'wan':   10,   // ~81-129 frames @ ~13fps
  'kling': 10,   // "5" or "10" string param
  'veo3':  8,    // Google Veo3 default output
};

// Parse "15s" → 15, "1m" → 60
function parseDurationSeconds(d: string): number {
  const s = d.toLowerCase().trim();
  if (s.endsWith('m')) return parseInt(s) * 60;
  if (s.endsWith('s')) return parseInt(s);
  return parseInt(s) || 10;
}

// Build model-specific body params beyond `prompt`
function buildModelParams(modelKey: string, durationSec: number): Record<string, unknown> {
  const capped = Math.min(durationSec, MODEL_MAX_SECONDS[modelKey] ?? 10);

  switch (modelKey) {
    case 'ltx':
      // LTX Video: 24fps, 121 frames ≈ 5 seconds (model default)
      return {
        num_frames: 121,
        negative_prompt: 'low quality, blurry, watermark, text overlay, distorted faces',
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
    "Vertical 9:16. Rapid cuts every 2-3 seconds. Bold text overlays in TikTok style. First frame is a pattern interrupt — something unexpected or shocking. High energy throughout. Trending audio feel.",

  "ugc-review":
    "Vertical 9:16. Handheld camera feel — slight shake, natural movement. Talking-to-camera framing. Natural home or outdoor lighting. Authentic, unpolished aesthetic. No product on white background. Real-life context throughout.",

  "before-after":
    "Vertical 9:16. Stark visual contrast between first half and second half. Before: muted colors, low energy environment. After: bright, warm, high energy. Consider split-screen or hard cut at midpoint. Transformation is VISUAL, not just narrated.",

  "product-demo":
    "Widescreen 16:9 or vertical 9:16. Close-up hands-on product shots. Multiple angles — overhead, close macro, side profile. Show the product in actual use, not just display. Clean but not sterile. Professional lighting.",

  "product-unboxing":
    "Close-up macro shots of packaging details. Camera starts on the shipping box, reveals inner packaging, then product. Slow deliberate movements at key moments (first reveal), faster during secondary reveals. ASMR-adjacent — show texture, weight, material quality visually.",

  "flash-sale":
    "High contrast, high saturation. Red and bold colors suggest urgency. Big bold text for price/discount. Fast paced. Clock or countdown visual element if possible. Every frame communicates: LIMITED TIME.",

  "amazon-listing":
    "Clean, professional. White or neutral background for product shots. 360-degree product rotation implied. Scale reference shots (hand holding, next to common object). Multiple hero angles. Well-lit, color-accurate product representation.",

  "brand-story":
    "Cinematic 16:9. Warm, human-centered. Faces matter — authentic expressions, not model poses. Origin moment should feel intimate, like found footage or home video. Builds to sweeping, hopeful visual as mission is stated.",

  "testimonial-compilation":
    "Vertical 9:16. Quick cuts between different people in different settings — visual variety is key. Each face is centered, talking directly to camera. Text quote overlays on each clip. Builds to a montage crescendo of overlapping voices/faces.",

  "shopify-promo":
    "Lifestyle aesthetic. Product shown in aspirational real-world settings — kitchen, bedroom, outdoor. Golden hour lighting preferred. Model interaction with product (not just display). Strong closing product hero shot with price/offer overlay.",

  "tutorial":
    "Step-by-step clarity. Overhead or close-up angles for technique shots. Hands prominently featured. Step number text overlays on each new step. Before/during/after of each step shown. Clean, well-lit, distraction-free.",

  "instagram-reel":
    "Aesthetic-first. Every frame is Instagram-worthy on its own. Specific color grade direction matters. Mix of lifestyle shots, product close-ups, and one hero moment. Trending Reel format pacing — quick but deliberate.",
};

function buildVideoPrompt(script: ExpandedScript, platform: string, duration: string, templateType?: string): string {
  const isVertical = platform === 'tiktok' || platform === 'instagram';
  const baseFormat = isVertical
    ? 'vertical 9:16 format, mobile-first, designed for social media feeds'
    : 'widescreen 16:9, cinematic, professional production quality';

  // Pull template-specific visual direction if available
  const templateDirection = templateType
    ? (TEMPLATE_VIDEO_DIRECTION[templateType] ?? '')
    : '';

  // Build scene breakdown
  const sceneLines = script.scenes.slice(0, 6).map((s, i) =>
    `Scene ${i + 1} (${s.duration}): ${s.description}. Camera/visuals: ${s.visualDirection}.`
  ).join(' ');

  const parts: string[] = [
    // Template-specific direction takes priority
    templateDirection ? `Video format directive: ${templateDirection}` : '',

    // Opening hook — most important for AI to prioritize
    script.hook ? `Opening hook (first 2-3 seconds): ${script.hook}.` : '',

    // Scene breakdown
    sceneLines ? `Scene breakdown: ${sceneLines}` : '',

    // Voiceover narrative arc
    script.voiceoverText ? `Voiceover/narration: "${script.voiceoverText.slice(0, 400)}"` : '',

    // CTA
    script.callToAction ? `Closing CTA: ${script.callToAction}.` : '',

    // Base format if no template direction
    !templateDirection
      ? `Style: professional product advertisement, ${baseFormat}, high production value, ${duration} duration.`
      : `Format: ${baseFormat}. Duration: ${duration}.`,

    // Music
    script.suggestedMusic ? `Music/mood: ${script.suggestedMusic}.` : '',
  ];

  return parts.filter(Boolean).join(' ');
}

function getModelId(renderingModelId: string, hasImage = false): string {
  if (renderingModelId === 'ltx') return FAL_MODEL_IDS.ltx;
  if (renderingModelId === 'wan') return hasImage ? FAL_MODEL_IDS['wan-img'] : FAL_MODEL_IDS.wan;
  if (renderingModelId === 'kling' || renderingModelId === 'kling-1.6') return hasImage ? FAL_MODEL_IDS['kling-img'] : FAL_MODEL_IDS.kling;
  if (renderingModelId === 'veo3') return FAL_MODEL_IDS.veo3;
  return FAL_MODEL_IDS.ovi;
}

function getModelKey(renderingModelId: string): string {
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
  if (imageUrl) {
    falImageUrl = await uploadImageToFal(imageUrl, falKey);
  }

  const hasImage = !!falImageUrl;
  const modelPath = getModelId(renderingModelId, hasImage);
  const modelKey  = getModelKey(renderingModelId);
  const durationSec = parseDurationSeconds(duration);
  const prompt = buildVideoPrompt(script, platform, duration, templateType);
  const modelParams = buildModelParams(modelKey, durationSec);

  console.log(`[fal-video] Submitting ${modelPath} | template: ${templateType ?? 'generic'} | duration: ${duration} | image: ${hasImage} → model params:`, modelParams);

  // image_url is the param name for both wan and kling image-to-video endpoints
  const body: Record<string, unknown> = { prompt, ...modelParams };
  if (falImageUrl) body.image_url = falImageUrl;
  if (webhookUrl) body.webhook_url = webhookUrl;

  const res = await fetch(`https://queue.fal.run/${modelPath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[fal-video] Submit error ${res.status}:`, err);
    throw new Error(`fal.ai submit failed: ${res.status}`);
  }

  const data = await res.json() as { request_id: string };
  const token = `fal:${modelPath}:${data.request_id}`;
  console.log(`[fal-video] Submitted, token: ${token}`);
  return token;
}

// Poll fal.ai for render status — called on every GET /projects/:id
export async function pollFalVideoRender(
  token: string
): Promise<{ status: 'processing' | 'done' | 'failed'; url?: string }> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) return { status: 'failed' };

  // token = "fal:<modelPath>:<requestId>"
  const parts = token.slice('fal:'.length).split(':');
  const requestId = parts[parts.length - 1];
  const modelPath = parts.slice(0, -1).join(':');

  const statusRes = await fetch(
    `https://queue.fal.run/${modelPath}/requests/${requestId}/status?logs=0`,
    { headers: { 'Authorization': `Key ${falKey}` } }
  );

  if (!statusRes.ok) {
    const body = await statusRes.text().catch(() => '(unreadable)');
    // 404/405 = job no longer exists on fal.ai (expired or never queued) → treat as failed
    // NOTE: if this fires within 15s of submission it is a race condition —
    // the 15s hold-off in projects.ts should prevent us from ever reaching here that early.
    if (statusRes.status === 404 || statusRes.status === 405) {
      console.error(`[fal-video] Poll ${statusRes.status} — job gone on fal.ai, marking failed. Body: ${body}`);
      return { status: 'failed' };
    }
    console.error(`[fal-video] Poll error ${statusRes.status}. Body: ${body}`);
    return { status: 'processing' };
  }

  const statusData = await statusRes.json() as { status: string };
  console.log(`[fal-video] Poll status: ${statusData.status}`);

  if (statusData.status === 'FAILED') return { status: 'failed' };
  if (statusData.status !== 'COMPLETED') return { status: 'processing' };

  // COMPLETED — fetch result
  const resultRes = await fetch(
    `https://queue.fal.run/${modelPath}/requests/${requestId}`,
    { headers: { 'Authorization': `Key ${falKey}` } }
  );

  if (!resultRes.ok) {
    console.error(`[fal-video] Result fetch error ${resultRes.status}`);
    return { status: 'processing' };
  }

  const result = await resultRes.json() as any;
  const output = result?.output ?? result;
  const url =
    output?.video?.url ??
    output?.video_url ??
    output?.url ??
    output?.videos?.[0]?.url ??
    output?.video ??
    result?.video?.url ??
    result?.video_url ??
    null;

  if (url && typeof url === 'string') {
    console.log(`[fal-video] Got video URL`);
    return { status: 'done', url };
  }

  console.error('[fal-video] COMPLETED but no URL. result keys:', Object.keys(result ?? {}));
  console.error('[fal-video] Full result:', JSON.stringify(result).slice(0, 500));
  return { status: 'failed' };
}

export function isFalToken(value: string | null): boolean {
  return typeof value === 'string' && value.startsWith('fal:');
}

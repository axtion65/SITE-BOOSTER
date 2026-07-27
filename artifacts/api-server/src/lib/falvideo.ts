// fal.ai video generation — replaces Shotstack entirely
// Ovi: $0.20/video flat (video + native audio)
// Wan 2.5: $0.05/sec (higher quality, ~10s clip)
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
  'ovi':   'fal-ai/ovi',
  'wan':   'fal-ai/wan/v2.2/text-to-video',
  'kling': 'fal-ai/kling-video/v2.5/standard/text-to-video',
  'veo3':  'fal-ai/veo3',
};

// Credits charged per model (1 credit = $0.01)
export const MODEL_CREDIT_COSTS: Record<string, number> = {
  'quae-v1':  30,  // Ovi default
  'ovi':      30,
  'wan':      200,
  'kling':    300,
  'kling-1.6': 300, // legacy alias stored in older projects
  'veo3':     1500,
};

// Plan credit allocations
export const PLAN_CREDITS: Record<string, number> = {
  'free':    90,
  'starter': 600,
  'pro':     2000,
  'agency':  6000,
};

function buildVideoPrompt(script: ExpandedScript, platform: string, duration: string): string {
  const isVertical = platform === 'tiktok' || platform === 'instagram';
  const format = isVertical
    ? 'vertical 9:16 format, fast-paced, mobile-first social media style'
    : 'widescreen 16:9, cinematic, professional production';

  // Build a rich scene breakdown so the model understands what should appear when
  const sceneLines = script.scenes.slice(0, 6).map((s, i) =>
    `Scene ${i + 1} (${s.duration}): ${s.description}. Visuals: ${s.visualDirection}.`
  ).join(' ');

  const parts: string[] = [
    // Opening hook — what grabs attention first
    script.hook ? `Opening hook: ${script.hook}.` : '',

    // Full scene breakdown
    sceneLines ? `Scene breakdown: ${sceneLines}` : '',

    // Voiceover narration — gives the model the narrative arc
    script.voiceoverText ? `Narration/voiceover theme: "${script.voiceoverText.slice(0, 300)}"` : '',

    // CTA
    script.callToAction ? `Closing call to action: ${script.callToAction}.` : '',

    // Style direction
    `Style: professional product advertisement, ${format}, high production value, sharp visuals, ${duration} total duration.`,

    // Music mood
    script.suggestedMusic ? `Mood/music: ${script.suggestedMusic}.` : '',
  ];

  return parts.filter(Boolean).join(' ');
}

function getModelId(renderingModelId: string): string {
  // Map renderingModelId from projects to fal model
  // Also handle legacy IDs (e.g. "kling-1.6" stored in DB before model rename)
  if (renderingModelId === 'wan') return FAL_MODEL_IDS.wan;
  if (renderingModelId === 'kling' || renderingModelId === 'kling-1.6') return FAL_MODEL_IDS.kling;
  if (renderingModelId === 'veo3') return FAL_MODEL_IDS.veo3;
  return FAL_MODEL_IDS.ovi; // default
}

// Submit to fal.ai queue — returns `fal:<modelId>:<requestId>`
export async function submitFalVideoRender(
  script: ExpandedScript,
  platform: string,
  duration: string,
  renderingModelId: string = 'quae-v1'
): Promise<string> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) throw new Error('FAL_KEY not configured');

  const modelPath = getModelId(renderingModelId);
  const prompt = buildVideoPrompt(script, platform, duration);

  console.log(`[fal-video] Submitting ${modelPath} render`);

  const res = await fetch(`https://queue.fal.run/${modelPath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt }),
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
  // modelPath may contain colons (e.g. fal-ai/kling-video/v2.5/...)
  // requestId is the last segment (UUID)
  const requestId = parts[parts.length - 1];
  const modelPath = parts.slice(0, -1).join(':');

  // Step 1: check status
  const statusRes = await fetch(
    `https://queue.fal.run/${modelPath}/requests/${requestId}/status?logs=0`,
    { headers: { 'Authorization': `Key ${falKey}` } }
  );

  if (!statusRes.ok) {
    console.error(`[fal-video] Poll error ${statusRes.status}`);
    return { status: 'processing' };
  }

  const statusData = await statusRes.json() as { status: string };
  console.log(`[fal-video] Poll status: ${statusData.status}`);

  if (statusData.status === 'FAILED') return { status: 'failed' };

  if (statusData.status !== 'COMPLETED') return { status: 'processing' };

  // Step 2: status is COMPLETED — fetch the actual result from the result endpoint.
  // The status endpoint does NOT include output; the result endpoint does.
  const resultRes = await fetch(
    `https://queue.fal.run/${modelPath}/requests/${requestId}`,
    { headers: { 'Authorization': `Key ${falKey}` } }
  );

  if (!resultRes.ok) {
    console.error(`[fal-video] Result fetch error ${resultRes.status}`);
    // Don't treat this as a permanent failure — result endpoint may be briefly unavailable
    return { status: 'processing' };
  }

  const result = await resultRes.json() as any;

  // fal.ai models return video URL in different shapes — try all known formats
  const output = result?.output ?? result;
  const url =
    output?.video?.url ??       // { output: { video: { url } } }
    output?.video_url ??        // { output: { video_url } }
    output?.url ??              // { output: { url } }
    output?.videos?.[0]?.url ?? // { output: { videos: [{ url }] } }
    output?.video ??            // { output: { video: "url" } }  (string)
    result?.video?.url ??       // top-level { video: { url } }
    result?.video_url ??        // top-level { video_url }
    null;

  if (url && typeof url === 'string') {
    console.log(`[fal-video] Got video URL from result endpoint`);
    return { status: 'done', url };
  }

  console.error('[fal-video] COMPLETED but no URL found. result keys:', Object.keys(result ?? {}), 'output keys:', Object.keys(output ?? {}));
  // Log the full result to diagnose unknown response shapes
  console.error('[fal-video] Full result:', JSON.stringify(result).slice(0, 500));
  return { status: 'failed' };
}

export function isFalToken(value: string | null): boolean {
  return typeof value === 'string' && value.startsWith('fal:');
}

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
  const sceneParts = script.scenes.slice(0, 4).map(s => s.visualDirection).join('. ');
  const format = platform === 'tiktok' || platform === 'instagram'
    ? 'vertical format, fast-paced, social media style'
    : 'widescreen, cinematic, professional';

  return [
    script.hook,
    sceneParts,
    `Call to action: ${script.callToAction}`,
    `Professional product advertisement. ${format}. High production value. ${duration} duration.`,
  ].filter(Boolean).join('. ');
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

  const res = await fetch(
    `https://queue.fal.run/${modelPath}/requests/${requestId}/status?logs=0`,
    {
      headers: { 'Authorization': `Key ${falKey}` },
    }
  );

  if (!res.ok) {
    console.error(`[fal-video] Poll error ${res.status}`);
    return { status: 'processing' };
  }

  const data = await res.json() as {
    status: string;
    output?: { video?: { url: string }; url?: string };
  };

  console.log(`[fal-video] Poll status: ${data.status}`);

  if (data.status === 'COMPLETED') {
    // fal.ai models return video URL in different shapes — try all known formats
    const output = (data as any).output;
    const url =
      output?.video?.url ??       // { output: { video: { url } } }
      output?.video_url ??        // { output: { video_url } }
      output?.url ??              // { output: { url } }
      output?.videos?.[0]?.url ?? // { output: { videos: [{ url }] } }
      output?.video ??            // { output: { video: "url" } }  (string)
      null;
    if (url && typeof url === 'string') return { status: 'done', url };
    console.error('[fal-video] COMPLETED but no URL found. output keys:', Object.keys(output ?? {}));
    return { status: 'failed' };
  }

  if (data.status === 'FAILED') return { status: 'failed' };

  return { status: 'processing' };
}

export function isFalToken(value: string | null): boolean {
  return typeof value === 'string' && value.startsWith('fal:');
}

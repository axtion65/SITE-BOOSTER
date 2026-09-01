/**
 * Text-to-speech via OpenAI TTS API.
 * Uses the standard OPENAI_API_KEY in production. A complete pair of legacy
 * Replit AI Integrations variables remains supported for older environments.
 *
 * Returns null (instead of throwing) on failure so each caller can apply its
 * own legacy fallback or production failure policy.
 */

const VALID_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
type TtsVoice = typeof VALID_VOICES[number];

const OPENAI_API_BASE_URL = "https://api.openai.com/v1";

function resolveOpenAiConfig(): { apiKey: string; baseUrl: string } | null {
  const legacyApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim();
  const legacyBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim();

  if (legacyApiKey && legacyBaseUrl) {
    return {
      apiKey: legacyApiKey,
      baseUrl: legacyBaseUrl.replace(/\/+$/, ""),
    };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  return {
    apiKey,
    baseUrl: (process.env.OPENAI_BASE_URL?.trim() || OPENAI_API_BASE_URL).replace(/\/+$/, ""),
  };
}

function resolveVoice(voice: string | null | undefined): TtsVoice {
  if (voice && (VALID_VOICES as readonly string[]).includes(voice)) {
    return voice as TtsVoice;
  }
  return "alloy";
}

export async function generateSpeechBuffer(text: string, voice?: string | null): Promise<Buffer | null> {
  const openai = resolveOpenAiConfig();

  if (!openai) {
    console.warn('[tts] OPENAI_API_KEY is not set — skipping TTS narration');
    return null;
  }

  // Trim and cap to avoid overly long narration relative to the short video clips
  const input = text.trim().slice(0, 1000);
  if (!input) return null;

  try {
    const res = await fetch(`${openai.baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openai.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input,
        voice: resolveVoice(voice),
        response_format: 'mp3',
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[tts] TTS API error ${res.status}:`, err.slice(0, 300));
      return null;
    }

    const audio = await res.arrayBuffer();
    const buffer = Buffer.from(audio);
    console.log(`[tts] Generated speech: ${buffer.length} bytes for ${input.length} chars`);
    return buffer;
  } catch (err) {
    console.error('[tts] TTS request failed:', err);
    return null;
  }
}

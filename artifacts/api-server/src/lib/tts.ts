/**
 * Text-to-speech via OpenAI TTS API.
 * Uses the AI_INTEGRATIONS_OPENAI_BASE_URL / AI_INTEGRATIONS_OPENAI_API_KEY
 * env vars (Replit AI Integrations proxy).
 *
 * Returns null (instead of throwing) on any failure so callers can
 * fall back to delivering the video without audio rather than surfacing errors.
 */

export async function generateSpeechBuffer(text: string): Promise<Buffer | null> {
  const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const openaiBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

  if (!openaiKey || !openaiBase) {
    console.warn('[tts] AI_INTEGRATIONS_OPENAI env vars not set — skipping TTS narration');
    return null;
  }

  // Trim and cap to avoid overly long narration relative to the short video clips
  const input = text.trim().slice(0, 1000);
  if (!input) return null;

  try {
    const res = await fetch(`${openaiBase}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input,
        voice: 'alloy',
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

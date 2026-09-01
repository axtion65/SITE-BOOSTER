import assert from "node:assert/strict";
import test from "node:test";

import { generateSpeechBuffer } from "./tts.js";

const ENV_NAMES = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "AI_INTEGRATIONS_OPENAI_API_KEY",
  "AI_INTEGRATIONS_OPENAI_BASE_URL",
] as const;

function restoreEnvironment(snapshot: Record<string, string | undefined>) {
  for (const name of ENV_NAMES) {
    const value = snapshot[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

test("uses Railway's standard OpenAI key with the official speech endpoint", async () => {
  const environment = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;

  process.env.OPENAI_API_KEY = "railway-openai-key";
  delete process.env.OPENAI_BASE_URL;
  delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.openai.com/v1/audio/speech");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer railway-openai-key");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      model: "tts-1",
      input: "A complete thirty-second business advert.",
      voice: "alloy",
      response_format: "mp3",
    });
    return new Response(new Uint8Array([0x49, 0x44, 0x33]), { status: 200 });
  };

  try {
    const audio = await generateSpeechBuffer("A complete thirty-second business advert.");
    assert.deepEqual(audio, Buffer.from([0x49, 0x44, 0x33]));
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});

test("keeps a complete legacy Replit proxy configuration backward compatible", async () => {
  const environment = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;

  process.env.OPENAI_API_KEY = "standard-key";
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "legacy-key";
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://legacy.example.test/v1/";

  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://legacy.example.test/v1/audio/speech");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer legacy-key");
    return new Response(new Uint8Array([0x49, 0x44, 0x33]), { status: 200 });
  };

  try {
    const audio = await generateSpeechBuffer("Legacy narration");
    assert.ok(audio);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});

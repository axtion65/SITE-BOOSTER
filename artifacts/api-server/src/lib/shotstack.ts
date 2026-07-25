/**
 * Shotstack video render helper.
 *
 * Visual priority (per scene):
 *   1. AI-generated image via gpt-image-1 (OpenAI) — hosted on tmpfiles.org
 *   2. Pexels HD photo — searched by visual direction keywords
 *   3. Animated gradient HTML — always works, no external deps
 *
 * Layers (Shotstack tracks):
 *   Track 0 (top)    — HTML text overlay (transparent bg, dark vignette)
 *   Track 1 (bottom) — Image / video background
 *
 * Audio:
 *   Shotstack soundtrack (royalty-free, selected by platform)
 */

const SHOTSTACK_BASE =
  process.env.SHOTSTACK_ENV === "production"
    ? "https://api.shotstack.io/edit/v1"
    : "https://api.shotstack.io/edit/stage";

function shotstackKey(): string {
  const key = process.env.SHOTSTACK_API_KEY;
  if (!key) throw new Error("SHOTSTACK_API_KEY env var is not set");
  return key;
}

// ── Script types ──────────────────────────────────────────────────────────────

export interface ExpandedScript {
  hook?: string;
  callToAction?: string;
  scenes?: Array<{
    sceneNumber: number;
    description: string;
    duration: string;
    visualDirection: string;
  }>;
  voiceoverText?: string;
  suggestedMusic?: string;
}

function parseDuration(s: string | undefined | null): number {
  if (!s) return 5;
  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
  return isNaN(n) ? 5 : n;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Music selection ───────────────────────────────────────────────────────────

// FreePD public-domain tracks hosted by Shotstack (used in their own docs/tutorials)
const MUSIC = {
  energetic: "https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/freepd/audio/Kickback.mp3",
  upbeat:    "https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/freepd/audio/Carefree.mp3",
  corporate: "https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/freepd/audio/BossaBossa.mp3",
};

function pickMusic(platform: string): string {
  const p = (platform ?? "").toLowerCase();
  if (["tiktok", "reels"].includes(p)) return MUSIC.energetic;
  if (p === "instagram") return MUSIC.upbeat;
  return MUSIC.corporate;
}

// ── Stop words for keyword extraction ────────────────────────────────────────

const STOPS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with",
  "by","from","is","are","was","were","be","been","being","have","has",
  "had","do","does","did","will","would","could","should","may","might",
  "can","this","that","these","those","left","right","show","shows",
  "side","using","used","use","into","onto","shot","camera","sound",
  "design","quick","slow","fast","bold","text","screen","cuts","cut",
]);

function keywords(text: string, n = 4): string {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPS.has(w))
    .slice(0, n)
    .join(" ");
}

// ── AI image generation (OpenAI gpt-image-1) ─────────────────────────────────

async function generateAIImage(prompt: string, portrait: boolean): Promise<string | null> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey || !baseUrl) return null;

  const size = portrait ? "1024x1536" : "1536x1024";

  try {
    const res = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: `Cinematic photorealistic background for a video advertisement. No text, no overlaid words, no logos. Atmospheric, professional, high contrast. ${prompt}`,
        size,
        n: 1,
        output_format: "jpeg",
        quality: "medium",
      }),
    });

    if (!res.ok) {
      console.error("[ai-image] OpenAI error:", res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as { data?: Array<{ url?: string; b64_json?: string }> };

    // Some proxy configs return a direct URL — use immediately
    if (data.data?.[0]?.url) return data.data[0].url;

    // Otherwise base64 → upload to tmpfiles.org for a public URL Shotstack can fetch
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return null;

    const buf = Buffer.from(b64, "base64");
    const form = new FormData();
    form.append("file", new Blob([buf], { type: "image/jpeg" }), "ai-scene.jpg");

    const upload = await fetch("https://tmpfiles.org/api/v1/upload", {
      method: "POST",
      body: form,
    });

    if (!upload.ok) {
      console.error("[ai-image] tmpfiles upload failed:", upload.status);
      return null;
    }

    const upData = (await upload.json()) as { data?: { url?: string } };
    const url = upData.data?.url;
    if (!url) return null;

    // tmpfiles returns https://tmpfiles.org/1234/file.jpg — direct download is /dl/ path
    return url.replace("tmpfiles.org/", "tmpfiles.org/dl/");
  } catch (err) {
    console.error("[ai-image] error:", err);
    return null;
  }
}

// ── Pexels HD photo search (fallback 1) ──────────────────────────────────────

async function searchPexelsPhoto(query: string, portrait: boolean): Promise<string | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !query.trim()) return null;

  const orientation = portrait ? "portrait" : "landscape";
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=${orientation}&size=large`;

  try {
    const res = await fetch(url, { headers: { Authorization: key } });
    if (!res.ok) { console.error("[pexels] photo search failed", res.status); return null; }

    const data = (await res.json()) as {
      photos?: Array<{ src: { large2x?: string; large?: string } }>;
    };

    const photo = data.photos?.[0];
    if (!photo) return null;

    return photo.src.large2x ?? photo.src.large ?? null;
  } catch (err) {
    console.error("[pexels] error:", err);
    return null;
  }
}

// ── HTML builders ─────────────────────────────────────────────────────────────

const ACCENTS = ["#a855f7","#3b82f6","#ef4444","#22c55e","#f59e0b","#06b6d4","#ec4899"];

function hookOverlayHtml(hook: string, vpW: number, vpH: number): string {
  const fs = vpW >= 1000 ? 68 : 54;
  const words = hook.split(" ");
  const half = Math.ceil(words.length / 2);
  const l1 = esc(words.slice(0, half).join(" "));
  const l2 = esc(words.slice(half).join(" "));
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @keyframes fadeUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
    @keyframes glow{0%,100%{text-shadow:0 2px 40px rgba(168,85,247,.9)}50%{text-shadow:0 2px 80px rgba(168,85,247,1),0 0 120px rgba(168,85,247,.5)}}
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${vpW}px;height:${vpH}px;overflow:hidden;background:transparent}
    .vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,.1) 0%,rgba(0,0,0,.72) 100%)}
    .wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:${vpW>=1000?80:56}px;text-align:center}
    .l{font-family:'Arial Black',Arial,sans-serif;font-size:${fs}px;font-weight:900;line-height:1.1;color:#fff;display:block;animation:fadeUp .7s ease-out both,glow 2.5s ease-in-out 1s infinite}
    .l2{color:#e9d5ff;animation-delay:.2s,1.2s}
    .bar{width:72px;height:4px;background:linear-gradient(90deg,#7c3aed,#c084fc);margin:20px auto 0;border-radius:2px}
  </style></head><body>
    <div class="vig"></div>
    <div class="wrap"><span class="l">${l1}</span><span class="l l2">${l2}</span><div class="bar"></div></div>
  </body></html>`;
}

function sceneOverlayHtml(copy: string, idx: number, vpW: number, vpH: number): string {
  const accent = ACCENTS[idx % ACCENTS.length];
  const fs = vpW >= 1000 ? 52 : 42;
  const words = copy.toUpperCase().split(" ");
  const last = esc(words.pop() ?? "");
  const main = esc(words.join(" "));
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @keyframes slideIn{from{opacity:0;transform:translateX(-32px)}to{opacity:1;transform:translateX(0)}}
    @keyframes popIn{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${vpW}px;height:${vpH}px;overflow:hidden;background:transparent}
    .vig{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.85) 0%,rgba(0,0,0,.1) 55%,transparent 100%)}
    .wrap{position:absolute;bottom:0;left:0;right:0;padding:${vpW>=1000?"56px 72px":"40px 48px"}}
    p{font-family:'Arial Black',Arial,sans-serif;font-size:${fs}px;font-weight:900;line-height:1.15;color:#fff;animation:slideIn .5s ease-out both}
    .hl{color:${accent};text-shadow:0 0 24px ${accent}cc;animation:popIn .4s ease-out .45s both;display:inline-block}
    .bar{width:48px;height:3px;background:${accent};border-radius:2px;margin-top:14px;box-shadow:0 0 10px ${accent}}
  </style></head><body>
    <div class="vig"></div>
    <div class="wrap"><p>${main} <span class="hl">${last}</span></p><div class="bar"></div></div>
  </body></html>`;
}

function ctaOverlayHtml(cta: string, vpW: number, vpH: number): string {
  const fs = vpW >= 1000 ? 52 : 44;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @keyframes zoomIn{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}
    @keyframes shimmer{0%,100%{box-shadow:0 0 40px rgba(168,85,247,.5)}50%{box-shadow:0 0 80px rgba(168,85,247,.9)}}
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${vpW}px;height:${vpH}px;overflow:hidden;background:transparent}
    .vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,.15) 0%,rgba(0,0,0,.8) 100%)}
    .wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${vpW>=1000?36:24}px}
    .label{font-family:Arial,sans-serif;font-size:${vpW>=1000?22:18}px;font-weight:600;color:#e9d5ff;letter-spacing:4px;text-transform:uppercase;animation:zoomIn .5s ease-out both}
    .btn{background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:${vpW>=1000?18:12}px;padding:${vpW>=1000?"28px 68px":"22px 48px"};animation:zoomIn .5s ease-out .3s both,shimmer 2s ease-in-out 1s infinite}
    .btn-text{font-family:'Arial Black',Arial,sans-serif;font-size:${fs}px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:2px}
  </style></head><body>
    <div class="vig"></div>
    <div class="wrap"><span class="label">Start Today</span><div class="btn"><p class="btn-text">${esc(cta)}</p></div></div>
  </body></html>`;
}

function gradientFallbackHtml(copy: string, idx: number, vpW: number, vpH: number): string {
  const accent = ACCENTS[idx % ACCENTS.length];
  const PAIRS = [["#0d0d1a","#2d1b69"],["#0a1628","#0f2545"],["#1a0a0a","#3d0f0f"],["#0a1a0f","#0f3d1f"],["#1a120a","#3d2d0f"]];
  const [bg1, bg2] = PAIRS[idx % PAIRS.length];
  const fs = vpW >= 1000 ? 52 : 42;
  const words = copy.toUpperCase().split(" ");
  const last = esc(words.pop() ?? "");
  const main = esc(words.join(" "));
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @keyframes bg{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
    @keyframes slideIn{from{opacity:0;transform:translateX(-32px)}to{opacity:1;transform:translateX(0)}}
    @keyframes popIn{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${vpW}px;height:${vpH}px;overflow:hidden;background:linear-gradient(160deg,${bg1},${bg2},${bg1});background-size:300% 300%;animation:bg 6s ease infinite;font-family:'Arial Black',Arial,sans-serif;display:flex;align-items:flex-end}
    .wrap{padding:${vpW>=1000?"56px 72px":"40px 48px"};width:100%}
    p{font-size:${fs}px;font-weight:900;line-height:1.15;color:#fff;animation:slideIn .5s ease-out both}
    .hl{color:${accent};text-shadow:0 0 24px ${accent}cc;animation:popIn .4s ease-out .45s both;display:inline-block}
    .bar{width:48px;height:3px;background:${accent};border-radius:2px;margin-top:14px}
  </style></head><body>
    <div class="wrap"><p>${main} <span class="hl">${last}</span></p><div class="bar"></div></div>
  </body></html>`;
}

function hookFallbackHtml(hook: string, vpW: number, vpH: number): string {
  const fs = vpW >= 1000 ? 68 : 54;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @keyframes bg{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${vpW}px;height:${vpH}px;overflow:hidden;background:linear-gradient(135deg,#0d0d1a,#1a0533,#2d1b69,#0d0d1a);background-size:400% 400%;animation:bg 6s ease infinite;font-family:'Arial Black',Arial,sans-serif;display:flex;align-items:center;justify-content:center;text-align:center}
    .wrap{padding:${vpW>=1000?80:56}px;animation:fadeUp .7s ease-out both}
    p{font-size:${fs}px;font-weight:900;line-height:1.1;color:#fff;text-shadow:0 0 60px rgba(168,85,247,.9)}
  </style></head><body><div class="wrap"><p>${esc(hook)}</p></div></body></html>`;
}

function ctaFallbackHtml(cta: string, vpW: number, vpH: number): string {
  const fs = vpW >= 1000 ? 52 : 44;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @keyframes bg{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
    @keyframes zoomIn{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${vpW}px;height:${vpH}px;overflow:hidden;background:linear-gradient(135deg,#1a0533,#2d1b69,#4c1d95,#1a0533);background-size:400% 400%;animation:bg 5s ease infinite;font-family:'Arial Black',Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${vpW>=1000?36:24}px}
    .label{font-size:${vpW>=1000?22:18}px;font-weight:600;color:#e9d5ff;letter-spacing:4px;text-transform:uppercase;animation:zoomIn .5s ease-out both}
    .btn{background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:${vpW>=1000?18:12}px;padding:${vpW>=1000?"28px 68px":"22px 48px"};animation:zoomIn .5s ease-out .3s both}
    .btn-text{font-size:${fs}px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:2px}
  </style></head><body>
    <span class="label">Start Today</span><div class="btn"><p class="btn-text">${esc(cta)}</p></div>
  </body></html>`;
}

function toPunchyCopy(description: string, maxWords = 9): string {
  const phrases = description.split(/[.,]/).map(s => s.trim()).filter(s => s.length > 5);
  const best = phrases[0] ?? description;
  const words = best.split(" ");
  return words.length <= maxWords ? best : words.slice(0, maxWords).join(" ");
}

// ── Resolve background image: AI → Pexels → null (→ gradient fallback) ───────

async function resolveBackground(
  aiPrompt: string,
  pexelsQuery: string,
  portrait: boolean
): Promise<{ url: string; type: "image" | "gradient-fallback" } | null> {
  // Run AI generation and Pexels search in parallel
  const [aiUrl, pexelsUrl] = await Promise.all([
    generateAIImage(aiPrompt, portrait),
    searchPexelsPhoto(pexelsQuery, portrait),
  ]);

  if (aiUrl) { console.log("[bg] using AI image"); return { url: aiUrl, type: "image" }; }
  if (pexelsUrl) { console.log("[bg] using Pexels photo"); return { url: pexelsUrl, type: "image" }; }
  console.log("[bg] falling back to gradient");
  return null;
}

// ── Timeline builder ──────────────────────────────────────────────────────────

async function buildTimeline(script: ExpandedScript, platform: string, durationStr: string) {
  const totalDuration = parseDuration(durationStr) || 30;
  const hook = script.hook ?? "Watch this.";
  const cta = script.callToAction ?? "Get Started";
  const scenes = script.scenes ?? [];

  const isPortrait = ["tiktok","instagram","reels"].includes((platform ?? "").toLowerCase());
  const vpW = isPortrait ? 720 : 1280;
  const vpH = isPortrait ? 1280 : 720;

  // Timing
  const hookLen = Math.min(3, totalDuration);
  const ctaLen = Math.min(4, Math.max(0, totalDuration - hookLen));
  const contentBudget = totalDuration - hookLen - ctaLen;

  const displayScenes = scenes.slice(0, 8);
  const rawDurations = displayScenes.map(sc => parseDuration(sc.duration));
  const rawTotal = rawDurations.reduce((a, b) => a + b, 0) || 1;
  const scaledDurations = rawDurations.map(d => Math.max(2, Math.round((d / rawTotal) * contentBudget)));

  interface SlotTiming { start: number; length: number }
  const timings: SlotTiming[] = [];
  let cursor = hookLen;
  for (let i = 0; i < displayScenes.length; i++) {
    const len = scaledDurations[i];
    if (cursor + len > totalDuration - ctaLen) break;
    timings.push({ start: cursor, length: len });
    cursor += len;
  }
  const activeScenes = displayScenes.slice(0, timings.length);

  // Resolve all backgrounds in parallel (AI + Pexels run concurrently)
  const [hookBg, ctaBg, ...sceneBgs] = await Promise.all([
    resolveBackground(
      `${hook}. High-energy, dramatic, dark moody atmosphere`,
      keywords(hook, 3),
      isPortrait
    ),
    resolveBackground(
      "Success, achievement, celebration, business growth, modern",
      "success achievement modern",
      isPortrait
    ),
    ...activeScenes.map((sc) =>
      resolveBackground(
        sc.visualDirection || sc.description,
        keywords(sc.visualDirection || sc.description, 4),
        isPortrait
      )
    ),
  ]);

  // Track builders
  type ClipAsset =
    | { type: "html"; html: string; width: number; height: number; background?: string }
    | { type: "image"; src: string };

  interface Clip {
    asset: ClipAsset;
    start: number;
    length: number;
    fit?: string;
    transition?: { in?: string; out?: string };
  }

  const overlayClips: Clip[] = [];
  const bgClips: Clip[] = [];

  function addSlide(
    start: number,
    length: number,
    overlayHtml: string,
    bg: { url: string; type: "image" | "gradient-fallback" } | null,
    fallbackHtml: string
  ) {
    const trans = { in: "fade" as const, out: "fade" as const };
    if (bg) {
      bgClips.push({ asset: { type: "image", src: bg.url }, start, length, fit: "cover", transition: trans });
      overlayClips.push({ asset: { type: "html", html: overlayHtml, width: vpW, height: vpH, background: "transparent" }, start, length, transition: trans });
    } else {
      bgClips.push({ asset: { type: "html", html: fallbackHtml, width: vpW, height: vpH, background: "#0d0d1a" }, start, length, transition: trans });
    }
  }

  // 1. Hook
  addSlide(0, hookLen, hookOverlayHtml(hook, vpW, vpH), hookBg, hookFallbackHtml(hook, vpW, vpH));

  // 2. Scenes
  for (let i = 0; i < timings.length; i++) {
    const { start, length } = timings[i];
    const copy = toPunchyCopy(activeScenes[i].description);
    addSlide(start, length, sceneOverlayHtml(copy, i, vpW, vpH), sceneBgs[i] ?? null, gradientFallbackHtml(copy, i, vpW, vpH));
  }

  // 3. CTA
  if (ctaLen > 0) {
    addSlide(totalDuration - ctaLen, ctaLen, ctaOverlayHtml(cta, vpW, vpH), ctaBg, ctaFallbackHtml(cta, vpW, vpH));
  }

  const tracks = overlayClips.length > 0
    ? [{ clips: overlayClips }, { clips: bgClips }]
    : [{ clips: bgClips }];

  const output: Record<string, unknown> = { format: "mp4", resolution: isPortrait ? "mobile" : "sd" };
  if (isPortrait) output.size = { width: 720, height: 1280 };

  return {
    timeline: {
      tracks,
      soundtrack: {
        src: pickMusic(platform),
        effect: "fadeInFadeOut",
        volume: 0.5,
      },
    },
    output,
  };
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function submitShotstackRender(
  script: ExpandedScript,
  platform: string,
  duration: string
): Promise<string> {
  const body = await buildTimeline(script, platform, duration);
  const res = await fetch(`${SHOTSTACK_BASE}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": shotstackKey() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shotstack submit failed ${res.status}: ${text}`);
  }
  const json = (await res.json()) as { response?: { id?: string } };
  const id = json?.response?.id;
  if (!id) throw new Error("Shotstack returned no render ID");
  return id;
}

export async function pollShotstackRender(
  renderId: string
): Promise<{ status: "queued" | "fetching" | "rendering" | "saving" | "done" | "failed"; url?: string }> {
  const res = await fetch(`${SHOTSTACK_BASE}/render/${renderId}`, {
    headers: { "x-api-key": shotstackKey() },
  });
  if (!res.ok) throw new Error(`Shotstack poll failed ${res.status}`);
  const json = (await res.json()) as { response?: { status?: string; url?: string } };
  return { status: (json?.response?.status ?? "queued") as any, url: json?.response?.url };
}

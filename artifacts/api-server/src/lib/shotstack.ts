/**
 * Shotstack video render helper.
 *
 * Architecture:
 *   Track 0 (top)    — HTML text overlays (transparent bg, dark vignette)
 *   Track 1 (bottom) — Pexels stock video clips, one per scene
 *
 * Falls back to animated gradient HTML slides if PEXELS_API_KEY is not set
 * or a search returns no results.
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
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Pexels footage search ─────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with",
  "by","from","is","are","was","were","be","been","being","have","has",
  "had","do","does","did","will","would","could","should","may","might",
  "can","this","that","these","those","left","right","show","shows",
  "shows","side","using","used","use","into","onto",
]);

function toSearchQuery(text: string, maxWords = 4): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
  return words.slice(0, maxWords).join(" ");
}

interface PexelsVideoFile {
  quality: string;
  file_type: string;
  width: number;
  height: number;
  link: string;
}

async function searchPexelsVideo(
  query: string,
  portrait: boolean
): Promise<string | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !query.trim()) return null;

  const orientation = portrait ? "portrait" : "landscape";
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(
    query
  )}&per_page=5&orientation=${orientation}&size=medium`;

  try {
    const res = await fetch(url, { headers: { Authorization: key } });
    if (!res.ok) {
      console.error("[pexels] search failed", res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as {
      videos?: Array<{ video_files: PexelsVideoFile[] }>;
    };
    const video = data.videos?.[0];
    if (!video) return null;

    const targetW = portrait ? 720 : 1280;
    const mp4s = video.video_files.filter((f) => f.file_type === "video/mp4");
    mp4s.sort(
      (a, b) => Math.abs(a.width - targetW) - Math.abs(b.width - targetW)
    );
    return mp4s[0]?.link ?? null;
  } catch (err) {
    console.error("[pexels] fetch error", err);
    return null;
  }
}

// ── HTML slide builders (fallback + overlays) ─────────────────────────────────

function hookOverlayHtml(hook: string, vpW: number, vpH: number): string {
  const fs = vpW >= 1000 ? 68 : 54;
  const words = hook.split(" ");
  const half = Math.ceil(words.length / 2);
  const line1 = esc(words.slice(0, half).join(" "));
  const line2 = esc(words.slice(half).join(" "));

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @keyframes fadeUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
    @keyframes glowPulse{0%,100%{text-shadow:0 2px 40px rgba(168,85,247,.9),0 0 80px rgba(168,85,247,.4)}50%{text-shadow:0 2px 80px rgba(168,85,247,1),0 0 120px rgba(168,85,247,.6)}}
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${vpW}px;height:${vpH}px;overflow:hidden;background:transparent}
    .vignette{
      position:absolute;inset:0;
      background:radial-gradient(ellipse at center,rgba(0,0,0,.15) 0%,rgba(0,0,0,.65) 100%);
    }
    .wrap{
      position:absolute;inset:0;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      padding:${vpW>=1000?80:56}px;text-align:center;
    }
    .line{
      font-family:'Arial Black',Arial,sans-serif;
      font-size:${fs}px;font-weight:900;line-height:1.1;
      color:#fff;display:block;
      animation:fadeUp .7s ease-out both, glowPulse 2.5s ease-in-out 1s infinite;
    }
    .line2{color:#e9d5ff;animation-delay:.2s,1.2s}
    .bar{width:72px;height:4px;background:linear-gradient(90deg,#7c3aed,#c084fc);margin:20px auto 0;border-radius:2px}
  </style></head><body>
    <div class="vignette"></div>
    <div class="wrap">
      <span class="line">${line1}</span>
      <span class="line line2">${line2}</span>
      <div class="bar"></div>
    </div>
  </body></html>`;
}

const ACCENT_COLORS = [
  "#a855f7","#3b82f6","#ef4444","#22c55e","#f59e0b","#06b6d4","#ec4899",
];

function sceneOverlayHtml(
  copy: string,
  paletteIdx: number,
  vpW: number,
  vpH: number
): string {
  const accent = ACCENT_COLORS[paletteIdx % ACCENT_COLORS.length];
  const fs = vpW >= 1000 ? 52 : 42;
  const words = copy.toUpperCase().split(" ");
  const last = esc(words.pop() ?? "");
  const main = esc(words.join(" "));

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @keyframes slideIn{from{opacity:0;transform:translateX(-32px)}to{opacity:1;transform:translateX(0)}}
    @keyframes popIn{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${vpW}px;height:${vpH}px;overflow:hidden;background:transparent}
    .vignette{
      position:absolute;inset:0;
      background:linear-gradient(to top,rgba(0,0,0,.8) 0%,rgba(0,0,0,.1) 60%,transparent 100%);
    }
    .wrap{
      position:absolute;bottom:0;left:0;right:0;
      padding:${vpW>=1000?"56px 72px":"40px 48px"};
    }
    p{
      font-family:'Arial Black',Arial,sans-serif;
      font-size:${fs}px;font-weight:900;line-height:1.15;color:#fff;
      animation:slideIn .5s ease-out both;
    }
    .hl{
      color:${accent};
      text-shadow:0 0 24px ${accent}cc;
      animation:popIn .4s ease-out .45s both;
      display:inline-block;
    }
    .bar{width:48px;height:3px;background:${accent};border-radius:2px;margin-top:14px;box-shadow:0 0 10px ${accent}}
  </style></head><body>
    <div class="vignette"></div>
    <div class="wrap">
      <p>${main} <span class="hl">${last}</span></p>
      <div class="bar"></div>
    </div>
  </body></html>`;
}

function ctaOverlayHtml(cta: string, vpW: number, vpH: number): string {
  const fs = vpW >= 1000 ? 52 : 44;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @keyframes zoomIn{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}
    @keyframes shimmer{0%,100%{box-shadow:0 0 40px rgba(168,85,247,.5)}50%{box-shadow:0 0 80px rgba(168,85,247,.9)}}
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${vpW}px;height:${vpH}px;overflow:hidden;background:transparent}
    .vignette{
      position:absolute;inset:0;
      background:radial-gradient(ellipse at center,rgba(0,0,0,.2) 0%,rgba(0,0,0,.75) 100%);
    }
    .wrap{
      position:absolute;inset:0;
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${vpW>=1000?36:24}px;
    }
    .label{font-family:Arial,sans-serif;font-size:${vpW>=1000?22:18}px;font-weight:600;color:#e9d5ff;letter-spacing:4px;text-transform:uppercase;animation:zoomIn .5s ease-out both}
    .btn{
      background:linear-gradient(135deg,#7c3aed,#a855f7);
      border-radius:${vpW>=1000?18:12}px;
      padding:${vpW>=1000?"28px 68px":"22px 48px"};
      animation:zoomIn .5s ease-out .3s both, shimmer 2s ease-in-out 1s infinite;
    }
    .btn-text{font-family:'Arial Black',Arial,sans-serif;font-size:${fs}px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:2px}
  </style></head><body>
    <div class="vignette"></div>
    <div class="wrap">
      <span class="label">Start Today</span>
      <div class="btn"><p class="btn-text">${esc(cta)}</p></div>
    </div>
  </body></html>`;
}

/** Fallback slide when no Pexels video found — animated gradient */
function gradientFallbackHtml(
  copy: string,
  paletteIdx: number,
  vpW: number,
  vpH: number
): string {
  const accent = ACCENT_COLORS[paletteIdx % ACCENT_COLORS.length];
  const BG_PAIRS = [
    ["#0d0d1a","#2d1b69"],["#0a1628","#0f2545"],["#1a0a0a","#3d0f0f"],
    ["#0a1a0f","#0f3d1f"],["#1a120a","#3d2d0f"],
  ];
  const [bg1, bg2] = BG_PAIRS[paletteIdx % BG_PAIRS.length];
  const fs = vpW >= 1000 ? 52 : 42;
  const words = copy.toUpperCase().split(" ");
  const last = esc(words.pop() ?? "");
  const main = esc(words.join(" "));

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @keyframes bg{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
    @keyframes slideIn{from{opacity:0;transform:translateX(-32px)}to{opacity:1;transform:translateX(0)}}
    @keyframes popIn{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${vpW}px;height:${vpH}px;overflow:hidden;
      background:linear-gradient(160deg,${bg1},${bg2},${bg1});
      background-size:300% 300%;animation:bg 6s ease infinite;
      font-family:'Arial Black',Arial,sans-serif;display:flex;align-items:flex-end;
    }
    .wrap{padding:${vpW>=1000?"56px 72px":"40px 48px"};width:100%}
    p{font-size:${fs}px;font-weight:900;line-height:1.15;color:#fff;animation:slideIn .5s ease-out both}
    .hl{color:${accent};text-shadow:0 0 24px ${accent}cc;animation:popIn .4s ease-out .45s both;display:inline-block}
    .bar{width:48px;height:3px;background:${accent};border-radius:2px;margin-top:14px}
  </style></head><body>
    <div class="wrap">
      <p>${main} <span class="hl">${last}</span></p>
      <div class="bar"></div>
    </div>
  </body></html>`;
}

function toPunchyCopy(description: string, maxWords = 9): string {
  const phrases = description.split(/[.,]/).map((s) => s.trim()).filter((s) => s.length > 5);
  const best = phrases[0] ?? description;
  const words = best.split(" ");
  return words.length <= maxWords ? best : words.slice(0, maxWords).join(" ");
}

// ── Timeline builder ──────────────────────────────────────────────────────────

async function buildTimeline(
  script: ExpandedScript,
  platform: string,
  durationStr: string
) {
  const totalDuration = parseDuration(durationStr) || 30;
  const hook = script.hook ?? "Watch this.";
  const cta = script.callToAction ?? "Get Started";
  const scenes = script.scenes ?? [];

  const isPortrait = ["tiktok","instagram","reels"].includes(
    (platform ?? "").toLowerCase()
  );
  const vpW = isPortrait ? 720 : 1280;
  const vpH = isPortrait ? 1280 : 720;

  // ── Timing ────────────────────────────────────────────────────────────────
  const hookLen = Math.min(3, totalDuration);
  const ctaLen = Math.min(4, Math.max(0, totalDuration - hookLen));
  const contentBudget = totalDuration - hookLen - ctaLen;

  const displayScenes = scenes.slice(0, 8);
  const rawDurations = displayScenes.map((sc) => parseDuration(sc.duration));
  const rawTotal = rawDurations.reduce((a, b) => a + b, 0) || 1;
  const scaledDurations = rawDurations.map((d) =>
    Math.max(2, Math.round((d / rawTotal) * contentBudget))
  );

  // Build timing plan
  interface SlotTiming { start: number; length: number }
  const sceneTimings: SlotTiming[] = [];
  let cursor = hookLen;
  for (let i = 0; i < displayScenes.length; i++) {
    const len = scaledDurations[i];
    if (cursor + len > totalDuration - ctaLen) break;
    sceneTimings.push({ start: cursor, length: len });
    cursor += len;
  }

  // ── Fetch Pexels videos in parallel ──────────────────────────────────────
  // Hook: search for something visually dynamic
  const hookQuery = toSearchQuery(hook, 3);
  // Each scene: use visualDirection for more specific imagery
  const sceneQueries = displayScenes.slice(0, sceneTimings.length).map((sc) =>
    toSearchQuery(sc.visualDirection || sc.description, 4)
  );
  // CTA: always use a generic "success business" clip
  const ctaQuery = "success achievement business";

  const [hookVideoUrl, ...restVideos] = await Promise.all([
    searchPexelsVideo(hookQuery, isPortrait),
    ...sceneQueries.map((q) => searchPexelsVideo(q, isPortrait)),
    searchPexelsVideo(ctaQuery, isPortrait),
  ]);
  const ctaVideoUrl = restVideos[restVideos.length - 1];
  const sceneVideoUrls = restVideos.slice(0, sceneTimings.length);

  // ── Build clip arrays ─────────────────────────────────────────────────────
  type ClipAsset =
    | { type: "html"; html: string; width: number; height: number; background?: string }
    | { type: "video"; src: string; trim?: { start: number } };

  interface Clip {
    asset: ClipAsset;
    start: number;
    length: number;
    transition?: { in?: string; out?: string };
    fit?: string;
  }

  const overlayClips: Clip[] = [];
  const bgClips: Clip[] = [];

  function addSlide(
    start: number,
    length: number,
    overlayHtml: string,
    videoUrl: string | null,
    fallbackHtml: string
  ) {
    if (videoUrl) {
      bgClips.push({
        asset: { type: "video", src: videoUrl, trim: { start: 0 } },
        start,
        length,
        fit: "cover",
        transition: { in: "fade", out: "fade" },
      });
      overlayClips.push({
        asset: {
          type: "html",
          html: overlayHtml,
          width: vpW,
          height: vpH,
          background: "transparent",
        },
        start,
        length,
        transition: { in: "fade", out: "fade" },
      });
    } else {
      // No Pexels result — use animated gradient fallback as single clip
      bgClips.push({
        asset: {
          type: "html",
          html: fallbackHtml,
          width: vpW,
          height: vpH,
          background: "#0d0d1a",
        },
        start,
        length,
        transition: { in: "fade", out: "fade" },
      });
    }
  }

  // 1. Hook
  const hookFallback = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @keyframes bg{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${vpW}px;height:${vpH}px;overflow:hidden;
      background:linear-gradient(135deg,#0d0d1a,#1a0533,#2d1b69,#0d0d1a);
      background-size:400% 400%;animation:bg 6s ease infinite;
      font-family:'Arial Black',Arial,sans-serif;display:flex;align-items:center;justify-content:center;text-align:center;
    }
    .wrap{padding:${vpW>=1000?80:56}px;animation:fadeUp .7s ease-out both}
    p{font-size:${vpW>=1000?68:54}px;font-weight:900;line-height:1.1;color:#fff;text-shadow:0 0 60px rgba(168,85,247,.9)}
  </style></head><body>
    <div class="wrap"><p>${esc(hook)}</p></div>
  </body></html>`;

  addSlide(0, hookLen, hookOverlayHtml(hook, vpW, vpH), hookVideoUrl, hookFallback);

  // 2. Scenes
  for (let i = 0; i < sceneTimings.length; i++) {
    const sc = displayScenes[i];
    const { start, length } = sceneTimings[i];
    const copy = toPunchyCopy(sc.description);
    addSlide(
      start,
      length,
      sceneOverlayHtml(copy, i, vpW, vpH),
      sceneVideoUrls[i] ?? null,
      gradientFallbackHtml(copy, i, vpW, vpH)
    );
  }

  // 3. CTA
  if (ctaLen > 0) {
    const ctaStart = totalDuration - ctaLen;
    const ctaFallback = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @keyframes bg{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
      @keyframes zoomIn{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}
      *{margin:0;padding:0;box-sizing:border-box}
      html,body{width:${vpW}px;height:${vpH}px;overflow:hidden;
        background:linear-gradient(135deg,#1a0533,#2d1b69,#4c1d95,#1a0533);
        background-size:400% 400%;animation:bg 5s ease infinite;
        font-family:'Arial Black',Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${vpW>=1000?36:24}px;
      }
      .label{font-size:${vpW>=1000?22:18}px;font-weight:600;color:#e9d5ff;letter-spacing:4px;text-transform:uppercase;animation:zoomIn .5s ease-out both}
      .btn{background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:${vpW>=1000?18:12}px;padding:${vpW>=1000?"28px 68px":"22px 48px"};animation:zoomIn .5s ease-out .3s both}
      .btn-text{font-size:${vpW>=1000?52:44}px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:2px}
    </style></head><body>
      <span class="label">Start Today</span>
      <div class="btn"><p class="btn-text">${esc(cta)}</p></div>
    </body></html>`;

    addSlide(ctaStart, ctaLen, ctaOverlayHtml(cta, vpW, vpH), ctaVideoUrl ?? null, ctaFallback);
  }

  // ── Assemble tracks ───────────────────────────────────────────────────────
  // Track 0 = overlay text (top), Track 1 = video bg (bottom)
  const tracks = overlayClips.length > 0
    ? [{ clips: overlayClips }, { clips: bgClips }]
    : [{ clips: bgClips }];

  const output: Record<string, unknown> = {
    format: "mp4",
    resolution: isPortrait ? "mobile" : "sd",
  };
  if (isPortrait) output.size = { width: 720, height: 1280 };

  return { timeline: { tracks }, output };
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
    headers: {
      "Content-Type": "application/json",
      "x-api-key": shotstackKey(),
    },
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
): Promise<{
  status: "queued" | "fetching" | "rendering" | "saving" | "done" | "failed";
  url?: string;
}> {
  const res = await fetch(`${SHOTSTACK_BASE}/render/${renderId}`, {
    headers: { "x-api-key": shotstackKey() },
  });
  if (!res.ok) throw new Error(`Shotstack poll failed ${res.status}`);
  const json = (await res.json()) as {
    response?: { status?: string; url?: string };
  };
  const status = json?.response?.status ?? "queued";
  const url = json?.response?.url;
  return { status: status as any, url };
}

/**
 * Shotstack video render helper.
 * Builds a polished ad video from an AI-generated script using Shotstack's HTML asset renderer.
 * CSS animations ARE captured frame-by-frame so gradients and keyframe effects render.
 */

const SHOTSTACK_BASE = process.env.SHOTSTACK_ENV === "production"
  ? "https://api.shotstack.io/edit/v1"
  : "https://api.shotstack.io/edit/stage";

function apiKey(): string {
  const key = process.env.SHOTSTACK_API_KEY;
  if (!key) throw new Error("SHOTSTACK_API_KEY env var is not set");
  return key;
}

// ── Script types ─────────────────────────────────────────────────────────────

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

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Extract short, punchy ad copy from a scene description.
 * The description is written as production notes — we pull the first meaningful phrase.
 */
function toPunchyCopy(description: string, maxWords = 9): string {
  // Split on period or comma, take first substantial chunk
  const phrases = description.split(/[.,]/).map(s => s.trim()).filter(s => s.length > 5);
  const best = phrases[0] ?? description;
  const words = best.split(" ");
  return words.length <= maxWords ? best : words.slice(0, maxWords).join(" ");
}

// ── Color palettes for scenes ─────────────────────────────────────────────────

const PALETTES = [
  { bg1: "#0d0d1a", bg2: "#1a0533", accent: "#a855f7", glow: "rgba(168,85,247,0.8)" },
  { bg1: "#0a1628", bg2: "#0f2545", accent: "#3b82f6", glow: "rgba(59,130,246,0.8)" },
  { bg1: "#1a0a0a", bg2: "#3d0f0f", accent: "#ef4444", glow: "rgba(239,68,68,0.8)" },
  { bg1: "#0a1a0f", bg2: "#0f3d1f", accent: "#22c55e", glow: "rgba(34,197,94,0.8)" },
  { bg1: "#1a120a", bg2: "#3d2d0f", accent: "#f59e0b", glow: "rgba(245,158,11,0.8)" },
  { bg1: "#0d0a1a", bg2: "#1e0f3d", accent: "#8b5cf6", glow: "rgba(139,92,246,0.8)" },
  { bg1: "#0a1a1a", bg2: "#0f3d3d", accent: "#06b6d4", glow: "rgba(6,182,212,0.8)" },
];

function palette(idx: number) {
  return PALETTES[idx % PALETTES.length];
}

// ── Slide HTML builders ───────────────────────────────────────────────────────

function hookHtml(hook: string, vpW: number, vpH: number): string {
  const words = hook.split(" ");
  // Break into two lines naturally
  const half = Math.ceil(words.length / 2);
  const line1 = escHtml(words.slice(0, half).join(" "));
  const line2 = escHtml(words.slice(half).join(" "));
  const fs = vpW >= 1000 ? 72 : 60;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @keyframes bgShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
    @keyframes fadeUp{0%{opacity:0;transform:translateY(30px)}100%{opacity:1;transform:translateY(0)}}
    @keyframes glowPulse{0%,100%{text-shadow:0 0 40px rgba(168,85,247,0.7),0 0 80px rgba(168,85,247,0.3)}50%{text-shadow:0 0 80px rgba(168,85,247,1),0 0 120px rgba(168,85,247,0.5)}}
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${vpW}px;height:${vpH}px;overflow:hidden}
    body{
      background:linear-gradient(135deg,#0d0d1a,#1a0533,#2d1b69,#0d0d1a);
      background-size:400% 400%;
      animation:bgShift 6s ease infinite;
      display:flex;align-items:center;justify-content:center;
      font-family:'Arial Black',Arial,sans-serif;
    }
    .wrap{
      text-align:center;padding:${vpW >= 1000 ? 80 : 60}px;
      animation:fadeUp 0.8s ease-out both;
    }
    .line1{
      font-size:${fs}px;font-weight:900;line-height:1.1;color:#fff;
      display:block;animation:glowPulse 2s ease-in-out infinite;
    }
    .line2{
      font-size:${fs}px;font-weight:900;line-height:1.1;color:#d8b4fe;
      display:block;margin-top:8px;animation:glowPulse 2s ease-in-out 0.3s infinite;
    }
    .bar{width:80px;height:4px;background:linear-gradient(90deg,#7c3aed,#a855f7);margin:24px auto 0;border-radius:2px}
  </style></head><body>
    <div class="wrap">
      <span class="line1">${line1}</span>
      <span class="line2">${line2}</span>
      <div class="bar"></div>
    </div>
  </body></html>`;
}

function sceneHtml(
  copy: string,
  paletteIdx: number,
  vpW: number,
  vpH: number
): string {
  const p = palette(paletteIdx);
  const fs = vpW >= 1000 ? 54 : 46;
  const words = copy.toUpperCase().split(" ");
  // Highlight the last word
  const lastWord = words.pop() ?? "";
  const mainText = escHtml(words.join(" "));
  const highlight = escHtml(lastWord);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @keyframes bgShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
    @keyframes slideIn{0%{opacity:0;transform:translateX(-40px)}100%{opacity:1;transform:translateX(0)}}
    @keyframes popIn{0%{opacity:0;transform:scale(0.7)}100%{opacity:1;transform:scale(1)}}
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${vpW}px;height:${vpH}px;overflow:hidden}
    body{
      background:linear-gradient(160deg,${p.bg1},${p.bg2},${p.bg1});
      background-size:300% 300%;
      animation:bgShift 5s ease infinite;
      display:flex;align-items:center;justify-content:center;
      font-family:'Arial Black',Arial,sans-serif;
    }
    .wrap{text-align:center;padding:${vpW >= 1000 ? 80 : 56}px}
    .copy{
      font-size:${fs}px;font-weight:900;line-height:1.15;color:#fff;
      animation:slideIn 0.6s ease-out both;
    }
    .highlight{
      color:${p.accent};
      text-shadow:0 0 30px ${p.glow};
      display:inline-block;
      animation:popIn 0.5s ease-out 0.5s both;
    }
    .accent-line{
      width:60px;height:3px;
      background:${p.accent};
      margin:20px auto 0;border-radius:2px;
      box-shadow:0 0 12px ${p.glow};
    }
  </style></head><body>
    <div class="wrap">
      <p class="copy">${mainText} <span class="highlight">${highlight}</span></p>
      <div class="accent-line"></div>
    </div>
  </body></html>`;
}

function ctaHtml(cta: string, vpW: number, vpH: number): string {
  const fs = vpW >= 1000 ? 56 : 48;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @keyframes bgShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
    @keyframes zoomIn{0%{opacity:0;transform:scale(0.8)}100%{opacity:1;transform:scale(1)}}
    @keyframes shimmer{0%{opacity:0.8}50%{opacity:1}100%{opacity:0.8}}
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${vpW}px;height:${vpH}px;overflow:hidden}
    body{
      background:linear-gradient(135deg,#1a0533,#2d1b69,#4c1d95,#1a0533);
      background-size:400% 400%;
      animation:bgShift 5s ease infinite;
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${vpW >= 1000 ? 40 : 28}px;
      font-family:'Arial Black',Arial,sans-serif;
    }
    .label{
      font-size:${vpW >= 1000 ? 24 : 20}px;font-weight:600;
      color:#d8b4fe;letter-spacing:4px;text-transform:uppercase;
      animation:zoomIn 0.6s ease-out both;
    }
    .btn{
      background:linear-gradient(135deg,#7c3aed,#a855f7,#9333ea);
      border-radius:${vpW >= 1000 ? 20 : 14}px;
      padding:${vpW >= 1000 ? "32px 72px" : "24px 52px"};
      animation:zoomIn 0.6s ease-out 0.3s both;
      box-shadow:0 0 60px rgba(168,85,247,0.5);
    }
    .btn-text{
      font-size:${fs}px;font-weight:900;color:#fff;
      text-transform:uppercase;letter-spacing:2px;
      animation:shimmer 2s ease-in-out 1s infinite;
    }
  </style></head><body>
    <span class="label">Start Today</span>
    <div class="btn"><p class="btn-text">${escHtml(cta)}</p></div>
  </body></html>`;
}

// ── Timeline builder ──────────────────────────────────────────────────────────

function buildTimeline(script: ExpandedScript, platform: string, durationStr: string) {
  const totalDuration = parseDuration(durationStr) || 30;
  const hook = script.hook ?? "Watch this.";
  const cta = script.callToAction ?? "Get Started";
  const scenes = script.scenes ?? [];

  const isPortrait = ["tiktok", "instagram", "reels"].includes((platform ?? "").toLowerCase());
  const vpW = isPortrait ? 720 : 1280;
  const vpH = isPortrait ? 1280 : 720;

  interface Clip {
    asset: { type: string; html: string; width: number; height: number; background?: string };
    start: number;
    length: number;
    transition?: { in?: string; out?: string };
  }

  const clips: Clip[] = [];

  // 1. Hook — 3s
  const hookLen = Math.min(3, totalDuration);
  clips.push({
    asset: { type: "html", html: hookHtml(hook, vpW, vpH), width: vpW, height: vpH, background: "#0d0d1a" },
    start: 0,
    length: hookLen,
    transition: { in: "fade", out: "fade" },
  });

  let cursor = hookLen;
  const ctaLen = Math.min(4, Math.max(0, totalDuration - cursor));
  const contentBudget = totalDuration - cursor - ctaLen;

  // 2. Scenes — show punchy ad copy, not production notes
  const displayScenes = scenes.slice(0, 8);
  const rawDurations = displayScenes.map(sc => parseDuration(sc.duration));
  const rawTotal = rawDurations.reduce((a, b) => a + b, 0) || 1;
  const scaledDurations = rawDurations.map(d =>
    Math.max(2, Math.round((d / rawTotal) * contentBudget))
  );

  for (let i = 0; i < displayScenes.length; i++) {
    const sc = displayScenes[i];
    const len = scaledDurations[i];
    if (cursor + len > totalDuration - ctaLen) break;

    const copy = toPunchyCopy(sc.description);
    clips.push({
      asset: {
        type: "html",
        html: sceneHtml(copy, i, vpW, vpH),
        width: vpW,
        height: vpH,
        background: "#0d0d1a",
      },
      start: cursor,
      length: len,
      transition: { in: "fade", out: "fade" },
    });
    cursor += len;
  }

  // 3. CTA
  if (ctaLen > 0) {
    clips.push({
      asset: { type: "html", html: ctaHtml(cta, vpW, vpH), width: vpW, height: vpH, background: "#1a0533" },
      start: totalDuration - ctaLen,
      length: ctaLen,
      transition: { in: "fade" },
    });
  }

  const output: Record<string, unknown> = {
    format: "mp4",
    resolution: isPortrait ? "mobile" : "sd",
  };
  if (isPortrait) {
    output.size = { width: 720, height: 1280 };
  }

  return { timeline: { tracks: [{ clips }] }, output };
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function submitShotstackRender(
  script: ExpandedScript,
  platform: string,
  duration: string
): Promise<string> {
  const body = buildTimeline(script, platform, duration);
  const res = await fetch(`${SHOTSTACK_BASE}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey() },
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
    headers: { "x-api-key": apiKey() },
  });
  if (!res.ok) throw new Error(`Shotstack poll failed ${res.status}`);
  const json = (await res.json()) as { response?: { status?: string; url?: string } };
  const status = json?.response?.status ?? "queued";
  const url = json?.response?.url;
  return { status: status as any, url };
}

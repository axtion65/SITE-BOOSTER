/**
 * Shotstack video render helper.
 * Builds a kinetic-typography timeline from an AI-generated script and submits it.
 * Uses SHOTSTACK_API_KEY env var (sandbox or production key from app.shotstack.io).
 */

const SHOTSTACK_BASE = process.env.SHOTSTACK_ENV === "production"
  ? "https://api.shotstack.io/v1"
  : "https://api.shotstack.io/stage/v1";

function apiKey(): string {
  const key = process.env.SHOTSTACK_API_KEY;
  if (!key) throw new Error("SHOTSTACK_API_KEY env var is not set");
  return key;
}

// ── Typography helpers ───────────────────────────────────────────────────────

function fullPage(bodyHtml: string, bg = "#0d0d1a"): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:100%;height:100%;overflow:hidden;background:${bg};font-family:'Arial Black',Arial,sans-serif;color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;padding:40px}
  </style></head><body>${bodyHtml}</body></html>`;
}

function hookHtml(hook: string): string {
  return fullPage(
    `<div style="background:linear-gradient(135deg,#0d0d1a,#1a0533,#2d1b69);width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:40px">
      <p style="font-size:52px;font-weight:900;line-height:1.15;color:#fff;text-shadow:0 0 40px rgba(138,43,226,0.9)">${escHtml(hook)}</p>
    </div>`,
    "#0d0d1a"
  );
}

function sceneHtml(sceneNumber: number, description: string, visualDirection: string): string {
  return fullPage(
    `<div style="background:linear-gradient(160deg,#0d0d1a,#1a0533);width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px;gap:24px">
      <div style="background:rgba(138,43,226,0.2);border:1px solid rgba(138,43,226,0.5);border-radius:8px;padding:8px 20px">
        <span style="font-size:22px;font-weight:700;color:#a855f7;letter-spacing:2px">SCENE ${sceneNumber}</span>
      </div>
      <p style="font-size:36px;font-weight:700;line-height:1.3;color:#fff;max-width:900px">${escHtml(description)}</p>
      <p style="font-size:20px;font-weight:400;line-height:1.5;color:#a0a0c0;max-width:860px;font-style:italic">${escHtml(visualDirection)}</p>
    </div>`,
    "#0d0d1a"
  );
}

function ctaHtml(cta: string): string {
  return fullPage(
    `<div style="background:linear-gradient(135deg,#1a0533,#2d1b69,#4c1d95);width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:32px;padding:48px">
      <p style="font-size:28px;color:#d8b4fe;font-weight:600;letter-spacing:1px">Ready to start?</p>
      <div style="background:linear-gradient(135deg,#7c3aed,#9333ea);border-radius:16px;padding:28px 60px">
        <p style="font-size:44px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:2px">${escHtml(cta)}</p>
      </div>
    </div>`,
    "#1a0533"
  );
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Timeline builder ─────────────────────────────────────────────────────────

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

function buildTimeline(script: ExpandedScript, platform: string, durationStr: string) {
  const totalDuration = parseDuration(durationStr) || 30;
  const hook = script.hook ?? "Watch this.";
  const cta = script.callToAction ?? "Start now";
  const scenes = script.scenes ?? [];

  const isPortrait = ["tiktok", "instagram", "reels"].includes((platform ?? "").toLowerCase());

  // Viewport that Shotstack renders HTML into (px)
  const vpW = isPortrait ? 720 : 1280;
  const vpH = isPortrait ? 1280 : 720;

  interface Clip {
    asset: {
      type: string;
      html: string;
      width: number;
      height: number;
      background?: string;
    };
    start: number;
    length: number;
    transition?: { in?: string; out?: string };
  }

  const clips: Clip[] = [];

  // 1. Hook (3 s)
  const hookLen = Math.min(3, totalDuration);
  clips.push({
    asset: { type: "html", html: hookHtml(hook), width: vpW, height: vpH, background: "#0d0d1a" },
    start: 0,
    length: hookLen,
    transition: { in: "fade", out: "fade" },
  });

  let cursor = hookLen;
  const ctaLen = Math.min(4, totalDuration - cursor);
  const contentBudget = totalDuration - cursor - ctaLen;

  // 2. Scenes
  const displayScenes = scenes.slice(0, 8);
  // Distribute content budget across scenes, respecting their own duration hints
  const rawDurations = displayScenes.map((sc) => parseDuration(sc.duration));
  const rawTotal = rawDurations.reduce((a, b) => a + b, 0) || 1;
  const scaledDurations = rawDurations.map((d) =>
    Math.max(2, Math.round((d / rawTotal) * contentBudget))
  );

  for (let i = 0; i < displayScenes.length; i++) {
    const sc = displayScenes[i];
    const len = scaledDurations[i];
    if (cursor + len > totalDuration - ctaLen) break;
    clips.push({
      asset: {
        type: "html",
        html: sceneHtml(sc.sceneNumber, sc.description, sc.visualDirection),
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
      asset: { type: "html", html: ctaHtml(cta), width: vpW, height: vpH, background: "#1a0533" },
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

  return {
    timeline: { tracks: [{ clips }] },
    output,
  };
}

// ── API calls ────────────────────────────────────────────────────────────────

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
  const json = (await res.json()) as {
    response?: { status?: string; url?: string };
  };
  const status = json?.response?.status ?? "queued";
  const url = json?.response?.url;
  return { status: status as ReturnType<typeof pollShotstackRender> extends Promise<infer T> ? T["status"] : never, url };
}

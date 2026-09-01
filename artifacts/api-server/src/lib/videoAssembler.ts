import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface BusinessAdvertRenderInput {
  targetDurationSeconds: number;
  width: number;
  height: number;
  voiceoverUrl: string;
  voiceoverDurationMs: number;
  scenes: Array<{ videoUrl: string; durationMs: number; caption: string }>;
  brand: {
    name: string;
    website?: string | null;
    primaryColor?: string | null;
    callToAction: string;
  };
}

function srtTime(milliseconds: number): string {
  const safe = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const millis = safe % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function subtitleText(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/-->/g, "→").trim();
}

export function buildAdvertSubtitles(input: BusinessAdvertRenderInput): string {
  const entries: string[] = [];
  const captions = input.scenes.map((scene) => scene.caption.trim()).filter(Boolean);
  const weights = captions.map((caption) => Math.max(1, caption.split(/\s+/).length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let captionStart = 0;
  for (let index = 0; index < captions.length; index++) {
    const isLast = index === captions.length - 1;
    const duration = isLast
      ? input.voiceoverDurationMs - captionStart
      : Math.round(input.voiceoverDurationMs * weights[index]! / totalWeight);
    const captionEnd = captionStart + duration;
    entries.push(`${entries.length + 1}\n${srtTime(captionStart)} --> ${srtTime(captionEnd)}\n${subtitleText(captions[index]!)}\n`);
    captionStart = captionEnd;
  }
  const start = input.scenes.reduce((sum, scene) => sum + scene.durationMs, 0);
  const endCard = [input.brand.name, input.brand.callToAction, input.brand.website].filter(Boolean).map((line) => subtitleText(String(line))).join("\n");
  entries.push(`${entries.length + 1}\n${srtTime(start)} --> ${srtTime(input.targetDurationSeconds * 1000)}\n${endCard}\n`);
  return entries.join("\n");
}

function safeColor(value: string | null | undefined): string {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? `0x${value!.slice(1)}` : "0x6D28D9";
}

function ffmpegFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

async function materialize(source: string, target: string): Promise<void> {
  if (source.startsWith("file://")) {
    await copyFile(fileURLToPath(source), target);
    return;
  }
  const response = await fetch(source, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`Production asset download failed with HTTP ${response.status}`);
  const advertised = Number(response.headers.get("content-length"));
  if (Number.isFinite(advertised) && advertised > 500 * 1024 * 1024) throw new Error("Production asset exceeds 500 MB");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > 500 * 1024 * 1024) throw new Error("Production asset is empty or too large");
  await writeFile(target, buffer);
}

/** Deterministically assembles exact-length business output from persisted scene clips. */
export async function renderBusinessAdvert(input: BusinessAdvertRenderInput): Promise<Buffer> {
  if (![15, 30, 45].includes(input.targetDurationSeconds)) throw new Error("Advert duration must be 15, 30, or 45 seconds");
  if (!input.scenes.length) throw new Error("Advert assembly requires completed scenes");
  if (!Number.isFinite(input.voiceoverDurationMs) || input.voiceoverDurationMs <= 0 || input.voiceoverDurationMs >= input.targetDurationSeconds * 1000) throw new Error("Measured voiceover duration is invalid");
  const expectedVisualMs = input.targetDurationSeconds * 1000 - 3000;
  if (input.scenes.reduce((sum, scene) => sum + scene.durationMs, 0) !== expectedVisualMs) throw new Error("Scene timeline does not reserve the exact three-second end card");
  const directory = await mkdtemp(path.join(tmpdir(), "quae-assemble-"));
  const audioPath = path.join(directory, "voiceover.mp3");
  const subtitlePath = path.join(directory, "captions.srt");
  const outputPath = path.join(directory, "advert.mp4");
  try {
    const scenePaths = input.scenes.map((_, index) => path.join(directory, `scene-${index}.mp4`));
    await Promise.all([
      materialize(input.voiceoverUrl, audioPath),
      ...input.scenes.map((scene, index) => materialize(scene.videoUrl, scenePaths[index]!)),
    ]);
    await writeFile(subtitlePath, buildAdvertSubtitles(input), "utf8");

    const args: string[] = ["-y"];
    for (const scenePath of scenePaths) args.push("-i", scenePath);
    const audioInput = scenePaths.length;
    args.push("-i", audioPath);
    const endCardInput = audioInput + 1;
    args.push("-f", "lavfi", "-t", "3", "-i", `color=c=${safeColor(input.brand.primaryColor)}:s=${input.width}x${input.height}:r=30`);

    const filters = input.scenes.map((scene, index) =>
      `[${index}:v]scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height},fps=30,trim=duration=${(scene.durationMs / 1000).toFixed(3)},setpts=PTS-STARTPTS,format=yuv420p[v${index}]`,
    );
    filters.push(`[${endCardInput}:v]trim=duration=3,setpts=PTS-STARTPTS,format=yuv420p[vend]`);
    const concatenatedInputs = input.scenes.map((_, index) => `[v${index}]`).join("") + "[vend]";
    filters.push(`${concatenatedInputs}concat=n=${input.scenes.length + 1}:v=1:a=0[base]`);
    filters.push(`[base]subtitles=filename='${ffmpegFilterPath(subtitlePath)}':force_style='FontName=DejaVu Sans,FontSize=38,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=1,Shadow=0,Alignment=2,MarginL=80,MarginR=80,MarginV=70'[vout]`);

    args.push(
      "-filter_complex", filters.join(";"),
      "-map", "[vout]",
      "-map", `${audioInput}:a:0`,
      "-af", "apad",
      "-t", String(input.targetDurationSeconds),
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "160k",
      "-movflags", "+faststart",
      outputPath,
    );
    await execFileAsync("ffmpeg", args, { timeout: 15 * 60_000, maxBuffer: 8 * 1024 * 1024 });
    return await readFile(outputPath);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

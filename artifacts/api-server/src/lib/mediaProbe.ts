import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface MediaProbe {
  durationMs: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

export async function probeMediaFile(filePath: string): Promise<MediaProbe> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type",
    "-of", "json",
    filePath,
  ], { timeout: 30_000, maxBuffer: 1024 * 1024 });
  const value = JSON.parse(stdout) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string }> };
  const seconds = Number(value.format?.duration);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("Media duration could not be measured");
  return {
    durationMs: Math.round(seconds * 1000),
    hasVideo: value.streams?.some((stream) => stream.codec_type === "video") ?? false,
    hasAudio: value.streams?.some((stream) => stream.codec_type === "audio") ?? false,
  };
}

export async function probeMediaBuffer(buffer: Buffer, extension: string): Promise<MediaProbe> {
  const directory = await mkdtemp(path.join(tmpdir(), "quae-probe-"));
  const filePath = path.join(directory, `media.${extension.replace(/[^a-z0-9]/gi, "") || "bin"}`);
  try {
    await writeFile(filePath, buffer);
    return await probeMediaFile(filePath);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

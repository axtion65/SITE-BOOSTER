import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { buildAdvertSubtitles, renderBusinessAdvert } from "./videoAssembler";
import { probeMediaBuffer } from "./mediaProbe";

const execFileAsync = promisify(execFile);

test("subtitle timeline preserves scene copy and reserves the brand CTA end card", () => {
  const subtitles = buildAdvertSubtitles({
    targetDurationSeconds: 15,
    width: 320,
    height: 180,
    voiceoverUrl: "file:///voice.mp3",
    voiceoverDurationMs: 12_000,
    scenes: [
      { videoUrl: "file:///one.mp4", durationMs: 4000, caption: "First approved sentence." },
      { videoUrl: "file:///two.mp4", durationMs: 4000, caption: "Second approved sentence." },
      { videoUrl: "file:///three.mp4", durationMs: 4000, caption: "Third approved sentence." },
    ],
    brand: { name: "Quae", callToAction: "Start building", website: "quae.ai" },
  });
  assert.match(subtitles, /00:00:00,000 --> 00:00:04,000/);
  assert.match(subtitles, /00:00:12,000 --> 00:00:15,000\nQuae\nStart building\nquae\.ai/);
});

test("FFmpeg produces one exact-length MP4 with voiceover audio and all scenes", { timeout: 120_000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "quae-assembler-test-"));
  try {
    const colors = ["red", "green", "blue"];
    const scenePaths = colors.map((_, index) => path.join(directory, `scene-${index}.mp4`));
    await Promise.all(colors.map((color, index) => execFileAsync("ffmpeg", [
      "-y", "-f", "lavfi", "-i", `color=c=${color}:s=320x180:r=30:d=4`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", scenePaths[index]!,
    ], { timeout: 30_000 })));
    const audioPath = path.join(directory, "voice.mp3");
    await execFileAsync("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=10", "-c:a", "libmp3lame", audioPath], { timeout: 30_000 });
    const output = await renderBusinessAdvert({
      targetDurationSeconds: 15,
      width: 320,
      height: 180,
      voiceoverUrl: pathToFileURL(audioPath).toString(),
      voiceoverDurationMs: 10_000,
      scenes: scenePaths.map((scenePath, index) => ({ videoUrl: pathToFileURL(scenePath).toString(), durationMs: 4000, caption: `Approved scene ${index + 1}` })),
      brand: { name: "Quae", callToAction: "Start building", website: "quae.ai", primaryColor: "#6D28D9" },
    });
    const probe = await probeMediaBuffer(output, "mp4");
    assert.ok(probe.hasVideo);
    assert.ok(probe.hasAudio);
    assert.ok(Math.abs(probe.durationMs - 15_000) <= 100);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    width: 1080,
    height: 1920,
    voiceoverUrl: "file:///voice.mp3",
    voiceoverDurationMs: 12_000,
    scenes: [
      { videoUrl: "file:///one.mp4", durationMs: 4000, caption: "First approved sentence with affordable professional marketing content." },
      { videoUrl: "file:///two.mp4", durationMs: 4000, caption: "Second approved sentence." },
      { videoUrl: "file:///three.mp4", durationMs: 4000, caption: "Third approved sentence." },
    ],
    brand: { name: "Quae", callToAction: "Start building", website: "quae.ai" },
  });
  assert.match(subtitles, /PlayResX: 1080/);
  assert.match(subtitles, /PlayResY: 1920/);
  assert.match(subtitles, /WrapStyle: 2/);
  assert.match(subtitles, /Style: Caption[^\n]+,2,97,97,307,1/);
  assert.doesNotMatch(subtitles, /First approved sentence with affordable professional marketing content\./);
  const captionEvents = subtitles.split("\n").filter((line) => line.includes(",Caption,"));
  assert.ok(captionEvents.length > 3);
  for (const event of captionEvents) {
    const text = event.slice(event.indexOf(",,") + 2).replace(/\\N/g, " ");
    assert.ok(text.split(/\s+/).length <= 6, `caption phrase is too long: ${text}`);
    assert.ok((event.match(/\\N/g) ?? []).length <= 1, `caption exceeds two lines: ${event}`);
  }
  assert.match(subtitles, /Dialogue: 0,0:00:12\.00,0:00:15\.00,EndCard[^\n]+Quae\\NStart building\\Nquae\.ai/);
});

function whitePixelBounds(frame: Buffer, width: number, height: number) {
  let minimumX = width;
  let maximumX = -1;
  let minimumY = height;
  let maximumY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      if (frame[offset]! > 210 && frame[offset + 1]! > 210 && frame[offset + 2]! > 210) {
        minimumX = Math.min(minimumX, x);
        maximumX = Math.max(maximumX, x);
        minimumY = Math.min(minimumY, y);
        maximumY = Math.max(maximumY, y);
      }
    }
  }
  assert.ok(maximumX >= 0, "expected visible white subtitle pixels");
  return { minimumX, maximumX, minimumY, maximumY };
}

test("FFmpeg keeps long captions and the end card inside a 1080x1920 safe area", { timeout: 180_000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "quae-assembler-test-"));
  try {
    const colors = ["black", "black", "black"];
    const scenePaths = colors.map((_, index) => path.join(directory, `scene-${index}.mp4`));
    await Promise.all(colors.map((color, index) => execFileAsync("ffmpeg", [
      "-y", "-f", "lavfi", "-i", `color=c=${color}:s=270x480:r=30:d=4`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", scenePaths[index]!,
    ], { timeout: 30_000 })));
    const audioPath = path.join(directory, "voice.mp3");
    await execFileAsync("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=10", "-c:a", "libmp3lame", audioPath], { timeout: 30_000 });
    const output = await renderBusinessAdvert({
      targetDurationSeconds: 15,
      width: 1080,
      height: 1920,
      voiceoverUrl: pathToFileURL(audioPath).toString(),
      voiceoverDurationMs: 10_000,
      scenes: [
        { videoUrl: pathToFileURL(scenePaths[0]!).toString(), durationMs: 4000, caption: "Businesses that need affordable professional marketing content can now create it." },
        { videoUrl: pathToFileURL(scenePaths[1]!).toString(), durationMs: 4000, caption: "Build polished campaigns without the agency delay." },
        { videoUrl: pathToFileURL(scenePaths[2]!).toString(), durationMs: 4000, caption: "Launch your next campaign with confidence today." },
      ],
      brand: { name: "Quae", callToAction: "Start building your next campaign today", website: "quae.ai", primaryColor: "#6D28D9" },
    });
    const probe = await probeMediaBuffer(output, "mp4");
    assert.ok(probe.hasVideo);
    assert.ok(probe.hasAudio);
    assert.ok(Math.abs(probe.durationMs - 15_000) <= 100);
    const outputPath = path.join(directory, "output.mp4");
    await writeFile(outputPath, output);
    for (const [timestamp, kind] of [["2", "caption"], ["13.5", "end card"]] as const) {
      const framePath = path.join(directory, `${kind.replace(" ", "-")}.rgb`);
      await execFileAsync("ffmpeg", [
        "-y", "-ss", timestamp, "-i", outputPath, "-frames:v", "1",
        "-f", "rawvideo", "-pix_fmt", "rgb24", framePath,
      ], { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
      const bounds = whitePixelBounds(await readFile(framePath), 1080, 1920);
      assert.ok(bounds.minimumX >= 80, `${kind} crosses the left safe area: ${JSON.stringify(bounds)}`);
      assert.ok(bounds.maximumX <= 999, `${kind} crosses the right safe area: ${JSON.stringify(bounds)}`);
      assert.ok(bounds.maximumY - bounds.minimumY <= (kind === "caption" ? 150 : 320), `${kind} is too tall: ${JSON.stringify(bounds)}`);
      if (kind === "caption") {
        assert.ok(bounds.minimumY >= 1150, `caption is not in the lower safe area: ${JSON.stringify(bounds)}`);
        assert.ok(bounds.maximumY <= 1650, `caption crosses the bottom safe area: ${JSON.stringify(bounds)}`);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

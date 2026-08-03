/**
 * Add TTS narration audio to a video clip using FFmpeg.
 *
 * Strategy:
 *  1. Download the source video to a temp file.
 *  2. Write the audio buffer (MP3) to a temp file.
 *  3. Run FFmpeg to mix the narration over the video:
 *       - apad pads narration with silence if shorter than the video.
 *       - -shortest stops encoding when the video stream ends.
 *       - Video stream is copied (no re-encode cost).
 *  4. Return the mixed MP4 as a Buffer.
 *
 * Returns null on any failure so callers can fall back to the silent video.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export async function addNarrationToVideo(
  videoUrl: string,
  audioBuffer: Buffer,
): Promise<Buffer | null> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quae-narrate-'));
  const videoPath = path.join(tmpDir, 'video.mp4');
  const audioPath = path.join(tmpDir, 'narration.mp3');
  const outputPath = path.join(tmpDir, 'output.mp4');

  try {
    // Download the source video
    const resp = await fetch(videoUrl, { signal: AbortSignal.timeout(180_000) });
    if (!resp.ok) throw new Error(`Video download failed: HTTP ${resp.status}`);
    const videoBuf = Buffer.from(await resp.arrayBuffer());
    await fs.writeFile(videoPath, videoBuf);
    await fs.writeFile(audioPath, audioBuffer);

    // Mix: narration padded with silence to match video length; copy video, encode audio as AAC
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', videoPath,
      '-i', audioPath,
      '-filter_complex', '[1:a]apad[a]',
      '-map', '0:v:0',
      '-map', '[a]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      outputPath,
    ]);

    const output = await fs.readFile(outputPath);
    console.log(
      `[videoNarrate] Mixed: ${videoBuf.length}B video + ${audioBuffer.length}B audio → ${output.length}B narrated`,
    );
    return output;
  } catch (err) {
    console.error('[videoNarrate] FFmpeg mix failed:', err);
    return null;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

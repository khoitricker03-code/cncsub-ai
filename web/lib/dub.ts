import path from "path";
import { promises as fs } from "fs";
import { spawn } from "child_process";
import { synthesizeSegment, concatWavs } from "@/lib/tts";
import { getProjectRoot } from "@/lib/storage";
import { logger } from "@/lib/logger";

type Segment = { id: number; start: number; end: number; text: string };

export async function runDubbingJob(
  projectId: string,
  segments: Segment[],
  outDir: string,
  opts: { provider?: string; language?: string; retries?: number },
  onProgress: (phase: string, pct: number) => void,
): Promise<{ voicePath: string; mixedPath: string; renderedVideo?: string }> {
  await fs.mkdir(outDir, { recursive: true });
  onProgress("Preparing...", 0);

  const clipPaths: string[] = [];
  let i = 0;
  for (const seg of segments) {
    i++;
    onProgress("Synthesizing...", Math.round((i / segments.length) * 50));
    const dur = Math.max(0.1, seg.end - seg.start);
    const clip = path.join(outDir, `clip-${seg.id}.wav`);
    let attempts = 0;
    while (true) {
      try {
        await synthesizeSegment(seg.text, clip, dur, { provider: opts.provider, language: opts.language });
        break;
      } catch (err) {
        attempts++;
        logger.error("dub.tts_failed", { err, segId: seg.id, attempt: attempts });
        if (attempts > (opts.retries ?? 2)) throw err;
      }
    }
    clipPaths.push(clip);
  }

  const voicePath = path.join(outDir, "voice.wav");
  onProgress("Concatenating...", 60);
  await concatWavs(clipPaths, voicePath);

  // Extract original audio
  const origAudio = path.join(outDir, "original_audio.wav");
  onProgress("Mixing...", 70);
  await new Promise<void>((resolve, reject) => {
    const args = ["-y", "-i", path.join(getProjectRoot(projectId) || "", "media", "input.mp4"), "-vn", "-acodec", "pcm_s16le", "-ar", "48000", origAudio];
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += String(d)));
    p.on("error", (e) => reject(e));
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg extract audio failed: ${stderr}`));
    });
  });

  const mixed = path.join(outDir, "mixed.wav");
  // Simple mix: lower original by 6dB and overlay AI voice (both full length)
  await new Promise<void>((resolve, reject) => {
    const args = [
      "-y",
      "-i",
      origAudio,
      "-i",
      voicePath,
      "-filter_complex",
      "[0:a]volume=0.5[a0];[a0][1:a]amix=inputs=2:duration=longest:dropout_transition=2",
      "-ar",
      "48000",
      "-ac",
      "2",
      mixed,
    ];
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += String(d)));
    p.on("error", (e) => reject(e));
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg mixing failed: ${stderr}`));
    });
  });

  onProgress("Rendering...", 85);
  // Return paths; final video rendering and subtitle burn will be handled by caller
  return { voicePath, mixedPath: mixed };
}

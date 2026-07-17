import path from "path";
import { promises as fs } from "fs";

import {
  buildSeparatedAudioMixFilter,
  buildVoiceOnlyMixFilter,
  buildVoiceTimelineFilter,
  type TimedAudioClip,
} from "@/lib/dub-audio";
import { ensureSeparatedAudio, type SeparationResult } from "@/lib/demucs";
import {
  analyzeAudioVolume,
  probeAudio,
  probeVideo,
  runFfmpeg,
} from "@/lib/ffmpeg";
import { logger } from "@/lib/logger";
import { synthesizeSegment } from "@/lib/tts";
import type { DubbingOptions } from "@/lib/tts-config";

export type DubbingSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

type DubbingJobOptions = DubbingOptions & {
  signal?: AbortSignal;
  separationCacheDir?: string;
};

function validateSegments(segments: DubbingSegment[]) {
  if (!segments.length) throw new Error("No translated subtitle segments are available for dubbing.");
  const ids = new Set<number>();
  let previousStart = -1;
  for (const segment of segments) {
    if (!Number.isInteger(segment.id) || ids.has(segment.id)) {
      throw new Error(`Invalid or duplicate subtitle segment ID: ${segment.id}.`);
    }
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start < 0 || segment.end <= segment.start) {
      throw new Error(`Invalid timestamps for subtitle segment ${segment.id}.`);
    }
    if (segment.start < previousStart) {
      throw new Error(`Subtitle segment ${segment.id} is out of chronological order.`);
    }
    if (!segment.text.trim()) throw new Error(`Subtitle segment ${segment.id} has no text to synthesize.`);
    ids.add(segment.id);
    previousStart = segment.start;
  }
}

function ensureNotCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Operation cancelled", "AbortError");
}

async function verifyAudibleAudio(file: string, label: string) {
  const metadata = await probeAudio(file);
  if (metadata.duration <= 0) throw new Error(`${label} has no playable duration.`);
  const volume = await analyzeAudioVolume(file);
  if (!Number.isFinite(volume.maxVolumeDb) || volume.maxVolumeDb <= -80) {
    throw new Error(`${label} is silent.`);
  }
  return metadata;
}

export async function runDubbingJob(
  inputVideo: string,
  segments: DubbingSegment[],
  outDir: string,
  options: DubbingJobOptions,
  onProgress: (phase: string, percent: number) => void,
): Promise<{
  voicePath: string;
  mixedPath: string;
  clipPaths: string[];
  separation: SeparationResult | null;
}> {
  validateSegments(segments);
  ensureNotCancelled(options.signal);
  await fs.mkdir(outDir, { recursive: true });
  const video = await probeVideo(inputVideo);
  if (video.duration <= 0) throw new Error("The source video has no valid duration.");

  let separation: SeparationResult | null = null;
  if (options.mode === "replace-vocals") {
    if (!video.audioCodec) {
      throw new Error("The source video has no audio stream for Demucs separation.");
    }
    if (!options.separationCacheDir) {
      throw new Error("A project separation cache directory is required for Replace Voice Only mode.");
    }
    separation = await ensureSeparatedAudio({
      inputVideo,
      cacheDir: options.separationCacheDir,
      signal: options.signal,
      onProgress,
    });
  }
  onProgress("Preparing Edge TTS", options.mode === "replace-vocals" ? 38 : 5);

  const timedClips: TimedAudioClip[] = [];
  const clipPaths: string[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const clipPath = path.join(outDir, `clip-${segment.id}.mp3`);
    onProgress(
      `Generating speech for subtitle ${segment.id}`,
      (options.mode === "replace-vocals" ? 40 : 10)
        + Math.round(((index + 1) / segments.length) * (options.mode === "replace-vocals" ? 30 : 55)),
    );

    let synthesized: Awaited<ReturnType<typeof synthesizeSegment>> | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= options.retries; attempt += 1) {
      ensureNotCancelled(options.signal);
      try {
        synthesized = await synthesizeSegment(
          segment.text,
          clipPath,
          {
            provider: options.provider,
            voice: options.voice,
            rate: options.rate,
            pitch: options.pitch,
          },
          options.signal,
        );
        break;
      } catch (error) {
        if (options.signal?.aborted) throw new DOMException("Operation cancelled", "AbortError");
        lastError = error;
        logger.error("dub.tts_failed", {
          error,
          segmentId: segment.id,
          attempt: attempt + 1,
        });
        await fs.rm(clipPath, { force: true }).catch(() => undefined);
      }
    }
    if (!synthesized) {
      const reason = lastError instanceof Error ? lastError.message : String(lastError);
      throw new Error(`Edge TTS failed for subtitle segment ${segment.id}: ${reason}`);
    }
    clipPaths.push(clipPath);
    timedClips.push({
      id: segment.id,
      start: segment.start,
      end: segment.end,
      duration: synthesized.duration,
    });
  }

  ensureNotCancelled(options.signal);
  onProgress("Synchronizing speech timeline", 75);
  const voicePath = path.join(outDir, "voice.wav");
  const timelineArgs = clipPaths.flatMap((clipPath) => ["-i", clipPath]);
  await runFfmpeg([
    "-y",
    ...timelineArgs,
    "-filter_complex",
    buildVoiceTimelineFilter(timedClips, video.duration),
    "-map",
    "[voice]",
    "-c:a",
    "pcm_s16le",
    "-ar",
    "48000",
    "-ac",
    "2",
    voicePath,
  ], { signal: options.signal });
  await verifyAudibleAudio(voicePath, "Timed AI voice track");

  ensureNotCancelled(options.signal);
  onProgress(
    options.mode === "replace-vocals"
      ? "Mixing AI voice with preserved music and sound effects"
      : "Replacing the entire original audio track",
    80,
  );
  const mixedPath = path.join(outDir, "mixed.wav");
  if (options.mode === "replace-vocals") {
    if (!separation) throw new Error("Demucs separation did not produce an accompaniment track.");
    await runFfmpeg([
      "-y",
      "-i",
      separation.accompanimentPath,
      "-i",
      voicePath,
      "-filter_complex",
      buildSeparatedAudioMixFilter(
        options.backgroundVolume,
        options.voiceVolume,
        video.duration,
      ),
      "-map",
      "[mixed]",
      "-c:a",
      "pcm_s16le",
      "-ar",
      "48000",
      "-ac",
      "2",
      mixedPath,
    ], { signal: options.signal });
  } else {
    await runFfmpeg([
      "-y",
      "-i",
      voicePath,
      "-filter_complex",
      buildVoiceOnlyMixFilter(options.voiceVolume, video.duration),
      "-map",
      "[mixed]",
      "-c:a",
      "pcm_s16le",
      "-ar",
      "48000",
      "-ac",
      "2",
      mixedPath,
    ], { signal: options.signal });
  }
  await verifyAudibleAudio(mixedPath, "Final dubbing audio track");
  onProgress("Audio ready", 84);
  return { voicePath, mixedPath, clipPaths, separation };
}

import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";

export type VideoMetadata = {
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  videoCodec: string;
  audioCodec: string | null;
};

export type SubtitleStyle = {
  fontFamily?: string;
  fontSize?: number;
  alignment?: number;
  marginV?: number;
  primaryColour?: string;
  outlineColour?: string;
  backgroundColour?: string;
  outline?: number;
  shadow?: number;
};

export type BurnSubtitleOptions = {
  inputVideo: string;
  subtitleFile: string;
  outputVideo: string;
  hardwareAcceleration?: "auto" | "nvenc" | "software";
  style?: SubtitleStyle;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
};

type ProcessResult = { stdout: string; stderr: string };

async function ensureFile(file: string) {
  await fs.access(file);
}

function runProcess(
  command: string,
  args: string[],
  options: { signal?: AbortSignal; onStderr?: (value: string) => void } = {},
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const abort = () => child.kill("SIGTERM");
    options.signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => {
      const value = chunk.toString();
      stderr += value;
      options.onStderr?.(value);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      options.signal?.removeEventListener("abort", abort);
      if (options.signal?.aborted) reject(new DOMException("Operation cancelled", "AbortError"));
      else if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || `${command} exited with code ${code}`));
    });
  });
}

function parseRate(value?: string) {
  if (!value) return 0;
  const [numerator, denominator = 1] = value.split("/").map(Number);
  return denominator ? numerator / denominator : 0;
}

export async function probeVideo(inputVideo: string): Promise<VideoMetadata> {
  await ensureFile(inputVideo);
  const { stdout } = await runProcess("ffprobe", [
    "-v", "error", "-show_streams", "-show_format", "-of", "json", inputVideo,
  ]);
  const value = JSON.parse(stdout) as {
    streams?: Array<Record<string, string | number>>;
    format?: { duration?: string };
  };
  const video = value.streams?.find((stream) => stream.codec_type === "video");
  const audio = value.streams?.find((stream) => stream.codec_type === "audio");
  if (!video) throw new Error("Video stream not found.");
  return {
    duration: Number(value.format?.duration ?? video.duration ?? 0),
    width: Number(video.width ?? 0),
    height: Number(video.height ?? 0),
    frameRate: parseRate(String(video.avg_frame_rate ?? video.r_frame_rate ?? "0")),
    videoCodec: String(video.codec_name ?? "unknown"),
    audioCodec: audio ? String(audio.codec_name ?? "unknown") : null,
  };
}

export async function generateThumbnail(inputVideo: string, output: string, time = 0) {
  await ensureFile(inputVideo);
  await runProcess("ffmpeg", ["-y", "-ss", String(Math.max(0, time)), "-i", inputVideo, "-frames:v", "1", "-q:v", "2", output]);
}

export async function generateWaveform(inputVideo: string, output: string) {
  await ensureFile(inputVideo);
  await runProcess("ffmpeg", ["-y", "-i", inputVideo, "-filter_complex", "showwavespic=s=1600x240:colors=6366f1", "-frames:v", "1", output]);
}

export async function hasNvenc() {
  try {
    const { stdout } = await runProcess("ffmpeg", ["-hide_banner", "-encoders"]);
    return stdout.includes("h264_nvenc");
  } catch {
    return false;
  }
}

function escapeSubtitlePath(file: string) {
  return path.resolve(file).replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function styleFilter(style?: SubtitleStyle) {
  if (!style) return "";
  const values: string[] = [];
  if (style.fontFamily) values.push(`FontName=${style.fontFamily.replace(/[,']/g, "")}`);
  if (style.fontSize) values.push(`FontSize=${Math.max(8, Math.min(120, style.fontSize))}`);
  if (style.alignment) values.push(`Alignment=${style.alignment}`);
  if (style.marginV !== undefined) values.push(`MarginV=${Math.max(0, style.marginV)}`);
  if (style.primaryColour) values.push(`PrimaryColour=${style.primaryColour}`);
  if (style.outlineColour) values.push(`OutlineColour=${style.outlineColour}`);
  if (style.backgroundColour) values.push(`BackColour=${style.backgroundColour}`);
  if (style.outline !== undefined) values.push(`Outline=${Math.max(0, style.outline)}`);
  if (style.shadow !== undefined) values.push(`Shadow=${Math.max(0, style.shadow)}`);
  return values.length ? `:force_style='${values.join(",")}'` : "";
}

async function encode(options: BurnSubtitleOptions, encoder: "h264_nvenc" | "libx264", duration: number) {
  const filter = `subtitles='${escapeSubtitlePath(options.subtitleFile)}'${styleFilter(options.style)}`;
  const codecArgs = encoder === "h264_nvenc"
    ? ["-c:v", encoder, "-preset", "p4", "-cq", "23"]
    : ["-c:v", encoder, "-preset", "veryfast", "-crf", "23"];
  let buffered = "";
  await runProcess("ffmpeg", [
    "-y", "-i", options.inputVideo, "-vf", filter, ...codecArgs,
    "-c:a", "aac", "-b:a", "192k", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-progress", "pipe:2", "-nostats", options.outputVideo,
  ], {
    signal: options.signal,
    onStderr(value) {
      buffered += value;
      const matches = [...buffered.matchAll(/out_time_ms=(\d+)/g)];
      const last = matches.at(-1);
      if (last && duration > 0) options.onProgress?.(Math.min(100, Number(last[1]) / 10_000 / duration));
      if (buffered.length > 20_000) buffered = buffered.slice(-5_000);
    },
  });
}

export async function burnSubtitle(options: BurnSubtitleOptions): Promise<void> {
  await Promise.all([ensureFile(options.inputVideo), ensureFile(options.subtitleFile)]);
  const duration = (await probeVideo(options.inputVideo)).duration;
  const mode = options.hardwareAcceleration ?? "auto";
  const useNvenc = mode !== "software" && (await hasNvenc());
  if (mode === "nvenc" && !useNvenc) throw new Error("NVENC is not available. Select software encoding or install an NVIDIA-enabled FFmpeg build.");
  if (useNvenc) {
    try {
      await encode(options, "h264_nvenc", duration);
      return;
    } catch (error) {
      if (mode === "nvenc" || options.signal?.aborted) throw error;
      await fs.rm(options.outputVideo, { force: true });
    }
  }
  await encode(options, "libx264", duration);
}

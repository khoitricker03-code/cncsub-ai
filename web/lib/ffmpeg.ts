import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";

export type BurnSubtitleOptions = {
  inputVideo: string;
  subtitleFile: string;
  outputVideo: string;
};

async function ensureFile(file: string) {
  await fs.access(file);
}

function escapeSubtitlePath(file: string) {
  const normalized = path
    .resolve(file)
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");

  return normalized;
}

export async function burnSubtitle({
  inputVideo,
  subtitleFile,
  outputVideo,
}: BurnSubtitleOptions): Promise<void> {
  await ensureFile(inputVideo);
  await ensureFile(subtitleFile);

  const subtitleFilter = `subtitles='${escapeSubtitlePath(
    subtitleFile
  )}'`;

  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-y",

        "-i",
        inputVideo,

        "-vf",
        subtitleFilter,

        "-c:v",
        "libx264",

        "-preset",
        "veryfast",

        "-crf",
        "23",

        "-c:a",
"aac",

"-b:a",
"192k",

"-pix_fmt",
"yuv420p",

"-movflags",
"+faststart",
        outputVideo,
      ],
      {
        windowsHide: true,
      }
    );

    let stderr = "";

    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on("error", (error) => {
      reject(error);
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            stderr || `FFmpeg exited with code ${code}`
          )
        );
      }
    });
  });
}
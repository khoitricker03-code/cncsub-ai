import { promises as fs } from "fs";
import path from "path";

import type { SubtitleSegment } from "./whisper";

function projectRoot(projectId: string) {
  return path.join(
    process.cwd(),
    "storage",
    "projects",
    projectId,
  );
}

export async function saveInputVideo(
  projectId: string,
  buffer: Buffer,
  filename = "input.mp4",
) {
  const mediaDir = path.join(
    projectRoot(projectId),
    "media",
  );

  await fs.mkdir(mediaDir, {
    recursive: true,
  });

  const videoPath = path.join(
    mediaDir,
    filename,
  );

  await fs.writeFile(videoPath, buffer);

  return videoPath;
}

export async function saveTranscript(
  projectId: string,
  text: string,
  srt: string,
  segments: SubtitleSegment[],
) {
  const transcriptDir = path.join(
    projectRoot(projectId),
    "transcript",
  );

  await fs.mkdir(transcriptDir, {
    recursive: true,
  });

  await fs.writeFile(
    path.join(transcriptDir, "subtitle.srt"),
    srt,
    "utf8",
  );

  await fs.writeFile(
    path.join(transcriptDir, "transcript.txt"),
    text,
    "utf8",
  );

  await fs.writeFile(
    path.join(transcriptDir, "segments.json"),
    JSON.stringify(segments, null, 2),
    "utf8",
  );
}
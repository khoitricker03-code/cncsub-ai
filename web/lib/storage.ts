import { promises as fs } from "fs";
import path from "path";

import type { SubtitleSegment } from "./whisper";
import {
  getProject,
  isValidProjectId,
  type ProjectRecord,
} from "./projects";

export type ProjectWorkspace = {
  project: ProjectRecord;
  subtitle: string;
  transcript: string;
  segments: SubtitleSegment[];
};

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

function isSubtitleSegment(value: unknown): value is SubtitleSegment {
  if (!value || typeof value !== "object") {
    return false;
  }

  const segment = value as Record<string, unknown>;

  return (
    typeof segment.id === "number" &&
    typeof segment.start === "number" &&
    typeof segment.end === "number" &&
    typeof segment.text === "string"
  );
}

export async function loadProjectWorkspace(
  projectId: string,
): Promise<ProjectWorkspace | null> {
  if (!isValidProjectId(projectId)) {
    return null;
  }

  const project = await getProject(projectId);

  if (!project) {
    return null;
  }

  const transcriptDir = path.join(
    projectRoot(projectId),
    "transcript",
  );

  const [subtitle, transcript, segmentsContent] = await Promise.all([
    fs.readFile(path.join(transcriptDir, "subtitle.srt"), "utf8"),
    fs.readFile(path.join(transcriptDir, "transcript.txt"), "utf8"),
    fs.readFile(path.join(transcriptDir, "segments.json"), "utf8"),
  ]);

  const parsedSegments: unknown = JSON.parse(segmentsContent);

  if (
    !Array.isArray(parsedSegments) ||
    !parsedSegments.every(isSubtitleSegment)
  ) {
    throw new Error("segments.json không hợp lệ.");
  }

  return {
    project,
    subtitle,
    transcript,
    segments: parsedSegments,
  };
}

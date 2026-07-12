import { promises as fs } from "fs";
import path from "path";

import {
  buildSrt,
  buildTranscript,
  isSubtitleSegment,
  validateSegments,
  type SubtitleSegment,
} from "./subtitles";
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

export async function saveEditedSubtitles(
  projectId: string,
  segments: SubtitleSegment[],
): Promise<{ subtitle: string; transcript: string }> {
  if (!isValidProjectId(projectId) || !(await getProject(projectId))) {
    throw new Error("Project không tồn tại.");
  }

  const validationError = validateSegments(segments);

  if (validationError) {
    throw new Error(validationError);
  }

  const subtitle = buildSrt(segments);
  const transcript = buildTranscript(segments);
  const transcriptDir = path.join(projectRoot(projectId), "transcript");
  const suffix = `.tmp-${process.pid}-${Date.now()}`;
  const files = [
    {
      path: path.join(transcriptDir, "segments.json"),
      content: JSON.stringify(segments, null, 2),
    },
    { path: path.join(transcriptDir, "subtitle.srt"), content: subtitle },
    { path: path.join(transcriptDir, "transcript.txt"), content: transcript },
  ];

  await Promise.all(
    files.map((file) => fs.writeFile(`${file.path}${suffix}`, file.content, "utf8")),
  );

  await Promise.all(
    files.map((file) => fs.rename(`${file.path}${suffix}`, file.path)),
  );

  return { subtitle, transcript };
}

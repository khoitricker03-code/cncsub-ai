import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { transcribeVideo } from "@/lib/whisper";
import { createProject, updateProject } from "@/lib/projects";
import {
  saveInputVideo,
  saveTranscript,
} from "@/lib/storage";
import { registerProject } from "@/lib/services/project-service";
import { isolateProjectStorage } from "@/lib/services/user-storage-service";
import {
  getCurrentSession,
  isDevelopmentAuthBypassEnabled,
} from "@/lib/services/auth-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
export async function POST(request: Request) {
  let tempVideoPath = "";

  try {
    const session = await getCurrentSession();
    const userId = session?.user.id;
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const formData = await request.formData();
    const video = formData.get("video");

    if (!(video instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "Bạn chưa chọn video.",
        },
        { status: 400 },
      );
    }

    if (video.size === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "File video rỗng.",
        },
        { status: 400 },
      );
    }

    if (video.size > MAX_VIDEO_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: "Video hiện tại phải nhỏ hơn 100 MB.",
        },
        { status: 413 },
      );
    }

    const originalExtension = path.extname(video.name);
    const safeExtension =
      originalExtension.replace(/[^a-zA-Z0-9.]/g, "") || ".mp4";

    const randomPart = Math.random().toString(36).slice(2);

    tempVideoPath = path.join(
      os.tmpdir(),
      `cncsub-${Date.now()}-${randomPart}${safeExtension}`,
    );

    const videoBuffer = Buffer.from(await video.arrayBuffer());
    const project = await createProject(video.name);
    if (!isDevelopmentAuthBypassEnabled()) {
      await isolateProjectStorage(userId, project.id);
      await registerProject(userId, {
        id: project.id,
        name: project.name,
        status: project.status,
        sourceFilename: video.name,
      });
    }


const projectVideoPath =
  await saveInputVideo(
    project.id,
    videoBuffer,
  );
    const pythonScript = path.join(
      process.cwd(),
      "scripts",
      "transcribe.py",
    );

    await fs.access(pythonScript);

   const result = await transcribeVideo(projectVideoPath);

const segments = result.segments;

    if (segments.length === 0) {
      throw new Error(
        "Không tạo được phụ đề. Video có thể không có tiếng nói.",
      );
    }

    const baseName =
      path.parse(video.name).name.replace(/[^\p{L}\p{N}_-]+/gu, "-") ||
      "subtitle";
      
      const projectRoot = path.join(
  process.cwd(),
  "storage",
  "projects",
  project.id,
);

const transcriptDir = path.join(
  projectRoot,
  "transcript",
);
await saveTranscript(
  project.id,
  result.text,
  result.srt,
  segments,
);

    await updateProject(project.id, (current) => ({
      ...current,
      status: "ready",
      media: {
        sourceFilename: video.name,
        sourcePath: path.relative(process.cwd(), projectVideoPath),
      },
      transcript: {
        language: result.language ?? "unknown",
        textPath: path.relative(
          process.cwd(),
          path.join(transcriptDir, "transcript.txt"),
        ),
        subtitlePath: path.relative(
          process.cwd(),
          path.join(transcriptDir, "subtitle.srt"),
        ),
        segmentsPath: path.relative(
          process.cwd(),
          path.join(transcriptDir, "segments.json"),
        ),
      },
    }));
    return NextResponse.json({
      success: true,
      projectId: project.id,
      filename: `${baseName}.srt`,
      textFilename: `${baseName}.txt`,
      language: result.language ?? "unknown",
      languageProbability: result.languageProbability,
      text: result.text ?? "",
      srt: result.srt ?? "",
      segments,
    });
  } catch (error) {
    logger.error("transcribe.failed", error);

    const message =
      error instanceof Error
        ? error.message
        : "Không thể tạo phụ đề.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  } finally {
    if (tempVideoPath) {
      await fs.unlink(tempVideoPath).catch(() => undefined);
    }
  }
}

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";

import { burnSubtitle } from "@/lib/ffmpeg";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_VIDEO_SIZE = 500 * 1024 * 1024;

type BurnResponse = {
  success: boolean;
  error?: string;
};
async function saveUploadedFile(
  file: File,
  outputPath: string,
): Promise<void> {
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
}

async function removeFile(filePath: string) {
  try {
    await fs.unlink(filePath);
  } catch {
    // bỏ qua nếu file không tồn tại
  }
}
function createJobPaths(videoName: string) {
  const jobId = `burn-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

  const workDir = path.join(os.tmpdir(), jobId);

  const extension =
    path.extname(videoName).toLowerCase() || ".mp4";

  return {
    workDir,
    inputVideo: path.join(workDir, `input${extension}`),
    subtitleFile: path.join(workDir, "subtitle.srt"),
    outputVideo: path.join(workDir, "output.mp4"),
  };
}
export async function POST(request: Request) {
  let workDir = "";

  try {
    const formData = await request.formData();

    const video = formData.get("video");
    const subtitle = formData.get("subtitle");
    const hardwareAcceleration = formData.get("hardwareAcceleration");
    const styleValue = formData.get("style");

    if (!(video instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "Thiếu video.",
        } satisfies BurnResponse,
        { status: 400 },
      );
    }

    if (!(subtitle instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "Thiếu file SRT.",
        } satisfies BurnResponse,
        { status: 400 },
      );
    }

    if (video.size > MAX_VIDEO_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: "Video quá lớn.",
        } satisfies BurnResponse,
        { status: 413 },
      );
    }

    const paths = createJobPaths(video.name);

    workDir = paths.workDir;

    await fs.mkdir(workDir, {
      recursive: true,
    });

    await saveUploadedFile(
      video,
      paths.inputVideo,
    );

    await saveUploadedFile(
      subtitle,
      paths.subtitleFile,
    );

    await burnSubtitle({
      inputVideo: paths.inputVideo,
      subtitleFile: paths.subtitleFile,
      outputVideo: paths.outputVideo,
      hardwareAcceleration:
        hardwareAcceleration === "nvenc" || hardwareAcceleration === "software"
          ? hardwareAcceleration
          : "auto",
      style:
        typeof styleValue === "string" && styleValue
          ? (JSON.parse(styleValue) as Record<string, string | number>)
          : undefined,
      signal: request.signal,
    });

    const output = await fs.readFile(
      paths.outputVideo,
    );

    return new NextResponse(output, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition":
          'attachment; filename="video_final.mp4"',
      },
    });
      } catch (error) {
    logger.error("burn.failed", error);

    const message =
      error instanceof Error
        ? error.message
        : "Không thể burn phụ đề.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      } satisfies BurnResponse,
      {
        status: 500,
      },
    );
  } finally {
    if (workDir) {
      await removeFile(path.join(workDir, "input.mp4"));
      await removeFile(path.join(workDir, "subtitle.srt"));
      await removeFile(path.join(workDir, "output.mp4"));

      try {
        await fs.rmdir(workDir);
      } catch {
        // ignore
      }
    }
  }
}

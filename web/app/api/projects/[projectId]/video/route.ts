import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { NextResponse } from "next/server";

import { getProjectVideoPath } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const videoPath = await getProjectVideoPath(projectId);

    if (!videoPath) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy video của project." },
        { status: 404 },
      );
    }

    const file = await stat(videoPath);
    const range = request.headers.get("range");

    if (!range) {
      const stream = Readable.toWeb(createReadStream(videoPath));
      return new Response(stream as ReadableStream, {
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": String(file.size),
          "Content-Type": "video/mp4",
        },
      });
    }

    const match = /^bytes=(\d+)-(\d*)$/.exec(range);

    if (!match) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${file.size}` },
      });
    }

    const start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : file.size - 1;
    const end = Math.min(requestedEnd, file.size - 1);

    if (start >= file.size || start > end) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${file.size}` },
      });
    }

    const stream = Readable.toWeb(createReadStream(videoPath, { start, end }));

    return new Response(stream as ReadableStream, {
      status: 206,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${file.size}`,
        "Content-Type": "video/mp4",
      },
    });
  } catch (error) {
    console.error("Project video stream error:", error);
    return NextResponse.json(
      { success: false, error: "Không thể tải video của project." },
      { status: 500 },
    );
  }
}

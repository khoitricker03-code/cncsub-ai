import { NextResponse } from "next/server";

import { updateProject } from "@/lib/projects";
import { isSubtitleSegment, validateSegments } from "@/lib/subtitles";
import {
  loadProjectWorkspace,
  saveEditedSubtitles,
  saveTranslatedSubtitles,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    const { projectId } = await context.params;
    const workspace = await loadProjectWorkspace(projectId);

    if (!workspace) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy project." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, ...workspace });
  } catch (error) {
    console.error("Open project error:", error);

    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";

    return NextResponse.json(
      {
        success: false,
        error:
          code === "ENOENT"
            ? "Project chưa có đủ dữ liệu phụ đề."
            : error instanceof Error
              ? error.message
              : "Không thể mở project.",
      },
      { status: code === "ENOENT" ? 409 : 500 },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const body: unknown = await request.json();
    const segments =
      body && typeof body === "object" && "segments" in body
        ? (body as { segments: unknown }).segments
        : null;

    if (!Array.isArray(segments) || !segments.every(isSubtitleSegment)) {
      return NextResponse.json(
        { success: false, error: "Danh sách phụ đề không hợp lệ." },
        { status: 400 },
      );
    }

    const validationError = validateSegments(segments);

    if (validationError) {
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 422 },
      );
    }

    const track = new URL(request.url).searchParams.get("track");
    const targetLanguage = new URL(request.url).searchParams.get("language") ?? "unknown";
    const saved =
      track === "translation"
        ? await saveTranslatedSubtitles(projectId, targetLanguage, segments)
        : await saveEditedSubtitles(projectId, segments);
    const project = await updateProject(projectId, (current) => current);

    return NextResponse.json({
      success: true,
      savedAt: project.updatedAt,
      ...saved,
    });
  } catch (error) {
    console.error("Save subtitle editor error:", error);

    const message =
      error instanceof SyntaxError
        ? "Dữ liệu JSON không hợp lệ."
        : error instanceof Error
          ? error.message
          : "Không thể lưu phụ đề.";

    return NextResponse.json(
      { success: false, error: message },
      { status: message === "Project không tồn tại." ? 404 : 500 },
    );
  }
}

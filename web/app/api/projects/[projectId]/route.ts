import { NextResponse } from "next/server";

import { loadProjectWorkspace } from "@/lib/storage";

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

import { NextResponse } from "next/server";

import { getProject } from "@/lib/projects";
import { isRewriteMode } from "@/lib/rewrite";
import { rewriteWithCache } from "@/lib/rewrite-cache";
import { isSubtitleSegment } from "@/lib/subtitles";
import { getProjectRoot } from "@/lib/storage";
import { authorizeProject } from "@/lib/services/access-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    if (!(await authorizeProject(projectId))) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const body: unknown = await request.json();
    const mode =
      body && typeof body === "object" && "mode" in body
        ? String(body.mode)
        : "";
    const segments =
      body && typeof body === "object" && "segments" in body
        ? body.segments
        : null;
    const root = getProjectRoot(projectId);

    if (
      !isRewriteMode(mode) ||
      !Array.isArray(segments) ||
      !segments.every(isSubtitleSegment)
    ) {
      return NextResponse.json(
        { success: false, error: "Yêu cầu rewrite không hợp lệ." },
        { status: 400 },
      );
    }

    if (!root || !(await getProject(projectId))) {
      return NextResponse.json(
        { success: false, error: "Project không tồn tại." },
        { status: 404 },
      );
    }

    const rewritten = await rewriteWithCache(
      root,
      mode,
      segments,
      request.signal,
    );
    return NextResponse.json({ success: true, segments: rewritten });
  } catch (error) {
    console.error("Rewrite error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Không thể rewrite.",
      },
      { status: 500 },
    );
  }
}

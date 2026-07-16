import { NextResponse } from "next/server";

import { getProject } from "@/lib/projects";
import { isSubtitleSegment, validateSegments } from "@/lib/subtitles";
import { getTranslationLanguage } from "@/lib/translation/languages";
import { translateBatchWithCache } from "@/lib/translation/cache";
import {
  getProjectRoot,
  loadProjectWorkspace,
  saveTranslatedSubtitles,
} from "@/lib/storage";
import { authorizeProject } from "@/lib/services/access-service";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

function parseBody(body: unknown) {
  if (!body || typeof body !== "object") return null;

  const { sourceLanguage, targetLanguage, segments } = body as Record<
    string,
    unknown
  >;

  if (
    typeof targetLanguage !== "string" ||
    !getTranslationLanguage(targetLanguage) ||
    (segments !== undefined &&
      (!Array.isArray(segments) || !segments.every(isSubtitleSegment)))
  ) {
    return null;
  }

  return {
    sourceLanguage:
      typeof sourceLanguage === "string" ? sourceLanguage : "auto",
    targetLanguage,
    segments: Array.isArray(segments) ? segments : undefined,
  };
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    if (!(await authorizeProject(projectId))) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }

    const parsed = parseBody(await request.json());
    const root = getProjectRoot(projectId);

    if (!parsed) {
      return NextResponse.json(
        { success: false, error: "Yêu cầu dịch không hợp lệ." },
        { status: 400 },
      );
    }

    if (!root || !(await getProject(projectId))) {
      return NextResponse.json(
        { success: false, error: "Project không tồn tại." },
        { status: 404 },
      );
    }

    const workspace = parsed.segments
      ? null
      : await loadProjectWorkspace(projectId);
    const sourceSegments = parsed.segments ?? workspace?.segments;

    if (!sourceSegments?.length) {
      return NextResponse.json(
        { success: false, error: "Project chưa có phụ đề gốc." },
        { status: 409 },
      );
    }

    const language = getTranslationLanguage(parsed.targetLanguage);
    const segments = await translateBatchWithCache(
      root,
      language?.name ?? parsed.targetLanguage,
      sourceSegments,
      request.signal,
      parsed.sourceLanguage,
    );

    await saveTranslatedSubtitles(projectId, parsed.targetLanguage, segments);

    return NextResponse.json({ success: true, segments });
  } catch (error) {
    logger.error("translation.failed", error);

    const message =
      error instanceof Error ? error.message : "Không thể dịch phụ đề.";
    const clientError =
      error instanceof Error &&
      /(Kết quả dịch không giữ nguyên cấu trúc phụ đề|JSON hợp lệ|Ollama)/i.test(
        error.message,
      );

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: clientError ? 502 : 500 },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    if (!(await authorizeProject(projectId))) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }

    const parsed = parseBody(await request.json());
    if (!parsed?.segments) {
      return NextResponse.json(
        { success: false, error: "Bản dịch không hợp lệ." },
        { status: 400 },
      );
    }

    const validationError = validateSegments(parsed.segments);
    if (validationError) {
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 422 },
      );
    }

    await saveTranslatedSubtitles(
      projectId,
      parsed.targetLanguage,
      parsed.segments,
    );

    return NextResponse.json({ success: true, segments: parsed.segments });
  } catch (error) {
    logger.error("translation.save_failed", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Không thể lưu bản dịch.",
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";

import { listUserProjects } from "@/lib/services/project-service";
import { getCurrentUserId, isDevelopmentAuthBypassEnabled } from "@/lib/services/auth-context";
import { listProjects } from "@/lib/projects";

export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));

  if (isDevelopmentAuthBypassEnabled()) {
    const pageSize = 10;
    const filtered = (await listProjects()).filter((project) =>
      project.name.toLowerCase().includes(search.toLowerCase()),
    );
    return NextResponse.json({
      success: true,
      projects: filtered.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
    });
  }

  const result = await listUserProjects(userId, {
    search,
    page,
  });
  return NextResponse.json({ success: true, ...result });
}
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { listUserProjects } from "@/lib/services/project-service";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const result = await listUserProjects(session.user.id, {
    search: url.searchParams.get("search") ?? "",
    page: Number(url.searchParams.get("page") ?? 1),
  });
  return NextResponse.json({ success: true, ...result });
}

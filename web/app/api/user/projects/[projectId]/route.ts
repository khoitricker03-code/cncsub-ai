import { NextResponse } from "next/server";

import { deleteOwnedProject, renameOwnedProject } from "@/lib/services/project-service";
import { deleteProject, updateProject } from "@/lib/projects";
import { getCurrentUserId, isDevelopmentAuthBypassEnabled } from "@/lib/services/auth-context";

type Context = { params: Promise<{ projectId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params;
  const body = (await request.json()) as { name?: string };
  if (!body.name?.trim()) return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  const project = isDevelopmentAuthBypassEnabled()
    ? await updateProject(projectId, (current) => ({ ...current, name: body.name!.trim().slice(0, 120) }))
    : await renameOwnedProject(userId, projectId, body.name);
  return project
    ? NextResponse.json({ success: true, project })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(_request: Request, { params }: Context) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params;
  const deleted = isDevelopmentAuthBypassEnabled()
    ? await deleteProject(projectId)
    : await deleteOwnedProject(userId, projectId);
  return deleted
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
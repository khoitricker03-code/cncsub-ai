import { NextResponse } from "next/server";

import { deleteOwnedProject, renameOwnedProject } from "@/lib/services/project-service";
import { deleteProject, duplicateProject, restoreProject, updateProject } from "@/lib/projects";
import { getCurrentSession, isDevelopmentAuthBypassEnabled } from "@/lib/services/auth-context";

type Context = { params: Promise<{ projectId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const session = await getCurrentSession();
  const userId = session?.user.id;
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
  const session = await getCurrentSession();
  const userId = session?.user.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params;
  const deleted = isDevelopmentAuthBypassEnabled()
    ? await deleteProject(projectId)
    : await deleteOwnedProject(userId, projectId);
  return deleted
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(request: Request, { params }: Context) {
  const session = await getCurrentSession();
  if (!session?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isDevelopmentAuthBypassEnabled()) return NextResponse.json({ error: "Local project action only" }, { status: 400 });
  const { projectId } = await params;
  const body = (await request.json()) as { action?: "duplicate" | "restore" };
  const project = body.action === "restore" ? await restoreProject(projectId) : await duplicateProject(projectId);
  return project ? NextResponse.json({ success: true, project }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

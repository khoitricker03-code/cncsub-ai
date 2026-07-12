import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { deleteOwnedProject, renameOwnedProject } from "@/lib/services/project-service";

type Context = { params: Promise<{ projectId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params;
  const body = (await request.json()) as { name?: string };
  if (!body.name?.trim()) return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  const project = await renameOwnedProject(session.user.id, projectId, body.name);
  return project
    ? NextResponse.json({ success: true, project })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(_request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params;
  return (await deleteOwnedProject(session.user.id, projectId))
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { jobQueue } from "@/lib/queue/database-queue";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const job = await prisma.job.findFirst({ where: { id: jobId, userId: session.user.id } });
  return job ? NextResponse.json({ success: true, job }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const body = (await request.json()) as { action?: "cancel" | "retry" };
  const result = body.action === "retry"
    ? await jobQueue.retry(session.user.id, jobId)
    : await jobQueue.cancel(session.user.id, jobId);
  return result ? NextResponse.json({ success: true, result }) : NextResponse.json({ error: "Action rejected" }, { status: 409 });
}

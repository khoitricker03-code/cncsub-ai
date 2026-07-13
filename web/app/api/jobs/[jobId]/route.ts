import { NextResponse } from "next/server";

import { jobQueue } from "@/lib/queue/database-queue";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/services/auth-context";

type Context = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const session = await getCurrentSession();
  const userId = session?.user.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const job = await prisma.job.findFirst({ where: { id: jobId, userId } });
  return job ? NextResponse.json({ success: true, job }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Context) {
  const session = await getCurrentSession();
  const userId = session?.user.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const body = (await request.json()) as { action?: "cancel" | "retry" };
  const result = body.action === "retry"
    ? await jobQueue.retry(userId, jobId)
    : await jobQueue.cancel(userId, jobId);
  return result ? NextResponse.json({ success: true, result }) : NextResponse.json({ error: "Action rejected" }, { status: 409 });
}

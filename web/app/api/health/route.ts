import { NextResponse } from "next/server";
import { validateStartup } from "@/lib/startup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await validateStartup();
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}

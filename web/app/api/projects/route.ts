import { NextResponse } from "next/server";

import { createProject, listProjects } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const projects = await listProjects();

    return NextResponse.json({
      success: true,
      projects,
    });
  } catch (error) {
    console.error("List projects error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Không thể tải danh sách dự án.",
      },
      {
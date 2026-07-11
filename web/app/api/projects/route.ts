import { NextResponse } from "next/server";

import {
  createProject,
  listProjects,
} from "@/lib/projects";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

type CreateProjectBody = {
  name?: string;
};

export async function GET() {
  try {
    const projects = await listProjects();

    return NextResponse.json({
      success: true,
      projects,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: "Không thể lấy danh sách project.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(
  request: Request,
) {
  try {
    const body =
      (await request.json()) as CreateProjectBody;

    const project =
      await createProject(body.name);
          return NextResponse.json(
      {
        success: true,
        project,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error(error);

    const message =
      error instanceof Error
        ? error.message
        : "Không thể tạo project.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}
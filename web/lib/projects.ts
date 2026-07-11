import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

export type ProjectStatus =
  | "created"
  | "transcribing"
  | "ready"
  | "rendering"
  | "completed"
  | "failed";

export type ProjectRecord = {
  id: string;
  name: string;

  status: ProjectStatus;

  createdAt: string;
  updatedAt: string;

  media: {
    sourceFilename: string | null;
    sourcePath: string | null;
  };

  transcript: {
    language: string | null;
    textPath: string | null;
    subtitlePath: string | null;
    segmentsPath: string | null;
  };

  render: {
    outputPath: string | null;
  };
};

const STORAGE_ROOT = path.join(
  process.cwd(),
  "storage",
  "projects",
);

function sanitizeProjectName(
  name: string,
): string {
  const cleaned = name
    .trim()
    .replace(/\s+/g, " ");

  return (
    cleaned.slice(0, 120) ||
    "Dự án chưa đặt tên"
  );
}

function projectDirectory(
  projectId: string,
) {
  return path.join(
    STORAGE_ROOT,
    projectId,
  );
}

function projectFile(
  projectId: string,
) {
  return path.join(
    projectDirectory(projectId),
    "project.json",
  );
}
export async function ensureProjectStorage(): Promise<void> {
  await fs.mkdir(STORAGE_ROOT, {
    recursive: true,
  });
}

export async function createProject(
  name?: string,
): Promise<ProjectRecord> {
  await ensureProjectStorage();

  const id = randomUUID();

  const now = new Date().toISOString();

  const root = projectDirectory(id);

  await Promise.all([
    fs.mkdir(path.join(root, "media"), {
      recursive: true,
    }),

    fs.mkdir(path.join(root, "transcript"), {
      recursive: true,
    }),

    fs.mkdir(path.join(root, "render"), {
      recursive: true,
    }),

    fs.mkdir(path.join(root, "history"), {
      recursive: true,
    }),
  ]);

  const project: ProjectRecord = {
    id,

    name: sanitizeProjectName(name ?? ""),

    status: "created",

    createdAt: now,
    updatedAt: now,

    media: {
      sourceFilename: null,
      sourcePath: null,
    },

    transcript: {
      language: null,
      textPath: null,
      subtitlePath: null,
      segmentsPath: null,
    },

    render: {
      outputPath: null,
    },
  };

  await fs.writeFile(
    projectFile(id),
    JSON.stringify(project, null, 2),
    "utf8",
  );

  return project;
}
export async function getProject(
  projectId: string,
): Promise<ProjectRecord | null> {
  try {
    const content = await fs.readFile(
      projectFile(projectId),
      "utf8",
    );

    return JSON.parse(
      content,
    ) as ProjectRecord;
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error
        ? String(error.code)
        : "";

    if (code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function listProjects(): Promise<
  ProjectRecord[]
> {
  await ensureProjectStorage();

  const entries = await fs.readdir(
    STORAGE_ROOT,
    {
      withFileTypes: true,
    },
  );

  const projects = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        getProject(entry.name),
      ),
  );

  return projects
    .filter(
      (
        project,
      ): project is ProjectRecord =>
        project !== null,
    )
    .sort((a, b) =>
      b.updatedAt.localeCompare(
        a.updatedAt,
      ),
    );
}
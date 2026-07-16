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
  trashedAt?: string | null;

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
const TRASH_ROOT = path.join(process.cwd(), "storage", "trash");

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

export function isValidProjectId(projectId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    projectId,
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
  if (!isValidProjectId(projectId)) {
    return null;
  }

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

export async function updateProject(
  projectId: string,
  update: (project: ProjectRecord) => ProjectRecord,
): Promise<ProjectRecord> {
  const current = await getProject(projectId);

  if (!current) {
    throw new Error("Project không tồn tại.");
  }

  const next = {
    ...update(current),
    id: current.id,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(
    projectFile(projectId),
    JSON.stringify(next, null, 2),
    "utf8",
  );

  return next;
}

export async function deleteProject(projectId: string): Promise<boolean> {
  if (!isValidProjectId(projectId)) {
    return false;
  }

  try {
    await fs.mkdir(TRASH_ROOT, { recursive: true });
    const project = await getProject(projectId);
    if (!project) return false;
    await fs.writeFile(projectFile(projectId), JSON.stringify({ ...project, trashedAt: new Date().toISOString() }, null, 2), "utf8");
    await fs.rename(projectDirectory(projectId), path.join(TRASH_ROOT, projectId));
    return true;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code === "ENOENT") return false;
    throw error;
  }
}

export async function restoreProject(projectId: string): Promise<ProjectRecord | null> {
  if (!isValidProjectId(projectId)) return null;
  const source = path.join(TRASH_ROOT, projectId);
  try {
    await fs.rename(source, projectDirectory(projectId));
    return updateProject(projectId, (project) => ({ ...project, trashedAt: null }));
  } catch { return null; }
}

export async function duplicateProject(projectId: string): Promise<ProjectRecord | null> {
  const source = await getProject(projectId);
  if (!source) return null;
  const duplicate = await createProject(`${source.name} (copy)`);
  await fs.rm(projectDirectory(duplicate.id), { recursive: true });
  await fs.cp(projectDirectory(projectId), projectDirectory(duplicate.id), { recursive: true });
  const now = new Date().toISOString();
  const next = { ...source, id: duplicate.id, name: duplicate.name, createdAt: now, updatedAt: now, trashedAt: null };
  await fs.writeFile(projectFile(duplicate.id), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function emptyProjectTrash(retentionDays = 30): Promise<number> {
  try {
    const entries = await fs.readdir(TRASH_ROOT, { withFileTypes: true });
    const cutoff = Date.now() - retentionDays * 86_400_000;
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const stats = await fs.stat(path.join(TRASH_ROOT, entry.name));
      if (stats.mtimeMs < cutoff) { await fs.rm(path.join(TRASH_ROOT, entry.name), { recursive: true }); removed += 1; }
    }
    return removed;
  } catch { return 0; }
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

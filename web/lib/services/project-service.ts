import { prisma } from "@/lib/prisma";
import { removeUserProjectStorage } from "./user-storage-service";

export async function listUserProjects(
  userId: string,
  options: { search?: string; page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 10));
  const where = {
    userId,
    ...(options.search
      ? { name: { contains: options.search.slice(0, 120), mode: "insensitive" as const } }
      : {}),
  };
  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.project.count({ where }),
  ]);

  return { projects, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function requireOwnedProject(userId: string, projectId: string) {
  return prisma.project.findFirst({ where: { id: projectId, userId } });
}

export async function registerProject(
  userId: string,
  project: { id: string; name: string; status: string; sourceFilename?: string | null },
) {
  return prisma.project.create({
    data: {
      id: project.id,
      userId,
      name: project.name,
      status: project.status,
      sourceFilename: project.sourceFilename,
      storageKey: `users/${userId}/projects/${project.id}`,
    },
  });
}

export async function renameOwnedProject(userId: string, projectId: string, name: string) {
  const owned = await requireOwnedProject(userId, projectId);
  if (!owned) return null;
  return prisma.project.update({ where: { id: projectId }, data: { name: name.trim().slice(0, 120) } });
}

export async function deleteOwnedProject(userId: string, projectId: string) {
  const owned = await requireOwnedProject(userId, projectId);
  if (!owned) return false;
  await prisma.project.delete({ where: { id: projectId } });
  await removeUserProjectStorage(userId, projectId);
  return true;
}

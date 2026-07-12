import { promises as fs } from "fs";
import path from "path";

export function userProjectStorageRoot(userId: string, projectId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(userId) || !/^[a-f0-9-]+$/i.test(projectId)) {
    throw new Error("Invalid storage identity");
  }
  return path.join(process.cwd(), "storage", "users", userId, "projects", projectId);
}

export async function isolateProjectStorage(userId: string, projectId: string) {
  const legacy = path.join(process.cwd(), "storage", "projects", projectId);
  const owned = userProjectStorageRoot(userId, projectId);
  await fs.mkdir(path.dirname(owned), { recursive: true });
  await fs.rename(legacy, owned);
  const relativeTarget = path.relative(path.dirname(legacy), owned);
  await fs.symlink(relativeTarget, legacy, "dir");
  return owned;
}

export async function removeUserProjectStorage(userId: string, projectId: string) {
  const owned = userProjectStorageRoot(userId, projectId);
  const legacy = path.join(process.cwd(), "storage", "projects", projectId);
  await Promise.all([
    fs.rm(owned, { recursive: true, force: true }),
    fs.unlink(legacy).catch(() => undefined),
  ]);
}

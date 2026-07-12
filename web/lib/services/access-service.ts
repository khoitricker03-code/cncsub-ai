import { auth } from "@/auth";
import { requireOwnedProject } from "./project-service";

export async function authorizeProject(projectId: string) {
  const session = await auth();
  if (!session?.user.id) return null;
  const project = await requireOwnedProject(session.user.id, projectId);
  return project ? { userId: session.user.id, project } : null;
}

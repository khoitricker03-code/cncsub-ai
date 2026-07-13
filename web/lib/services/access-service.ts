import {
  DEVELOPMENT_USER_ID,
  getCurrentUserId,
  isDevelopmentAuthBypassEnabled,
} from "./auth-context";
import { requireOwnedProject } from "./project-service";

export async function authorizeProject(projectId: string) {
  if (isDevelopmentAuthBypassEnabled()) {
    return {
      userId: DEVELOPMENT_USER_ID,
      project: { id: projectId, userId: DEVELOPMENT_USER_ID },
    };
  }

  const userId = await getCurrentUserId();
  if (!userId) return null;
  const project = await requireOwnedProject(userId, projectId);
  return project ? { userId, project } : null;
}
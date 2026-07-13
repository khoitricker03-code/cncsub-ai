import { auth } from "@/auth";
import { isDevelopmentAuthBypassEnabled } from "./auth-flags";

export const DEVELOPMENT_USER_ID = "local-development-user";

export async function getCurrentUserId(): Promise<string | null> {
  if (isDevelopmentAuthBypassEnabled()) {
    return DEVELOPMENT_USER_ID;
  }

  const session = await auth();
  return session?.user.id ?? null;
}

export { isDevelopmentAuthBypassEnabled } from "./auth-flags";
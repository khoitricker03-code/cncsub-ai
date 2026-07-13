import { isDevelopmentAuthBypassEnabled } from "./auth-flags";

export const DEVELOPMENT_USER_ID = "local-dev-user";

export async function getCurrentSession() {
  if (isDevelopmentAuthBypassEnabled()) {
    return {
      user: {
        id: DEVELOPMENT_USER_ID,
        name: "Local developer",
        email: null,
        image: null,
      },
    };
  }

  const { auth } = await import("@/auth");
  return auth();
}

export async function getCurrentUserId(): Promise<string | null> {
  const session = await getCurrentSession();
  return session?.user.id ?? null;
}

export { isDevelopmentAuthBypassEnabled } from "./auth-flags";

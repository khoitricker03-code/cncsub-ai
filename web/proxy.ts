import {
  NextResponse,
  type NextFetchEvent,
  type NextMiddleware,
  type NextRequest,
} from "next/server";

import { isDevelopmentAuthBypassEnabled } from "@/lib/services/auth-flags";

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (isDevelopmentAuthBypassEnabled()) {
    return NextResponse.next();
  }

  const { auth } = await import("@/auth");
  const allowAuthenticatedRequest: NextMiddleware = () => NextResponse.next();
  const authenticatedProxy = auth(allowAuthenticatedRequest);
  return authenticatedProxy(request, event);
}

export const config = {
  matcher: ["/((?!api/auth|login|register|_next/static|_next/image|favicon.ico).*)"],
};

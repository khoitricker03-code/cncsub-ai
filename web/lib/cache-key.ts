import { createHash } from "crypto";

export function createContentCacheKey(
  namespace: string,
  content: string,
): string {
  return createHash("sha256")
    .update(namespace)
    .update("\0")
    .update(content)
    .digest("hex");
}

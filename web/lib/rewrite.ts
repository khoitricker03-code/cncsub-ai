export const REWRITE_MODES = [
  "natural",
  "tiktok",
  "youtube",
  "netflix",
  "formal",
  "short",
  "long",
  "casual",
] as const;

export type RewriteMode = (typeof REWRITE_MODES)[number];

export type RewriteInput = {
  id: number;
  text: string;
};

export interface RewriteEngine {
  readonly provider: string;
  rewrite(
    text: string,
    mode: RewriteMode,
    signal?: AbortSignal,
  ): Promise<string>;
  batchRewrite(
    segments: RewriteInput[],
    mode: RewriteMode,
    signal?: AbortSignal,
  ): Promise<RewriteInput[]>;
}

export function isRewriteMode(value: string): value is RewriteMode {
  return (REWRITE_MODES as readonly string[]).includes(value);
}

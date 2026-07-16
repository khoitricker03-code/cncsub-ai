export type LogContext = Record<string, string | number | boolean | null | undefined>;

function write(level: "info" | "warn" | "error", event: string, context: LogContext = {}, error?: unknown) {
  const record = {
    timestamp: new Date().toISOString(), level, event, ...context,
    ...(error instanceof Error ? { error: error.message, errorType: error.name } : {}),
  };
  const output = JSON.stringify(record);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.info(output);
}

export const logger = {
  info: (event: string, context?: LogContext) => write("info", event, context),
  warn: (event: string, context?: LogContext) => write("warn", event, context),
  error: (event: string, error: unknown, context?: LogContext) => write("error", event, context, error),
};

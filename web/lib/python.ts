export type PythonComponent = "whisper" | "demucs" | "tts" | "diagnostics";

export function getPythonExecutable(): string {
  return process.env.PYTHON_PATH || "python";
}

export function logPythonExecutable(
  component: PythonComponent,
  executable = getPythonExecutable(),
  context: Record<string, unknown> = {},
): void {
  console.info(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "info",
    event: "python.execution",
    component,
    executable,
    ...context,
  }));
}

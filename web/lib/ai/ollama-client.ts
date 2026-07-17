const DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1";
const DEFAULT_MODEL = "qwen2.5:7b";
const RETRY_DELAYS_MS = [300, 900, 2_700] as const;

type OllamaModelsResponse = {
  data?: Array<{ id?: string; name?: string }>;
};

type OllamaChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

export type OllamaHealth = {
  ok: boolean;
  baseURL: string;
  model: string;
  models: string[];
  error?: string;
};

export type OllamaClientOptions = {
  baseURL?: string;
  model?: string;
  apiKey?: string;
  retryDelaysMs?: readonly number[];
};

export type OllamaChatOptions = {
  system: string;
  user: string;
  temperature: number;
  signal?: AbortSignal;
  diagnostics?: "translation";
};

function normalizeBaseURL(value: string): string {
  return value.replace(/\/+$/, "");
}

function isTemporaryStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function wait(delay: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }

    const timeout = setTimeout(resolve, delay);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function offlineMessage(baseURL: string): string {
  return `Không kết nối được Ollama tại ${baseURL}. Hãy mở Ollama rồi thử lại.`;
}

class OllamaHttpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaHttpError";
  }
}

function getOllamaErrorDetail(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "";

  let detail = trimmed;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const nestedError = record.error;
      const candidate =
        typeof nestedError === "string"
          ? nestedError
          : nestedError && typeof nestedError === "object"
            ? (nestedError as Record<string, unknown>).message
            : record.message ?? record.detail;

      if (typeof candidate === "string" && candidate.trim()) {
        detail = candidate;
      }
    }
  } catch {
    // Plain-text Ollama errors are useful diagnostics too.
  }

  const normalized = detail.replace(/\s+/g, " ").trim();
  return normalized.length > 1_000
    ? `${normalized.slice(0, 1_000)}…`
    : normalized;
}

function ollamaHttpError(status: number, content: string): OllamaHttpError {
  const detail = getOllamaErrorDetail(content);
  return new OllamaHttpError(
    `Ollama trả về HTTP ${status}${detail ? `: ${detail}` : ""}.`,
  );
}

function writeTranslationDiagnostic(
  enabled: boolean,
  level: "info" | "error",
  event: string,
  context: Record<string, unknown>,
): void {
  if (!enabled) return;

  const output = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
  });

  if (level === "error") console.error(output);
  else console.info(output);
}

function errorDiagnostic(error: unknown): {
  error: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      error: error.message,
      stack: error.stack,
    };
  }

  return { error: String(error) };
}

function stripMarkdownFences(content: string): string {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    ?? content.match(/~~~(?:json)?\s*([\s\S]*?)\s*~~~/i);

  return fencedMatch ? fencedMatch[1].trim() : content;
}

function extractJsonString(content: string): string | null {
  const normalized = stripMarkdownFences(content).trim();

  try {
    JSON.parse(normalized);
    return normalized;
  } catch {
    const start = normalized.search(/[\[{]/);
    if (start === -1) {
      return null;
    }

    const stack: string[] = [];
    for (let index = start; index < normalized.length; index += 1) {
      const char = normalized[index];

      if (char === "{" || char === "[") {
        stack.push(char);
      } else if (char === "}" || char === "]") {
        const last = stack[stack.length - 1];
        if (
          (char === "}" && last === "{") ||
          (char === "]" && last === "[")
        ) {
          stack.pop();
          if (stack.length === 0) {
            return normalized.slice(start, index + 1).trim();
          }
        }
      }
    }

    return null;
  }
}

function normalizeOllamaResponseContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.join("");
  }

  return String(content ?? "");
}

export function getLocalAIConfig(): {
  baseURL: string;
  model: string;
  apiKey: string;
} {
  return {
    baseURL: normalizeBaseURL(
      process.env.LOCAL_BASE_URL || DEFAULT_BASE_URL,
    ),
    model: DEFAULT_MODEL,
    apiKey: process.env.LOCAL_LLM_API_KEY || "ollama",
  };
}

export function getTranslationModel(): string {
  return (
    process.env.LOCAL_TRANSLATION_MODEL ||
    process.env.LOCAL_MODEL ||
    process.env.TRANSLATION_MODEL ||
    DEFAULT_MODEL
  );
}

export function getRewriteModel(): string {
  return (
    process.env.LOCAL_MODEL || process.env.REWRITE_MODEL || DEFAULT_MODEL
  );
}

export class OllamaClient {
  readonly baseURL: string;
  readonly model: string;
  private readonly apiKey: string;
  private readonly retryDelaysMs: readonly number[];

  constructor(options: OllamaClientOptions = {}) {
    const defaults = getLocalAIConfig();
    this.baseURL = normalizeBaseURL(options.baseURL || defaults.baseURL);
    this.model = options.model || defaults.model;
    this.apiKey = options.apiKey || defaults.apiKey;
    this.retryDelaysMs = options.retryDelaysMs ?? RETRY_DELAYS_MS;
  }

  async health(signal?: AbortSignal): Promise<OllamaHealth> {
    try {
      const response = await fetch(`${this.baseURL}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal,
        cache: "no-store",
      });

      if (!response.ok) {
        return {
          ok: false,
          baseURL: this.baseURL,
          model: this.model,
          models: [],
          error: `Ollama health check trả về HTTP ${response.status}.`,
        };
      }

      const body = (await response.json()) as OllamaModelsResponse;
      const models = (body.data ?? [])
        .map((item) => item.id ?? item.name)
        .filter((value): value is string => Boolean(value));
      const installed = models.includes(this.model);

      return {
        ok: installed,
        baseURL: this.baseURL,
        model: this.model,
        models,
        error: installed
          ? undefined
          : `Ollama chưa có model '${this.model}'. Chạy: ollama pull ${this.model}`,
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return {
        ok: false,
        baseURL: this.baseURL,
        model: this.model,
        models: [],
        error: offlineMessage(this.baseURL),
      };
    }
  }

  async chatJSON(options: OllamaChatOptions): Promise<unknown> {
    const health = await this.health(options.signal);

    if (!health.ok) {
      throw new Error(health.error ?? offlineMessage(this.baseURL));
    }

    const content = await this.requestWithRetry(options);
    const jsonString = extractJsonString(content);

    if (!jsonString) {
      throw new Error("Ollama trả về dữ liệu không phải JSON hợp lệ.");
    }

    try {
      return JSON.parse(jsonString) as unknown;
    } catch {
      throw new Error("Ollama trả về dữ liệu không phải JSON hợp lệ.");
    }
  }

  private async requestWithRetry(options: OllamaChatOptions): Promise<string> {
    let lastError: Error | null = null;
    const diagnostics = options.diagnostics === "translation";
    const url = `${this.baseURL}/chat/completions`;
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    const requestBody = {
      model: this.model,
      temperature: options.temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
    };
    const serializedBody = JSON.stringify(requestBody);

    for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt += 1) {
      writeTranslationDiagnostic(
        diagnostics,
        "info",
        "ollama.translation.request",
        {
          attempt: attempt + 1,
          method: "POST",
          url,
          headers: {
            Authorization: "[redacted]",
            "Content-Type": headers["Content-Type"],
          },
          body: requestBody,
        },
      );

      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: serializedBody,
          signal: options.signal,
          cache: "no-store",
        });
        const responseBody = await response.text();

        writeTranslationDiagnostic(
          diagnostics,
          "info",
          "ollama.translation.response",
          {
            attempt: attempt + 1,
            url,
            status: response.status,
            body: responseBody,
          },
        );

        if (!response.ok) {
          const modelMissing =
            response.status === 404 && /model|not found/i.test(responseBody);

          if (modelMissing) {
            throw new Error(
              `Ollama chưa có model '${this.model}'. Chạy: ollama pull ${this.model}`,
            );
          }

          const httpError = ollamaHttpError(response.status, responseBody);
          if (!isTemporaryStatus(response.status)) throw httpError;

          lastError = httpError;
        } else {
          const body = JSON.parse(responseBody) as OllamaChatResponse;
          const content = normalizeOllamaResponseContent(
            body.choices?.[0]?.message?.content,
          );

          if (!content.trim()) {
            throw new Error("Ollama không trả về nội dung.");
          }

          return content;
        }
      } catch (error) {
        if (options.signal?.aborted) throw error;
        writeTranslationDiagnostic(
          diagnostics,
          "error",
          "ollama.translation.exception",
          {
            attempt: attempt + 1,
            url,
            ...errorDiagnostic(error),
          },
        );
        if (
          error instanceof Error &&
          (error.message.includes("chưa có model") ||
            error instanceof OllamaHttpError)
        ) {
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      if (attempt < this.retryDelaysMs.length) {
        await wait(this.retryDelaysMs[attempt], options.signal);
      }
    }

    if (lastError instanceof OllamaHttpError) {
      writeTranslationDiagnostic(
        diagnostics,
        "error",
        "ollama.translation.exception",
        {
          attempt: this.retryDelaysMs.length + 1,
          url,
          ...errorDiagnostic(lastError),
        },
      );
      throw lastError;
    }

    throw new Error(
      `${offlineMessage(this.baseURL)}${lastError ? ` (${lastError.message})` : ""}`,
    );
  }
}

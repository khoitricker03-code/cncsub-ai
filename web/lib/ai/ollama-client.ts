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
};

export type OllamaChatOptions = {
  system: string;
  user: string;
  temperature: number;
  signal?: AbortSignal;
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

export function getLocalAIConfig(): Required<OllamaClientOptions> {
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

  constructor(options: OllamaClientOptions = {}) {
    const defaults = getLocalAIConfig();
    this.baseURL = normalizeBaseURL(options.baseURL || defaults.baseURL);
    this.model = options.model || defaults.model;
    this.apiKey = options.apiKey || defaults.apiKey;
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

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        const response = await fetch(`${this.baseURL}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            temperature: options.temperature,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: options.system },
              { role: "user", content: options.user },
            ],
          }),
          signal: options.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          const message = await response.text();
          const modelMissing =
            response.status === 404 && /model|not found/i.test(message);

          if (modelMissing) {
            throw new Error(
              `Ollama chưa có model '${this.model}'. Chạy: ollama pull ${this.model}`,
            );
          }

          if (!isTemporaryStatus(response.status)) {
            throw new Error(
              `Ollama trả về HTTP ${response.status}${message ? `: ${message}` : ""}.`,
            );
          }

          lastError = new Error(`Ollama tạm thời lỗi HTTP ${response.status}.`);
        } else {
          const body = (await response.json()) as OllamaChatResponse;
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
        if (
          error instanceof Error &&
          (error.message.includes("chưa có model") ||
            error.message.includes("trả về HTTP"))
        ) {
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      if (attempt < RETRY_DELAYS_MS.length) {
        await wait(RETRY_DELAYS_MS[attempt], options.signal);
      }
    }

    throw new Error(
      `${offlineMessage(this.baseURL)}${lastError ? ` (${lastError.message})` : ""}`,
    );
  }
}

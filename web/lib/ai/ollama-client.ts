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

export function parseOllamaJSON(content: string): unknown {
  const stripped = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(stripped) as unknown;
  } catch {
    // Qwen occasionally surrounds valid JSON with a short explanation. Find
    // the first balanced object/array without being confused by JSON strings.
  }

  for (let start = 0; start < stripped.length; start += 1) {
    if (stripped[start] !== "{" && stripped[start] !== "[") continue;
    const stack: string[] = [];
    let quoted = false;
    let escaped = false;
    for (let index = start; index < stripped.length; index += 1) {
      const character = stripped[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') { quoted = true; continue; }
      if (character === "{" || character === "[") stack.push(character);
      else if (character === "}" || character === "]") {
        const opening = stack.pop();
        if ((opening === "{" && character !== "}") || (opening === "[" && character !== "]")) break;
        if (stack.length === 0) {
          try { return JSON.parse(stripped.slice(start, index + 1)) as unknown; } catch { break; }
        }
      }
    }
  }
  throw new Error("Ollama trả về dữ liệu không phải JSON hợp lệ.");
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

    let parseError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const content = await this.requestWithRetry(
        attempt === 0
          ? options
          : {
              ...options,
              temperature: 0,
              system: `${options.system}\nYour previous response was invalid. Output exactly one JSON object, without markdown fences, commentary, or trailing text.`,
            },
      );
      try {
        return parseOllamaJSON(content);
      } catch (error) {
        parseError = error;
      }
    }
    throw parseError instanceof Error ? parseError : new Error("Ollama trả về JSON không hợp lệ.");
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
          const content = body.choices?.[0]?.message?.content;

          if (!content) {
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

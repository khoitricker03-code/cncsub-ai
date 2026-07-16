import { isValidTextTransform } from "../ai-validation";
import type { Translator, TranslationInput, TranslationOptions } from "./translator";

type Provider = "openai" | "gemini";

export class RemoteTranslator implements Translator {
  readonly model: string;
  constructor(readonly provider: Provider) {
    this.model = provider === "openai" ? process.env.OPENAI_TRANSLATION_MODEL || "gpt-4o-mini" : process.env.GEMINI_TRANSLATION_MODEL || "gemini-2.0-flash";
  }
  async translate(text: string, options: TranslationOptions) { return (await this.batchTranslate([{ id: 0, text }], options))[0].text; }
  async detectLanguage() { return "auto"; }
  async batchTranslate(segments: TranslationInput[], options: TranslationOptions) {
    const prompt = JSON.stringify({ instruction: "Translate subtitles. Return JSON only with segments preserving id, order and newline count.", sourceLanguage: options.sourceLanguage || "auto", targetLanguage: options.targetLanguage, segments });
    let content = "";
    if (this.provider === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error("OPENAI_API_KEY chưa được cấu hình.");
      const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: this.model, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }), signal: options.signal });
      if (!response.ok) throw new Error(`OpenAI translation failed: HTTP ${response.status}`);
      const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      content = body.choices?.[0]?.message?.content || "";
    } else {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error("GEMINI_API_KEY chưa được cấu hình.");
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }), signal: options.signal });
      if (!response.ok) throw new Error(`Gemini translation failed: HTTP ${response.status}`);
      const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      content = body.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }
    const parsed = JSON.parse(content) as { segments?: unknown };
    if (!isValidTextTransform(segments, parsed.segments)) throw new Error("Kết quả dịch không giữ nguyên cấu trúc phụ đề.");
    return parsed.segments as TranslationInput[];
  }
}

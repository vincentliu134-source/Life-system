import { fetchAi } from "./ai-network";

export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";

export class GeminiRequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function isGeminiRegionError(error: unknown): boolean {
  return error instanceof GeminiRequestError && /location is not supported|unsupported.*location|not available in your (country|region)/i.test(error.message);
}

export function aiFailureMessage(error: unknown): string {
  if (isGeminiRegionError(error)) return "Google 已收到请求，但当前网络出口地区不支持 Gemini API。这不代表 Key 无效，请使用受支持地区的网络出口后重试。（User location is not supported for the API use）";
  if (error instanceof GeminiRequestError) return error.message;
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "Gemini 请求超时，请确认代理连接后重试。";
  if (error instanceof SyntaxError) return "Gemini 返回内容为空、被截断或格式不完整，请重试。";
  return "本机服务无法连接 Gemini。这不代表 Key 无效，请检查系统代理是否开启后重试。";
}

interface GenerateOptions {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  maxOutputTokens: number;
  temperature?: number;
  json?: boolean;
}

type GeminiPayload = {
  error?: { code?: number; message?: string };
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
};

export async function generateGemini(token: string, options: GenerateOptions, signal: AbortSignal): Promise<{ content: string; model: string }> {
  const system = options.messages.filter(message => message.role === "system").map(message => ({ text: message.content }));
  const body = JSON.stringify({
    ...(system.length ? { systemInstruction: { parts: system } } : {}),
    contents: options.messages.filter(message => message.role !== "system").map(message => ({
      role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }],
    })),
    generationConfig: {
      maxOutputTokens: options.maxOutputTokens,
      thinkingConfig: { thinkingLevel: "minimal" },
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
      ...(options.json ? { responseMimeType: "application/json" } : {}),
    },
  });
  const models = [...new Set([GEMINI_MODEL, GEMINI_FALLBACK_MODEL])];
  for (let index = 0; index < models.length; index++) {
    const model = models[index];
    const response = await fetchAi(`${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": token },
      body,
    });
    const payload: GeminiPayload = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Credentials and permission errors must remain visible to the user.
      if ([404, 429, 503].includes(response.status) && index < models.length - 1) continue;
      const detail = typeof payload.error?.message === "string" ? payload.error.message.split(token).join("[已隐藏]").slice(0, 500) : "请稍后重试";
      throw new GeminiRequestError(response.status, `Gemini 请求失败（HTTP ${response.status}，${model}）：${detail}`);
    }
    const candidate = payload.candidates?.[0];
    const content = candidate?.content?.parts?.filter(part => !part.thought).map(part => part.text || "").join("").trim();
    if (candidate?.finishReason === "MAX_TOKENS" || !content) throw new SyntaxError("模型未返回完整内容");
    return { content, model };
  }
  throw new Error("没有可用模型");
}

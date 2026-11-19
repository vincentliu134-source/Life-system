import { generateGemini, GeminiRequestError, aiFailureMessage, isGeminiRegionError } from "@/lib/ai-config";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body.token || "").trim();
    if (!token || !/^[\x21-\x7E]+$/.test(token)) {
      return NextResponse.json({ valid: false, status: "invalid", error: "请填写正确的 Gemini API Key。" }, { status: 400 });
    }
    try {
      const result = await generateGemini(token, {
        messages: [{ role: "user", content: "只回复 OK。" }],
        maxOutputTokens: 256,
      }, AbortSignal.timeout(20000));
      return NextResponse.json({ valid: true, modelUsed: result.model });
    } catch (error) {
      const busy = error instanceof GeminiRequestError && [429, 503].includes(error.status);
      const invalid = error instanceof GeminiRequestError && [400, 401, 403].includes(error.status);
      return NextResponse.json({
        valid: false,
        status: isGeminiRegionError(error) ? "region_unavailable" : busy ? "busy" : invalid ? "invalid" : "unavailable",
        error: aiFailureMessage(error),
      });
    }
  } catch {
    return NextResponse.json({ valid: false, error: "验证请求格式错误，请重试。" }, { status: 400 });
  }
}

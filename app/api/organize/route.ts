import { NextResponse } from "next/server";
import { createId } from "@/lib/id";
import { organizeInput } from "@/lib/organizer";
import { updateState } from "@/lib/store";

export async function POST(request: Request) {
  try {
  const body = await request.json();
  const input = String(body.input || "").trim();
  const token = request.headers.get("x-gemini-api-key")?.trim() || undefined;
  const dimensionPriorityOrder = Array.isArray(body.dimension_priority_order) ? body.dimension_priority_order : undefined;
  if (!input) return NextResponse.json({ error: "请输入要整理的事项" }, { status: 400 });

  const result = await organizeInput(input, token, dimensionPriorityOrder);
  await updateState((state) => {
    state.ai_logs.unshift({
      id: createId("log"),
      input,
      output: result.tasks,
      mode: result.mode,
      created_at: new Date().toISOString(),
    });
  });

  return NextResponse.json(result);

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { suggestGoal } from "@/lib/goal-breakdown";
import { readState } from "@/lib/store";

export async function POST(request: Request) {
  try {
  const body = await request.json();
  const input = String(body.input || "").trim();
  const token = request.headers.get("x-gemini-api-key")?.trim() || undefined;

  if (!input) {
    return NextResponse.json({ error: "请输入目标" }, { status: 400 });
  }

  const state = await readState();
  return NextResponse.json(await suggestGoal(input, token, state));

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { clarifyInboxItemSmart } from "@/lib/clarify";
import { readState, updateState } from "@/lib/store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
  const { id } = await context.params;
  const current = await readState();
  const item = current.inbox_items.find((entry) => entry.id === id);
  if (!item) return NextResponse.json({ error: "未找到收集箱内容" }, { status: 404 });

  const token = request.headers.get("x-gemini-api-key")?.trim() || undefined;
  const result = await clarifyInboxItemSmart(item.content, current, token);

  const state = await updateState((current) => {
    const item = current.inbox_items.find((entry) => entry.id === id);
    if (!item) return;
    const clarification = result.clarification;
    item.clarified_type = clarification.clarified_type;
    item.dimension_primary = clarification.dimension_primary;
    item.scheduled_date = clarification.scheduled_date;
    item.scheduled_time = clarification.scheduled_time;
    item.next_action = clarification.next_action;
    item.goal_id = clarification.goal_id;
    item.project_id = clarification.project_id;
    item.relation_type = clarification.relation_type;
  });

  return NextResponse.json({ clarification: result.clarification, mode: result.mode, error: result.error, state });

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { createId } from "@/lib/id";
import { updateState } from "@/lib/store";
import type { InboxItem } from "@/lib/types";

export async function POST(request: Request) {
  try {
  const body = await request.json();
  const content = String(body.content || "").trim();

  if (!content) {
    return NextResponse.json({ error: "请输入内容" }, { status: 400 });
  }

  const item: InboxItem = {
    id: createId("inbox"),
    content,
    status: "未处理",
    clarified_type: null,
    dimension_primary: null,
    scheduled_date: null,
    scheduled_time: null,
    next_action: null,
    created_at: new Date().toISOString(),
    archived_at: null,
  };

  const state = await updateState((current) => {
    current.inbox_items.unshift(item);
  });

  return NextResponse.json(state);

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

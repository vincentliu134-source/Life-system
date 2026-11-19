import { NextResponse } from "next/server";
import { createId } from "@/lib/id";
import { updateState } from "@/lib/store";
import type { DraftTask, Task } from "@/lib/types";
import { validateFields } from "@/lib/validation";

export async function POST(request: Request) {
  try {
  const body = await request.json();
  const drafts = (Array.isArray(body.tasks) ? body.tasks : [body]) as DraftTask[];
  if (drafts.length > 100) throw new Error("一次最多新增100项任务");
  for (const draft of drafts) { validateFields(draft); if (!draft.title?.trim()) throw new Error("任务标题不能为空"); }
  const createdAt = new Date().toISOString();

  const tasks: Task[] = drafts.map((draft) => ({
    ...draft,
    description: draft.description || "",
    date: draft.date || "",
    estimated_minutes: draft.estimated_minutes || 0,
    due_date: draft.due_date || null,
    due_time: draft.due_time || null,
    dimension_primary: draft.dimension_primary || "心智",
    priority: draft.priority || "B",
    type: draft.type || "临时任务",
    goal_id: draft.goal_id || null,
    project_id: draft.project_id || null,
    habit_id: draft.habit_id || null,
    is_habit: Boolean(draft.is_habit),
    is_must_today: Boolean(draft.is_must_today),
    id: createId("task"),
    status: "未开始",
    result_note: "",
    checklist: Array.isArray((draft as unknown as { checklist?: unknown }).checklist)
      ? (draft as unknown as { checklist: Task["checklist"] }).checklist
      : [],
    source: draft.source || "manual",
    origin: draft.origin || (draft.goal_id || draft.project_id || draft.source === "calendar" || draft.source === "goal_week" || draft.source === "planned" || draft.due_time ? "planned" : "ad_hoc"),
    created_at: createdAt,
    completed_at: null,
    postponed_count: 0,
    is_focus: false,
    focus_order: null,
  }));

  const state = await updateState((current) => {
    current.tasks.unshift(...tasks);
  });

  return NextResponse.json({ tasks, state });

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

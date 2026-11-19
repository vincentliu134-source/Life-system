import { NextResponse } from "next/server";
import { todayKey } from "@/lib/date";
import { updateState } from "@/lib/store";
import { createId } from "@/lib/id";
import type { TaskChecklistItem, TaskStatus } from "@/lib/types";
import { validateFields } from "@/lib/validation";
import { rememberPlan } from "@/lib/workspace";
import { reconcileCompletedLegacyActions } from "@/lib/legacy-split-actions";

function checklistTemplateFromTask(value: unknown): TaskChecklistItem[] {
  if (!Array.isArray(value)) return [];
  const checklist: TaskChecklistItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const text = String((item as { text?: unknown }).text || "").trim();
    if (!text) continue;
    checklist.push({
      id: createId("check"),
      text,
      done: false,
      result_note: "",
      carry_status: "none",
      carried_to_task_id: null,
      carried_to_date: null,
    });
  }
  return checklist;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
  const { id } = await context.params;
  const updates = await request.json();
  validateFields(updates);
  if (updates.status && !["未开始", "进行中", "等待反馈", "完成", "延期", "取消", "跳过", "未记录"].includes(updates.status)) return NextResponse.json({ message: "任务状态无效" }, { status: 400 });
  const state = await updateState((current) => {
    const task = current.tasks.find((item) => item.id === id);
    if (!task) throw new Error("任务不存在，请刷新后重试");
    if (["跳过", "未记录"].includes(updates.status) && !task.is_habit && task.source !== "habit") throw new Error("只有习惯可以标记跳过或未记录");
    if (updates.status === "等待反馈" && task.is_habit) throw new Error("习惯不使用等待反馈状态");

    if (updates.status) {
      const status = updates.status as TaskStatus;
      if (task.date && task.date < todayKey() && task.status !== status) rememberPlan(task);
      task.status = status;
      const completedAt = typeof updates.completed_at === "string" ? updates.completed_at : null;
      task.completed_at = status === "完成" ? completedAt || new Date().toISOString() : null;
      if (status === "延期") {
        const targetDate = updates.date || updates.due_date || todayKey(new Date(Date.now() + 86400000));
        task.postponed_count = (task.postponed_count || 0) + 1;
        task.postponed_at = new Date().toISOString();
        task.postponed_from_date = task.date || todayKey();
        task.date = targetDate;
        task.is_must_today = false;
        task.is_focus = false;
        task.focus_order = null;
        task.status = "未开始";
      }
      if (status === "取消" || status === "跳过" || status === "未记录") {
        task.is_focus = false;
        task.focus_order = null;
      }
    }

    for (const key of [
      "title",
      "description",
      "dimension_primary",
      "dimension_secondary",
      "type",
      "priority",
      "is_must_today",
      "due_date",
      "due_time",
      "scheduled_end_time",
      "reminder_time",
      "estimated_minutes",
      "result_note",
      "checklist",
      "date",
      "project_id",
      "goal_id",
      "is_focus",
      "focus_order",
    ]) {
      if (key in updates && !(key === "due_date" && updates.status === "延期")) {
        (task as unknown as Record<string, unknown>)[key] = updates[key];
      }
    }
    if ("priority" in updates) task.priority_source = "user";

    if (task.is_habit && task.habit_id && "checklist" in updates) {
      const habit = current.habits.find((item) => item.id === task.habit_id);
      if (habit) habit.checklist_template = checklistTemplateFromTask(task.checklist);
    }
    if (updates.status === "完成") reconcileCompletedLegacyActions(current.tasks);
  });
  return NextResponse.json(state);

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
  const { id } = await context.params;
  const state = await updateState((current) => {
    current.tasks = current.tasks.filter((task) => task.id !== id);
  });
  return NextResponse.json(state);

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

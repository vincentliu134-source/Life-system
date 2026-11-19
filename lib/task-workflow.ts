import { isHabit, isOpen } from "./planning";
import { recommendation } from "./recommend";
import type { AppState, Task } from "./types";

export function taskCategory(task: Task): "计划内" | "临时新增" {
  if (task.origin) return task.origin === "planned" ? "计划内" : "临时新增";
  return task.goal_id || task.project_id || task.source === "calendar" || task.due_time || task.calendar_sync_status === "pending" || task.source === "goal_week" || task.source === "planned"
    ? "计划内" : "临时新增";
}

export function sortDailyTasks(tasks: Task[], state: AppState): Task[] {
  return [...tasks].sort((a, b) => {
    // A saved manual position takes precedence over automatic importance.
    if (a.sort_order !== undefined || b.sort_order !== undefined) {
      const order = (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER);
      if (order) return order;
    }
    const completed = Number(a.status === "完成") - Number(b.status === "完成");
    if (completed) return completed;
    return recommendation(b, state).score - recommendation(a, state).score
      || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  });
}

export function rolloverOpenTasks(state: AppState, date: string, timestamp: string): void {
  for (const task of state.tasks) {
    if (isHabit(task) || !task.date || task.date >= date || (!isOpen(task) && task.status !== "延期")) continue;
    const from = task.date;
    task.rollovers = [...(task.rollovers || []), { from_date: from, to_date: date, created_at: timestamp, status: task.status }];
    task.date = date;
    if (task.status === "延期") task.status = "未开始";
    task.is_focus = false;
    task.focus_order = null;
  }
}

// Keep the pre-rollover state available to historical reviews.
export function taskAtDate(task: Task, date: string): Task | null {
  const previous = [...(task.plan_history || [])].reverse().find(item => item.date === date);
  if (previous) return { ...task, date, title: previous.title, status: previous.status, completed_at: null };
  if (task.date === date) return task;
  const rollover = task.rollovers?.find(item => item.from_date <= date && item.to_date > date);
  if (!rollover) return null;
  return { ...task, date, status: rollover.status, completed_at: null };
}

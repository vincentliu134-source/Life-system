import { dateBounds, todayKey } from "./date";
import type { AppState, Goal, Task } from "./types";

export const isHabit = (task: Task) => task.is_habit || task.source === "habit" || task.type === "习惯";
export const isOpen = (task: Task) => task.status === "未开始" || task.status === "进行中" || task.status === "等待反馈";
export const planDate = (task: Task) => task.date || "";
export function dailyCapacity(state: AppState, date = todayKey()) {
  const plan = state.daily_plans?.[date] ?? { available_minutes: 180, buffer_minutes: 60, focus_limit: 3 };
  const tasks = state.tasks.filter((task) => task.date === date && (isOpen(task) || task.status === "完成"));
  const scheduled = tasks.reduce((sum, task) => sum + (task.estimated_minutes || 0), 0);
  const unknown = tasks.filter((task) => !task.estimated_minutes).length;
  const budget = Math.max(0, plan.available_minutes - plan.buffer_minutes);
  return { ...plan, scheduled, unknown, budget, remaining: budget - scheduled, overloaded: scheduled > budget, configured: Boolean(state.daily_plans?.[date]) };
}

export function goalOutcomePercent(goal: Goal): number | null {
  const metric = goal.outcome;
  if (!metric || metric.target === metric.baseline) return null;
  return Math.max(0, Math.min(100, Math.round((metric.current - metric.baseline) / (metric.target - metric.baseline) * 100)));
}

export function habitSummary(state: AppState, habitId: string, date = todayKey()) {
  const week = dateBounds("week", new Date(`${date}T12:00:00`));
  const tasks = state.tasks.filter((task) => task.habit_id === habitId && task.date <= date);
  const recent = tasks.filter((task) => task.date >= week.start && task.date <= week.end);
  const completedDates = [...new Set(tasks.filter((task) => task.status === "完成").map((task) => task.date))].sort();
  const last = completedDates.at(-1);
  const prior = completedDates.at(-2);
  const resumed = Boolean(last && prior && tasks.some((task) => task.date > prior && task.date < last && task.status !== "完成"));
  return { completed: new Set(recent.filter((task) => task.status === "完成").map((task) => task.date)).size, skipped: recent.filter((task) => task.status === "跳过").length, unrecorded: recent.filter((task) => task.status === "未记录" || (task.date < date && isOpen(task))).length, resumed, last };
}

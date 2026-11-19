import { dateBounds, todayKey } from "./date";
import { dailyCapacity, isHabit, isOpen } from "./planning";
import type { AppState, Task } from "./types";

export function recommendation(task: Task, state: AppState) {
  const goal = state.goals.find((item) => item.id === task.goal_id);
  const rank = state.dimension_priority_order.indexOf(task.dimension_primary);
  let score = task.priority === "A" ? 60 : task.priority === "B" ? 35 : 10;
  score += rank < 0 ? 0 : (6 - rank) * 4;
  const reasons = [`${task.priority_source === "user" ? "你设定的" : "系统判断的"}${task.priority}级`, `${task.dimension_primary}在维度排序中第${rank + 1}位`];
  if (goal?.cycle_focus === "本周期重点") { score += 40; reasons.push(`推进本周期重点「${goal.title}」`); }
  else if (goal?.cycle_focus === "以后再说") { score -= 50; reasons.push("目标暂缓，可考虑放回候选池"); }
  else if (goal) { score += 20; reasons.push(`推进「${goal.title}」`); }
  if (task.due_date && task.due_date <= todayKey()) { score += 45; reasons.push(`真实截止日期 ${task.due_date}`); }
  if (task.is_must_today) { score += 25; reasons.push("今天必须处理"); }
  reasons.push(task.estimated_minutes ? `预计${task.estimated_minutes}分钟` : "时长待估，容量尚不能确认");
  if (task.postponed_count >= 2) reasons.push("反复延期：检查动作是否明确、是否等待外部条件，或停止这件事");
  return { score, reason: reasons.join("；") };
}

export function buildStats(state: AppState) {
  const today = todayKey();
  const week = dateBounds("week");
  const counted = state.tasks.filter((task) => !isHabit(task) && (isOpen(task) || task.status === "完成"));
  const todayTasks = counted.filter((task) => task.date === today);
  const weekTasks = counted.filter((task) => task.date >= week.start && task.date <= week.end);
  const completedToday = todayTasks.filter((task) => task.status === "完成").length;
  const completedWeek = weekTasks.filter((task) => task.status === "完成").length;
  return { today_total: todayTasks.length, today_completed: completedToday, today_rate: todayTasks.length ? Math.round(completedToday / todayTasks.length * 100) : 0, week_total: weekTasks.length, week_completed: completedWeek, week_rate: weekTasks.length ? Math.round(completedWeek / weekTasks.length * 100) : 0 };
}

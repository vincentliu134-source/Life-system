import { isHabit, isOpen } from "./planning";
import { sortDailyTasks } from "./task-workflow";
import { createId } from "./id";
import type { AppState, Dimension, Goal, Task, TaskChecklistItem } from "./types";

export type GoalAction = { key: string; title: string; checklist?: TaskChecklistItem[]; task?: Task };
export const goalIsActive = (goal: Goal) => ["未开始", "进行中"].includes(goal.status) && goal.cycle_focus !== "以后再说";
export const goalStatusLabel = (goal: Goal) => goal.status === "完成" ? "已完成" : goal.status === "放弃" ? "已放弃" : goal.status === "暂停" || goal.cycle_focus === "以后再说" ? "暂缓" : "推进中";

export function legacyGoalActions(goal: Goal): GoalAction[] {
  try {
    const raw = JSON.parse(goal.ai_breakdown || "{}");
    if (!Array.isArray(raw.current_week_tasks)) return [];
    return raw.current_week_tasks.flatMap((action: { id?: string; title?: string; status?: string; checklist?: TaskChecklistItem[] }, index: number) =>
      typeof action.title === "string" && action.title.trim() && action.status !== "完成"
        ? [{ key: `legacy:${action.id || `legacy_${index}`}`, title: action.title.trim(), checklist: action.checklist }] : []);
  } catch { return []; }
}

export function goalNextAction(goal: Goal, state: AppState): string {
  if (typeof goal.next_action === "string") return goal.next_action;
  if (goal.outcome?.next_action) return goal.outcome.next_action;
  const linked = sortDailyTasks(state.tasks.filter(task => task.goal_id === goal.id && !isHabit(task) && isOpen(task)), state);
  const legacy = legacyGoalActions(goal).find(action => !state.tasks.some(task => task.goal_id === goal.id && task.status === "完成" && (task.week_task_id === action.key.slice(7) || task.title === action.title)));
  return linked[0]?.next_action || linked[0]?.title || legacy?.title || "";
}

export function goalLatestProgress(goal: Goal, state: AppState): { content: string; date: string } | null {
  const records = state.tasks.filter(task => task.goal_id === goal.id).flatMap(task => [
    ...(task.progress_logs || []).map(entry => ({ content: entry.content, date: entry.created_at })),
    ...(task.result_note ? [{ content: task.result_note, date: task.completed_at || task.created_at }] : []),
  ]);
  if (goal.outcome?.evidence) records.push({ content: goal.outcome.evidence, date: goal.outcome.updated_at || goal.updated_at || goal.created_at });
  return records.sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

export function goalActions(goal: Goal, state: AppState): GoalAction[] {
  const next = goalNextAction(goal, state).trim();
  const actions: GoalAction[] = next ? [{ key: "next", title: next }] : [];
  for (const action of legacyGoalActions(goal)) if (!actions.some(item => item.title === action.title)) actions.push(action);
  return actions.flatMap(action => {
    const task = state.tasks.find(task => task.goal_id === goal.id && task.status !== "取消" && (
      (action.key === "next" && task.id === goal.next_action_task_id && task.title === action.title)
      || (action.key !== "next" && (task.week_task_id === action.key.slice(7) || !task.week_task_id && task.title === action.title))
      || (isOpen(task) && task.title === action.title)
    ));
    return task?.status === "完成" ? [] : [{ ...action, task }];
  });
}

export function scheduleGoalAction(state: AppState, goal: Goal, key: string, date: string, expectedTitle?: string): Task {
  if (!goalIsActive(goal)) throw new Error("请先将目标设为继续推进，再安排下一步");
  const action = goalActions(goal, state).find(item => item.key === key);
  if (!action) throw new Error("这一步已完成或发生变化，请刷新后补充下一步");
  if (expectedTitle !== undefined && action.title !== expectedTitle) throw new Error("下一步已修改，请刷新后重新确认");
  let task = action.task;
  if (task) {
    task.date = date;
  } else {
    const priority = state.preferences.goal_task_priority === "always_a" ? "A" : state.preferences.goal_task_priority === "always_b" ? "B" : state.dimension_priority_order.indexOf(goal.dimension_primary) < 2 ? "A" : "B";
    task = {
      id: createId("task"), title: action.title, description: `来自目标：${goal.title}`, date,
      dimension_primary: goal.dimension_primary, dimension_secondary: null, type: "项目任务", priority,
      priority_source: "system", status: "未开始", goal_id: goal.id, project_id: null, habit_id: null,
      is_habit: false, is_must_today: false, due_date: null, due_time: null, reminder_time: null,
      calendar_sync_status: "none", estimated_minutes: 0, result_note: "", checklist: action.checklist || [],
      created_at: new Date().toISOString(), completed_at: null, postponed_count: 0, is_focus: false,
      focus_order: null, source: "goal_week", origin: "planned", week_task_id: key === "next" ? null : key.slice(7),
    };
    state.tasks.unshift(task);
  }
  if (key === "next") {
    goal.next_action = action.title;
    goal.next_action_task_id = task.id;
  }
  return task;
}

export function inferGoalDimension(input: string): Dimension {
  if (/客户|报价|收入|现金流|订单|业务|产品|销售/.test(input)) return "财富";
  if (/英语|学习|阅读|语言|AI|编程|研究/.test(input)) return "心智";
  if (/运动|睡眠|健康|身体|饮食/.test(input)) return "身体";
  if (/吉他|唱歌|旅行|摄影|音乐|体验/.test(input)) return "感受";
  if (/家人|朋友|合作|关系|父母/.test(input)) return "关系";
  return "精神";
}


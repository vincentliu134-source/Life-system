import { NextResponse } from "next/server";
import { todayKey } from "@/lib/date";
import { createId } from "@/lib/id";
import { updateState } from "@/lib/store";
import type { Task, TaskChecklistItem } from "@/lib/types";

function addDaysKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return todayKey(date);
}

function checklistItem(text: string): TaskChecklistItem {
  return {
    id: createId("check"),
    text,
    done: false,
    result_note: "",
    carry_status: "none",
    carried_to_task_id: null,
    carried_to_date: null,
  };
}

function nextChecklistFromTask(task: Task) {
  const items: TaskChecklistItem[] = [];
  if (task.result_note?.trim()) {
    items.push(checklistItem(`根据今日结果继续：${task.result_note.trim()}`));
  }
  for (const item of task.checklist || []) {
    if (!item.done) items.push(checklistItem(`继续：${item.text}`));
    if (item.done && item.result_note?.trim()) items.push(checklistItem(`根据反馈继续：${item.result_note.trim()}`));
  }
  if (!items.length) items.push(checklistItem("确认今天产生的反馈，并写出下一步动作"));
  return items.slice(0, 6);
}

export async function POST(request: Request) {
  try {
  const body = await request.json().catch(() => ({}));
  const date = String(body.date || todayKey());
  const tomorrowAdjustment = String(body.tomorrow_adjustment || "").trim();
  const tomorrow = addDaysKey(date, 1);

  const state = await updateState((current) => {
    const goals = current.goals.filter((goal) => goal.status === "进行中" || goal.status === "未开始");
    for (const goal of goals) {
      const sourceTasks = current.tasks
        .filter((task) => (
          task.goal_id === goal.id
          && task.date === date
          && task.status !== "取消"
          && task.status !== "延期"
          && (task.status === "完成" || Boolean(task.result_note?.trim()) || (task.checklist || []).some((item) => item.result_note?.trim()))
        ))
        .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));
      if (!sourceTasks.length) continue;

      const source = sourceTasks[0];
      const title = `继续推进：${source.title}`;
      const exists = current.tasks.some((task) => (
        task.goal_id === goal.id
        && task.date === tomorrow
        && task.status !== "取消"
        && task.title.trim() === title
      ));
      if (exists) continue;

      current.tasks.unshift({
        id: createId("task"),
        title,
        description: `由 ${date} 的执行结果滚动生成`,
        date: tomorrow,
        dimension_primary: goal.dimension_primary,
        dimension_secondary: null,
        type: "项目任务",
        priority: goal.dimension_primary === "财富" || goal.dimension_primary === "身体" ? "A" : "B",
        priority_source: "system",
        status: "未开始",
        goal_id: goal.id,
        project_id: null,
        habit_id: null,
        is_habit: false,
        is_must_today: false,
        due_date: null,
        due_time: null,
        reminder_time: null,
        calendar_sync_status: "none",
        estimated_minutes: source.estimated_minutes || 0,
        result_note: "",
        checklist: tomorrowAdjustment
          ? [checklistItem(`明日重点：${tomorrowAdjustment}`), ...nextChecklistFromTask(source)].slice(0, 6)
          : nextChecklistFromTask(source),
        created_at: new Date().toISOString(),
        completed_at: null,
        postponed_count: 0,
        is_focus: false,
        focus_order: null,
        source: "goal_week",
        week_task_id: source.week_task_id || null,
        stage_id: source.stage_id || null,
      });
    }
  });

  return NextResponse.json(state);

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

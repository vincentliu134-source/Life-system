import { NextResponse } from "next/server";
import { createId } from "@/lib/id";
import { updateState } from "@/lib/store";
import { addDateDays, dateBounds, validDate } from "@/lib/date";
import { dailyCapacity } from "@/lib/planning";
import type { AppState, GoalBreakdown, Task } from "@/lib/types";

// Generating candidates never changes the current week's plan or creates tasks.
export async function POST() {
  try {
  const week = addDateDays(dateBounds("week").start, 7);
  const state = await updateState((current) => {
    current.week_candidates ||= [];
    for (const goal of current.goals) {
      if (!["进行中", "未开始"].includes(goal.status) || goal.cycle_focus === "以后再说") continue;
      let breakdown: GoalBreakdown | null = null;
      try { breakdown = JSON.parse(goal.ai_breakdown); } catch { /* no evidence yet */ }
      const candidates = breakdown?.current_week_tasks || [];
      for (const action of candidates) {
        if (!action.title.trim() || action.status === "完成") continue;
        if (current.tasks.some((task) => task.goal_id === goal.id && task.status === "完成" && (action.id ? task.week_task_id === action.id : task.title === action.title))) continue;
        if (current.week_candidates.some((item) => item.week === week && item.goal_id === goal.id && item.title === action.title)) continue;
        current.week_candidates.push({
          id: createId("candidate"), week, goal_id: goal.id, title: action.title,
          reason: `来自「${goal.title}」的现有推进池；${goal.cycle_focus || "维持"}；请确认下一步仍然有效`,
          estimated_minutes: 0, stage_id: action.stage_id || null,
          checklist: action.checklist?.map((item) => ({ ...item, done: false, result_note: "", carry_status: "none", carried_to_task_id: null, carried_to_date: null })),
        });
      }
    }
  });
  return NextResponse.json(state);

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
  const body = await request.json();
  if (!Array.isArray(body.selections) || body.selections.length > 50) return NextResponse.json({ message: "请选择候选行动" }, { status: 400 });
  const state = await updateState((current) => {
    for (const selection of body.selections) {
      const candidate = current.week_candidates?.find((item) => item.id === selection.id);
      if (!candidate) throw new Error("候选项不存在，请刷新");
      if (candidate.task_id && current.tasks.some((task) => task.id === candidate.task_id)) continue;
      const date = selection.date;
      if (!validDate(date) || date < candidate.week || date > addDateDays(candidate.week, 6)) throw new Error("请选择该候选周内的日期");
      const minutes = Number(selection.estimated_minutes);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error("排期前请填写1至1440分钟的估时");
      const goal = current.goals.find((item) => item.id === candidate.goal_id);
      if (!goal || goal.cycle_focus === "以后再说" || !["未开始", "进行中"].includes(goal.status)) throw new Error("目标已暂停或暂缓，请先调整目标");
      const capacity = dailyCapacity(current, date);
      if (capacity.scheduled + minutes > capacity.budget) throw new Error(`${date} 仅剩 ${Math.max(0, capacity.remaining)} 分钟，请减少安排或调整当天容量`);
      const task: Task = {
        id: createId("task"), title: candidate.title, description: candidate.reason, date,
        dimension_primary: goal.dimension_primary, dimension_secondary: null, type: "项目任务",
        priority: current.preferences.goal_task_priority === "always_a" ? "A" : current.preferences.goal_task_priority === "always_b" ? "B" : current.dimension_priority_order.indexOf(goal.dimension_primary) < 2 ? "A" : "B",
        priority_source: "system", status: "未开始", goal_id: goal.id, project_id: null, habit_id: null,
        is_habit: false, is_must_today: false, due_date: null, due_time: null, reminder_time: null,
        calendar_sync_status: "none", estimated_minutes: minutes, result_note: "", checklist: candidate.checklist || [],
        created_at: new Date().toISOString(), completed_at: null, postponed_count: 0, is_focus: false, focus_order: null,
        source: "goal_week", week_id: candidate.week, week_task_id: candidate.id, stage_id: candidate.stage_id,
      };
      current.tasks.unshift(task);
      candidate.task_id = task.id;
      candidate.estimated_minutes = minutes;
    }
  });
  return NextResponse.json(state);

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

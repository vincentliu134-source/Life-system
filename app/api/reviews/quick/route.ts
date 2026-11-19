import { NextResponse } from "next/server";
import { updateState } from "@/lib/store";
import { addDateDays, validDate } from "@/lib/date";
import { createId } from "@/lib/id";
import { sortDailyTasks } from "@/lib/task-workflow";
import { isHabit, isOpen } from "@/lib/planning";
import { validateFields } from "@/lib/validation";
import type { Task } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    validateFields(body);
    if (!validDate(body.date)) throw new Error("复盘日期无效");
    const state = await updateState(current => {
      const saved = current.daily_reviews.find(review => review.date === body.date);
      const tomorrow = addDateDays(body.date, 1);
      let first = String(body.tomorrow_first_text || "").trim();
      let selected: Task | undefined;
      let source: "existing" | "new" | undefined;
      if (body.tomorrow_first_task_id) {
        selected = current.tasks.find(task => task.id === body.tomorrow_first_task_id && !isHabit(task) && isOpen(task));
        if (!selected) throw new Error("所选任务已完成或不可用，请重新选择");
        first = selected.title;
        source = "existing";
      } else if (first) {
        // Only a previous review-created task may be renamed by free text.
        selected = current.tasks.find(task => task.id === saved?.tomorrow_first_task_id && task.date === tomorrow && isOpen(task) && (saved?.tomorrow_first_source === "new" || task.description === "每日复盘的明天第一步"));
        if (selected) { selected.title = first; source = "new"; }
        else {
          selected = current.tasks.find(task => task.date === tomorrow && task.title === first && !isHabit(task) && isOpen(task));
          if (selected) source = "existing";
        }
        if (!selected) {
          selected = { id: createId("task"), title: first, description: "每日复盘的明天第一步", date: tomorrow, dimension_primary: "心智", dimension_secondary: null, type: "临时任务", priority: "A", priority_source: "user", status: "未开始", goal_id: null, project_id: null, habit_id: null, is_habit: false, is_must_today: false, due_date: null, due_time: null, reminder_time: null, calendar_sync_status: "none", estimated_minutes: 0, result_note: "", checklist: [], created_at: new Date().toISOString(), completed_at: null, postponed_count: 0, is_focus: false, focus_order: null, source: "planned", origin: "planned" };
          current.tasks.unshift(selected);
          source = "new";
        }
      }
      if (selected) {
        selected.date = tomorrow;
        sortDailyTasks(current.tasks.filter(task => task.date === tomorrow && task.id !== selected!.id && !isHabit(task) && !["取消", "延期"].includes(task.status)), current).forEach((task, index) => { task.sort_order = index + 1; });
        selected.is_focus = false; selected.focus_order = null; selected.sort_order = 0;
      }
      const timestamp = new Date().toISOString();
      current.daily_reviews = current.daily_reviews.filter(review => review.date !== body.date);
      current.daily_reviews.unshift({
        id: saved?.id || createId("review"), date: body.date, wins: "", blockers: "", tomorrow_adjustment: "", energy: "中", pressure: "中", available_time: "一般", created_at: timestamp,
        ...saved,
        ...(body.wins === undefined ? {} : { wins: body.wins }),
        ...(body.blockers === undefined ? {} : { blockers: body.blockers }),
        ...(body.adjustment === undefined ? {} : { adjustment: body.adjustment }),
        tomorrow_first_text: first, tomorrow_first_task_id: selected?.id || null, tomorrow_first_source: source, updated_at: timestamp,
      });
    });
    return NextResponse.json(state);
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "保存复盘失败" }, { status: 400 }); }
}

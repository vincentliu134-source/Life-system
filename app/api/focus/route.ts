import { NextResponse } from "next/server";
import { todayKey, validDate } from "@/lib/date";
import { updateState } from "@/lib/store";
import { sortDailyTasks } from "@/lib/task-workflow";
import { isHabit } from "@/lib/planning";

export async function POST(request: Request) {
  try {
  const body = await request.json();
  const taskId = String(body.task_id || "");
  const order = Number(body.order);
  const date = body.date || todayKey();

  if (!taskId || ![1, 2, 3].includes(order) || !validDate(date)) {
    return NextResponse.json({ error: "invalid_focus_request" }, { status: 400 });
  }

  const state = await updateState((current) => {
    const candidate = current.tasks.find((task) => task.id === taskId);
    if (!candidate || candidate.is_habit || ["取消", "跳过", "未记录"].includes(candidate.status)) throw new Error("请选择可执行的主任务");
    for (const task of current.tasks) {
      if (task.date !== date) continue;
      if (task.focus_order === order || task.id === taskId) {
        task.is_focus = false;
        task.focus_order = null;
      }
    }

    const target = current.tasks.find((task) => task.id === taskId);
    if (target) {
      target.is_focus = false;
      target.focus_order = null;
      target.date = date;
      const others = sortDailyTasks(current.tasks.filter(task => task.id !== target.id && task.date === date && !isHabit(task) && !["取消", "延期"].includes(task.status)), current);
      others.splice(Math.min(order - 1, others.length), 0, target);
      others.forEach((task, index) => { task.sort_order = index; });
    }
  });

  return NextResponse.json(state);

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

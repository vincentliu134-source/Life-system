import { NextResponse } from "next/server";
import { updateState } from "@/lib/store";
import { todayKey, validDate } from "@/lib/date";
import { scheduleGoalAction } from "@/lib/simple-goals";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const date = body.date || todayKey();
    if (!validDate(date)) throw new Error("请选择有效日期");
    let taskId = "";
    const state = await updateState(current => {
      const goal = current.goals.find(goal => goal.id === id);
      if (!goal) throw new Error("目标不存在，请刷新");
      const task = scheduleGoalAction(current, goal, typeof body.key === "string" ? body.key : "next", date, body.title);
      taskId = task.id;
    });
    return NextResponse.json({ state, task_id: taskId });
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "安排失败" }, { status: 400 }); }
}

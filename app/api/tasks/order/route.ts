import { NextResponse } from "next/server";
import { updateState } from "@/lib/store";
import { validDate } from "@/lib/date";
import { isHabit } from "@/lib/planning";

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    if (!validDate(body.date)) throw new Error("排序日期无效");
    if (!body.reset && (!Array.isArray(body.ids) || body.ids.some((id: unknown) => typeof id !== "string") || new Set(body.ids).size !== body.ids.length)) throw new Error("排序列表无效");
    const state = await updateState(current => {
      const tasks = current.tasks.filter(task => task.date === body.date && !isHabit(task) && !["取消", "延期"].includes(task.status));
      if (body.reset) {
        tasks.forEach(task => { delete task.sort_order; });
      } else {
        if (tasks.length !== body.ids.length || tasks.some(task => !body.ids.includes(task.id))) throw new Error("任务列表已变化，请刷新后重新排序");
        tasks.forEach(task => { task.sort_order = body.ids.indexOf(task.id); });
      }
    });
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "保存顺序失败" }, { status: 400 });
  }
}

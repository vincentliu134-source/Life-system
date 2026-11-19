import { NextResponse } from "next/server";
import { updateState } from "@/lib/store";
import { validateFields } from "@/lib/validation";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    validateFields(body);
    if ("title" in body && !body.title?.trim()) throw new Error("目标名称不能为空");
    if ("success_metric" in body && !body.success_metric?.trim()) throw new Error("请说明完成的样子");
    if (body.status && !["未开始", "进行中", "暂停", "完成", "放弃"].includes(body.status)) throw new Error("目标状态无效");
    const state = await updateState(current => {
      const goal = current.goals.find(item => item.id === id);
      if (!goal) throw new Error("目标不存在，请刷新");
      for (const key of ["title", "dimension_primary", "success_metric", "next_action", "deadline", "status", "cycle_focus", "outcome"]) {
        if (key in body) (goal as unknown as Record<string, unknown>)[key] = typeof body[key] === "string" ? body[key].trim() : body[key];
      }
      if (body.status === "进行中" && goal.cycle_focus === "以后再说") goal.cycle_focus = "维持";
      goal.updated_at = new Date().toISOString();
    });
    return NextResponse.json(state);
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "保存目标失败" }, { status: 400 }); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await updateState(state => {
      state.goals = state.goals.filter(goal => goal.id !== id);
      state.tasks = state.tasks.filter(task => task.goal_id !== id);
    }));
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "删除目标失败" }, { status: 400 }); }
}

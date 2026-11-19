import { NextResponse } from "next/server";
import { updateState } from "@/lib/store";
import { validDate } from "@/lib/date";
import { validateFields } from "@/lib/validation";
import { isHabit } from "@/lib/planning";

export async function PATCH(request: Request) {
  try {
  const body = await request.json();
  if (!validDate(body.date)) return NextResponse.json({ message: "请选择有效日期" }, { status: 400 });
  if (body.plan) validateFields(body.plan);
  if (body.weekly) validateFields(body.weekly);
  const state = await updateState((current) => {
    if (body.plan) {
      const plan = { available_minutes: 180, buffer_minutes: 60, focus_limit: 3, ...current.daily_plans?.[body.date], ...body.plan };
      validateFields(plan);
      current.daily_plans = { ...current.daily_plans, [body.date]: plan };
    }
    if (body.weekly) current.weekly_plans = { ...current.weekly_plans, [body.date]: { stop: "", continue: "", commit: "", ...body.weekly } };
    if (Array.isArray(body.focus_ids)) {
      const ids = [...new Set<string>(body.focus_ids)];
      const limit = current.daily_plans?.[body.date]?.focus_limit ?? 3;
      if (ids.length > limit || ids.some((id) => !current.tasks.some((task) => task.id === id && task.date === body.date && !isHabit(task) && ["未开始", "进行中", "完成"].includes(task.status)))) throw new Error(`最多选择${limit}件当日主任务`);
      for (const task of current.tasks.filter((task) => task.date === body.date)) {
        task.is_focus = ids.includes(task.id);
        task.focus_order = task.is_focus ? ids.indexOf(task.id) + 1 : null;
      }
      current.daily_plans = { ...current.daily_plans, [body.date]: { available_minutes: 180, buffer_minutes: 60, focus_limit: 3, ...current.daily_plans?.[body.date], confirmed: true } };
    }
  });
  return NextResponse.json(state);

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

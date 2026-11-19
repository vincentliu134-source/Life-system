import { NextResponse } from "next/server";
import { updateState } from "@/lib/store";
import { addDateDays, dateBounds, validDate } from "@/lib/date";
import { scheduleGoalAction } from "@/lib/simple-goals";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body.decisions) || !Array.isArray(body.actions) || body.decisions.length > 500 || body.actions.length > 100) throw new Error("周复盘内容无效");
    const week = addDateDays(dateBounds("week").start, 7);
    const state = await updateState(current => {
      const seen = new Set<string>();
      for (const decision of body.decisions) {
        if (!decision || typeof decision.goal_id !== "string" || seen.has(decision.goal_id) || !["进行中", "暂停", "完成"].includes(decision.status)) throw new Error("目标取舍无效");
        seen.add(decision.goal_id);
        const goal = current.goals.find(goal => goal.id === decision.goal_id);
        if (!goal) throw new Error("目标已变化，请刷新后重试");
        goal.status = decision.status;
        if (goal.status === "进行中" && goal.cycle_focus === "以后再说") goal.cycle_focus = "维持";
        goal.updated_at = new Date().toISOString();
      }
      const seenActions = new Set<string>();
      for (const action of body.actions) {
        const goal = current.goals.find(goal => goal.id === action?.goal_id);
        if (!goal || typeof action.key !== "string" || typeof action.title !== "string" || !validDate(action.date) || action.date < week || action.date > addDateDays(week, 6)) throw new Error("请选择下周内的有效行动和日期");
        const identity = `${goal.id}:${action.key}`;
        if (seenActions.has(identity)) throw new Error("同一行动只能安排一次");
        seenActions.add(identity);
        scheduleGoalAction(current, goal, action.key, action.date, action.title);
      }
      const previous = current.weekly_plans?.[week];
      current.weekly_plans = { ...current.weekly_plans, [week]: { ...previous, stop: body.decisions.filter((item: { status: string }) => item.status === "暂停").map((item: { goal_id: string }) => current.goals.find(goal => goal.id === item.goal_id)?.title).join("；"), continue: body.decisions.filter((item: { status: string }) => item.status === "进行中").map((item: { goal_id: string }) => current.goals.find(goal => goal.id === item.goal_id)?.title).join("；"), commit: body.actions.map((item: { title: string }) => item.title).join("；") } };
    });
    return NextResponse.json(state);
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "保存周复盘失败" }, { status: 400 }); }
}

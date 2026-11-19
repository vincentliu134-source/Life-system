import { NextResponse } from "next/server";
import { createId } from "@/lib/id";
import { updateState } from "@/lib/store";
import { validateFields } from "@/lib/validation";
import { isDimension } from "@/lib/dimensions";
import type { Goal } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    validateFields(body);
    if (!body.title?.trim() || !body.success_metric?.trim()) throw new Error("请填写目标名称和完成的样子");
    if (!isDimension(body.dimension_primary)) throw new Error("请选择所属维度");
    const timestamp = new Date().toISOString();
    const goal: Goal = {
      id: createId("goal"), title: body.title.trim(), dimension_primary: body.dimension_primary,
      success_metric: body.success_metric.trim(), next_action: body.next_action?.trim() || "",
      deadline: body.deadline || null, status: "进行中",
      why: "", ai_breakdown: "", created_at: timestamp, updated_at: timestamp,
    };
    return NextResponse.json(await updateState(state => { state.goals.unshift(goal); }));
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "创建目标失败" }, { status: 400 }); }
}

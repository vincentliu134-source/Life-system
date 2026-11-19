import { NextResponse } from "next/server";
import { updateState } from "@/lib/store";
import { validateFields } from "@/lib/validation";
import { createId } from "@/lib/id";
import { isHabit } from "@/lib/planning";
import type { TaskProgress } from "@/lib/types";
import { reconcileCompletedLegacyActions } from "@/lib/legacy-split-actions";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    validateFields(body);
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content || content.length > 5000) throw new Error("请填写1至5000字的进展记录");
    if (!["进行中", "等待反馈", "完成"].includes(body.status)) throw new Error("请选择有效的进展状态");
    const timestamp = new Date().toISOString();
    const state = await updateState(current => {
      const task = current.tasks.find(task => task.id === id);
      if (!task || isHabit(task) || task.status === "取消") throw new Error("该任务无法记录进展，请刷新后重试");
      const entry: TaskProgress = {
        id: createId("progress"), content, created_at: timestamp, status: body.status,
        next_action: body.status === "完成" ? "" : body.next_action?.trim() || "",
        waiting_on: body.status === "等待反馈" ? body.waiting_on?.trim() || "" : "",
        follow_up_date: body.status === "完成" ? null : body.follow_up_date || null,
      };
      task.progress_logs = [...(task.progress_logs || []), entry];
      task.status = entry.status;
      task.completed_at = entry.status === "完成" ? timestamp : null;
      task.next_action = entry.next_action;
      task.waiting_on = entry.waiting_on;
      task.follow_up_date = entry.follow_up_date;
      if (entry.status === "完成") reconcileCompletedLegacyActions(current.tasks);
    });
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "保存进展失败" }, { status: 400 });
  }
}

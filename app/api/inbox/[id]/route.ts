import { NextResponse } from "next/server";
import { todayKey } from "@/lib/date";
import { createId } from "@/lib/id";
import { clarifyInboxItem } from "@/lib/clarify";
import { organizeWithRules } from "@/lib/organizer";
import { updateState } from "@/lib/store";
import type { Goal, Habit, Task } from "@/lib/types";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
  const { id } = await context.params;
  const body = await request.json();
  const action = String(body.action || "");
  const now = new Date().toISOString();

  const state = await updateState((current) => {
    const item = current.inbox_items.find((entry) => entry.id === id);
    if (!item) return;

    if (action === "archive") {
      item.status = "已归档";
      item.archived_at = now;
      return;
    }

    if (action === "restore") {
      item.status = "未处理";
      item.archived_at = null;
      return;
    }

    if (action === "schedule") {
      const draft = organizeWithRules(item.content)[0];
      if (draft) {
        const task: Task = {
          ...draft,
          id: createId("task"),
          date: todayKey(),
          due_date: null,
          is_must_today: true,
          status: "未开始",
          result_note: "",
          checklist: [],
          created_at: now,
          completed_at: null,
          postponed_count: 0,
          is_focus: false,
          focus_order: null,
          source: "inbox",
        };
        current.tasks.unshift(task);
      }
      item.status = "已安排";
      item.archived_at = now;
      return;
    }

    if (action === "distribute") {
      const clarification = body.clarification || clarifyInboxItem(item.content, current);
      const dimension = clarification.dimension_primary || "心智";
      const title = clarification.suggested_title || item.content;
      const nextAction = clarification.next_action || title;
      const goalId = clarification.goal_id || null;
      const projectId = null;
      item.clarified_type = clarification.clarified_type;
      item.dimension_primary = dimension;
      item.scheduled_date = clarification.scheduled_date || null;
      item.scheduled_time = clarification.scheduled_time || null;
      item.next_action = nextAction;
      item.goal_id = goalId;
      item.project_id = projectId;
      item.relation_type = clarification.relation_type || null;

      if (clarification.clarified_type === "今日动作" || clarification.clarified_type === "临时事项" || clarification.clarified_type === "日程") {
        current.tasks.unshift({
          id: createId("task"),
          title,
          description: item.content,
          date: clarification.scheduled_date || todayKey(),
          dimension_primary: dimension,
          dimension_secondary: null,
          type: clarification.clarified_type === "今日动作" ? "项目任务" : "临时任务",
          priority: clarification.clarified_type === "日程" || clarification.clarified_type === "今日动作" ? "A" : "B",
          status: "未开始",
          goal_id: clarification.clarified_type === "临时事项" ? null : goalId,
          project_id: null,
          habit_id: null,
          is_habit: false,
          is_must_today: clarification.scheduled_date === todayKey() || clarification.clarified_type === "日程",
          due_date: null,
          due_time: clarification.scheduled_time || null,
          reminder_time: null,
          calendar_sync_status: clarification.clarified_type === "日程" ? "pending" : "none",
          estimated_minutes: 0,
          result_note: "",
          checklist: [],
          created_at: now,
          completed_at: null,
          postponed_count: 0,
          is_focus: false,
          focus_order: null,
          source: clarification.clarified_type === "日程" ? "calendar" : "inbox",
        } satisfies Task);
      } else if (clarification.clarified_type === "短期目标" || clarification.clarified_type === "长期目标") {
        current.goals.unshift({
          id: createId("goal"),
          title,
          dimension_primary: dimension,
          success_metric: "",
          next_action: nextAction,
          deadline: null,
          status: "进行中",
          why: item.content,
          ai_breakdown: "",
          created_at: now,
        } satisfies Goal);
      } else if (clarification.clarified_type === "习惯") {
        current.habits.unshift({
          id: createId("habit"),
          title,
          dimension_primary: dimension,
          frequency: "每日",
          weekdays: [],
          estimated_minutes: 20,
          priority: dimension === "财富" || dimension === "身体" ? "A" : "B",
          active: true,
          created_at: now,
        } satisfies Habit);
      } else {
        item.status = "已归档";
        item.archived_at = now;
        return;
      }
      item.status = "已安排";
      item.archived_at = now;
    }

    if (action === "checklist") {
      const clarification = body.clarification || clarifyInboxItem(item.content, current);
      item.clarified_type = clarification.clarified_type || "临时事项";
      item.dimension_primary = clarification.dimension_primary || "心智";
      item.scheduled_date = clarification.scheduled_date || null;
      item.scheduled_time = clarification.scheduled_time || null;
      item.next_action = clarification.next_action || clarification.suggested_title || item.content;
      item.goal_id = clarification.goal_id || null;
      item.project_id = body.target_task_id || null;
      item.relation_type = clarification.relation_type || null;
      item.status = "已安排";
      item.archived_at = now;
    }
  });

  return NextResponse.json(state);

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
  const { id } = await context.params;
  const state = await updateState((current) => {
    current.inbox_items = current.inbox_items.filter((item) => item.id !== id);
  });

  return NextResponse.json(state);

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

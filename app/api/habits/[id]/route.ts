import { NextResponse } from "next/server";
import { createId } from "@/lib/id";
import { todayKey } from "@/lib/date";
import { updateState } from "@/lib/store";
import { deleteHabit, setHabitActive } from "@/lib/workspace";
import type { Habit, TaskChecklistItem } from "@/lib/types";

const habitFrequencies: Habit["frequency"][] = ["每日", "隔天一次", "每周1次", "每周3次", "每周5次", "指定星期", "每周自由3次"];

function normalizeWeekdays(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
}

function normalizeFrequency(value: unknown, fallback: Habit["frequency"]): Habit["frequency"] {
  return habitFrequencies.includes(value as Habit["frequency"]) ? value as Habit["frequency"] : fallback;
}

function defaultWeekdays(frequency: Habit["frequency"], weekdays: number[], createdAt: string) {
  if (frequency === "每周5次") return [1, 2, 3, 4, 5];
  if (frequency === "每周3次") return weekdays.length ? weekdays : [1, 3, 5];
  if (frequency === "每周1次") return weekdays.length ? [weekdays[0]] : [new Date(createdAt).getDay()];
  if (frequency === "指定星期") return weekdays;
  return [];
}

function normalizeChecklistTemplate(value: unknown): TaskChecklistItem[] {
  if (!Array.isArray(value)) return [];
  const checklist: TaskChecklistItem[] = [];
  for (const item of value) {
    const text = typeof item === "string" ? item.trim() : typeof item === "object" && item ? String((item as { text?: unknown }).text || "").trim() : "";
    if (!text) continue;
    checklist.push({
      id: typeof item === "object" && item && typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id : createId("check"),
      text,
      done: false,
      result_note: "",
      carry_status: "none",
      carried_to_task_id: null,
      carried_to_date: null,
    });
  }
  return checklist;
}

function syncHabitChecklist(previous: TaskChecklistItem[] | undefined, template: TaskChecklistItem[] | undefined) {
  const existing = previous || [];
  return (template || []).map((item) => {
    const saved = existing.find((entry) => entry.id === item.id || entry.text.trim() === item.text.trim());
    return {
      ...item,
      done: saved?.done || false,
      result_note: saved?.result_note || "",
      carry_status: saved?.carry_status || "none",
      carried_to_task_id: saved?.carried_to_task_id || null,
      carried_to_date: saved?.carried_to_date || null,
    };
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
  const { id } = await context.params;
  const updates = await request.json();
  const state = await updateState((current) => {
    const habit = current.habits.find((item) => item.id === id);
    if (!habit) return;

    for (const key of ["title", "dimension_primary", "frequency", "weekdays", "estimated_minutes", "priority", "active"]) {
      if (key in updates) {
        (habit as unknown as Record<string, unknown>)[key] = updates[key];
      }
    }
    if ("checklist_template" in updates) {
      habit.checklist_template = normalizeChecklistTemplate(updates.checklist_template);
    }
    habit.frequency = normalizeFrequency(habit.frequency, "每日");
    habit.weekdays = defaultWeekdays(habit.frequency, normalizeWeekdays(habit.weekdays), habit.created_at);
    if ("active" in updates) setHabitActive(current, habit, habit.active);

    current.tasks = current.tasks.map((task) => {
      if (task.habit_id !== id || task.date < todayKey() || task.status === "完成") return task;
      const shouldSyncChecklist = "checklist_template" in updates && task.date >= todayKey() && task.status !== "取消";
      return {
        ...task,
        title: habit.title,
        dimension_primary: habit.dimension_primary,
        priority: habit.priority,
        priority_source: "user",
        estimated_minutes: habit.estimated_minutes,
        is_must_today: false,
        checklist: shouldSyncChecklist ? syncHabitChecklist(task.checklist, habit.checklist_template) : task.checklist,
      };
    });
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
    deleteHabit(current, id);
  });

  return NextResponse.json(state);

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

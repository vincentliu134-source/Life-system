import { NextResponse } from "next/server";
import { createId } from "@/lib/id";
import { updateState } from "@/lib/store";
import type { Habit, TaskChecklistItem } from "@/lib/types";

const habitFrequencies: Habit["frequency"][] = ["每日", "隔天一次", "每周1次", "每周3次", "每周5次", "指定星期", "每周自由3次"];

function normalizeWeekdays(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
}

function normalizeFrequency(value: unknown): Habit["frequency"] {
  return habitFrequencies.includes(value as Habit["frequency"]) ? value as Habit["frequency"] : "每日";
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

export async function POST(request: Request) {
  try {
  const body = await request.json();
  const now = new Date().toISOString();
  const frequency = normalizeFrequency(body.frequency);
  const weekdays = defaultWeekdays(frequency, normalizeWeekdays(body.weekdays), now);

  const habit: Habit = {
    id: createId("habit"),
    title: String(body.title || "新的习惯").trim() || "新的习惯",
    dimension_primary: body.dimension_primary || "心智",
    frequency,
    weekdays,
    estimated_minutes: Math.max(1, Number(body.estimated_minutes || 20)),
    priority: ["A", "B", "C"].includes(String(body.priority)) ? body.priority : "B",
    active: body.active !== false,
    checklist_template: normalizeChecklistTemplate(body.checklist_template),
    created_at: now,
  };

  const state = await updateState((current) => {
    current.habits.unshift(habit);
  });

  return NextResponse.json({ habit, state });

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

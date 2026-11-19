import { NextResponse } from "next/server";
import { todayKey } from "@/lib/date";
import { createId } from "@/lib/id";
import { updateState } from "@/lib/store";
import type { DailyReview } from "@/lib/types";

export async function POST(request: Request) {
  try {
  const body = await request.json();
  const date = body.date || todayKey();
  const review: DailyReview = {
    id: createId("review"),
    date,
    wins: body.wins || "",
    blockers: body.blockers || "",
    tomorrow_adjustment: body.tomorrow_adjustment || "",
    principle_alignment: body.principle_alignment || "",
    needed_resources: body.needed_resources || "",
    important_completed_task_id: body.important_completed_task_id || null,
    important_completed_text: body.important_completed_text || "",
    important_unfinished_task_id: body.important_unfinished_task_id || null,
    important_unfinished_text: body.important_unfinished_text || "",
    unfinished_reason_tags: Array.isArray(body.unfinished_reason_tags) ? body.unfinished_reason_tags : [],
    feedback_suggestions: Array.isArray(body.feedback_suggestions) ? body.feedback_suggestions : [],
    tomorrow_first_task_id: body.tomorrow_first_task_id || null,
    tomorrow_first_text: body.tomorrow_first_text || "",
    energy: body.energy || "中",
    pressure: body.pressure || "中",
    available_time: body.available_time || "一般",
    created_at: new Date().toISOString(),
  };

  const state = await updateState((current) => {
    current.daily_reviews = current.daily_reviews.filter((item) => item.date !== date);
    current.daily_reviews.unshift(review);
  });

  return NextResponse.json(state);

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

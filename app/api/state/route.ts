import { NextResponse } from "next/server";
import { ensureTodayHabitTasks } from "@/lib/store";
import { buildStats } from "@/lib/recommend";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
  const state = await ensureTodayHabitTasks();
  return NextResponse.json({
    ...state,
    test_mode: process.env.LIFE_TEST_MODE === "1",
    stats: buildStats(state),
  }, { headers: { "Cache-Control": "no-store" } });

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

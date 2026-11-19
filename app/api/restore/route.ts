import { NextResponse } from "next/server";
import { restoreWithSnapshot } from "@/lib/store";

export async function POST(request: Request) {
  try {
  try {
    const state = await restoreWithSnapshot(await request.json());
    const total = state.tasks.length + state.goals.length + state.projects.length + state.habits.length + state.inbox_items.length + state.daily_reviews.length;
    return NextResponse.json({ ok: true, total, revision: state.revision });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "恢复失败" }, { status: 400 });
  }

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { updateState } from "@/lib/store";
import type { ProjectStatus } from "@/lib/types";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
  const { id } = await context.params;
  const updates = await request.json();
  const state = await updateState((current) => {
    const project = current.projects.find((item) => item.id === id);
    if (!project) return;

    for (const key of ["title", "description", "next_action", "dimension_primary", "dimension_secondary", "goal_id"]) {
      if (key in updates) {
        (project as unknown as Record<string, unknown>)[key] = updates[key];
      }
    }

    if (updates.status) {
      project.status = updates.status as ProjectStatus;
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
    current.projects = current.projects.filter((project) => project.id !== id);
    current.tasks = current.tasks.map((task) => task.project_id === id ? { ...task, project_id: null } : task);
  });

  return NextResponse.json(state);

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

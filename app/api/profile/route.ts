import { NextResponse } from "next/server";
import { updateState } from "@/lib/store";
import type { Dimension, DimensionVision, LifeCore, SystemPreferences } from "@/lib/types";

function normalizeDimension(value: unknown): Dimension | null {
  if (typeof value !== "string") return null;
  const valid: Dimension[] = ["财富", "心智", "身体", "感受", "精神", "关系"];
  return valid.includes(value as Dimension) ? (value as Dimension) : null;
}

export async function PATCH(request: Request) {
  try {
  const body = await request.json();
  const state = await updateState((current) => {
    if (body.life_core) {
      current.life_core = {
        ...current.life_core,
        ...(body.life_core as Partial<LifeCore>),
      };
    }

    if (Array.isArray(body.dimension_visions)) {
      current.dimension_visions = body.dimension_visions as DimensionVision[];
    }

    if (Array.isArray(body.dimension_priority_order)) {
      const nextOrder: Dimension[] = [];
      for (const item of body.dimension_priority_order) {
        const normalized = normalizeDimension(item);
        if (normalized && !nextOrder.includes(normalized)) nextOrder.push(normalized);
      }
      if (nextOrder.length === 6) {
        current.dimension_priority_order = nextOrder;
      }
    }

    if (body.preferences && typeof body.preferences === "object") {
      current.preferences = {
        ...current.preferences,
        ...(body.preferences as Partial<SystemPreferences>),
      };
    }
  });

  return NextResponse.json(state);

  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "操作失败，请重试" }, { status: 400 });
  }
}

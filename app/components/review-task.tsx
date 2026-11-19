"use client";

import { DimensionDot,statusClass } from "@/app/components/shared";
import { apiFetch } from "@/lib/client-api";
import type { Task } from "@/lib/types";
import { useState } from "react";

export function ReviewUnfinishedTask({ task, onRefresh }: { task: Task; onRefresh: () => void }) {
  const [reason, setReason] = useState(task.result_note || "");
  const [saving, setSaving] = useState(false);

  async function saveReason() {
    try {
    setSaving(true);
    await apiFetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result_note: reason }),
    });
    await onRefresh();
    setSaving(false);
  
    } catch { setSaving(false); }
}

  return (
    <article className="result-row unfinished-review-row">
      <div>
        <strong>{task.title}</strong>
        <span><DimensionDot dimension={task.dimension_primary} />{task.dimension_primary} · <span className={`status-text ${statusClass(task.status)}`}>{task.status}</span> · {task.priority}</span>
      </div>
      <div className="unfinished-reason-editor">
        <input value={reason} placeholder="记录未完成原因" onChange={(event) => setReason(event.target.value)} />
        <button onClick={saveReason} disabled={saving}>{saving ? "保存中" : "保存原因"}</button>
      </div>
    </article>
  );
}

export const weekdayOptions = [
  { value: 1, label: "一" },
  { value: 2, label: "二" },
  { value: 3, label: "三" },
  { value: 4, label: "四" },
  { value: 5, label: "五" },
  { value: 6, label: "六" },
  { value: 0, label: "日" },
];

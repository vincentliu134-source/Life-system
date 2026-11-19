"use client";

import { TaskTiming } from "@/app/components/planning-panels";
import { goalNextAction } from "@/lib/simple-goals";
import { TaskProgressPanel } from "./task-progress";
import { DimensionDot,StateResponse,addDaysKey,checklistItem,checklistProgress,completedAtForDate,createChecklistId,estimateText,inDateRange,nextWeekStartKey,rangeBounds,taskRangeDate,taskSourceLabel } from "@/app/components/shared";
import { apiFetch } from "@/lib/client-api";
import { todayKey } from "@/lib/date";
import type { Goal,Task } from "@/lib/types";
import type { ReactNode } from "react";
import { useEffect,useRef,useState } from "react";

export function TaskChecklist({ task, onRefresh, tasks = [] }: { task: Task; onRefresh: () => void; tasks?: Task[] }) {
  const [draft, setDraft] = useState("");
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [localChecklist, setLocalChecklist] = useState<Task["checklist"] | null>(null);
  const activeDragIdRef = useRef<string | null>(null);
  const dragOrderRef = useRef<Task["checklist"] | null>(null);
  const dragMovedRef = useRef(false);
  const [openResultId, setOpenResultId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openCarryId, setOpenCarryId] = useState<string | null>(null);
  const [customCarryDate, setCustomCarryDate] = useState("");
  const [resultDrafts, setResultDrafts] = useState<Record<string, string>>({});
  const [resultSaveStatus, setResultSaveStatus] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState("");
  const checklist = localChecklist || task.checklist || [];

  useEffect(() => {
    setLocalChecklist(null);
    setItemDrafts((current) => {
      const source = task.checklist || [];
      const next: Record<string, string> = {};
      for (const item of source) {
        next[item.id] = current[item.id] ?? item.text;
      }
      return next;
    });
  }, [task.id, task.checklist]);

  async function patchChecklist(nextChecklist: Task["checklist"]) {
    const previousChecklist = checklist;
    setLocalChecklist(nextChecklist);
    setSavingId("checklist");
    try {
      const response = await apiFetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklist: nextChecklist }),
      });
      if (!response.ok) throw new Error(`清单同步失败：${response.status}`);
      setSyncMessage("已同步");
      window.setTimeout(() => setSyncMessage(""), 1200);
      onRefresh();
      return true;
    } catch {
      setLocalChecklist(previousChecklist);
      setSyncMessage("同步失败，请重试");
      window.setTimeout(() => setSyncMessage(""), 2200);
      return false;
    } finally {
      setSavingId(null);
    }
  }

  function addItem() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    patchChecklist([...checklist, checklistItem(text)]);
  }

  function toggleItem(id: string) {
    patchChecklist(checklist.map((item) => item.id === id ? { ...item, done: !item.done } : item));
  }

  function saveItemText(id: string) {
    const nextText = (itemDrafts[id] ?? "").trim();
    const currentItem = checklist.find((item) => item.id === id);
    if (!currentItem) return;
    if (!nextText) {
      setItemDrafts((current) => ({ ...current, [id]: currentItem.text }));
      return;
    }
    if (currentItem.text === nextText) return;
    patchChecklist(checklist.map((item) => item.id === id ? { ...item, text: nextText } : item));
  }

  function removeItem(id: string) {
    setOpenMenuId(null);
    patchChecklist(checklist.filter((item) => item.id !== id));
  }

  function reorderedChecklist(sourceId: string, targetId: string, sourceChecklist: Task["checklist"]) {
    if (sourceId === targetId) return;
    const fromIndex = sourceChecklist.findIndex((item) => item.id === sourceId);
    const toIndex = sourceChecklist.findIndex((item) => item.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = sourceChecklist.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  }

  function startChecklistDrag(id: string) {
    activeDragIdRef.current = id;
    dragOrderRef.current = checklist;
    dragMovedRef.current = false;
    setDraggingId(id);
    setDragOverId(id);
    setOpenMenuId(null);
  }

  function previewChecklistMove(targetId: string) {
    const sourceId = activeDragIdRef.current;
    if (!sourceId || sourceId === targetId) return;
    const next = reorderedChecklist(sourceId, targetId, dragOrderRef.current || checklist);
    if (!next) return;
    dragOrderRef.current = next;
    dragMovedRef.current = true;
    setLocalChecklist(next);
    setDragOverId(targetId);
  }

  function finishChecklistDrag() {
    const nextChecklist = dragOrderRef.current;
    activeDragIdRef.current = null;
    dragOrderRef.current = null;
    setDraggingId(null);
    setDragOverId(null);
    if (nextChecklist && dragMovedRef.current) {
      dragMovedRef.current = false;
      patchChecklist(nextChecklist);
    } else {
      dragMovedRef.current = false;
    }
  }

  useEffect(() => {
    if (!draggingId) return;
    window.addEventListener("pointerup", finishChecklistDrag);
    window.addEventListener("pointercancel", finishChecklistDrag);
    return () => {
      window.removeEventListener("pointerup", finishChecklistDrag);
      window.removeEventListener("pointercancel", finishChecklistDrag);
    };
  }, [draggingId]);

  function openResult(item: Task["checklist"][number]) {
    setResultDrafts((current) => ({ ...current, [item.id]: current[item.id] ?? item.result_note ?? "" }));
    setOpenResultId(openResultId === item.id ? null : item.id);
    setOpenMenuId(null);
    setOpenCarryId(null);
  }

  async function saveResult(id: string) {
    setResultSaveStatus((current) => ({ ...current, [id]: "saving" }));
    const saved = await patchChecklist(checklist.map((item) => item.id === id ? { ...item, result_note: resultDrafts[id] || "" } : item));
    if (saved) {
      setResultSaveStatus((current) => ({ ...current, [id]: "saved" }));
      setOpenResultId(null);
      window.setTimeout(() => setResultSaveStatus((current) => ({ ...current, [id]: "idle" })), 1400);
    } else {
      setResultSaveStatus((current) => ({ ...current, [id]: "error" }));
    }
  }

  async function carryToDate(id: string, targetDate: string) {
    if (!targetDate) return;
    setOpenMenuId(null);
    setOpenCarryId(null);
    const item = checklist.find((entry) => entry.id === id);
    if (!item) return;
    const sameGoalTarget = tasks.find((entry) => (
      entry.id !== task.id
      && entry.goal_id === task.goal_id
      && entry.date === targetDate
      && !entry.is_habit
      && entry.status !== "取消"
    ));
    const carriedText = item.result_note?.trim()
      ? `${item.text}（继续：${item.result_note.trim()}）`
      : `继续：${item.text}`;
    let targetTaskId = sameGoalTarget?.id || null;

    try {
      if (sameGoalTarget) {
        const response = await apiFetch(`/api/tasks/${sameGoalTarget.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checklist: [
              ...(sameGoalTarget.checklist || []),
              { id: createChecklistId(), text: carriedText, done: false, result_note: "", carry_status: "none", carried_to_task_id: null, carried_to_date: null },
            ],
          }),
        });
        if (!response.ok) throw new Error(`延期任务同步失败：${response.status}`);
      } else {
        const response = await apiFetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `继续推进：${task.title}`,
            description: `由 ${task.date || todayKey()} 的清单项延期`,
            date: targetDate,
            dimension_primary: task.dimension_primary,
            dimension_secondary: task.dimension_secondary,
            type: task.type,
            priority: task.priority,
            priority_source: "user",
            goal_id: task.goal_id,
            project_id: null,
            habit_id: null,
            is_habit: false,
            is_must_today: false,
            due_date: null,
            due_time: null,
            reminder_time: null,
            calendar_sync_status: "none",
            estimated_minutes: task.estimated_minutes,
            source: "manual",
            checklist: [{ id: createChecklistId(), text: carriedText, done: false, result_note: "", carry_status: "none", carried_to_task_id: null, carried_to_date: null }],
          }),
        });
        if (!response.ok) throw new Error(`延期任务创建失败：${response.status}`);
        const data = await response.json();
        targetTaskId = data.tasks?.[0]?.id || null;
      }
    } catch {
      setSyncMessage("延期失败，请重试");
      window.setTimeout(() => setSyncMessage(""), 2200);
      return;
    }

    await patchChecklist(checklist.map((entry) => entry.id === id ? {
      ...entry,
      carry_status: "carried",
      carried_to_task_id: targetTaskId,
      carried_to_date: targetDate,
    } : entry));
  }

  return (
    <div className="task-checklist">
      {syncMessage ? <span className="checklist-sync">{syncMessage}</span> : null}
      {checklist.map((item) => (
        <div
          className={`checklist-row ${item.done ? "is-done" : ""} ${draggingId === item.id ? "is-dragging" : ""} ${dragOverId === item.id && draggingId !== item.id ? "is-drop-target" : ""}`}
          key={item.id}
          onPointerEnter={() => previewChecklistMove(item.id)}
        >
          <button
            className="checklist-drag"
            title="拖动排序"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              startChecklistDrag(item.id);
            }}
          >
            ↕
          </button>
          <button className={`mini-check ${item.done ? "done" : ""}`} title="完成子项" onClick={() => toggleItem(item.id)}>
            {item.done ? "✓" : ""}
          </button>
          <input
            value={itemDrafts[item.id] ?? item.text}
            onChange={(event) => setItemDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
            onBlur={() => saveItemText(item.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
          {item.carried_to_date ? <small>已延期至 {item.carried_to_date}</small> : null}
          <div className="checklist-menu-wrap">
            <button className="icon-more" title="清单操作" onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}>⋯</button>
            {openMenuId === item.id ? (
              <div className="checklist-menu">
                <button onClick={() => openResult(item)}>结果</button>
                <button onClick={() => setOpenCarryId(openCarryId === item.id ? null : item.id)} disabled={savingId === "checklist"}>延期</button>
                <button className="text-danger" onClick={() => removeItem(item.id)}>删除</button>
              </div>
            ) : null}
          </div>
          {openCarryId === item.id ? (
            <div className="checklist-carry-menu">
              <button onClick={() => carryToDate(item.id, addDaysKey(task.date || todayKey(), 1))}>明天</button>
              <button onClick={() => carryToDate(item.id, addDaysKey(task.date || todayKey(), 2))}>后天</button>
              <button onClick={() => carryToDate(item.id, nextWeekStartKey(task.date || todayKey()))}>下周一</button>
              <div className="postpone-custom">
                <input type="date" value={customCarryDate} onChange={(event) => setCustomCarryDate(event.target.value)} />
                <button onClick={() => carryToDate(item.id, customCarryDate)}>确定</button>
              </div>
            </div>
          ) : null}
          {openResultId === item.id ? (
            <div className="checklist-result">
              <input
                value={resultDrafts[item.id] ?? item.result_note ?? ""}
                placeholder="一句结果 / 反馈"
                onChange={(event) => setResultDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveResult(item.id);
                }}
              />
              <button onClick={() => saveResult(item.id)} disabled={resultSaveStatus[item.id] === "saving"}>
                {resultSaveStatus[item.id] === "saving" ? "保存中..." : resultSaveStatus[item.id] === "saved" ? "已保存" : resultSaveStatus[item.id] === "error" ? "保存失败" : "保存"}
              </button>
            </div>
          ) : null}
        </div>
      ))}
      <div className="checklist-add">
        <input
          value={draft}
          placeholder="添加行动清单"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addItem();
          }}
        />
        <button onClick={addItem}>添加</button>
      </div>
    </div>
  );
}

export function goalShortTitle(goal: Goal | null | undefined) {
  if (!goal) return "";
  return goal.title.replace(/^在\d+天内/, "").replace(/^在\d{4}年.*?期间，?/, "").slice(0, 22);
}

export function CompactTask({
  task,
  onRefresh,
  elevated = false,
  onReplace,
  goal,
  onGoalClick,
  goalOpen = false,
  focusLabel,
  onCompleteStarted,
  detailsOpen,
  onDetailsToggle,
  checklistOpen,
  onChecklistToggle,
  alwaysShowMeta = false,
  hideSideActions = false,
  inlineActions,
}: {
  task: Task;
  onRefresh: () => void;
  elevated?: boolean;
  onReplace?: () => void;
  goal?: Goal | null;
  onGoalClick?: () => void;
  goalOpen?: boolean;
  focusLabel?: string;
  onCompleteStarted?: (taskId: string) => void | Promise<void>;
  detailsOpen?: boolean;
  onDetailsToggle?: (open: boolean) => void;
  checklistOpen?: boolean;
  onChecklistToggle?: () => void;
  alwaysShowMeta?: boolean;
  hideSideActions?: boolean;
  inlineActions?: ReactNode;
}) {
  const [optimisticDone, setOptimisticDone] = useState(false);
  const [localDetailsOpen, setLocalDetailsOpen] = useState(false);
  const done = task.status === "完成" || optimisticDone;
  const progress = checklistProgress(task);
  const isDetailsOpen = detailsOpen ?? localDetailsOpen;
  const estimate = estimateText(task);

  useEffect(() => {
    setOptimisticDone(false);
  }, [task.id, task.status]);

  async function patch(updates: Partial<Task>) {
    await apiFetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    onRefresh();
  }

  async function toggleComplete() {
    try {
      if (!done) await onCompleteStarted?.(task.id);
      await patch({ status: done ? "未开始" : "完成" });
      setOptimisticDone(!done);
    } catch { setOptimisticDone(task.status === "完成"); }
  }

  function toggleDetails() {
    const next = !isDetailsOpen;
    setLocalDetailsOpen(next);
    onDetailsToggle?.(next);
  }

  return (
    <article className={`task-row ${elevated ? "task-row-large" : ""} ${done ? "is-done" : ""}`}>
      <button className={`check ${done ? "done" : ""}`} title="完成" onClick={toggleComplete}>
        {done ? "✓" : ""}
      </button>
      <div className="task-copy" role="button" tabIndex={0} onClick={toggleDetails} onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") toggleDetails();
      }}>
        <strong>{task.title}</strong>
        {isDetailsOpen || elevated || alwaysShowMeta ? (
          <span>
            <DimensionDot dimension={task.dimension_primary} />
            {focusLabel ? <em className="focus-badge">{focusLabel}</em> : null}
            <b>{taskSourceLabel(task)}</b>
            {task.dimension_primary}
            {task.dimension_secondary ? ` / ${task.dimension_secondary}` : ""} · {task.priority}{estimate ? ` · ${estimate}` : ""}
            {goal ? (
              <>
                {" · "}
                {onGoalClick ? <button className={`meta-button ${goalOpen ? "is-active" : ""}`} onClick={(event) => {
                  event.stopPropagation();
                  onGoalClick();
                }}>目标</button> : <span>目标</span>}
              </>
            ) : null}
            {onChecklistToggle && (elevated || alwaysShowMeta) ? (
              <>
                {" · "}
                <button className={`meta-button ${checklistOpen ? "is-active" : ""}`} onClick={(event) => {
                  event.stopPropagation();
                  onChecklistToggle();
                }}>{checklistOpen ? "收起清单" : `清单${progress ? ` ${progress}` : ""}`}</button>
              </>
            ) : progress ? ` · 清单 ${progress}` : ""}
            {inlineActions ? (
              <>
                {" · "}
                {inlineActions}
              </>
            ) : null}
          </span>
        ) : null}
      </div>
      {elevated && onReplace ? <button className="replace-button" onClick={onReplace}>替换</button> : null}
      {!elevated && !hideSideActions ? (
        <div className="task-side-actions">
          <span className={`priority priority-${task.priority}`}>{task.priority}</span>
          {onChecklistToggle && progress ? (
            <button className="task-side-checklist" onClick={onChecklistToggle}>{checklistOpen ? "收起清单" : `清单 ${progress}`}</button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function HabitTask({ task, onRefresh, tasks = [], onCompleteStarted }: { task: Task; onRefresh: () => void; tasks?: Task[]; onCompleteStarted?: (taskId: string) => void | Promise<void> }) {
  const [result, setResult] = useState(task.result_note || "");
  const [resultOpen, setResultOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function patch(updates: Partial<Task>) {
    try {
    setSaveStatus("saving");
    try {
      await apiFetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      setSaveStatus("saved");
      onRefresh();
      window.setTimeout(() => setSaveStatus("idle"), 1400);
    } catch {
      setSaveStatus("error");
    }
  
    } catch { setSaveStatus("idle"); }
}

  useEffect(() => {
    if (!detailsOpen) {
      setChecklistOpen(false);
      setResultOpen(false);
    }
  }, [detailsOpen]);

  return (
    <div className="quiet-task">
      <CompactTask
        task={task}
        onRefresh={onRefresh}
        onCompleteStarted={onCompleteStarted}
        detailsOpen={detailsOpen}
        onDetailsToggle={setDetailsOpen}
        checklistOpen={checklistOpen}
        onChecklistToggle={() => setChecklistOpen((value) => !value)}
        alwaysShowMeta
        hideSideActions
        inlineActions={(
          <>
          <button className="meta-button" onClick={() => patch({ status: task.status === "跳过" ? "未开始" : "跳过" })}>{task.status === "跳过" ? "恢复打卡" : "跳过今天"}</button>
          <button className={`meta-button ${resultOpen ? "is-active" : ""}`} onClick={(event) => {
            event.stopPropagation();
            setResultOpen((value) => !value);
          }}>{resultOpen ? "收起结果" : "结果"}</button>
          </>
        )}
      />
      {checklistOpen ? <TaskChecklist task={task} onRefresh={onRefresh} tasks={tasks} /> : null}
      {resultOpen ? (
        <div className="result-tools">
          <input value={result} placeholder="一句结果" onChange={(event) => setResult(event.target.value)} />
          <button onClick={() => patch({ result_note: result })} disabled={saveStatus === "saving"}>{saveStatus === "saving" ? "保存中..." : saveStatus === "saved" ? "已保存" : saveStatus === "error" ? "保存失败" : "保存"}</button>
        </div>
      ) : null}
    </div>
  );
}

export function StaleTaskRow({ task, yesterday, onPatch }: { task: Task; yesterday: string; onPatch: (id: string, updates: Partial<Task>) => void | Promise<void> }) {
  const [completionDate, setCompletionDate] = useState(task.date || yesterday);
  const [carryStatus, setCarryStatus] = useState<"idle" | "saving" | "error">("idle");
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const checklist = task.checklist || [];
  const doneItems = checklist.filter((item) => item.done);
  const unfinishedItems = checklist.filter((item) => !item.done && item.carry_status !== "carried");
  const carriedItems = checklist.filter((item) => item.carried_to_date);
  const hasChecklist = checklist.length > 0;

  function completeWithDate() {
    onPatch(task.id, {
      status: "完成",
      completed_at: completedAtForDate(completionDate || yesterday),
    });
  }

  async function carryUnfinishedToToday() {
    try {
    if (!unfinishedItems.length) return;
    setActionMenuOpen(false);
    setCarryStatus("saving");
    const carriedChecklist = unfinishedItems.map((item) => ({
      id: createChecklistId(),
      text: item.result_note?.trim() ? `${item.text}（继续：${item.result_note.trim()}）` : item.text,
      done: false,
      result_note: "",
      carry_status: "none" as const,
      carried_to_task_id: null,
      carried_to_date: null,
    }));

    try {
      const response = await apiFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `继续推进：${task.title}`,
          description: `由 ${task.date || yesterday} 的未完成清单转入今天`,
          date: todayKey(),
          dimension_primary: task.dimension_primary,
          dimension_secondary: task.dimension_secondary,
          type: task.type,
          priority: task.priority,
          priority_source: "user",
          goal_id: task.goal_id,
          project_id: task.project_id,
          habit_id: null,
          is_habit: false,
          is_must_today: task.priority === "A",
          due_date: null,
          due_time: null,
          reminder_time: null,
          calendar_sync_status: "none",
          estimated_minutes: task.estimated_minutes,
          source: "manual",
          checklist: carriedChecklist,
        }),
      });
      if (!response.ok) throw new Error(`续做任务创建失败：${response.status}`);
      const data = await response.json();
      const targetTaskId = data.tasks?.[0]?.id || null;
      await onPatch(task.id, {
        status: "完成",
        completed_at: completedAtForDate(yesterday),
        result_note: task.result_note ? `${task.result_note}\n未完成清单已转入 ${todayKey()}` : `未完成清单已转入 ${todayKey()}`,
        checklist: checklist.map((item) => unfinishedItems.some((entry) => entry.id === item.id) ? {
          ...item,
          carry_status: "carried",
          carried_to_task_id: targetTaskId,
          carried_to_date: todayKey(),
        } : item),
      });
      setCarryStatus("idle");
    } catch {
      setCarryStatus("error");
      window.setTimeout(() => setCarryStatus("idle"), 2200);
    }
  
    } catch { setCarryStatus("idle"); }
}

  return (
    <article className="stale-row">
      <div>
        <strong>{task.title}</strong>
        <span><DimensionDot dimension={task.dimension_primary} />{taskSourceLabel(task)} · {task.priority}{estimateText(task) ? ` · ${estimateText(task)}` : ""}</span>
        {hasChecklist ? (
          <button className="stale-checklist-progress" onClick={() => setChecklistOpen((value) => !value)}>
            清单 {doneItems.length}/{checklist.length}
            {unfinishedItems.length ? ` · 未完成 ${unfinishedItems.length}` : ""}
            {carriedItems.length ? ` · 已转 ${carriedItems.length}` : ""}
          </button>
        ) : null}
      </div>
      <div className="stale-actions">
        <div className="stale-complete-control">
          <input type="date" value={completionDate} max={todayKey()} onChange={(event) => setCompletionDate(event.target.value)} aria-label="完成日期" />
          <button className="stale-complete" onClick={completeWithDate}>补记完成</button>
        </div>
        <div className="stale-more-wrap">
          <button onClick={() => setActionMenuOpen((value) => !value)}>更多</button>
          {actionMenuOpen ? (
            <div className="stale-action-menu">
              {unfinishedItems.length ? (
                <button onClick={carryUnfinishedToToday} disabled={carryStatus === "saving"}>
                  {carryStatus === "saving" ? "转入中..." : carryStatus === "error" ? "转入失败" : "只顺延未完成子项"}
                </button>
              ) : null}
              <button onClick={() => {
                setActionMenuOpen(false);
                onPatch(task.id, { date: todayKey(), is_must_today: task.priority === "A" });
              }}>顺延今天</button>
              <button onClick={() => {
                setActionMenuOpen(false);
                onPatch(task.id, { date: "", is_must_today: false });
              }}>放回本周</button>
              <button className="text-danger" onClick={() => {
                setActionMenuOpen(false);
                onPatch(task.id, { status: "取消" });
              }}>放弃</button>
            </div>
          ) : null}
        </div>
      </div>
      {checklistOpen ? (
        <div className="stale-checklist-detail">
          {checklist.map((item) => {
            const carried = Boolean(item.carried_to_date);
            const stateLabel = carried ? `已转 ${item.carried_to_date}` : item.done ? "完成" : "未完成";
            return (
              <div className={`stale-checklist-item ${item.done ? "is-done" : ""} ${carried ? "is-carried" : ""}`} key={item.id}>
                <span className={`mini-check ${item.done ? "done" : ""}`}>{item.done ? "✓" : ""}</span>
                <p>{item.text}</p>
                <small>{stateLabel}</small>
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

export function EditableTask({ task, state, onRefresh, focusLabel, onCompleteStarted }: { task: Task; state: StateResponse; onRefresh: () => void; focusLabel?: string; onCompleteStarted?: (taskId: string) => void | Promise<void> }) {
  const [note, setNote] = useState(task.result_note || "");
  const [linkOpen, setLinkOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [postponeOpen, setPostponeOpen] = useState(false);
  const [customPostponeDate, setCustomPostponeDate] = useState(addDaysKey(todayKey(), 1));
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const goal = task.goal_id ? state.goals.find((item) => item.id === task.goal_id) || null : null;
  const goalWeekTasks = goal ? state.tasks
    .filter((item) => item.goal_id === goal.id && item.id !== task.id && inDateRange(taskRangeDate(item), rangeBounds("week").start, rangeBounds("week").end))
    .slice(0, 4) : [];

  async function patch(updates: Partial<Task>) {
    try {
    setSaveStatus("saving");
    try {
      await apiFetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      setSaveStatus("saved");
      onRefresh();
      window.setTimeout(() => setSaveStatus("idle"), 1400);
    } catch {
      setSaveStatus("error");
    }
  
    } catch { setSaveStatus("idle"); }
}

  useEffect(() => {
    if (!detailsOpen) {
      setChecklistOpen(false);
      setResultOpen(false);
      setMoreOpen(false);
      setGoalOpen(false);
      setLinkOpen(false);
      setPostponeOpen(false);
    }
  }, [detailsOpen]);

  async function remove() {
    await apiFetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    onRefresh();
  }

  async function postponeTo(date: string) {
    if (!date) return;
    setMoreOpen(false);
    setPostponeOpen(false);
    await patch({
      status: "延期",
      date,
      is_must_today: false,
      is_focus: false,
      focus_order: null,
    });
  }

  const taskInlineActions = (
    <>
      <button className={`meta-button ${resultOpen ? "is-active" : ""}`} onClick={(event) => {
        event.stopPropagation();
        setResultOpen((value) => !value);
      }}>{resultOpen ? "收起进展" : `进展 / 反馈${task.progress_logs?.length ? ` ${task.progress_logs.length}` : ""}`}</button>
      {" · "}
      <span className="task-more-wrap task-more-inline">
        <button className={`meta-button ${moreOpen ? "is-active" : ""}`} onClick={(event) => {
          event.stopPropagation();
          setMoreOpen((value) => !value);
        }}>更多</button>
        {moreOpen ? (
          <span className="task-action-menu" onClick={(event) => event.stopPropagation()}>
            <button onClick={(event) => {
              event.stopPropagation();
              setLinkOpen((value) => !value);
            }} className={linkOpen ? "is-active" : ""}>{linkOpen ? "收起关联目标" : "关联目标"}</button>
            <button className={postponeOpen ? "is-active" : ""} onClick={(event) => {
              event.stopPropagation();
              setPostponeOpen((value) => !value);
            }}>延期</button>
            {postponeOpen ? (
              <span className="postpone-menu" onClick={(event) => event.stopPropagation()}>
                <button onClick={(event) => {
                  event.stopPropagation();
                  postponeTo(addDaysKey(todayKey(), 1));
                }}>明天</button>
                <span className="postpone-custom">
                  <input type="date" value={customPostponeDate} onClick={(event) => event.stopPropagation()} onChange={(event) => setCustomPostponeDate(event.target.value)} />
                  <button onClick={(event) => {
                    event.stopPropagation();
                    postponeTo(customPostponeDate);
                  }}>确定</button>
                </span>
              </span>
            ) : null}
            <button className="text-danger" onClick={(event) => {
              event.stopPropagation();
              remove();
            }}>删除</button>
          </span>
        ) : null}
      </span>
    </>
  );

  return (
    <div className="quiet-task">
      <CompactTask task={task} onRefresh={onRefresh} goal={goal} onGoalClick={goal ? () => setGoalOpen((value) => !value) : undefined} goalOpen={goalOpen} focusLabel={focusLabel} onCompleteStarted={onCompleteStarted} detailsOpen={detailsOpen} onDetailsToggle={setDetailsOpen} checklistOpen={checklistOpen} onChecklistToggle={() => setChecklistOpen((value) => !value)} alwaysShowMeta hideSideActions inlineActions={taskInlineActions} />
      <TaskTiming task={task} onRefresh={onRefresh} />
      {resultOpen ? (
        <TaskProgressPanel task={task} onRefresh={onRefresh} />
      ) : null}
      {checklistOpen ? <TaskChecklist task={task} onRefresh={onRefresh} tasks={state.tasks} /> : null}
      {goalOpen && goal ? (
        <div className="goal-context">
          <div>
            <span>目标</span>
            <strong>{goal.title}</strong>
          </div>
          <div className="goal-context-stage">
            <strong>目标下一步</strong>
            <p>{goalNextAction(goal, state) || "尚未设定"}</p>
          </div>
          <p>成功标准：{goal.success_metric || "尚未设定"}</p>
          {goalWeekTasks.length ? (
            <div className="goal-context-list">
              <span>本周同目标任务</span>
              {goalWeekTasks.map((item) => <small key={item.id}>{taskRangeDate(item)} · {item.title}</small>)}
            </div>
          ) : null}
        </div>
      ) : null}
      {linkOpen ? (
        <div className="link-tools">
          <select value={task.goal_id || ""} onChange={(event) => patch({ goal_id: event.target.value || null, project_id: null })}>
            <option value="">无目标</option>
            {state.goals.map((goal) => <option value={goal.id} key={goal.id}>{goal.title}</option>)}
          </select>
        </div>
      ) : null}
    </div>
  );
}

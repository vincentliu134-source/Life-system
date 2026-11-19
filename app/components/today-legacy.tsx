"use client";

import { useEffect, useRef, useState } from "react";
import { EditableTask, HabitTask } from "./tasks";
import { InboxWorkspace } from "./today";
import { type StateResponse } from "./shared";
import { apiFetch } from "@/lib/client-api";
import { todayKey } from "@/lib/date";
import { isHabit } from "@/lib/planning";
import { sortDailyTasks, taskCategory } from "@/lib/task-workflow";

export function TodayPage({ state, onRefresh, onReview }: { state: StateResponse; onRefresh: () => void; onReview: () => void }) {
  const today = todayKey();
  const work = sortDailyTasks(state.tasks.filter(task => task.date === today && !isHabit(task) && !["取消", "延期"].includes(task.status)), state);
  const habits = state.tasks.filter(task => task.date === today && isHabit(task) && task.status !== "取消");
  const [localIds, setLocalIds] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"A" | "B" | "C">("B");
  const [creating, setCreating] = useState(false);
  const active = useRef<string | null>(null);
  const touchIds = useRef<string[] | null>(null);
  const startIds = useRef<string[]>([]);
  const saving = useRef(false);
  const touchMoved = useRef(false);
  const signature = work.map(task => `${task.id}:${task.sort_order ?? ""}:${task.priority}:${task.status}`).join("|");
  useEffect(() => { if (!active.current && !saving.current) setLocalIds(null); }, [signature]);
  const byId = new Map(work.map(task => [task.id, task]));
  const ordered = localIds ? [...localIds.map(id => byId.get(id)).filter((task): task is typeof work[number] => Boolean(task)), ...work.filter(task => !localIds.includes(task.id))] : work;

  function move(ids: string[], id: string, target: string) {
    const from = ids.indexOf(id), to = ids.indexOf(target);
    if (from < 0 || to < 0 || from === to) return ids;
    const next = [...ids]; next.splice(from, 1); next.splice(to, 0, id); return next;
  }

  async function persist(ids: string[], reset = false) {
    if (saving.current) return;
    saving.current = true; setBusy(true); setNotice("");
    if (!reset) setLocalIds(ids);
    try {
      await apiFetch("/api/tasks/order", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: today, ids, reset }) });
      await onRefresh();
      setNotice(reset ? "已按重要程度重新排序" : "顺序已保存");
    } catch (error) { setNotice(error instanceof Error ? error.message : "顺序保存失败，请重试"); }
    finally { setLocalIds(null); saving.current = false; setBusy(false); }
  }

  function moveOne(id: string, offset: number) {
    const ids = ordered.map(task => task.id), from = ids.indexOf(id);
    if (from < 0) return;
    const to = Math.max(0, Math.min(ids.length - 1, from + offset));
    if (from !== to) void persist(move(ids, id, ids[to]));
  }

  async function addTemporary() {
    if (!title.trim() || creating) return;
    setCreating(true); setNotice("");
    try {
      await apiFetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim(), priority, priority_source: "user", date: today, origin: "ad_hoc", source: "added" }) });
      setTitle(""); setAdding(false); await onRefresh();
      setNotice("临时事项已加入今日任务");
    } catch (error) { setNotice(error instanceof Error ? error.message : "新增失败，请重试"); }
    finally { setCreating(false); }
  }

  return <section className="today-stack page-enter">
    <section className="panel today-task-panel unified-today">
      <div className="section-head"><div><h1>今日任务</h1><p className="quiet-note">从上到下按重要程度处理，拖动左侧手柄调整顺序。未完成事项次日自动顺延。</p></div><div className="daily-header-actions"><button className="primary" onClick={() => setAdding(value => !value)}>{adding ? "收起添加" : "添加临时事项"}</button><button className="text-button" onClick={onReview}>晚间复盘</button></div></div>
      {adding ? <form className="daily-quick-add" onSubmit={event => { event.preventDefault(); void addTemporary(); }}><label>临时事项名称<input autoFocus value={title} onChange={event => setTitle(event.target.value)} placeholder="今天临时需要处理什么？" /></label><label>重要程度<select value={priority} onChange={event => setPriority(event.target.value as typeof priority)}><option value="A">A · 重要</option><option value="B">B · 一般</option><option value="C">C · 较低</option></select></label><button className="primary" type="submit" disabled={creating || !title.trim()}>{creating ? "添加中…" : "加入今日任务"}</button></form> : null}
      <div className="daily-list-summary"><span>已完成 {work.filter(task => task.status === "完成").length}/{work.length}</span><span>计划内 {work.filter(task => taskCategory(task) === "计划内").length}</span><span>临时新增 {work.filter(task => taskCategory(task) === "临时新增").length}</span><span>等待反馈 {work.filter(task => task.status === "等待反馈").length}</span><button className="text-button" disabled={busy || !work.length} onClick={() => void persist([], true)}>按重要程度重排</button></div>
      <p className="quiet-note daily-order-note">手动顺序会保留；新增事项接在手动列表后，可拖动或置顶。勾选完成表示这件事已经闭合。</p>
      <div className="daily-work-list" aria-label="按重要程度排列的今日任务">
        {ordered.map((task, index) => <article key={task.id} data-daily-task-id={task.id} className={`daily-work-item ${dragging === task.id ? "dragging" : ""} ${over === task.id ? "drag-over" : ""} ${task.status === "完成" ? "finished" : ""}`}>
          <div className="daily-item-bar">
            <button className="daily-drag-handle" disabled={busy} aria-label={`拖动排序：${task.title}`} title="拖动排序；也可按上下方向键或 Home 置顶"
              onKeyDown={event => { if (["ArrowUp", "ArrowDown", "Home"].includes(event.key)) { event.preventDefault(); moveOne(task.id, event.key === "Home" ? -index : event.key === "ArrowUp" ? -1 : 1); } }}
              onPointerDown={event => { if (busy) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); active.current = task.id; startIds.current = ordered.map(item => item.id); touchIds.current = startIds.current; touchMoved.current = false; setDragging(task.id); }}
              onPointerMove={event => { if (!active.current) return; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-daily-task-id]")?.dataset.dailyTaskId; if (target) { const ids = startIds.current; const next = move(ids, active.current, target); touchMoved.current = next.some((id, position) => id !== ids[position]); touchIds.current = next; setOver(target === active.current ? null : target); } }}
              onPointerUp={event => { if (!active.current) return; active.current = null; setDragging(null); setOver(null); if (touchMoved.current && touchIds.current) void persist(touchIds.current); touchIds.current = null; }}
              onPointerCancel={() => { active.current = null; touchIds.current = null; setDragging(null); setOver(null); setLocalIds(null); }}>⠿</button>
            <span className="daily-rank">{index + 1}</span><span className={`daily-origin ${taskCategory(task) === "计划内" ? "planned" : ""}`}>{taskCategory(task)}</span>
            <span className={`workflow-status ${task.status === "等待反馈" ? "waiting" : ""}`}>{task.status}</span>
            {task.source === "calendar" || task.due_time ? <span className="daily-context">日程{task.due_time ? ` ${task.due_time}` : ""}</span> : null}
            {task.project_id ? <span className="daily-context">{state.projects.find(item => item.id === task.project_id)?.title || "项目任务"}</span> : null}
            <div className="daily-position-actions"><button className="text-button" aria-label={`置顶：${task.title}`} disabled={busy || index === 0} onClick={() => moveOne(task.id, -index)}>置顶</button><button className="text-button" aria-label={`上移：${task.title}`} disabled={busy || index === 0} onClick={() => moveOne(task.id, -1)}>↑</button><button className="text-button" aria-label={`下移：${task.title}`} disabled={busy || index === ordered.length - 1} onClick={() => moveOne(task.id, 1)}>↓</button></div>
          </div>
          <EditableTask task={task} state={state} onRefresh={onRefresh} />
          {task.status === "等待反馈" && task.waiting_on ? <p className="daily-task-update waiting">等待：{task.waiting_on}</p> : null}
          {task.progress_logs?.length ? <p className="daily-task-update">最新进展：{task.progress_logs[task.progress_logs.length - 1].content}</p> : null}
          {task.next_action && task.status !== "完成" ? <p className="daily-task-update">下一步：{task.next_action}</p> : null}
          {task.follow_up_date && task.status !== "完成" ? <p className={`daily-task-update ${task.follow_up_date <= today ? "follow-up-due" : ""}`}>跟进日期：{task.follow_up_date}{task.follow_up_date <= today ? " · 需要跟进" : ""}</p> : null}
        </article>)}
        {!work.length ? <div className="empty">今天还没有任务，可从目标安排，或在下方添加临时事项。</div> : null}
      </div>
      <p className="daily-order-message" role="status">{busy ? "正在保存顺序…" : notice}</p>
    </section>
    <section className="split capture-habit-split"><InboxWorkspace state={state} onRefresh={onRefresh} showInbox={false} /><section className="panel"><div className="section-head"><h2>今日打卡</h2><span>{habits.filter(task => task.status === "完成").length}/{habits.length}</span></div>{habits.length ? habits.map(task => <HabitTask key={task.id} task={task} tasks={state.tasks} onRefresh={onRefresh} />) : <div className="empty">今天没有待安排的习惯。</div>}</section></section>
    <InboxWorkspace state={state} onRefresh={onRefresh} showCapture={false} />
  </section>;
}

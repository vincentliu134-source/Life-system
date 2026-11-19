"use client";
import { apiFetch } from "@/lib/client-api";
import { addDateDays,dateBounds,todayKey } from "@/lib/date";
import { dailyCapacity,habitSummary,isHabit,isOpen } from "@/lib/planning";
import type { AppState,Task } from "@/lib/types";
import { useEffect,useState } from "react";

const json = (body: unknown, method = "PATCH") => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function CapacityPanel({ state, onRefresh, date = todayKey() }: { state: AppState; onRefresh: () => void; date?: string }) {
  const capacity = dailyCapacity(state, date);
  const [available, setAvailable] = useState(capacity.available_minutes);
  const [buffer, setBuffer] = useState(capacity.buffer_minutes);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setAvailable(capacity.available_minutes); setBuffer(capacity.buffer_minutes); }, [date, capacity.available_minutes, capacity.buffer_minutes]);
  async function save() { setSaving(true); try { await apiFetch("/api/plans", json({ date, plan: { available_minutes: available, buffer_minutes: buffer } })); await onRefresh(); } catch {} finally { setSaving(false); } }
  const optional = state.tasks.filter((task) => task.date === date && !isHabit(task) && isOpen(task) && !task.is_must_today && !task.due_time).sort((a, b) => b.estimated_minutes - a.estimated_minutes);
  return <section className="panel capacity-panel">
    <div className="section-head"><h2>{date === todayKey() ? "今日可用时间" : `${date} 可用时间`}</h2><span>{capacity.configured ? "已设定" : "建议值，待确认"}</span></div>
    <div className="planning-fields">
      <label>可安排的总时间（分钟）<input aria-label="可安排的总时间" type="number" min="0" max="1440" value={available} onChange={(e) => setAvailable(Number(e.target.value))} /></label>
      <label>保留缓冲（分钟）<input aria-label="保留缓冲" type="number" min="0" max={available} value={buffer} onChange={(e) => setBuffer(Number(e.target.value))} /></label>
      <button onClick={save} disabled={saving || buffer > available}>{saving ? "保存中…" : "保存容量"}</button>
    </div>
    <p className={capacity.overloaded ? "review-alert" : "quiet-note"}>已安排 {capacity.scheduled} 分钟 · 可安排 {capacity.budget} 分钟 · {capacity.overloaded ? `超出 ${-capacity.remaining}` : `剩余 ${capacity.remaining}`} 分钟{capacity.unknown ? ` · ${capacity.unknown}项待估时，暂不能确认是否做得下` : ""}</p>
    <small>总时间包含本页任务、固定日程和习惯，已完成事项也计入当天投入。</small>
    {capacity.overloaded && optional[0] ? <p>可考虑移出「{optional[0].title}」（{optional[0].estimated_minutes || "待估"}分钟）。<button className="text-button" onClick={async () => { try { await apiFetch(`/api/tasks/${optional[0].id}`, json({ date: "", is_focus: false, focus_order: null })); onRefresh(); } catch {} }}>放回待安排</button></p> : null}
  </section>;
}

export function TaskTiming({ task, onRefresh }: { task: Task; onRefresh: () => void }) {
  const [draft, setDraft] = useState({ date: task.date, due_date: task.due_date || "", due_time: task.due_time || "", scheduled_end_time: task.scheduled_end_time || "", estimated_minutes: task.estimated_minutes || 0 });
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft({ date: task.date, due_date: task.due_date || "", due_time: task.due_time || "", scheduled_end_time: task.scheduled_end_time || "", estimated_minutes: task.estimated_minutes || 0 }); }, [task.date, task.due_date, task.due_time, task.scheduled_end_time, task.estimated_minutes]);
  async function save() { setBusy(true); try { await apiFetch(`/api/tasks/${task.id}`, json({ ...draft, due_date: draft.due_date || null, due_time: draft.due_time || null, scheduled_end_time: draft.scheduled_end_time || null })); await onRefresh(); } catch {} finally { setBusy(false); } }
  return <details className="task-timing"><summary>时间安排 · {task.estimated_minutes ? `${task.estimated_minutes}分钟` : "待估时"}{task.due_date ? ` · 截止${task.due_date}` : ""}</summary><div className="planning-fields">
    <label>计划日期<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
    <label>真实截止日期（可留空）<input type="date" value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} /></label>
    <label>固定日程开始<input type="time" value={draft.due_time} onChange={(e) => setDraft({ ...draft, due_time: e.target.value })} /></label>
    <label>固定日程结束<input type="time" value={draft.scheduled_end_time} onChange={(e) => setDraft({ ...draft, scheduled_end_time: e.target.value })} /></label>
    <label>预计分钟<input type="number" min="0" max="1440" value={draft.estimated_minutes} onChange={(e) => setDraft({ ...draft, estimated_minutes: Number(e.target.value) })} /></label>
  </div><div className="chips">{[15, 30, 60, 90].map((minutes) => <button key={minutes} onClick={() => setDraft({ ...draft, estimated_minutes: minutes })}>{minutes}分钟</button>)}<button onClick={save} disabled={busy}>{busy ? "保存中…" : "保存时间安排"}</button></div><small>改计划日期会保留真实截止日期。固定日程也请填写预计分钟。</small></details>;
}

export function HabitHistory({ state, onRefresh }: { state: AppState; onRefresh: () => void }) {
  const history = state.tasks.filter((task) => isHabit(task) && task.date < todayKey()).sort((a, b) => b.date.localeCompare(a.date));
  return <details className="panel"><summary>习惯记录与恢复</summary><p className="quiet-note">未记录不代表没有做；历史习惯不进入普通任务补做队列。</p>
    {state.habits.map((habit) => { const summary = habitSummary(state, habit.id); return <p key={habit.id}>{habit.title} · 本周{summary.completed}{habit.frequency === "每周自由3次" ? "/3" : ""}次 · 跳过{summary.skipped}次 · 未记录{summary.unrecorded}次{summary.resumed ? " · 中断后已恢复" : ""}</p>; })}
    {history.slice(0, 60).map((task) => <div className="habit-history-row" key={task.id}><span>{task.date} · {task.title}</span><select aria-label={`${task.title} ${task.date}记录状态`} value={isOpen(task) ? "未记录" : task.status} onChange={async (e) => { try { await apiFetch(`/api/tasks/${task.id}`, json({ status: e.target.value, ...(e.target.value === "完成" ? { completed_at: new Date(`${task.date}T12:00:00`).toISOString() } : {}) })); onRefresh(); } catch {} }}><option>完成</option><option>跳过</option><option>未记录</option>{task.status === "取消" ? <option>取消</option> : null}</select></div>)}
    {history.length > 60 ? <small>显示最近60条，完整历史保留在备份中。</small> : null}
  </details>;
}

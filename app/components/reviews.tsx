"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";
import { addDateDays, dateBounds, todayKey } from "@/lib/date";
import { isHabit, isOpen } from "@/lib/planning";
import { sortDailyTasks, taskAtDate } from "@/lib/task-workflow";
import { goalActions, goalIsActive } from "@/lib/simple-goals";
import { formatDateTime, type StateResponse } from "./shared";
import type { Goal } from "@/lib/types";

function DailyCheckIn({ state, onRefresh }: { state: StateResponse; onRefresh: () => void }) {
  const today = todayKey();
  const latest = state.daily_reviews.find(review => review.date === today);
  const [adjustment, setAdjustment] = useState(latest?.adjustment ?? latest?.blockers ?? "");
  const savedTask = state.tasks.find(task => task.id === latest?.tomorrow_first_task_id && !isHabit(task) && isOpen(task));
  const [choice, setChoice] = useState(savedTask ? latest?.tomorrow_first_source === "new" ? "new" : savedTask.id : latest?.tomorrow_first_task_id ? "" : latest?.tomorrow_first_text ? "new" : "");
  const [manual, setManual] = useState(latest?.tomorrow_first_text || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const candidates = sortDailyTasks(state.tasks.filter(task => !isHabit(task) && isOpen(task)), state);
  const done = state.tasks.filter(task => !isHabit(task) && task.status === "完成" && (task.completed_at ? todayKey(new Date(task.completed_at)) === today : task.date === today));
  const waiting = state.tasks.filter(task => !isHabit(task) && task.date === today && task.status === "等待反馈");
  const progress = state.tasks.flatMap(task => (task.progress_logs || []).filter(entry => todayKey(new Date(entry.created_at)) === today).map(entry => ({ ...entry, taskTitle: task.title, taskId: task.id }))).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const advanced = new Set(progress.map(entry => entry.taskId));
  async function save() {
    setBusy(true); setMessage("");
    try {
      await apiFetch("/api/reviews/quick", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: today, adjustment, tomorrow_first_task_id: choice && choice !== "new" ? choice : null, tomorrow_first_text: choice === "new" ? manual : "" }) });
      await onRefresh(); setMessage(choice ? "已保存，所选事项会排在明日列表前面。" : "已保存，未完成事项照常自动顺延。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败，请重试"); }
    finally { setBusy(false); }
  }
  return <div className="simple-daily-review">
    <div className="review-auto-strip"><span>今天已记录</span><strong>推进 {advanced.size} 项</strong><strong>完成 {done.length} 项</strong><strong>等待反馈 {waiting.length} 项</strong></div>
    <details className="review-auto-details"><summary>查看已有记录，不用重复写</summary>{progress.length ? progress.map(entry => <article key={entry.id}><small>{formatDateTime(entry.created_at)} · {entry.taskTitle}</small><p>{entry.content}</p></article>) : null}{done.filter(task => !advanced.has(task.id)).map(task => <article key={task.id}><strong>已完成 · {task.title}</strong>{task.result_note ? <p>{task.result_note}</p> : null}</article>)}{waiting.map(task => <article key={`waiting:${task.id}`}><strong>等待反馈 · {task.title}</strong>{task.waiting_on ? <p>{task.waiting_on}</p> : null}</article>)}{!progress.length && !done.length && !waiting.length ? <p className="quiet-note">今天还没有相关记录。</p> : null}</details>
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <label className="review-question"><span>今天有什么需要调整？</span><textarea rows={3} value={adjustment} onChange={event => setAdjustment(event.target.value)} placeholder="写一个发现或需要改变的地方；没有也可以留空。" /></label>
      <label className="review-question"><span>明天先推进什么？</span><select value={choice} onChange={event => setChoice(event.target.value)}><option value="">暂不指定，按原任务顺延</option>{candidates.map(task => <option key={task.id} value={task.id}>{task.title}{task.status === "等待反馈" ? " · 等待反馈" : ""}</option>)}<option value="new">新写一个具体动作</option></select></label>
      {choice === "new" ? <label className="review-new-action">明天先做的动作<input value={manual} onChange={event => setManual(event.target.value)} placeholder="一个可以开始的具体动作" /></label> : null}
      <p className="quiet-note">所选现有任务会改到明天，不会复制；其他未完成事项照常顺延。</p>
      <button className="primary" disabled={busy || choice === "new" && !manual.trim()}>{busy ? "保存中…" : "保存复盘"}</button><span className="simple-save-status" role="status">{message}</span>
    </form>
  </div>;
}

function WeeklyCheckIn({ state, onRefresh }: { state: StateResponse; onRefresh: () => void }) {
  const week = addDateDays(dateBounds("week").start, 7);
  const goals = state.goals.filter(goal => !["完成", "放弃"].includes(goal.status));
  const [decisions, setDecisions] = useState<Record<string, "进行中" | "暂停" | "完成">>(() => Object.fromEntries(goals.map(goal => [goal.id, goalIsActive(goal) ? "进行中" : "暂停"])));
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const statusFor = (goal: Goal) => decisions[goal.id] || (goalIsActive(goal) ? "进行中" : "暂停");
  const actions = goals.filter(goal => statusFor(goal) === "进行中").flatMap(goal => goalActions(goal, state).map(action => ({ ...action, goal, id: `${goal.id}:${action.key}` })));
  function decide(goal: Goal, status: "进行中" | "暂停" | "完成") {
    setDecisions(current => ({ ...current, [goal.id]: status }));
    if (status !== "进行中") setSelected(current => Object.fromEntries(Object.entries(current).filter(([id]) => !id.startsWith(`${goal.id}:`))));
  }
  async function save() {
    setBusy(true); setMessage("");
    try {
      await apiFetch("/api/reviews/week", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decisions: goals.map(goal => ({ goal_id: goal.id, status: statusFor(goal) })), actions: actions.filter(action => selected[action.id]).map(action => ({ goal_id: action.goal.id, key: action.key, title: action.title, date: selected[action.id] })) }) });
      await onRefresh(); setSelected({}); setMessage("目标取舍已保存，勾选的行动已安排到下周。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败，请重试"); }
    finally { setBusy(false); }
  }
  return <div className="simple-week-review"><section><h2>哪些目标继续，哪些暂缓？</h2>{goals.map(goal => <label className="weekly-goal-decision" key={goal.id}><span>{goal.title}</span><select aria-label={`${goal.title}下周的选择`} value={statusFor(goal)} onChange={event => decide(goal, event.target.value as "进行中" | "暂停" | "完成")}><option value="进行中">继续推进</option><option value="暂停">暂缓</option><option value="完成">已完成</option></select></label>)}{!goals.length ? <p className="quiet-note">还没有需要取舍的目标。</p> : null}</section>
    <section><h2>下周准备推进哪些具体行动？</h2><p className="quiet-note">勾选后安排日期。已有任务会沿用并改期；未完成事项平时仍照常顺延。</p>{actions.map(action => <div className="weekly-action-choice" key={action.id}><label><input type="checkbox" checked={Boolean(selected[action.id])} onChange={event => setSelected(current => { const next = { ...current }; if (event.target.checked) next[action.id] = week; else delete next[action.id]; return next; })} /><span>{action.title}<small>{action.goal.title}{action.task ? ` · 已安排 ${action.task.date || "未指定日期"}` : ""}</small></span></label>{selected[action.id] ? <input type="date" aria-label={`${action.title}的下周日期`} min={week} max={addDateDays(week, 6)} value={selected[action.id]} onChange={event => setSelected(current => ({ ...current, [action.id]: event.target.value }))} /> : null}</div>)}{!actions.length ? <p className="quiet-note">继续推进的目标还没有下一步，可先去目标中补充。</p> : null}</section>
    <button className="primary" disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : "保存下周安排"}</button><p className="simple-save-status" role="status">{message}</p>
  </div>;
}

export function Reviews({ state, onRefresh }: { state: StateResponse; onRefresh: () => void }) {
  const [tab, setTab] = useState<"today" | "week" | "history">("today");
  return <section className="simple-reviews page-enter"><header className="page-kicker"><h1>复盘</h1><p>已有记录自动带出，只补充调整和下一步。</p></header><div className="subnav"><button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}>今天</button><button className={tab === "week" ? "active" : ""} onClick={() => setTab("week")}>本周</button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>历史</button></div><section className="panel">{tab === "today" ? <DailyCheckIn state={state} onRefresh={onRefresh} /> : tab === "week" ? <WeeklyCheckIn state={state} onRefresh={onRefresh} /> : <div className="simple-review-history">{[...state.daily_reviews].sort((a, b) => b.date.localeCompare(a.date)).map(review => { const done = state.tasks.map(task => taskAtDate(task, review.date)).filter(task => task?.status === "完成"); return <details key={review.id}><summary><strong>{review.date}</strong><span>{(review.adjustment ?? review.blockers) || "未填写调整"}</span></summary><p><b>需要调整：</b>{review.adjustment ?? review.blockers ?? "未填写"}</p><p><b>先推进：</b>{review.tomorrow_first_text || review.tomorrow_adjustment || "未指定"}</p>{done.length ? <p className="quiet-note">当日完成 {done.length} 项</p> : null}{review.wins || review.needed_resources || review.principle_alignment ? <details><summary>查看原有复盘内容</summary>{review.wins ? <p>进展与发现：{review.wins}</p> : null}{review.needed_resources ? <p>资源：{review.needed_resources}</p> : null}{review.principle_alignment ? <p>原则校准：{review.principle_alignment}</p> : null}</details> : null}</details>; })}{!state.daily_reviews.length ? <p className="empty">还没有保存过复盘。</p> : null}</div>}</section></section>;
}

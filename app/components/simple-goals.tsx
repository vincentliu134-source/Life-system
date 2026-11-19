"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";
import { dimensions } from "@/lib/dimensions";
import { todayKey } from "@/lib/date";
import { inferGoalDimension, goalActions, goalIsActive, goalLatestProgress, goalNextAction, goalStatusLabel } from "@/lib/simple-goals";
import type { AppState, Dimension, Goal } from "@/lib/types";
import { DimensionDot, formatDateTime, type StateResponse } from "./shared";
import { EditableTask } from "./tasks";

type GoalDraft = { title: string; success_metric: string; dimension_primary: Dimension; next_action: string; deadline: string };
const blank: GoalDraft = { title: "", success_metric: "", dimension_primary: "精神", next_action: "", deadline: "" };
const draftFor = (goal: Goal, state: AppState): GoalDraft => ({ title: goal.title, success_metric: goal.success_metric, dimension_primary: goal.dimension_primary, next_action: goalNextAction(goal, state), deadline: goal.deadline || "" });

function GoalFields({ draft, setDraft, infer = false }: { draft: GoalDraft; setDraft: (draft: GoalDraft) => void; infer?: boolean }) {
  const [dimensionChosen, setDimensionChosen] = useState(false);
  return <div className="simple-goal-fields">
    <label>目标名称<input required maxLength={160} value={draft.title} placeholder="我想达成什么？" onChange={event => setDraft({ ...draft, title: event.target.value, dimension_primary: infer && !dimensionChosen ? inferGoalDimension(event.target.value) : draft.dimension_primary })} /></label>
    <label>完成的样子<textarea required rows={2} value={draft.success_metric} placeholder="出现什么事实，就可以说做到了？可以是成果、交付物或一个有依据的决定。" onChange={event => setDraft({ ...draft, success_metric: event.target.value })} /></label>
    <div className="simple-goal-pair"><label>大致所属维度<select value={draft.dimension_primary} onChange={event => { setDimensionChosen(true); setDraft({ ...draft, dimension_primary: event.target.value as Dimension }); }}>{dimensions.map(dimension => <option key={dimension.key}>{dimension.key}</option>)}</select></label><label>真实期限（可不填）<input type="date" value={draft.deadline} onChange={event => setDraft({ ...draft, deadline: event.target.value })} /></label></div>
    <label>下一步<input value={draft.next_action} placeholder="现在可以推进的一个具体动作，也可以稍后补充" onChange={event => setDraft({ ...draft, next_action: event.target.value })} /></label>
  </div>;
}

function GoalCard({ goal, state, onRefresh }: { goal: Goal; state: StateResponse; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GoalDraft>(() => draftFor(goal, state));
  const [date, setDate] = useState(todayKey());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const next = goalNextAction(goal, state);
  const latest = goalLatestProgress(goal, state);
  const actions = goalActions(goal, state);
  const nextAction = actions.find(action => action.key === "next");
  const otherActions = actions.filter(action => action.key !== "next" && !action.task);
  const tasks = state.tasks.filter(task => task.goal_id === goal.id && task.status !== "取消");
  const active = goalIsActive(goal);

  async function save(updates: Partial<GoalDraft> & { status?: string }) {
    setBusy(true); setMessage("");
    try {
      await apiFetch(`/api/goals/${goal.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...updates, ...("deadline" in updates ? { deadline: updates.deadline || null } : {}) }) });
      await onRefresh(); setEditing(false); setMessage("已保存");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败，请重试"); }
    finally { setBusy(false); }
  }
  async function schedule(key: string, title: string, target = todayKey()) {
    setBusy(true); setMessage("");
    try {
      await apiFetch(`/api/goals/${goal.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, title, date: target }) });
      await onRefresh(); setMessage(target === todayKey() ? "已安排到今天" : `已安排到 ${target}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "安排失败"); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm("确定删除这个目标及其全部关联任务和进展记录？")) return;
    setBusy(true);
    try { await apiFetch(`/api/goals/${goal.id}`, { method: "DELETE" }); await onRefresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "删除失败"); }
    finally { setBusy(false); }
  }
  function edit() { setDraft(draftFor(goal, state)); setEditing(true); setMessage(""); }

  return <article className="panel simple-goal-card">
    <header><div><span className="simple-goal-dimension"><DimensionDot dimension={goal.dimension_primary} />{goal.dimension_primary}</span><h2>{goal.title}</h2></div><span className={`goal-state ${active ? "active" : ""}`}>{goalStatusLabel(goal)}</span></header>
    <p className="goal-result-line"><span>完成的样子</span>{goal.success_metric || "待补充"}</p>
    <p className="goal-next-line"><span>下一步</span>{next || "还没有下一步，可先补充一个具体动作"}</p>
    {latest ? <p className="goal-latest-line"><span>最新进展</span>{latest.content}</p> : null}
    {goal.deadline ? <p className="simple-deadline">期限 {goal.deadline}</p> : null}
    <div className="simple-goal-actions">
      {active && nextAction ? <button className="primary" disabled={busy || nextAction.task?.date === todayKey()} onClick={() => void schedule("next", nextAction.title)}>{nextAction.task?.date === todayKey() ? "已在今天的任务中" : "安排到今天"}</button> : null}
      <button className="text-button" onClick={edit}>{next && !nextAction && active ? "补充新的下一步" : "编辑目标"}</button>
      <label className="goal-status-control"><span>目标状态</span><select aria-label={`${goal.title}的目标状态`} disabled={busy} value={goal.status === "完成" ? "完成" : active ? "进行中" : goal.status === "放弃" ? "放弃" : "暂停"} onChange={event => void save({ status: event.target.value })}><option value="进行中">继续推进</option><option value="暂停">暂缓</option><option value="完成">已完成</option>{goal.status === "放弃" ? <option value="放弃">已放弃</option> : null}</select></label>
    </div>
    {editing ? <form className="simple-goal-edit" onSubmit={event => { event.preventDefault(); void save(draft); }}><GoalFields draft={draft} setDraft={setDraft} /><div className="simple-form-actions"><button className="primary" disabled={busy || !draft.title.trim() || !draft.success_metric.trim()}>{busy ? "保存中…" : "保存目标"}</button><button type="button" className="secondary" onClick={() => setEditing(false)}>取消</button><button type="button" className="text-danger" disabled={busy} onClick={() => void remove()}>删除目标</button></div></form> : null}
    <details className="simple-goal-detail"><summary>行动与记录 · {tasks.length} 项</summary>
      {active && nextAction ? <div className="simple-action-schedule"><span>{nextAction.task ? `当前安排：${nextAction.task.date || "未指定日期"}` : "也可以安排到其他日期"}</span><input type="date" aria-label={`${goal.title}的行动日期`} value={date} onChange={event => setDate(event.target.value)} /><button className="secondary" disabled={busy || !date} onClick={() => void schedule("next", nextAction.title, date)}>安排到所选日期</button></div> : null}
      {otherActions.length ? <div className="legacy-actions"><p className="quiet-note">之前保留的待安排行动</p>{otherActions.map(action => <div key={action.key}><span>{action.title}</span><button className="text-button" disabled={!active || busy} onClick={() => void schedule(action.key, action.title)}>安排今天</button></div>)}</div> : null}
      {tasks.length ? tasks.map(task => <div className="simple-linked-task" key={task.id}><small>{task.date || "未安排日期"} · {task.status}</small><EditableTask task={task} state={state} onRefresh={onRefresh} /></div>) : <p className="quiet-note">安排下一步后，这里会显示关联任务及其进展记录。</p>}
      {latest ? <small className="quiet-note">最近记录于 {formatDateTime(latest.date)}</small> : null}
    </details>
    <p className="simple-save-status" role="status">{message}</p>
  </article>;
}

export function SimpleGoals({ state, onRefresh }: { state: StateResponse; onRefresh: () => void }) {
  const [creating, setCreating] = useState(!state.goals.length);
  const [draft, setDraft] = useState<GoalDraft>(blank);
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [message, setMessage] = useState("");
  const [view, setView] = useState<"active" | "paused" | "closed">("active");
  const groups = { active: state.goals.filter(goalIsActive), paused: state.goals.filter(goal => !goalIsActive(goal) && !["完成", "放弃"].includes(goal.status)), closed: state.goals.filter(goal => ["完成", "放弃"].includes(goal.status)) };
  async function suggest() {
    if (!draft.title.trim()) return;
    setSuggesting(true); setMessage("");
    try {
      const token = window.localStorage.getItem("six-ai-gemini-token") || "";
      const response = await apiFetch("/api/goals/breakdown", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { "x-gemini-api-key": token } : {}) }, body: JSON.stringify({ input: draft.title }) });
      const data = await response.json();
      if (data.suggestion) setDraft(current => ({ ...current, ...data.suggestion, success_metric: data.suggestion.success_metric || current.success_metric, next_action: data.suggestion.next_action || current.next_action, deadline: data.suggestion.deadline || current.deadline }));
      setMessage(data.error ? `${data.error} 已保留输入，可以直接填写。` : data.mode === "rules" ? "已建议大致维度，请直接补充完成的样子和下一步。" : "建议已填入，请按真实情况修改后保存。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "暂时无法整理，可直接填写"); }
    finally { setSuggesting(false); }
  }
  async function create() {
    setBusy(true); setMessage("");
    try {
      await apiFetch("/api/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, deadline: draft.deadline || null }) });
      setDraft(blank); setCreating(false); setView("active"); await onRefresh(); setMessage("目标已创建，可把下一步安排到今天。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "创建失败，请重试"); }
    finally { setBusy(false); }
  }
  return <section className="simple-goals">
    <div className="section-head"><p className="quiet-note">想达成什么，完成是什么样，下一步做什么。</p><button className="primary" onClick={() => setCreating(value => !value)}>{creating ? "收起新目标" : "新建目标"}</button></div>
    {creating ? <form className="panel simple-goal-create" onSubmit={event => { event.preventDefault(); void create(); }}><GoalFields draft={draft} setDraft={setDraft} infer /><div className="simple-form-actions"><button className="primary" disabled={busy || suggesting || !draft.title.trim() || !draft.success_metric.trim()}>{busy ? "创建中…" : "创建目标"}</button><button type="button" className="secondary" disabled={suggesting || busy || !draft.title.trim()} onClick={() => void suggest()}>{suggesting ? "正在整理…" : "AI 帮我理清（可选）"}</button></div></form> : null}
    <p className="simple-save-status" role="status">{message}</p>
    <div className="subnav simple-goal-tabs">{([["active", "推进中"], ["paused", "暂缓"], ["closed", "已结束"]] as const).map(([key, label]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{label} {groups[key].length}</button>)}</div>
    {groups[view].map(goal => <GoalCard key={goal.id} goal={goal} state={state} onRefresh={onRefresh} />)}
    {!groups[view].length ? <p className="empty">{view === "active" ? "还没有推进中的目标。先写一个你近期想达成的结果。" : "这里暂时没有目标。"}</p> : null}
  </section>;
}

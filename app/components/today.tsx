"use client";

import { checklistItem,clarificationDestinationHint,clarificationFromItem,clarificationTypeLabels,clarifiedTypes,formatDateTime,isToday,StateResponse,visibleClarifiedType } from "@/app/components/shared";
import { apiFetch } from "@/lib/client-api";
import { dimensions } from "@/lib/dimensions";
import type { ClarifiedType,Dimension,DraftTask,InboxClarification,Priority } from "@/lib/types";
import { useState } from "react";

export function InboxWorkspace({ state, onRefresh, showCapture = true, showInbox = true }: { state: StateResponse; onRefresh: () => void; showCapture?: boolean; showInbox?: boolean }) {
  const [input, setInput] = useState("");
  const [drafts, setDrafts] = useState<DraftTask[]>([]);
  const [organizing, setOrganizing] = useState(false);
  const [clarifyingAll, setClarifyingAll] = useState(false);
  const [clarifyingIds, setClarifyingIds] = useState<Record<string, boolean>>({});
  const [clarifications, setClarifications] = useState<Record<string, InboxClarification>>({});
  const [clarificationChecklistTargets, setClarificationChecklistTargets] = useState<Record<string, string>>({});
  const [inboxMode, setInboxMode] = useState<"pending" | "later" | "done">("pending");
  const [draftTargetTaskId, setDraftTargetTaskId] = useState("");
  const [draftGoalId, setDraftGoalId] = useState("");
  const [draftDestination, setDraftDestination] = useState<"checklist" | "independent" | "inbox">("checklist");
  const [draftSaveStatus, setDraftSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [draftSaveMessage, setDraftSaveMessage] = useState("");
  const [openDraftChecklist, setOpenDraftChecklist] = useState<Record<number, boolean>>({});
  const [draftChecklistInputs, setDraftChecklistInputs] = useState<Record<number, string>>({});
  const todayTasks = state.tasks.filter(isToday);
  const pendingInboxItems = state.inbox_items.filter((item) => item.status === "未处理");
  const laterInboxItems = state.inbox_items.filter((item) => item.status === "已归档");
  const doneInboxItems = state.inbox_items.filter((item) => item.status === "已安排");
  const inboxItems = (inboxMode === "pending" ? pendingInboxItems : inboxMode === "later" ? laterInboxItems : doneInboxItems).slice(0, 8);
  const todayWorkTasks = todayTasks
    .filter((task) => !task.is_habit && task.status !== "取消" && task.status !== "延期");
  const draftCount = drafts.filter((draft) => draft.title.trim()).length;
  const selectedDraftTarget = todayWorkTasks.find((task) => task.id === draftTargetTaskId);
  const draftConfirmDisabled = draftSaveStatus === "saving" || !draftCount || (draftDestination === "checklist" && !selectedDraftTarget);
  const draftConfirmLabel = draftSaveStatus === "saving" ? "保存中…" : draftDestination === "checklist" ? "加入任务清单" : draftDestination === "inbox" ? "放入收集箱" : "加入今天";
  async function organize() {
    try {
    if (!input.trim()) return;
    setOrganizing(true);
    setDraftSaveMessage("");
    setDraftSaveStatus("idle");
    const token = window.localStorage.getItem("six-ai-gemini-token") || "";
    const response = await apiFetch("/api/organize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-gemini-api-key": token } : {}),
      },
      body: JSON.stringify({ input, dimension_priority_order: state.dimension_priority_order }),
    });
    const data = await response.json();
    if (data.error) window.alert(`${data.error}\n本次已使用本地规则整理。`);
    setDrafts(data.tasks || []);
    setDraftDestination(todayWorkTasks.length ? "checklist" : "independent");
    setOrganizing(false);
  
    } catch { setOrganizing(false); }
}

  async function saveDrafts() {
    try {
    const tasks = drafts
      .filter((draft) => draft.title.trim())
      .map((draft) => ({
        ...draft,
        origin: "ad_hoc" as const,
        goal_id: draftGoalId || null,
        project_id: null,
        source: draftGoalId ? "goal_week" as const : "manual" as const,
      }));
    if (!tasks.length) return;
    setDraftSaveStatus("saving");
    try {
      await apiFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks }),
      });
      setDrafts([]);
      setInput("");
      setDraftTargetTaskId("");
      setDraftGoalId("");
      setDraftSaveStatus("saved");
      setDraftSaveMessage(`已加入今天任务 ${tasks.length} 项`);
      onRefresh();
      window.setTimeout(() => setDraftSaveStatus("idle"), 1600);
    } catch {
      setDraftSaveStatus("error");
      setDraftSaveMessage("保存失败，请重试");
    }
  
    } catch { setDraftSaveStatus("idle"); }
}

  async function saveDraftsToInbox() {
    try {
    const contents = drafts.map((draft) => draft.title.trim()).filter(Boolean);
    if (!contents.length) return;
    setDraftSaveStatus("saving");
    try {
      await Promise.all(contents.map((content) => apiFetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })));
      setDrafts([]);
      setInput("");
      setDraftTargetTaskId("");
      setDraftGoalId("");
      setDraftSaveStatus("saved");
      setDraftSaveMessage(`已放回收集箱 ${contents.length} 项`);
      onRefresh();
      window.setTimeout(() => setDraftSaveStatus("idle"), 1600);
    } catch {
      setDraftSaveStatus("error");
      setDraftSaveMessage("保存失败，请重试");
    }
  
    } catch { setDraftSaveStatus("idle"); }
}

  async function saveDraftsAsChecklist() {
    try {
    const target = todayWorkTasks.find((task) => task.id === draftTargetTaskId);
    const items = drafts.flatMap((draft) => [
      draft.title.trim(),
      ...(draft.checklist || []).map((item) => item.text.trim()),
    ]).filter(Boolean);
    if (!target || !items.length) return;
    setDraftSaveStatus("saving");
    try {
      await apiFetch(`/api/tasks/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checklist: [
            ...(target.checklist || []),
            ...items.map((text) => checklistItem(text)),
          ],
        }),
      });
      setDrafts([]);
      setInput("");
      setDraftTargetTaskId("");
      setDraftGoalId("");
      setDraftSaveStatus("saved");
      setDraftSaveMessage(`已加入「${target.title}」清单 ${items.length} 项`);
      onRefresh();
      window.setTimeout(() => setDraftSaveStatus("idle"), 1600);
    } catch {
      setDraftSaveStatus("error");
      setDraftSaveMessage("保存失败，请重试");
    }
  
    } catch { setDraftSaveStatus("idle"); }
}

  function confirmDraftDestination() {
    if (draftDestination === "checklist") {
      saveDraftsAsChecklist();
      return;
    }
    if (draftDestination === "independent") {
      saveDrafts();
      return;
    }
    saveDraftsToInbox();
  }

  async function saveDraftAsHabit(index: number) {
    const draft = drafts[index];
    if (!draft?.title.trim()) return;
    await apiFetch("/api/habits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: draft.title,
        dimension_primary: draft.dimension_primary,
        frequency: "每日",
        weekdays: [],
        estimated_minutes: draft.estimated_minutes || 20,
        priority: draft.priority || "B",
        active: true,
      }),
    });
    setDrafts((items) => items.filter((_, itemIndex) => itemIndex !== index));
    setInput("");
    onRefresh();
  }

  async function saveToInbox() {
    if (!input.trim()) return;
    await apiFetch("/api/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: input }),
    });
    setInput("");
    setDrafts([]);
    onRefresh();
  }

  async function patchInbox(id: string, action: "schedule" | "archive" | "restore") {
    await apiFetch(`/api/inbox/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    onRefresh();
  }

  async function deleteInbox(id: string) {
    await apiFetch(`/api/inbox/${id}`, { method: "DELETE" });
    onRefresh();
  }

  async function clarifyInbox(id: string) {
    if (clarifyingIds[id]) return;
    setClarifyingIds((current) => ({ ...current, [id]: true }));
    const token = window.localStorage.getItem("six-ai-gemini-token") || "";
    try {
      const response = await apiFetch(`/api/inbox/${id}/clarify`, {
        method: "POST",
        headers: {
          ...(token ? { "x-gemini-api-key": token } : {}),
        },
      });
      const data = await response.json();
      if (data.error) window.alert(`${data.error}\n本次已使用本地规则澄清。`);
      setClarifications((current) => ({ ...current, [id]: data.clarification }));
      onRefresh();
    } finally {
      setClarifyingIds((current) => ({ ...current, [id]: false }));
    }
  }

  async function clarifyVisibleInbox() {
    try {
    const targets = inboxItems.filter((item) => item.status === "未处理").slice(0, 8);
    if (!targets.length) return;
    setClarifyingAll(true);
    setClarifyingIds((current) => ({
      ...current,
      ...Object.fromEntries(targets.map((item) => [item.id, true])),
    }));
    const token = window.localStorage.getItem("six-ai-gemini-token") || "";
    try {
      const results: Array<readonly [string, InboxClarification, string | undefined]> = [];
      for (const item of targets) {
        const response = await apiFetch(`/api/inbox/${item.id}/clarify`, {
          method: "POST",
          headers: {
            ...(token ? { "x-gemini-api-key": token } : {}),
          },
        });
        const data = await response.json();
        results.push([item.id, data.clarification, data.error] as const);
      }
      const failure = results.find((result) => result[2]);
      if (failure) window.alert(`${failure[2]}\n部分事项已使用本地规则澄清。`);
      setClarifications((current) => ({
        ...current,
        ...Object.fromEntries(results.map(([id, clarification]) => [id, clarification])),
      }));
      onRefresh();
    } finally {
      setClarifyingAll(false);
      setClarifyingIds((current) => ({
        ...current,
        ...Object.fromEntries(targets.map((item) => [item.id, false])),
      }));
    }
  
    } catch { setClarifyingAll(false); }
}

  async function distributeInbox(id: string, clarification: InboxClarification) {
    await apiFetch(`/api/inbox/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "distribute", clarification }),
    });
    setClarifications((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    onRefresh();
  }

  async function distributeInboxAsChecklist(id: string, clarification: InboxClarification) {
    const target = state.tasks.find((task) => task.id === clarificationChecklistTargets[id]);
    const text = (clarification.next_action || clarification.suggested_title || "").trim();
    if (!target || !text) return;
    await apiFetch(`/api/tasks/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checklist: [
          ...(target.checklist || []),
          checklistItem(text),
        ],
      }),
    });
    await apiFetch(`/api/inbox/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "checklist", clarification, target_task_id: target.id }),
    });
    setClarifications((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setClarificationChecklistTargets((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    onRefresh();
  }

  function updateClarification(id: string, patch: Partial<InboxClarification>) {
    setClarifications((current) => {
      const item = inboxItems.find((entry) => entry.id === id);
      const base = current[id] || (item ? clarificationFromItem(item) : null);
      if (!base) return current;
      return { ...current, [id]: { ...base, ...patch } };
    });
  }

  function updateDraft(index: number, patch: Partial<DraftTask>) {
    setDrafts((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function updateDraftChecklistItem(draftIndex: number, checklistId: string, text: string) {
    setDrafts((items) => items.map((draft, index) => (
      index === draftIndex
        ? { ...draft, checklist: (draft.checklist || []).map((item) => item.id === checklistId ? { ...item, text } : item) }
        : draft
    )));
  }

  function removeDraftChecklistItem(draftIndex: number, checklistId: string) {
    setDrafts((items) => items.map((draft, index) => (
      index === draftIndex
        ? { ...draft, checklist: (draft.checklist || []).filter((item) => item.id !== checklistId) }
        : draft
    )));
  }

  function addDraftChecklistItem(draftIndex: number) {
    const text = (draftChecklistInputs[draftIndex] || "").trim();
    if (!text) return;
    setDrafts((items) => items.map((draft, index) => (
      index === draftIndex
        ? { ...draft, checklist: [...(draft.checklist || []), checklistItem(text)] }
        : draft
    )));
    setDraftChecklistInputs((current) => ({ ...current, [draftIndex]: "" }));
    setOpenDraftChecklist((current) => ({ ...current, [draftIndex]: true }));
  }

  return (
    <>
      {showCapture ? <div className="inbox-capture">
        <div className="quick-input panel">
          <div className="section-head">
            <h2>快速收集</h2>
            <span>{pendingInboxItems.length}</span>
          </div>
          <textarea rows={3} value={input} placeholder="把想到的事先放这里。" onChange={(event) => setInput(event.target.value)} />
          <p className="input-example">不急着决定归属。先收集，再澄清。</p>
          <div className="actions">
            <button className="primary" onClick={saveToInbox} disabled={!input.trim()}>放入收集箱</button>
            <button className="quiet-action" onClick={organize} disabled={organizing || !input.trim()}>{organizing ? "正在整理..." : "加入今天任务"}</button>
          </div>
          {draftSaveMessage ? <p className={`draft-save-message ${draftSaveStatus === "error" ? "is-error" : ""}`}>{draftSaveMessage}</p> : null}
          {drafts.length ? (
            <div className="draft-list">
              <div className="draft-destination">
                <div className="draft-destination-tabs" role="group" aria-label="整理结果去向">
                  <button className={draftDestination === "checklist" ? "active" : ""} onClick={() => setDraftDestination("checklist")} disabled={!todayWorkTasks.length}>加入已有任务清单</button>
                  <button className={draftDestination === "independent" ? "active" : ""} onClick={() => setDraftDestination("independent")}>作为独立任务</button>
                  <button className={draftDestination === "inbox" ? "active" : ""} onClick={() => setDraftDestination("inbox")}>放回收集箱</button>
                </div>
                {draftDestination === "checklist" ? (
                  <select value={draftTargetTaskId} onChange={(event) => setDraftTargetTaskId(event.target.value)}>
                    <option value="">选择今日主任务</option>
                    {todayWorkTasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}
                  </select>
                ) : null}
                {draftDestination === "independent" ? (
                  <select value={draftGoalId} onChange={(event) => setDraftGoalId(event.target.value)}>
                    <option value="">不关联目标，作为独立任务</option>
                    {state.goals.map((goal) => <option value={goal.id} key={goal.id}>{goal.title}</option>)}
                  </select>
                ) : null}
                <p>
                  {draftDestination === "checklist"
                    ? selectedDraftTarget ? `将把 ${draftCount} 条整理结果加入「${selectedDraftTarget.title}」清单` : `请选择一个今日主任务，承接这 ${draftCount} 条整理结果`
                    : draftDestination === "independent"
                      ? draftGoalId
                        ? `将把 ${draftCount} 条整理结果加入今天，并关联到「${state.goals.find((goal) => goal.id === draftGoalId)?.title || "所选目标"}」`
                        : `将把 ${draftCount} 条整理结果作为独立任务加入今天`
                      : `将把 ${draftCount} 条整理结果放回收集箱`}
                </p>
                <button className="primary" onClick={confirmDraftDestination} disabled={draftConfirmDisabled}>{draftConfirmLabel}</button>
              </div>
              {drafts.map((draft, index) => (
                <div className="draft-card" key={`${draft.title}-${index}`}>
                  <div className="draft-row">
                    <input value={draft.title} onChange={(event) => updateDraft(index, { title: event.target.value })} />
                    <select value={draft.dimension_primary} onChange={(event) => updateDraft(index, { dimension_primary: event.target.value as Dimension })}>
                      {dimensions.map((dimension) => <option key={dimension.key}>{dimension.key}</option>)}
                    </select>
                    <select value={draft.priority} onChange={(event) => updateDraft(index, { priority: event.target.value as Priority })}>
                      <option>A</option><option>B</option><option>C</option>
                    </select>
                    {draft.is_habit || draft.type === "习惯" ? <button className="secondary" onClick={() => saveDraftAsHabit(index)}>设为习惯</button> : null}
                    <button className={`draft-checklist-toggle ${openDraftChecklist[index] ? "active" : ""}`} onClick={() => setOpenDraftChecklist((current) => ({ ...current, [index]: !current[index] }))}>
                      清单 {draft.checklist?.length || 0} 项
                    </button>
                  </div>
                  {openDraftChecklist[index] ? (
                    <div className="draft-checklist-editor">
                      {(draft.checklist || []).length ? (draft.checklist || []).map((item) => (
                        <div className="draft-checklist-row" key={item.id}>
                          <input value={item.text} placeholder="清单事项" onChange={(event) => updateDraftChecklistItem(index, item.id, event.target.value)} />
                          <button className="text-danger" onClick={() => removeDraftChecklistItem(index, item.id)}>删除</button>
                        </div>
                      )) : <p className="quiet-note">还没有清单事项。</p>}
                      <div className="draft-checklist-add">
                        <input
                          value={draftChecklistInputs[index] || ""}
                          placeholder="添加清单事项"
                          onChange={(event) => setDraftChecklistInputs((current) => ({ ...current, [index]: event.target.value }))}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") addDraftChecklistItem(index);
                          }}
                        />
                        <button onClick={() => addDraftChecklistItem(index)}>添加</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>

      </div> : null}

      {showInbox ? <section className="panel inbox-panel">
        <div className="section-head">
          <h2>{inboxMode === "pending" ? "待澄清" : "收集箱"}</h2>
          {inboxMode === "pending" && pendingInboxItems.length ? <button className="text-button" onClick={clarifyVisibleInbox} disabled={clarifyingAll}>{clarifyingAll ? "澄清中..." : "批量澄清"}</button> : <span>{pendingInboxItems.length}</span>}
        </div>
        <div className="inbox-switch" aria-label="收集箱视图">
          <button className={inboxMode === "pending" ? "active" : ""} onClick={() => setInboxMode("pending")}>待澄清 {pendingInboxItems.length}</button>
          <button className={inboxMode === "later" ? "active" : ""} onClick={() => setInboxMode("later")}>将来/也许 {laterInboxItems.length}</button>
          <button className={inboxMode === "done" ? "active" : ""} onClick={() => setInboxMode("done")}>已分流 {doneInboxItems.length}</button>
        </div>
        <div className="inbox-list">
          {inboxItems.length ? inboxItems.map((item) => {
            const clarification = clarifications[item.id] || clarificationFromItem(item);
            const isClarifying = Boolean(clarifyingIds[item.id]);
            return (
              <article className="inbox-item" key={item.id}>
                <div className="inbox-main">
                  <p>{item.content}</p>
                  <div className="inbox-actions">
                    {inboxMode === "pending" ? <button onClick={() => clarifyInbox(item.id)} disabled={isClarifying || clarifyingAll}>{isClarifying ? "澄清中..." : clarification ? "重新澄清" : "澄清"}</button> : null}
                    {inboxMode === "pending" ? <button onClick={() => patchInbox(item.id, "archive")}>将来/也许</button> : null}
                    {inboxMode === "later" ? <button onClick={() => patchInbox(item.id, "restore")}>恢复</button> : null}
                    <button className="text-danger" onClick={() => deleteInbox(item.id)}>删除</button>
                  </div>
                </div>
                {inboxMode === "done" ? (
                  <div className="inbox-destination">
                    <span>{item.clarified_type ? clarificationTypeLabels[visibleClarifiedType(item.clarified_type)] : "已分流"}</span>
                    <strong>{state.goals.find((goal) => goal.id === item.goal_id)?.title || state.projects.find((project) => project.id === item.project_id)?.title || item.next_action || "已进入系统"}</strong>
                  </div>
                ) : null}
                <small className="inbox-date">进入：{formatDateTime(item.created_at)}</small>
                {clarification && inboxMode === "pending" ? (
                  <div className="clarify-card">
                    <div className="clarify-grid">
                      <label>
                        <span>分流去向</span>
                        <select value={visibleClarifiedType(clarification.clarified_type)} onChange={(event) => updateClarification(item.id, { clarified_type: event.target.value as ClarifiedType })}>
                          {clarifiedTypes.map((type) => <option key={type} value={type}>{clarificationTypeLabels[type]}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>维度</span>
                        <select value={clarification.dimension_primary} onChange={(event) => updateClarification(item.id, { dimension_primary: event.target.value as Dimension })}>
                          {dimensions.map((dimension) => <option key={dimension.key}>{dimension.key}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>关联目标</span>
                        <select value={clarification.goal_id || ""} onChange={(event) => updateClarification(item.id, { goal_id: event.target.value || null, project_id: null })}>
                          <option value="">无关联</option>
                          {state.goals.map((goal) => <option value={goal.id} key={goal.id}>{goal.title}</option>)}
                        </select>
                      </label>
                      <label className="wide">
                        <span>名称</span>
                        <input value={clarification.suggested_title} onChange={(event) => updateClarification(item.id, { suggested_title: event.target.value })} />
                      </label>
                      <label className="wide">
                        <span>下一步</span>
                        <input value={clarification.next_action} onChange={(event) => updateClarification(item.id, { next_action: event.target.value })} />
                      </label>
                      <label>
                        <span>日期</span>
                        <input type="date" value={clarification.scheduled_date || ""} onChange={(event) => updateClarification(item.id, { scheduled_date: event.target.value || null })} />
                      </label>
                      <label>
                        <span>时间</span>
                        <input type="time" value={clarification.scheduled_time || ""} onChange={(event) => updateClarification(item.id, { scheduled_time: event.target.value || null })} />
                      </label>
                    </div>
                    <p>{clarification.reason}</p>
                    <p className="clarify-destination-hint">{clarificationDestinationHint(clarification)}</p>
                    <div className="clarify-actions">
                      <button className="primary clarify-confirm" onClick={() => distributeInbox(item.id, clarification)}>确认分流</button>
                      <div className="clarify-checklist-action">
                        <select value={clarificationChecklistTargets[item.id] || ""} onChange={(event) => setClarificationChecklistTargets((current) => ({ ...current, [item.id]: event.target.value }))}>
                          <option value="">选择要加入的事项清单</option>
                          {state.tasks
                            .filter((task) => task.status !== "完成" && task.status !== "取消")
                            .slice(0, 30)
                            .map((task) => <option value={task.id} key={task.id}>{task.date || "未排期"} · {task.title}</option>)}
                        </select>
                        <button className="secondary clarify-checklist" onClick={() => distributeInboxAsChecklist(item.id, clarification)} disabled={!clarificationChecklistTargets[item.id]}>清单分流</button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          }) : <div className="empty">{inboxMode === "pending" ? "没有悬而未决的想法。" : inboxMode === "later" ? "将来/也许是空的。" : "还没有已分流记录。"}</div>}
        </div>
      </section> : null}
    </>
  );
}

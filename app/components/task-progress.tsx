"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";
import { formatDateTime } from "./shared";
import type { Task, TaskProgress } from "@/lib/types";

export function TaskProgressPanel({ task, onRefresh }: { task: Task; onRefresh: () => void }) {
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<TaskProgress["status"]>(task.status === "等待反馈" ? "等待反馈" : task.status === "完成" ? "完成" : "进行中");
  const [next, setNext] = useState(task.next_action || "");
  const [waiting, setWaiting] = useState(task.waiting_on || "");
  const [followUp, setFollowUp] = useState(task.follow_up_date || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setBusy(true); setMessage("");
    try {
      await apiFetch(`/api/tasks/${task.id}/progress`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, status, next_action: next, waiting_on: waiting, follow_up_date: followUp || null }),
      });
      setContent("");
      setMessage(status === "完成" ? "已记录，并完成此任务" : "进展已保存，任务继续保留");
      await onRefresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败，请重试"); }
    finally { setBusy(false); }
  }

  return <section className="task-progress-panel" aria-label={`${task.title}的进展记录`}>
    <p className="quiet-note">每次推进追加一条记录；收到反馈后可以继续推进，选择“完成并关闭”才结束任务。</p>
    <label>本次进展 / 收到的反馈<textarea rows={3} maxLength={5000} value={content} onChange={event => setContent(event.target.value)} placeholder="例如：已发出报价，等待客户确认规格；或客户回复需要调整数量。" /></label>
    <div className="planning-fields">
      <label>记录后的状态<select value={status} onChange={event => setStatus(event.target.value as TaskProgress["status"])}><option value="进行中">继续推进</option><option value="等待反馈">等待反馈</option><option value="完成">完成并关闭</option></select></label>
      {status !== "完成" ? <label>下次跟进日期<input type="date" value={followUp} onChange={event => setFollowUp(event.target.value)} /></label> : null}
    </div>
    {status === "等待反馈" ? <label>等待谁 / 什么反馈<input value={waiting} onChange={event => setWaiting(event.target.value)} placeholder="例如：客户确认最终规格" /></label> : null}
    {status !== "完成" ? <label>下一步<input value={next} onChange={event => setNext(event.target.value)} placeholder="例如：收到确认后调整报价，周四再跟进" /></label> : null}
    <button className="primary" onClick={save} disabled={busy || !content.trim()}>{busy ? "保存中…" : status === "完成" ? "保存并完成任务" : "保存进展"}</button>
    <span className="progress-save-message" role="status">{message}</span>
    {task.result_note ? <div className="progress-legacy"><small>已有结果备注</small><p>{task.result_note}</p></div> : null}
    <div className="task-progress-history">
      <strong>进展时间线 · {task.progress_logs?.length || 0} 条</strong>
      {[...(task.progress_logs || [])].reverse().map(entry => <article key={entry.id}>
        <div><time>{formatDateTime(entry.created_at)}</time><span className={`workflow-status ${entry.status === "等待反馈" ? "waiting" : ""}`}>{entry.status}</span></div>
        <p>{entry.content}</p>
        {entry.waiting_on ? <small>等待：{entry.waiting_on}</small> : null}
        {entry.next_action ? <small>下一步：{entry.next_action}</small> : null}
        {entry.follow_up_date ? <small>跟进日期：{entry.follow_up_date}</small> : null}
      </article>)}
      {!task.progress_logs?.length ? <p className="quiet-note">还没有进展记录，可先记下今天推进到了哪里。</p> : null}
    </div>
  </section>;
}

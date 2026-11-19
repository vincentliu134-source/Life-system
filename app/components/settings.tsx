"use client";

import { StateResponse } from "@/app/components/shared";
import { apiFetch } from "@/lib/client-api";
import { todayKey } from "@/lib/date";
import type { Dimension } from "@/lib/types";
import { useEffect,useMemo,useRef,useState } from "react";

export function AiSettingsPanel() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [validationError, setValidationError] = useState("");
  const [validationModel, setValidationModel] = useState("");
  const [status, setStatus] = useState<"unknown" | "valid" | "invalid" | "checking" | "busy" | "unavailable" | "region_unavailable">("unknown");

  useEffect(() => {
    const savedToken = window.localStorage.getItem("six-ai-gemini-token") || "";
    const savedStatus = window.localStorage.getItem("six-ai-gemini-token-status");
    setToken(savedToken);
    if (savedToken && savedStatus === "valid") setStatus("valid");
  }, []);

  function saveToken(value: string) {
    setToken(value);
    setValidationError("");
    setValidationModel("");
    window.localStorage.setItem("six-ai-gemini-token", value.trim());
    window.localStorage.removeItem("six-ai-gemini-token-status");
    setStatus(value ? "unknown" : "invalid");
  }

  async function validateToken() {
    if (!token.trim()) {
      setStatus("invalid");
      return;
    }
    setStatus("checking");
    setValidationError("");
    setValidationModel("");
    window.localStorage.removeItem("six-ai-gemini-token-status");
    try {
      const response = await apiFetch("/api/ai/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
        signal: AbortSignal.timeout(25000),
      });
      const data = await response.json();
      const valid = response.ok && data.valid;
      setStatus(valid ? "valid" : data.status === "region_unavailable" ? "region_unavailable" : data.status === "busy" ? "busy" : data.status === "unavailable" ? "unavailable" : "invalid");
      setValidationModel(valid ? data.modelUsed || "" : "");
      if (valid) window.localStorage.setItem("six-ai-gemini-token-status", "valid");
      else setValidationError(data.error || "验证失败，请检查 Gemini API Key。");
    } catch {
      setStatus("unavailable");
      setValidationError("验证请求未完成，请检查本地服务和网络连接后重试。");
    }
  }

  const statusText = status === "valid" ? "有效" : status === "checking" ? "验证中" : status === "region_unavailable" ? "地区不支持" : status === "busy" ? "服务繁忙" : status === "unavailable" ? "连接失败" : status === "invalid" ? "未通过" : "未验证";

  return (
    <div className="ai-settings">
      <button className="settings-toggle" onClick={() => setOpen((value) => !value)}>
        <span>
          <span className={`status-dot status-${status}`} />
          Gemini 3.6 Flash
        </span>
        <small>{statusText}</small>
      </button>
      {open ? (
        <div className="settings-dropdown">
          <label>
            <span>Gemini API Key</span>
            <input type="password" value={token} placeholder="输入 Gemini API Key" onChange={(event) => saveToken(event.target.value)} />
          </label>
          <div className="settings-actions">
            <button className="primary" onClick={validateToken} disabled={status === "checking"}>{status === "checking" ? "正在验证..." : "验证 Key"}</button>
            <button className="secondary" onClick={() => saveToken("")}>清除</button>
          </div>
          {validationError ? <p role="alert">{validationError}</p> : null}
          {validationModel ? <p>当前连接模型：{validationModel}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function DimensionPriorityPanel({ order }: { order: Dimension[] }) {
  const [priorityOrder, setPriorityOrder] = useState<Dimension[]>(order);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setPriorityOrder(order);
  }, [order]);

  const hasChanged = priorityOrder.some((item, index) => item !== order[index]);

  function move(index: number, direction: -1 | 1) {
    setPriorityOrder((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return next;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function saveOrder() {
    try {
    setSaving(true);
    setMessage("");
    const response = await apiFetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dimension_priority_order: priorityOrder }),
    });
    if (response.ok) {
      setMessage("已保存维度优先级顺序。");
      window.setTimeout(() => window.location.reload(), 400);
    } else {
      setMessage("保存失败，请稍后重试。");
    }
    setSaving(false);
  
    } catch { setSaving(false); }
}

  return (
    <div className="panel">
      <h2>维度优先级</h2>
      <p>系统将在自动判断优先级时参考这个顺序。手动选择优先级时会优先使用用户设置。</p>
      <div className="priority-list">
        {priorityOrder.map((dimension, index) => (
          <div className="priority-row" key={dimension}>
            <span><b>{index + 1}</b>{dimension}</span>
            <div className="priority-controls">
              <button onClick={() => move(index, -1)} disabled={index === 0} title="上移" aria-label={`${dimension} 上移`}>▲</button>
              <button onClick={() => move(index, 1)} disabled={index === priorityOrder.length - 1} title="下移" aria-label={`${dimension} 下移`}>▼</button>
            </div>
          </div>
        ))}
      </div>
      <button className="primary" onClick={saveOrder} disabled={!hasChanged || saving}>{saving ? "保存中..." : "保存顺序"}</button>
      {message ? <p className="quiet-note">{message}</p> : null}
    </div>
  );
}

export function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function Settings({ state }: { state: StateResponse }) {
  const [confirmImportOpen, setConfirmImportOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [importMessage, setImportMessage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const exportData = useMemo(() => {
    const { stats: _stats, offline_mode: _offlineMode, test_mode: _testMode, ...backup } = state as StateResponse & { offline_mode?: boolean; test_mode?: boolean };
    return JSON.stringify(backup, null, 2);
  }, [state]);
  const offlineApp = typeof document !== 'undefined' && document.documentElement.dataset.offlineApp === 'true';

  async function importBackupFile(file: File) {
    setImportStatus("loading");
    setImportMessage("");
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const response = await apiFetch("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(raw),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || `恢复失败：${response.status}`);
      }
      const result = await response.json();
      const message = `已恢复 ${result.total || 0} 条记录，页面将重新加载。`;
      setImportStatus("success");
      setImportMessage(message);
      window.setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      const message = error instanceof Error ? error.message : "备份文件无效或恢复失败";
      console.error(error);
      setImportStatus("error");
      setImportMessage(message);
    }
  }

  function triggerImport() {
    setConfirmImportOpen(true);
  }

  function confirmImport() {
    setConfirmImportOpen(false);
    fileInputRef.current?.click();
  }

  function cancelImport() {
    setConfirmImportOpen(false);
  }

  function exportJson() {
    const timestamp = new Date().toLocaleTimeString('en-GB', { hour12: false }).replaceAll(':', '');
    downloadText(`life-six-backup-${todayKey()}-${timestamp}.json`, exportData, "application/json;charset=utf-8");
  }

  async function shareJson() {
    const timestamp = new Date().toLocaleTimeString('en-GB', { hour12: false }).replaceAll(':', '');
    const file = new File([exportData], `life-six-backup-${todayKey()}-${timestamp}.json`, { type: 'application/json' });
    if (!navigator.canShare?.({ files: [file] })) { exportJson(); return; }
    try { await navigator.share({ files: [file], title: '人生六维数据备份' }); }
    catch (error) { if ((error as DOMException).name !== 'AbortError') exportJson(); }
  }

  return (
    <section className="settings-page page-enter">
      {!offlineApp?<div className="panel">
        <h2>AI 设置</h2>
        <AiSettingsPanel />
      </div>:null}
      <DimensionPriorityPanel order={state.dimension_priority_order} />
      <div className="panel">
        <h2>数据备份</h2>
        <p>{offlineApp?'数据保存在这台手机。请定期导出 JSON 文件，传到电脑后用“恢复备份”导入。':'自动保存；也可手动导出或恢复。'}</p>
        <div className="backup-actions">
          <button className="secondary" onClick={exportJson}>导出完整备份</button>
          {offlineApp?<button className="secondary" onClick={()=>void shareJson()}>分享备份文件</button>:null}
          <button className="secondary" onClick={triggerImport}>恢复备份</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) importBackupFile(file);
              event.target.value = "";
            }}
          />
        </div>
        {importStatus !== "idle" ? (
          <div className={`import-status import-${importStatus}`}>
            {importMessage}
          </div>
        ) : null}
        {confirmImportOpen ? (
          <div className="confirm-dialog">
            <div className="confirm-panel">
              <p>恢复备份会覆盖当前数据，确认继续吗？</p>
              <div className="confirm-actions">
                <button className="secondary" onClick={cancelImport}>取消</button>
                <button className="primary" onClick={confirmImport}>确认恢复</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

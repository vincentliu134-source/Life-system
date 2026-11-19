"use client";

import { Habits } from "@/app/components/habits";
import { SimpleGoals } from "./simple-goals";
import { AutoResizeTextarea,DimensionDot,DirectionTab,StateResponse,getDimensionDraft,getLifeCoreDraft,removeDimensionDraft,removeLifeCoreDraft,setDimensionDraft,setLifeCoreDraft } from "@/app/components/shared";
import { apiFetch } from "@/lib/client-api";
import { dimensions } from "@/lib/dimensions";
import type { Dimension } from "@/lib/types";
import { useEffect,useState } from "react";

export function LifeCorePanel({ state, onRefresh }: { state: StateResponse; onRefresh: () => void }) {
  const [vision, setVision] = useState(state.life_core.vision || "");
  const [mission, setMission] = useState(state.life_core.mission);
  const [values, setValues] = useState(state.life_core.values.join("\n"));
  const [principles, setPrinciples] = useState(state.life_core.principles.join("\n"));
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    const draft = getLifeCoreDraft();
    if (draft) {
      setVision(draft.vision);
      setMission(draft.mission);
      setValues(draft.values);
      setPrinciples(draft.principles);
    }
  }, []);

  useEffect(() => {
    setLifeCoreDraft({ vision, mission, values, principles });
  }, [vision, mission, values, principles]);

  async function save() {
    try {
    setSaveStatus("saving");
    try {
      const response = await apiFetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          life_core: {
            vision,
            mission,
            values: values.split("\n").map((item) => item.trim()).filter(Boolean),
            principles: principles.split("\n").map((item) => item.trim()).filter(Boolean),
          },
        }),
      });
      if (!response.ok) throw new Error(`保存失败：${response.status}`);
      await onRefresh();
      removeLifeCoreDraft();
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus("idle"), 1800);
    } catch (error) {
      console.error("LifeCore save failed", error);
      setSaveStatus("idle");
    }
  
    } catch { setSaveStatus("idle"); }
}

  return (
    <section className="panel core-panel">
      <div className="section-head">
        <h2>人生总纲</h2>
        <div className="save-inline">
          {saveStatus === "saved" ? <span>已保存</span> : null}
          <button className="text-button" onClick={save} disabled={saveStatus === "saving"}>{saveStatus === "saving" ? "保存中..." : "保存"}</button>
        </div>
      </div>
      <label>
        <span>愿景 / 远景</span>
        <AutoResizeTextarea storageKey="life-core:vision" rows={3} value={vision} placeholder="写下你长期想走向的生命图景。" onChange={(event) => setVision(event.target.value)} />
      </label>
      <label>
        <span>使命 / 宗旨</span>
        <AutoResizeTextarea storageKey="life-core:mission" rows={3} value={mission} placeholder="一句话写下你为什么长期行动。" onChange={(event) => setMission(event.target.value)} />
      </label>
      <label>
        <span>价值观 / 信念</span>
        <AutoResizeTextarea storageKey="life-core:values" rows={4} value={values} placeholder="每行一条，例如：长期主义" onChange={(event) => setValues(event.target.value)} />
      </label>
      <label>
        <span>原则 / 准则</span>
        <AutoResizeTextarea storageKey="life-core:principles" rows={5} value={principles} placeholder="每行一条，例如：先清楚，再行动" onChange={(event) => setPrinciples(event.target.value)} />
      </label>
    </section>
  );
}

export function SixDimensionBoard({ state, onRefresh }: { state: StateResponse; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState<Dimension | null>(null);
  const [savedDimension, setSavedDimension] = useState<Dimension | null>(null);
  const [savingDimension, setSavingDimension] = useState<Dimension | null>(null);
  const [overviewDraft, setOverviewDraft] = useState("");
  const [visionDraft, setVisionDraft] = useState("");
  const [missionDraft, setMissionDraft] = useState("");
  const [valuesDraft, setValuesDraft] = useState("");
  const [principlesDraft, setPrinciplesDraft] = useState("");
  const [focusDraft, setFocusDraft] = useState("");
  const [weeklyActionsDraft, setWeeklyActionsDraft] = useState("");
  const [reviewMetricsDraft, setReviewMetricsDraft] = useState("");

  useEffect(() => {
    if (!expanded) return;
    const draft = getDimensionDraft(expanded);
    if (draft) {
      setOverviewDraft(draft.overviewDraft);
      setVisionDraft(draft.visionDraft);
      setMissionDraft(draft.missionDraft);
      setValuesDraft(draft.valuesDraft);
      setPrinciplesDraft(draft.principlesDraft);
      setFocusDraft(draft.focusDraft);
      setWeeklyActionsDraft(draft.weeklyActionsDraft);
      setReviewMetricsDraft(draft.reviewMetricsDraft);
    }
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    setDimensionDraft(expanded, {
      overviewDraft,
      visionDraft,
      missionDraft,
      valuesDraft,
      principlesDraft,
      focusDraft,
      weeklyActionsDraft,
      reviewMetricsDraft,
    });
  }, [expanded, overviewDraft, visionDraft, missionDraft, valuesDraft, principlesDraft, focusDraft, weeklyActionsDraft, reviewMetricsDraft]);

  function openDimension(dimension: Dimension) {
    const saved = state.dimension_visions.find((item) => item.dimension === dimension);
    setExpanded(expanded === dimension ? null : dimension);
    setOverviewDraft(saved?.overview || "");
    setVisionDraft(saved?.vision || "");
    setMissionDraft(saved?.mission || "");
    setValuesDraft((saved?.values || []).join("\n"));
    setPrinciplesDraft((saved?.principles || []).join("\n"));
    setFocusDraft(saved?.current_focus || "");
    setWeeklyActionsDraft((saved?.weekly_actions || []).join("\n"));
    setReviewMetricsDraft((saved?.review_metrics || []).join("\n"));
  }

  async function saveDimensionVision(dimension: Dimension) {
    setSavingDimension(dimension);
    setSavedDimension(null);
    const next = state.dimension_visions.map((item) => item.dimension === dimension ? {
      ...item,
      overview: overviewDraft,
      vision: visionDraft,
      mission: missionDraft,
      values: valuesDraft.split("\n").map((entry) => entry.trim()).filter(Boolean),
      principles: principlesDraft.split("\n").map((entry) => entry.trim()).filter(Boolean),
      current_focus: focusDraft,
      weekly_actions: weeklyActionsDraft.split("\n").map((entry) => entry.trim()).filter(Boolean),
      review_metrics: reviewMetricsDraft.split("\n").map((entry) => entry.trim()).filter(Boolean),
    } : item);
    try {
      const response = await apiFetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dimension_visions: next }),
      });
      if (!response.ok) throw new Error(`保存失败：${response.status}`);
      await onRefresh();
      removeDimensionDraft(dimension);
      setSavedDimension(dimension);
      window.setTimeout(() => setSavedDimension((current) => current === dimension ? null : current), 1800);
    } catch (error) {
      console.error("SixDimension save failed", error);
    } finally {
      setSavingDimension(null);
    }
  }

  return (
    <div className="dimension-grid">
      {dimensions.map((dimension) => {
        const savedVision = state.dimension_visions.find((item) => item.dimension === dimension.key);
        const overview = savedVision?.overview || dimension.definition;
        const isExpanded = expanded === dimension.key;
        return (
          <article className="dimension-card" key={dimension.key}>
            <div className="card-title">
              <DimensionDot dimension={dimension.key} />
              <h3>{dimension.label}</h3>
            </div>
            <div className="dimension-overview">
              <span>概述</span>
              <p>{overview}</p>
            </div>
            <div className="goal-card-foot">
              <span>{savedVision?.vision ? "已设蓝图" : "尚未设蓝图"}</span>
              <button className="text-button" onClick={() => openDimension(dimension.key)}>{isExpanded ? "收起" : "蓝图"}</button>
            </div>
            {isExpanded ? (
              <div className="dimension-editor">
                <label>
                  <span>概述</span>
                  <AutoResizeTextarea storageKey={`dimension:${dimension.key}:overview`} rows={3} value={overviewDraft} placeholder="用一小段话概述这个维度的定位和追求。" onChange={(event) => setOverviewDraft(event.target.value)} />
                </label>
                <label>
                  <span>愿景 / 远景</span>
                  <AutoResizeTextarea storageKey={`dimension:${dimension.key}:vision`} rows={3} value={visionDraft} placeholder={`${dimension.label}最终想成为的样子`} onChange={(event) => setVisionDraft(event.target.value)} />
                </label>
                <label>
                  <span>使命 / 宗旨</span>
                  <AutoResizeTextarea storageKey={`dimension:${dimension.key}:mission`} rows={3} value={missionDraft} placeholder="这个维度为什么重要，它服务什么。" onChange={(event) => setMissionDraft(event.target.value)} />
                </label>
                <label>
                  <span>价值观 / 信念</span>
                  <AutoResizeTextarea storageKey={`dimension:${dimension.key}:values`} rows={4} value={valuesDraft} placeholder="每行一条判断标准" onChange={(event) => setValuesDraft(event.target.value)} />
                </label>
                <label>
                  <span>年度重点</span>
                  <input value={focusDraft} placeholder="当前最重要的推进方向" onChange={(event) => setFocusDraft(event.target.value)} />
                </label>
                <label>
                  <span>原则 / 准则</span>
                  <AutoResizeTextarea storageKey={`dimension:${dimension.key}:principles`} rows={4} value={principlesDraft} placeholder="每行一条行动边界或准则" onChange={(event) => setPrinciplesDraft(event.target.value)} />
                </label>
                <label>
                  <span>每周行动</span>
                  <AutoResizeTextarea storageKey={`dimension:${dimension.key}:weekly-actions`} rows={4} value={weeklyActionsDraft} placeholder="每行一条可重复推进的周动作" onChange={(event) => setWeeklyActionsDraft(event.target.value)} />
                </label>
                <label>
                  <span>复盘指标</span>
                  <AutoResizeTextarea storageKey={`dimension:${dimension.key}:review-metrics`} rows={4} value={reviewMetricsDraft} placeholder="每行一条判断本周是否变好的指标" onChange={(event) => setReviewMetricsDraft(event.target.value)} />
                </label>
                <div className="save-inline">
                  {savedDimension === dimension.key ? <span>已保存</span> : null}
                  <button className="secondary" onClick={() => saveDimensionVision(dimension.key)} disabled={savingDimension === dimension.key}>
                    {savingDimension === dimension.key ? "保存中..." : "保存"}
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export function DirectionPage({ state, onRefresh }: { state: StateResponse; onRefresh: () => void }) {
  const [tab, setTab] = useState<DirectionTab>("目标");
  const tabs: DirectionTab[] = ["目标", "习惯", "人生总纲", "六维蓝图"];

  return (
    <section className="direction-stack page-enter">
      <header className="page-kicker">
        <h1>方向</h1>
        <p>确定方向，把目标接到具体行动。</p>
      </header>
      <div className="subnav">
        {tabs.map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item}</button>)}
      </div>
      {tab === "人生总纲" ? <LifeCorePanel state={state} onRefresh={onRefresh} /> : null}
      {tab === "六维蓝图" ? <SixDimensionBoard state={state} onRefresh={onRefresh} /> : null}
      {tab === "目标" ? <SimpleGoals state={state} onRefresh={onRefresh} /> : null}
      {tab === "习惯" ? <Habits state={state} onRefresh={onRefresh} /> : null}
    </section>
  );
}

"use client";

import { dateBounds,todayKey } from "@/lib/date";
import { dimensions } from "@/lib/dimensions";
import type { AppState,ClarifiedType,Dimension,Goal,GoalBreakdown,InboxClarification,InboxItem,RhythmPlan,Task,TaskChecklistItem } from "@/lib/types";
import type { ReactNode,TextareaHTMLAttributes } from "react";
import { useEffect,useRef } from "react";


export type StateResponse = AppState & {
  stats: {
    today_total: number;
    today_completed: number;
    today_rate: number;
    week_total: number;
    week_completed: number;
    week_rate: number;
  };
};

export type MainTab = "今天" | "方向" | "总览" | "复盘" | "设置";

export type DirectionTab = "人生总纲" | "六维蓝图" | "目标" | "习惯";

export type RhythmKey = keyof RhythmPlan;

export type OverviewRange = "today" | "week" | "month";

export type OverviewMode = "overview" | "goal" | "category";

export const mainTabs: MainTab[] = ["今天", "方向", "总览", "复盘"];

export const overviewLabels: Array<{ key: OverviewRange; label: string }> = [
  { key: "today", label: "今天" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
];

export const overviewModeLabels: Array<{ key: OverviewMode; label: string }> = [
  { key: "overview", label: "概览" },
  { key: "goal", label: "目标" },
  { key: "category", label: "分类" },
];

export const clarifiedTypes: ClarifiedType[] = ["今日动作", "临时事项", "日程", "长期目标", "习惯", "将来某天", "删除"];

export const clarificationTypeLabels: Record<ClarifiedType, string> = {
  今日动作: "今日任务",
  临时事项: "临时事项",
  日程: "日程事项",
  成果项目: "阶段项目",
  短期目标: "短期目标",
  长期目标: "目标事项",
  习惯: "打卡事项",
  资料记录: "资料记录",
  将来某天: "将来/也许",
  删除: "删除",
};

export function visibleClarifiedType(type: ClarifiedType): ClarifiedType {
  if (type === "成果项目" || type === "短期目标") return "长期目标";
  if (type === "资料记录") return "将来某天";
  return clarifiedTypes.includes(type) ? type : "临时事项";
}

export type RhythmLabel = { key: RhythmKey; label: string };

export function getRhythmLabels(targetPeriod: string): RhythmLabel[] {
  const periodDays: Record<string, number> = {
    "7天": 7,
    "14天": 14,
    "30天": 30,
    "60天": 60,
    "90天": 90,
    "半年": 180,
    "一年": 365,
  };
  const days = periodDays[targetPeriod] || 90;

  if (days <= 30) {
    return [
      { key: "weekly", label: "每周" },
      { key: "monthly", label: `${targetPeriod}复盘` },
    ];
  }

  if (days <= 60) {
    return [
      { key: "weekly", label: "每周" },
      { key: "monthly", label: `${targetPeriod}复盘` },
    ];
  }

  if (days <= 90) {
    return [
      { key: "weekly", label: "每周" },
      { key: "monthly", label: "每月" },
      { key: "quarterly", label: `${targetPeriod}复盘` },
    ];
  }

  if (days <= 180) {
    return [
      { key: "weekly", label: "每周" },
      { key: "monthly", label: "每月" },
      { key: "quarterly", label: "季度" },
      { key: "half_year", label: `${targetPeriod}复盘` },
    ];
  }

  return [
    { key: "weekly", label: "周" },
    { key: "monthly", label: "月" },
    { key: "quarterly", label: "季" },
    { key: "half_year", label: "半年" },
    { key: "yearly", label: "年度" },
  ];
}

export const rhythmLabels: Array<{ key: RhythmKey; label: string }> = [
  { key: "weekly", label: "周" },
  { key: "monthly", label: "月" },
  { key: "quarterly", label: "季" },
  { key: "half_year", label: "半年" },
  { key: "yearly", label: "年" },
];

export function previousDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return todayKey(date);
}

export function completedAtForDate(dateKey: string) {
  return new Date(`${dateKey}T23:59:00`).toISOString();
}

export function statusClass(status: string) {
  if (status === "完成" || status === "已完成") return "status-done";
  if (status === "延期" || status === "暂停" || status === "等待中" || status === "等待反馈") return "status-warn";
  if (status === "未开始" || status === "待开始" || status === "进行中") return "status-open";
  return "status-neutral";
}

export function StatusText({ status }: { status: string }) {
  return <small className={`status-text ${statusClass(status)}`}>{status}</small>;
}

export function safeParseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function getLifeCoreDraft() {
  if (typeof window === "undefined") return null;
  return safeParseJson<{ vision: string; mission: string; values: string; principles: string }>(window.localStorage.getItem("six-life-core-draft"));
}

export function setLifeCoreDraft(draft: { vision: string; mission: string; values: string; principles: string }) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("six-life-core-draft", JSON.stringify(draft));
}

export function removeLifeCoreDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("six-life-core-draft");
}

export function getDimensionDraft(dimension: Dimension) {
  if (typeof window === "undefined") return null;
  return safeParseJson<{
    overviewDraft: string;
    visionDraft: string;
    missionDraft: string;
    valuesDraft: string;
    principlesDraft: string;
    focusDraft: string;
    weeklyActionsDraft: string;
    reviewMetricsDraft: string;
  }>(window.localStorage.getItem(`six-dimension-draft:${dimension}`));
}

export function setDimensionDraft(
  dimension: Dimension,
  draft: {
    overviewDraft: string;
    visionDraft: string;
    missionDraft: string;
    valuesDraft: string;
    principlesDraft: string;
    focusDraft: string;
    weeklyActionsDraft: string;
    reviewMetricsDraft: string;
  }
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`six-dimension-draft:${dimension}`, JSON.stringify(draft));
}

export function removeDimensionDraft(dimension: Dimension) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`six-dimension-draft:${dimension}`);
}

export function readStoredTextareaHeight(storageKey: string) {
  if (typeof window === "undefined") return null;
  const value = Number(window.localStorage.getItem(`six-textarea-height:${storageKey}`));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function writeStoredTextareaHeight(storageKey: string, height: number) {
  if (typeof window === "undefined" || !Number.isFinite(height) || height <= 0) return;
  window.localStorage.setItem(`six-textarea-height:${storageKey}`, String(Math.round(height)));
}

export function AutoResizeTextarea({ storageKey, value, rows, onChange, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { storageKey: string; value: string }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const userHeightRef = useRef<number | null>(null);
  const resizeStartHeightRef = useRef<number | null>(null);

  useEffect(() => {
    userHeightRef.current = readStoredTextareaHeight(storageKey);
  }, [storageKey]);

  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const nextHeight = Math.max(textarea.scrollHeight, userHeightRef.current || 0);
    textarea.style.height = `${nextHeight}px`;
  }, [storageKey, value]);

  function rememberManualHeight() {
    window.setTimeout(() => {
      const textarea = ref.current;
      const startHeight = resizeStartHeightRef.current;
      resizeStartHeightRef.current = null;
      if (!textarea || startHeight === null) return;
      const currentHeight = textarea.getBoundingClientRect().height;
      if (Math.abs(currentHeight - startHeight) < 2) return;
      userHeightRef.current = currentHeight;
      writeStoredTextareaHeight(storageKey, currentHeight);
    }, 0);
  }

  return (
    <textarea
      {...props}
      ref={ref}
      rows={rows}
      value={value}
      onChange={onChange}
      onPointerDown={(event) => {
        resizeStartHeightRef.current = event.currentTarget.getBoundingClientRect().height;
        window.addEventListener("pointerup", rememberManualHeight, { once: true });
        props.onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        rememberManualHeight();
        props.onPointerUp?.(event);
      }}
      onBlur={(event) => {
        rememberManualHeight();
        props.onBlur?.(event);
      }}
    />
  );
}

export function CollapsiblePanel({ title, count, defaultOpen = false, children }: { title: string; count?: number | string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details className="panel overview-section collapsible-panel" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        {count !== undefined ? <small>{count}</small> : null}
      </summary>
      <div className="collapsible-body">{children}</div>
    </details>
  );
}

export function emptyRhythmPlan(): RhythmPlan {
  return { weekly: [], monthly: [], quarterly: [], half_year: [], yearly: [] };
}

export function rhythmFromBreakdown(breakdown: Partial<GoalBreakdown> | null | undefined): RhythmPlan {
  const base = emptyRhythmPlan();
  if (!breakdown?.rhythm_plan) {
    return base;
  }

  return {
    weekly: breakdown.rhythm_plan.weekly.slice(0, 8),
    monthly: breakdown.rhythm_plan.monthly.slice(0, 6),
    quarterly: breakdown.rhythm_plan.quarterly.slice(0, 4),
    half_year: breakdown.rhythm_plan.half_year.slice(0, 3),
    yearly: breakdown.rhythm_plan.yearly.slice(0, 2),
  };
}

export function currentWeekTasksFromBreakdown(breakdown: Partial<GoalBreakdown> | null | undefined) {
  return (breakdown?.current_week_tasks || []).map((task) => ({ ...task, day: undefined }));
}

export function currentStageFromBreakdown(breakdown: Partial<GoalBreakdown> | null | undefined) {
  const stages = breakdown?.stage_results || [];
  return stages.find((stage) => stage.id && stage.id === breakdown?.current_stage_id) || stages.find((stage) => stage.status === "进行中") || stages[0] || null;
}

export function goalStatusFromBreakdown(breakdown: Partial<GoalBreakdown> | null | undefined, fallback: Goal["status"] = "未开始") {
  const stages = breakdown?.stage_results || [];
  if (!stages.length) return fallback;
  if (stages.every((stage) => stage.status === "完成")) return "完成";
  if (stages.some((stage) => stage.status === "进行中" || stage.status === "完成")) return "进行中";
  return "未开始";
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function periodDays(value: string | null | undefined) {
  const text = (value || "").trim();
  if (!text) return 90;
  const dayMatch = text.match(/(\d+)\s*天/);
  if (dayMatch) return Number(dayMatch[1]);
  const monthMatch = text.match(/(\d+)\s*(个月|月)/);
  if (monthMatch) return Number(monthMatch[1]) * 30;
  const yearMatch = text.match(/(\d+)\s*年/);
  if (yearMatch) return Number(yearMatch[1]) * 365;
  if (text.includes("半年")) return 180;
  if (text.includes("季度")) return 90;
  if (text.includes("一年") || text.includes("年度")) return 365;
  return 90;
}

export function addDaysToIsoDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return todayKey(date);
}

export function goalTimeProgress(goal: Goal, breakdown: GoalBreakdown | null) {
  const start = goal.created_at ? todayKey(new Date(goal.created_at)) : todayKey();
  const defaultDays = Math.max(1, periodDays(breakdown?.target_period || goal.time_horizon));
  const deadline = goal.deadline || addDaysToIsoDate(start, defaultDays - 1);
  const startTime = new Date(`${start}T12:00:00`).getTime();
  const todayTime = new Date(`${todayKey()}T12:00:00`).getTime();
  const deadlineTime = new Date(`${deadline}T12:00:00`).getTime();
  const totalDays = Math.max(1, Math.round((deadlineTime - startTime) / 86400000) + 1);
  const elapsedDays = Math.min(totalDays, Math.max(1, Math.floor((todayTime - startTime) / 86400000) + 1));
  const remainingDays = Math.max(0, Math.round((deadlineTime - todayTime) / 86400000));
  const percent = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));
  return { start, deadline, totalDays, elapsedDays, remainingDays, percent };
}

export function parseGoalBreakdown(goal: Goal): GoalBreakdown | null {
  try {
    if (!goal.ai_breakdown) return null;
    const parsed = JSON.parse(goal.ai_breakdown) as GoalBreakdown;
    return parsed;
  } catch {
    return null;
  }
}

export function rangeBounds(range: OverviewRange) { return dateBounds(range); }

export function isToday(task: Task) {
  const current = todayKey();
  return task.date === current;
}

export function dimensionAccent(dimension: Dimension) {
  return dimensions.find((item) => item.key === dimension)?.accent || "#1f2328";
}

export function defaultReviewQuestion(dimension: Dimension) {
  const questions: Record<Dimension, string> = {
    财富: "这周我有没有推进一个真正有价值的业务动作？",
    心智: "这周我有没有学到并沉淀一个有用东西？",
    身体: "这周我的身体是在恢复，还是在被透支？",
    感受: "这周我有没有做一件真正有感受的事？",
    关系: "这周我有没有维护重要关系，并守住边界？",
    精神: "这周我有没有更清醒，还是更内耗？",
  };
  return questions[dimension];
}

export function taskRangeDate(task: Task) {
  return task.date;
}

export function inDateRange(date: string | null | undefined, start: string, end: string) {
  return Boolean(date && date >= start && date <= end);
}

export function taskSourceLabel(task: Task) {
  if (task.postponed_count > 0) return "延期";
  if (task.is_habit || task.source === "habit") return "打卡";
  if (task.calendar_sync_status === "pending" || task.due_time) return task.due_time ? `日程 ${task.due_time}` : "日程";
  if (task.source === "goal_week") return "计划";
  if (task.source === "inbox") return "收集箱";
  return "新增";
}

export function checklistProgress(task: Task) {
  const checklist = task.checklist || [];
  if (!checklist.length) return null;
  return `${checklist.filter((item) => item.done).length}/${checklist.length}`;
}

export function checklistItemsProgress(checklist: TaskChecklistItem[] | undefined) {
  const items = checklist || [];
  if (!items.length) return null;
  return `${items.filter((item) => item.done).length}/${items.length}`;
}

export function estimateText(task: Pick<Task, "estimated_minutes" | "is_habit">) {
  return task.estimated_minutes ? `${task.estimated_minutes} 分钟` : "待估时";
}

export function checklistItem(text: string): TaskChecklistItem {
  return { id: createChecklistId(), text, done: false, result_note: "", carry_status: "none", carried_to_task_id: null, carried_to_date: null };
}

export function mergeTaskChecklist(previous: TaskChecklistItem[] | undefined, next: TaskChecklistItem[] | undefined): TaskChecklistItem[] {
  return (next || []).map((item) => {
    const saved = (previous || []).find((entry) => entry.id === item.id || entry.text.trim() === item.text.trim());
    return {
      ...item,
      done: saved?.done || item.done || false,
      result_note: saved?.result_note || item.result_note || "",
      carry_status: saved?.carry_status || item.carry_status || "none",
      carried_to_task_id: saved?.carried_to_task_id || item.carried_to_task_id || null,
      carried_to_date: saved?.carried_to_date || item.carried_to_date || null,
    };
  });
}

export function clarificationFromItem(item: InboxItem): InboxClarification | null {
  if (!item.clarified_type || !item.dimension_primary) return null;
  return {
    original: item.content,
    dimension_primary: item.dimension_primary,
    clarified_type: item.clarified_type,
    relation_type: item.relation_type || "生活维护",
    goal_id: item.goal_id || null,
    project_id: item.project_id || null,
    suggested_title: item.content,
    reason: "已澄清，可继续手动调整后分流。",
    next_action: item.next_action || item.content,
    scheduled_date: item.scheduled_date || null,
    scheduled_time: item.scheduled_time || null,
  };
}

export function clarificationDestinationHint(clarification: InboxClarification) {
  const type = visibleClarifiedType(clarification.clarified_type);
  const date = clarification.scheduled_date;
  if (type === "日程") {
    if (!date || date === todayKey()) return "确认后会进入「今天」页的「日程事项」分组；有时间时会按时间排序。";
    return `确认后会进入 ${date} 的日程；可在「总览」按对应范围查看「日程事项」，到当天会出现在「今天」页。`;
  }
  if (type === "今日动作") return "确认后会进入「今天」页的今日任务。";
  if (type === "临时事项") return "确认后会作为独立事项进入今天，不关联目标。";
  if (type === "长期目标") return "确认后会进入「方向」页的目标列表。";
  if (type === "习惯") return "确认后会进入「方向」页的习惯，并生成对应打卡。";
  if (type === "将来某天") return "确认后会放入收集箱的「将来/也许」。";
  return "确认后会按当前分流去向进入对应模块。";
}

export function DimensionDot({ dimension }: { dimension: Dimension }) {
  return <span className="dot" style={{ background: dimensionAccent(dimension) }} aria-hidden="true" />;
}

export function createChecklistId() {
  return `check_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function nextDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return todayKey(date);
}

export function addDaysKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return todayKey(date);
}

export function nextWeekStartKey(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 8);
  return todayKey(date);
}

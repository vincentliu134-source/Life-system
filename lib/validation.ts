import { validDate } from "./date";

export class ValidationError extends Error {}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ValidationError(message);
}
export function record(value: unknown): asserts value is Record<string, unknown> {
  assert(value && typeof value === "object" && !Array.isArray(value), "数据必须是对象");
}
const enums: Record<string, string[]> = {
  dimension_primary: ["财富", "心智", "身体", "感受", "精神", "关系", "意义"],
  dimension_secondary: ["财富", "心智", "身体", "感受", "精神", "关系", "意义"],
  priority: ["A", "B", "C"], priority_source: ["user", "system"],
  cycle_focus: ["本周期重点", "维持", "以后再说"],
  frequency: ["每日", "隔天一次", "每周1次", "每周3次", "每周5次", "指定星期", "每周自由3次"],
  source: ["planned", "added", "habit", "inbox", "calendar", "goal_week", "manual"],
  calendar_sync_status: ["none", "pending", "synced", "failed"],
  carry_status: ["none", "carried", "waiting"],
  origin: ["planned", "ad_hoc"],
  schedule_view: ["today_and_overview", "overview_only"],
  goal_task_priority: ["by_dimension", "always_a", "always_b"],
  checklist_carry_default: ["tomorrow", "next_week"],
  inbox_clarify_bias: ["execution_first", "goal_first", "schedule_first"],
  energy: ["高", "中", "低"], pressure: ["高", "中", "低"], available_time: ["充足", "一般", "很少"],
};
const numbers = new Set(["estimated_minutes", "postponed_count", "focus_order", "sort_order", "available_minutes", "buffer_minutes", "focus_limit", "baseline", "current", "target", "schema_version"]);
const booleans = new Set(["is_habit", "is_must_today", "is_focus", "active", "done", "confirmed"]);
const dates = new Set(["date", "due_date", "deadline", "scheduled_date", "postponed_from_date", "carried_to_date", "follow_up_date", "next_follow_up_date", "first_do_date", "from_date", "to_date", "week"]);
const times = new Set(["due_time", "scheduled_time", "scheduled_end_time"]);
const strings = new Set(["id", "title", "description", "text", "content", "result_note", "success_metric", "why", "ai_breakdown", "created_at", "updated_at", "completed_at", "archived_at", "vision", "mission", "overview", "current_focus", "wins", "blockers", "tomorrow_adjustment", "principle_alignment", "needed_resources", "important_completed_text", "important_unfinished_text", "tomorrow_first_text", "label", "unit", "evidence", "next_action", "next_follow_up_action", "continued_from_task_id", "continued_to_task_id", "adjustment", "next_action_task_id", "waiting_on", "reason", "stop", "continue", "commit", "goal_id", "project_id", "habit_id", "stage_id", "task_id", "week_task_id", "week_id"]);
const stringArrays = new Set(["values", "principles", "weekly_actions", "review_metrics", "unfinished_reason_tags", "feedback_suggestions", "dimension_priority_order"]);

export function validateFields(value: unknown, path = "数据"): void {
  record(value);
  for (const [key, item] of Object.entries(value)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) throw new ValidationError("数据包含无效字段");
    if (item === null || item === undefined) continue;
    const name = `${path}.${key}`;
    if (enums[key]) assert(enums[key].includes(item as string), `${name}的选项无效`);
    if (strings.has(key)) assert(typeof item === "string", `${name}必须是文字`);
    if (numbers.has(key)) {
      assert(typeof item === "number" && Number.isFinite(item), `${name}必须是有效数字`);
      if (!["baseline", "current", "target"].includes(key)) assert(item >= 0, `${name}不能为负数`);
      if (key.includes("minutes")) assert(item <= 1440 && Number.isInteger(item), `${name}必须是0至1440的整数`);
    }
    if (booleans.has(key)) assert(typeof item === "boolean", `${name}必须是布尔值`);
    if (dates.has(key)) assert(item === "" || validDate(item), `${name}日期无效`);
    if (times.has(key)) assert(item === "" || (typeof item === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(item)), `${name}时间无效`);
    if (stringArrays.has(key)) assert(Array.isArray(item) && item.every((v) => typeof v === "string"), `${name}必须是文字列表`);
    if (key === "weekdays") assert(Array.isArray(item) && item.every((v) => Number.isInteger(v) && v >= 0 && v <= 6), "星期无效");
    if (key === "progress_logs") {
      assert(Array.isArray(item), "进展记录必须是列表");
      const ids = new Set<string>();
      item.forEach((entry) => {
        validateFields(entry, name); record(entry);
        assert(typeof entry.id === "string" && entry.id && !ids.has(entry.id), "进展记录ID缺失或重复");
        ids.add(entry.id);
        assert(typeof entry.content === "string" && entry.content.trim(), "进展记录不能为空");
        assert(typeof entry.created_at === "string" && !Number.isNaN(Date.parse(entry.created_at)), "进展记录时间无效");
        assert(["进行中", "等待反馈", "完成"].includes(entry.status as string), "进展状态无效");
      });
    }
    if (key === "rollovers") {
      assert(Array.isArray(item), "顺延历史必须是列表");
      item.forEach((entry) => {
        validateFields(entry, name); record(entry);
        assert(validDate(entry.from_date) && validDate(entry.to_date) && entry.from_date < entry.to_date, "顺延日期无效");
        assert(["未开始", "进行中", "等待反馈", "延期"].includes(entry.status as string), "顺延状态无效");
      });
    }
    if (key === "plan_events") {
      assert(Array.isArray(item), "改期记录必须是列表");
      item.forEach((entry) => { validateFields(entry, name); record(entry); assert(typeof entry.from_date === "string" && typeof entry.to_date === "string" && typeof entry.changed_at === "string" && !Number.isNaN(Date.parse(entry.changed_at)), "改期记录无效"); });
    }
    if (key === "waiting_date_history") {
      assert(Array.isArray(item), "等待日期记录必须是列表");
      item.forEach((entry) => { validateFields(entry, name); record(entry); assert((entry.from_date === null || validDate(entry.from_date)) && validDate(entry.to_date) && typeof entry.changed_at === "string" && !Number.isNaN(Date.parse(entry.changed_at)), "等待日期记录无效"); });
    }
    if (key === "activity_events") {
      assert(Array.isArray(item), "操作记录必须是列表");
      item.forEach((entry) => { record(entry); assert(typeof entry.request_id === "string" && Boolean(entry.request_id) && typeof entry.op === "string" && typeof entry.changed_at === "string" && !Number.isNaN(Date.parse(entry.changed_at)), "操作记录无效"); });
    }
    if (["checklist", "checklist_template"].includes(key)) {
      assert(Array.isArray(item), `${name}必须是清单`);
      item.forEach((entry) => { if (typeof entry === "string") return; validateFields(entry, name); assert(typeof entry.text === "string", "清单缺少文字"); });
    }
    if (key === "outcome") { validateFields(item, name); const m = item as Record<string, unknown>; for (const field of ["baseline", "current", "target"]) assert(typeof m[field] === "number", "结果指标缺少数值"); }
    if (["life_core", "preferences"].includes(key)) validateFields(item, name);
  }
  if (value.focus_limit !== undefined) assert([1, 2, 3].includes(value.focus_limit as number), "承诺上限应为1至3件");
  if (typeof value.buffer_minutes === "number" && typeof value.available_minutes === "number") assert(value.buffer_minutes <= value.available_minutes, "缓冲时间不能超过可用时间");
  if (typeof value.due_time === "string" && value.due_time && typeof value.scheduled_end_time === "string" && value.scheduled_end_time) assert(value.scheduled_end_time > value.due_time, "固定日程结束时间应晚于开始时间（跨日请分两条记录）");
}

export function validateBackup(value: unknown) {
  record(value);
  validateFields(value);
  assert(value.schema_version === undefined || value.schema_version === 2, "备份版本不受支持，请使用兼容版本恢复");
  const collections = ["tasks", "goals", "projects", "habits", "inbox_items", "daily_reviews", "ai_logs", "dimension_visions", "week_candidates", "areas", "notes", "period_reviews"];
  assert(Array.isArray(value.tasks) && Array.isArray(value.goals), "备份必须包含任务和目标列表");
  const statuses: Record<string, string[]> = { tasks: ["未开始", "进行中", "等待反馈", "完成", "延期", "取消", "跳过", "未记录"], goals: ["未开始", "进行中", "暂停", "完成", "放弃"], projects: ["待开始", "进行中", "等待中", "已完成", "暂停"], inbox_items: ["未处理", "已安排", "已归档"] };
  for (const key of collections) {
    if (value[key] === undefined) continue;
    assert(Array.isArray(value[key]), `${key}必须是列表`);
    const ids = new Set<string>();
    for (const entry of value[key] as unknown[]) {
      validateFields(entry, key); record(entry);
      if (key !== "dimension_visions") { assert(typeof entry.id === "string" && entry.id && !ids.has(entry.id), `${key}的ID缺失或重复`); ids.add(entry.id); }
      if (statuses[key]) assert(statuses[key].includes(entry.status as string), `${key}状态无效`);
      if (["tasks", "goals", "projects", "habits"].includes(key)) assert(typeof entry.title === "string" && entry.title.trim(), `${key}标题不能为空`);
      if (key === "tasks") assert(typeof entry.date === "string" && typeof entry.estimated_minutes === "number", "任务缺少计划日期或估时");
      if (["tasks", "goals", "habits", "projects"].includes(key)) assert(typeof entry.created_at === "string" && !Number.isNaN(Date.parse(entry.created_at)), `${key}创建时间无效`);
      if (key === "habits") assert(Array.isArray(entry.weekdays) && typeof entry.active === "boolean" && typeof entry.frequency === "string", "习惯的频次、星期或启用状态缺失");
      if (key === "dimension_visions") assert(enums.dimension_primary.includes(entry.dimension as string), "六维蓝图维度无效");
      if (key === "ai_logs") { assert(Array.isArray(entry.output), "AI记录输出应为列表"); entry.output.forEach((draft) => validateFields(draft)); }
      if (key === "daily_reviews") for (const field of ["date", "wins", "blockers", "tomorrow_adjustment"]) assert(typeof entry[field] === "string", `复盘缺少${field}`);
      if (key === "areas") assert(typeof entry.title === "string" && entry.title.trim() && typeof entry.active === "boolean", "板块名称或状态无效");
      if (key === "notes") assert(typeof entry.content === "string" && entry.content.trim(), "记录内容不能为空");
      if (key === "period_reviews") assert(["week", "month"].includes(entry.kind as string) && typeof entry.period === "string" && typeof entry.content === "string", "周期复盘无效");
      if (key === "goals" && entry.ai_breakdown) {
        let b: unknown; try { b = JSON.parse(entry.ai_breakdown as string); } catch { throw new ValidationError("目标拆解不是有效JSON"); }
        record(b);
        if (b.stage_results !== undefined) { assert(Array.isArray(b.stage_results), "阶段结果必须是列表"); b.stage_results.forEach((stage) => validateFields(stage)); }
        if (b.current_week_tasks !== undefined) { assert(Array.isArray(b.current_week_tasks), "周行动必须是列表"); b.current_week_tasks.forEach((task) => validateFields(task)); }
        if (b.rhythm_plan !== undefined) { record(b.rhythm_plan); for (const items of Object.values(b.rhythm_plan)) assert(Array.isArray(items) && items.every((item) => typeof item === "string"), "目标节奏必须是文字列表"); }
      }
    }
  }
  for (const key of ["daily_plans", "weekly_plans"]) if (value[key] !== undefined) {
    record(value[key]);
    for (const [date, plan] of Object.entries(value[key])) {
      assert(validDate(date), "计划日期无效"); validateFields(plan); record(plan);
      if (key === "daily_plans") for (const field of ["available_minutes", "buffer_minutes", "focus_limit"]) assert(typeof plan[field] === "number", `每日计划缺少${field}`);
      else for (const field of ["stop", "continue", "commit"]) assert(typeof plan[field] === "string", "周计划缺少取舍记录");
    }
  }
  if (value.review_baselines !== undefined) {
    record(value.review_baselines);
    for (const [date, baseline] of Object.entries(value.review_baselines)) {
      assert(validDate(date), "复盘基线日期无效");record(baseline);
      assert(typeof baseline.captured_at === "string" && !Number.isNaN(Date.parse(baseline.captured_at)), "复盘基线时间无效");
      assert(Array.isArray(baseline.tasks), "复盘基线事项无效");
      baseline.tasks.forEach((task) => { record(task);validateFields(task);assert(typeof task.id === "string" && typeof task.title === "string" && typeof task.estimated_minutes === "number", "复盘基线事项无效"); });
    }
  }
}

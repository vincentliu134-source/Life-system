import { promises as fs } from "fs";
import path from "path";
import { todayKey } from "./date";
import { createId } from "./id";
import { dimensionKeys } from "./dimensions";
import { validateBackup } from "./validation";
import { isHabit, isOpen, habitSummary } from "./planning";
import type { AppState, Dimension, DimensionVision, Habit, LifeCore, Priority, SystemPreferences, Task, TaskChecklistItem, TaskSource } from "./types";

const dataPath = path.join(process.env.LIFE_DATA_DIR || path.join(process.cwd(), "data"), "app-state.json");

const now = () => new Date().toISOString();
// Next.js may load this module from separate route bundles. Share the queue
// across bundles so a restore and a task save cannot race within the server.
const queues = globalThis as typeof globalThis & { lifeWriteQueues?: Map<string, Promise<unknown>> };
queues.lifeWriteQueues ||= new Map();
function enqueue<T>(run: () => Promise<T>) {
  const previous = queues.lifeWriteQueues!.get(dataPath) || Promise.resolve();
  const result = previous.then(run, run);
  queues.lifeWriteQueues!.set(dataPath, result.catch(() => undefined));
  return result;
}

function defaultLifeCore(): LifeCore {
  return {
    vision: "",
    mission: "",
    values: [],
    principles: [],
  };
}

function defaultDimensionVisions(): DimensionVision[] {
  return dimensionKeys.map((dimension) => ({
    dimension,
    overview: "",
    vision: "",
    mission: "",
    values: [],
    principles: [],
    current_focus: "",
    weekly_actions: [],
    review_metrics: [],
  }));
}

function normalizeDimension(value: unknown): Dimension {
  if (value === "意义") return "精神";
  return dimensionKeys.includes(value as Dimension) ? value as Dimension : "精神";
}

function normalizePriority(value: unknown, dimension?: Dimension): Priority {
  if (value === "A" || value === "B" || value === "C") return value;
  return dimension === "财富" || dimension === "身体" ? "A" : "B";
}

function normalizeChecklist(value: unknown): TaskChecklistItem[] {
  if (!Array.isArray(value)) return [];
  const normalized: TaskChecklistItem[] = [];
  value.forEach((item, index) => {
    if (typeof item === "string") {
      const text = item.trim();
      if (text) {
        normalized.push({
          id: createId("check"),
          text,
          done: false,
          result_note: "",
          carry_status: "none",
          carried_to_task_id: null,
          carried_to_date: null,
        });
      }
      return;
    }
    if (!item || typeof item !== "object") return;
    const record = item as Record<string, unknown>;
    const text = String(record.text || "").trim();
    if (!text) return;
    normalized.push({
      id: String(record.id || `check_${index}`),
      text,
      done: Boolean(record.done),
      result_note: typeof record.result_note === "string" ? record.result_note : "",
      carry_status: record.carry_status === "carried" || record.carry_status === "waiting" ? record.carry_status : "none",
      carried_to_task_id: typeof record.carried_to_task_id === "string" ? record.carried_to_task_id : null,
      carried_to_date: typeof record.carried_to_date === "string" ? record.carried_to_date : null,
    });
  });
  return normalized;
}

function normalizeTaskSource(task: Task): TaskSource {
  if (task.source) return task.source;
  if (task.is_habit) return "habit";
  if (task.calendar_sync_status === "pending" || task.due_time) return "calendar";
  if (task.goal_id || task.stage_id || task.week_id) return "goal_week";
  return "manual";
}

const defaultDimensionPriorityOrder: Dimension[] = ["财富", "心智", "身体", "感受", "精神", "关系"];

const defaultPreferences: SystemPreferences = {
  schedule_view: "today_and_overview",
  goal_task_priority: "by_dimension",
  checklist_carry_default: "tomorrow",
  inbox_clarify_bias: "execution_first",
};

function normalizeDimensionPriorityOrder(value: unknown): Dimension[] {
  if (!Array.isArray(value)) return [...defaultDimensionPriorityOrder];
  const normalized: Dimension[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const dimension = normalizeDimension(item);
      if (!normalized.includes(dimension)) normalized.push(dimension);
    }
  }
  return normalized.length === defaultDimensionPriorityOrder.length ? normalized : [...defaultDimensionPriorityOrder];
}

function normalizePreferences(value: unknown): SystemPreferences {
  const source = value && typeof value === "object" ? value as Partial<SystemPreferences> : {};
  return {
    schedule_view: source.schedule_view === "overview_only" ? "overview_only" : defaultPreferences.schedule_view,
    goal_task_priority: source.goal_task_priority === "always_a" || source.goal_task_priority === "always_b" ? source.goal_task_priority : defaultPreferences.goal_task_priority,
    checklist_carry_default: source.checklist_carry_default === "next_week" ? "next_week" : defaultPreferences.checklist_carry_default,
    inbox_clarify_bias: source.inbox_clarify_bias === "goal_first" || source.inbox_clarify_bias === "schedule_first" ? source.inbox_clarify_bias : defaultPreferences.inbox_clarify_bias,
  };
}

function emptyState(): AppState {
  return {
    tasks: [],
    goals: [],
    projects: [],
    habits: [],
    inbox_items: [],
    daily_reviews: [],
    ai_logs: [],
    life_core: defaultLifeCore(),
    dimension_visions: defaultDimensionVisions(),
    dimension_priority_order: [...defaultDimensionPriorityOrder],
    preferences: defaultPreferences,
  };
}

function normalizeState(state: AppState): AppState {
  const tasks = (state.tasks || []).map((task) => {
    const priority_source: "user" | "system" = task.priority_source === "user" ? "user" : "system";
    return {
      ...task,
      dimension_primary: normalizeDimension(task.dimension_primary),
      dimension_secondary: task.dimension_secondary ? normalizeDimension(task.dimension_secondary) : null,
      priority: normalizePriority(task.priority, normalizeDimension(task.dimension_primary)),
      checklist: normalizeChecklist(task.checklist),
      is_focus: Boolean(task.is_focus),
      focus_order: typeof task.focus_order === "number" ? task.focus_order : null,
      priority_source,
      source: normalizeTaskSource(task),
    };
  });

  return {
    ...state,
    schema_version: 2,
    revision: state.revision || 0,
    areas: state.areas || [],
    notes: state.notes || [],
    period_reviews: state.period_reviews || [],
    applied_commands: state.applied_commands || [],
    daily_plans: state.daily_plans || {},
    review_baselines: state.review_baselines || {},
    weekly_plans: state.weekly_plans || {},
    week_candidates: state.week_candidates || [],
    dimension_priority_order: normalizeDimensionPriorityOrder(state.dimension_priority_order),
    preferences: normalizePreferences(state.preferences),
    inbox_items: (state.inbox_items || []).map((item) => ({
      ...item,
      clarified_type: item.clarified_type || null,
      dimension_primary: item.dimension_primary ? normalizeDimension(item.dimension_primary) : null,
      scheduled_date: item.scheduled_date || null,
      scheduled_time: item.scheduled_time || null,
      next_action: item.next_action || null,
      goal_id: item.goal_id || null,
      project_id: item.project_id || null,
      relation_type: item.relation_type || null,
    })),
    daily_reviews: state.daily_reviews || [],
    ai_logs: state.ai_logs || [],
    tasks,
    goals: (state.goals || []).map((goal) => ({ ...goal, dimension_primary: normalizeDimension(goal.dimension_primary) })),
    projects: (state.projects || []).map((project) => ({
      ...project,
      dimension_primary: normalizeDimension(project.dimension_primary),
      dimension_secondary: project.dimension_secondary ? normalizeDimension(project.dimension_secondary) : null,
    })),
    habits: (state.habits || []).map((habit) => {
      const dimension = normalizeDimension(habit.dimension_primary);
      return {
        ...habit,
        dimension_primary: dimension,
        priority: normalizePriority(habit.priority, dimension),
        checklist_template: normalizeChecklist(habit.checklist_template),
      };
    }),
    life_core: {
      ...defaultLifeCore(),
      ...(state.life_core || {}),
      values: state.life_core?.values || defaultLifeCore().values,
      principles: state.life_core?.principles || defaultLifeCore().principles,
    },
    dimension_visions: defaultDimensionVisions().map((item) => {
      const saved = state.dimension_visions?.find((entry) => normalizeDimension(entry.dimension) === item.dimension);
      return {
        ...item,
        ...saved,
        dimension: item.dimension,
        overview: saved?.overview || item.overview,
        mission: saved?.mission || item.mission,
        values: saved?.values || item.values,
        principles: saved?.principles || item.principles,
        current_focus: saved?.current_focus || "",
        weekly_actions: saved?.weekly_actions || item.weekly_actions,
        review_metrics: saved?.review_metrics || item.review_metrics,
      };
    }),
  };
}

export async function readState(): Promise<AppState> {
  let raw: string;
  try {
    raw = await fs.readFile(dataPath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
    const state = emptyState();
    await writeState(state);
    return state;
  }

  try {
    return normalizeState(JSON.parse(raw) as AppState);
  } catch (error) {
    throw new Error(`状态文件解析失败，已停止写入以保护数据：${error instanceof Error ? error.message : "未知错误"}`);
  }
}

export async function writeState(state: AppState) {
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  const tempPath = `${dataPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(tempPath, dataPath);
}

export async function updateState(mutator: (state: AppState) => void | AppState, options?: { snapshotReason?: string }): Promise<AppState> {
  const run = async () => {
    const state = await readState();
    const before = JSON.stringify(state);
    const next = mutator(state) || state;
    if (JSON.stringify(next) === before) return next;
    const previousTasks = new Map((JSON.parse(before) as AppState).tasks.map(task => [task.id, task]));
    const changedAt = now();
    for (const task of next.tasks) {
      if (task.is_habit) continue;
      const previousDate = previousTasks.get(task.id)?.date || "";
      if (previousDate !== task.date) task.plan_events = [...(task.plan_events || []), { from_date: previousDate, to_date: task.date, changed_at: changedAt }];
    }
    next.revision = (state.revision || 0) + 1;
    validateBackup(next);
    await snapshot(JSON.parse(before) as AppState);
    if (options?.snapshotReason) await snapshot(JSON.parse(before) as AppState, options.snapshotReason);
    await writeState(next);
    return next;
  };
  return enqueue(run);
}

async function snapshot(state: AppState, reason = "daily") {
  const directory = path.join(path.dirname(dataPath), "backups");
  await fs.mkdir(directory, { recursive: true });
  const filename = reason === "daily" ? `${todayKey()}-daily.json` : `${new Date().toISOString().replace(/[:.]/g, "-")}-${createId("snapshot")}-${reason}.json`;
  try { await fs.writeFile(path.join(directory, filename), JSON.stringify(state, null, 2), { encoding: "utf8", flag: "wx" }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
}

export async function restoreWithSnapshot(raw: unknown) {
  validateBackup(raw);
  const run = async () => {
    const current = await readState();
    const next = normalizeState(raw as AppState);
    const count = (s: AppState) => s.tasks.length + s.goals.length + s.projects.length + s.habits.length + s.inbox_items.length + s.daily_reviews.length;
    if (count(current) && !count(next)) throw new Error("空备份不能覆盖当前记录");
    next.revision = Math.max(current.revision || 0, next.revision || 0) + 1;
    await snapshot(current, "before-restore");
    await writeState(next);
    return next;
  };
  return enqueue(run);
}

function habitDueToday(habit: Habit, date = new Date()) {
  if (!habit.active) return false;
  if (habit.frequency === "每日") return true;
  if (habit.frequency === "隔天一次") {
    const created = new Date(habit.created_at);
    const elapsedDays = Math.floor((dateAsLocalNoon(date).getTime() - dateAsLocalNoon(created).getTime()) / 86400000);
    return elapsedDays >= 0 && elapsedDays % 2 === 0;
  }
  const day = date.getDay();
  if (habit.frequency === "每周1次") return (habit.weekdays.length ? habit.weekdays : [new Date(habit.created_at).getDay()]).includes(day);
  if (habit.frequency === "指定星期") return habit.weekdays.includes(day);
  if (habit.frequency === "每周5次") return [1, 2, 3, 4, 5].includes(day);
  if (habit.frequency === "每周3次") return (habit.weekdays.length ? habit.weekdays : [1, 3, 5]).includes(day);
  return false;
}

function dateAsLocalNoon(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

function inboxItemCreatesTask(type: string | null | undefined) {
  return type === "今日动作" || type === "临时事项" || type === "日程";
}

function copyHabitChecklistTemplate(checklist: TaskChecklistItem[] | undefined): TaskChecklistItem[] {
  return (checklist || []).map((item) => ({
    id: createId("check"),
    text: item.text,
    done: false,
    result_note: "",
    carry_status: "none",
    carried_to_task_id: null,
    carried_to_date: null,
  }));
}

function latestHabitTaskChecklist(tasks: Task[], habitId: string): TaskChecklistItem[] {
  const latest = tasks
    .filter((task) => task.habit_id === habitId && task.checklist?.length)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.created_at || "").localeCompare(a.created_at || ""))[0];

  return copyHabitChecklistTemplate(latest?.checklist);
}

function copyPreviousHabitChecklist(tasks: Task[], habit: Habit, date: string): TaskChecklistItem[] {
  const previous = tasks
    .filter((task) => task.habit_id === habit.id && task.date < date && task.checklist?.length)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.created_at || "").localeCompare(a.created_at || ""))[0];

  return copyHabitChecklistTemplate(previous?.checklist?.length ? previous.checklist : habit.checklist_template);
}

export async function ensureTodayHabitTasks() {
  const date = todayKey();
  return updateState((state) => {
    state.review_baselines ||= {};
    if (!state.review_baselines[date]) state.review_baselines[date] = {
      captured_at: now(),
      tasks: state.tasks.filter(task => !task.is_habit && task.source !== "calendar" && !task.due_time && (task.date === date || task.plan_history?.some(item => item.date === date && todayKey(new Date(item.changed_at)) === date))).map(task => ({ id: task.id, title: task.title, dimension_primary: task.dimension_primary, project_id: task.project_id, estimated_minutes: task.estimated_minutes })),
    };
    // An unfinished action remains where it was planned until explicitly selected again.
    state.workspace_version = 1;
    for (const task of state.tasks) {
      if (isHabit(task) && task.date < date && isOpen(task)) task.status = "未记录";
    }
    for (const habit of state.habits) {
      if (habit.checklist_template === undefined) {
        habit.checklist_template = latestHabitTaskChecklist(state.tasks, habit.id);
      }

      const existing = state.tasks.find((task) => task.habit_id === habit.id && task.date === date);
      if (existing && isOpen(existing)) {
        existing.title = habit.title;
        existing.area_id = habit.area_id || null;
        existing.goal_id = habit.goal_id || null;
        existing.project_id = null;
        existing.dimension_primary = habit.dimension_primary;
        existing.priority = habit.priority;
        existing.priority_source = "user";
        existing.estimated_minutes = habit.estimated_minutes;
        existing.is_must_today = false;
        if (!existing.checklist?.length) {
          existing.checklist = copyPreviousHabitChecklist(state.tasks, habit, date);
        }
      }
      const due = habit.frequency === "每周自由3次" ? habit.active && habitSummary(state, habit.id).completed < 3 : habitDueToday(habit);
      if (!existing && due) {
        const task: Task = {
          id: createId("task"),
          title: habit.title,
          description: "",
          date,
          dimension_primary: habit.dimension_primary,
          dimension_secondary: null,
          type: "习惯",
          priority: habit.priority,
          priority_source: "user",
          status: "未开始",
          area_id: habit.area_id || null,
          goal_id: habit.goal_id || null,
          project_id: null,
          habit_id: habit.id,
          is_habit: true,
          is_must_today: false,
          due_date: null,
          due_time: null,
          reminder_time: null,
          calendar_sync_status: "none",
          estimated_minutes: habit.estimated_minutes,
          result_note: "",
          checklist: copyPreviousHabitChecklist(state.tasks, habit, date),
          created_at: now(),
          completed_at: null,
          postponed_count: 0,
          is_focus: false,
          focus_order: null,
          source: "habit",
        };
        state.tasks.unshift(task);
      }
    }
  });
}

export async function ensureTodayGoalTasks() {
  return updateState((state) => {
    return state;
  });
}

export async function ensureScheduledInboxTasks() {
  return updateState((state) => {
    for (const item of state.inbox_items) {
      if (item.status !== "已安排" || !inboxItemCreatesTask(item.clarified_type)) continue;
      const date = item.scheduled_date || todayKey();
      const title = (item.next_action || item.content).trim();
      if (!title) continue;
      const exists = state.tasks.some((task) => (
        task.date === date
        && task.title.trim() === title
        && (task.description === item.content || task.source === "inbox")
      ));
      if (exists) continue;
      const isSchedule = item.clarified_type === "日程";
      const isTodayAction = item.clarified_type === "今日动作";
      const task: Task = {
        id: createId("task"),
        title,
        description: item.content,
        date,
        dimension_primary: item.dimension_primary || "心智",
        dimension_secondary: null,
        type: isTodayAction ? "项目任务" : "临时任务",
        priority: isSchedule || isTodayAction ? "A" : "B",
        priority_source: "system",
        status: "未开始",
        goal_id: item.clarified_type === "临时事项" ? null : item.goal_id || null,
        project_id: null,
        habit_id: null,
        is_habit: false,
        is_must_today: date === todayKey() || isSchedule,
        due_date: null,
        due_time: item.scheduled_time || null,
        reminder_time: null,
        calendar_sync_status: isSchedule ? "pending" : "none",
        estimated_minutes: 0,
        result_note: "",
        checklist: [],
        created_at: now(),
        completed_at: null,
        postponed_count: 0,
        is_focus: false,
        focus_order: null,
        source: "inbox",
      };
      state.tasks.unshift(task);
    }
  });
}

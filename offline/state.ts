import { applyWorkspaceCommand, makeAction } from '@/lib/workspace';
import { buildStats } from '@/lib/recommend';
import { createId } from '@/lib/id';
import { todayKey, weekStartKey } from '@/lib/date';
import { validateBackup } from '@/lib/validation';
import type { AppState, Dimension, Habit, Task, TaskChecklistItem } from '@/lib/types';

const databaseName = 'life-six-mobile-v1';
const priorityOrder: Dimension[] = ['财富', '心智', '身体', '感受', '精神', '关系'];

export function emptyMobileState(): AppState {
  return {
    schema_version: 2, revision: 0, workspace_version: 1,
    tasks: [], goals: [], projects: [], habits: [], inbox_items: [], daily_reviews: [], ai_logs: [],
    areas: [], notes: [], period_reviews: [], applied_commands: [], review_baselines: {},
    life_core: { vision: '', mission: '', values: [], principles: [] },
    dimension_visions: priorityOrder.map(dimension => ({ dimension, overview: '', vision: '', mission: '', values: [], principles: [], current_focus: '', weekly_actions: [], review_metrics: [] })),
    dimension_priority_order: [...priorityOrder],
    preferences: { schedule_view: 'today_and_overview', goal_task_priority: 'by_dimension', checklist_carry_default: 'tomorrow', inbox_clarify_bias: 'execution_first' },
  };
}

function completeState(raw: AppState): AppState {
  const defaults = emptyMobileState();
  return { ...defaults, ...raw, areas: raw.areas || [], notes: raw.notes || [], period_reviews: raw.period_reviews || [], applied_commands: raw.applied_commands || [], review_baselines: raw.review_baselines || {} };
}

let dbPromise: Promise<IDBDatabase> | null = null;
function database(): Promise<IDBDatabase> {
  dbPromise ||= new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('states');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function readKey(key: string): Promise<AppState | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('states', 'readonly');
    const request = tx.objectStore('states').get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function copyChecklist(items: TaskChecklistItem[] | undefined): TaskChecklistItem[] {
  return (items || []).map(item => ({ id: createId('check'), text: item.text, done: false, result_note: '', carry_status: 'none', carried_to_task_id: null, carried_to_date: null }));
}

function habitDue(habit: Habit, state: AppState, date: string): boolean {
  if (!habit.active) return false;
  if (habit.frequency === '每日') return true;
  const day = new Date(`${date}T12:00:00`).getDay();
  if (habit.frequency === '隔天一次') {
    const start = new Date(habit.created_at), now = new Date(`${date}T12:00:00`);
    const startNoon = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12);
    return Math.floor((now.getTime() - startNoon.getTime()) / 86400000) % 2 === 0;
  }
  if (habit.frequency === '每周自由3次') return state.tasks.filter(task => task.habit_id === habit.id && task.status === '完成' && task.date >= weekStartKey() && task.date <= date).length < 3;
  if (habit.frequency === '每周1次') return (habit.weekdays.length ? habit.weekdays : [new Date(habit.created_at).getDay()]).includes(day);
  if (habit.frequency === '指定星期') return habit.weekdays.includes(day);
  if (habit.frequency === '每周5次') return [1, 2, 3, 4, 5].includes(day);
  if (habit.frequency === '每周3次') return (habit.weekdays.length ? habit.weekdays : [1, 3, 5]).includes(day);
  return false;
}

function prepareToday(state: AppState): void {
  const date = todayKey();
  state.review_baselines ||= {};
  if (!state.review_baselines[date]) state.review_baselines[date] = {
    captured_at: new Date().toISOString(),
    tasks: state.tasks.filter(task => !task.is_habit && task.source !== 'calendar' && !task.due_time && task.date === date)
      .map(task => ({ id: task.id, title: task.title, dimension_primary: task.dimension_primary, project_id: task.project_id, estimated_minutes: task.estimated_minutes })),
  };
  for (const task of state.tasks) if (task.is_habit && task.date < date && ['未开始', '进行中', '等待反馈'].includes(task.status)) task.status = '未记录';
  for (const habit of state.habits) {
    const existing = state.tasks.find(task => task.habit_id === habit.id && task.date === date);
    if (!existing && habitDue(habit, state, date)) {
      const previous = state.tasks.filter(task => task.habit_id === habit.id && task.date < date && task.checklist?.length).sort((a, b) => b.date.localeCompare(a.date))[0];
      const task: Task = makeAction(state, { kind: '行动', title: habit.title, dimension_primary: habit.dimension_primary, area_id: habit.area_id || '', goal_id: habit.goal_id || '', date });
      Object.assign(task, { type: '习惯', source: 'habit', origin: 'planned', habit_id: habit.id, is_habit: true, priority: habit.priority, estimated_minutes: habit.estimated_minutes, checklist: copyChecklist(previous?.checklist?.length ? previous.checklist : habit.checklist_template) });
      state.tasks.unshift(task);
    }
  }
}

async function mutate(fn: (state: AppState, store: IDBObjectStore) => void): Promise<AppState> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('states', 'readwrite');
    const store = tx.objectStore('states');
    const request = store.get('main');
    let result: AppState;
    let operationError: Error | null = null;
    request.onsuccess = () => {
      try {
        const state = completeState((request.result as AppState) || emptyMobileState());
        const before = JSON.stringify(state);
        fn(state, store);
        if (JSON.stringify(state) !== before) {
          state.revision = (state.revision || 0) + 1;
          validateBackup(state);
          store.put(state, 'main');
        }
        result = state;
      } catch (error) {
        operationError = error instanceof Error ? error : new Error('本机保存失败');
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(operationError || tx.error || new Error('本机保存失败'));
    tx.onerror = () => reject(operationError || tx.error || new Error('本机保存失败'));
  });
}

export async function mobileState() {
  const state = await mutate(prepareToday);
  return { ...state, stats: buildStats(state), offline_mode: true };
}

export async function mobileCommand(body: Record<string, unknown>) {
  return mutate(state => applyWorkspaceCommand(state, body));
}

export async function mobileProfile(body: Record<string, unknown>) {
  return mutate(state => {
    if (body.life_core) state.life_core = { ...state.life_core, ...body.life_core as AppState['life_core'] };
    if (Array.isArray(body.dimension_visions)) state.dimension_visions = body.dimension_visions as AppState['dimension_visions'];
    if (Array.isArray(body.dimension_priority_order) && body.dimension_priority_order.length === 6 && new Set(body.dimension_priority_order).size === 6) state.dimension_priority_order = body.dimension_priority_order as Dimension[];
    if (body.preferences && typeof body.preferences === 'object') state.preferences = { ...state.preferences, ...body.preferences as AppState['preferences'] };
  });
}

export async function mobileRestore(raw: unknown) {
  validateBackup(raw);
  const incoming = completeState(raw as AppState);
  const current = await readKey('main');
  if (current && current.tasks.length + current.goals.length + current.projects.length + current.habits.length + current.inbox_items.length > 0 && incoming.tasks.length + incoming.goals.length + incoming.projects.length + incoming.habits.length + incoming.inbox_items.length === 0) throw new Error('空备份不能覆盖现有记录');
  const state = await mutate((state, store) => {
    store.put(state, 'before-restore');
    Object.assign(state, incoming, { revision: Math.max(state.revision || 0, incoming.revision || 0) });
  });
  return { ok: true, total: state.tasks.length + state.goals.length + state.projects.length + state.habits.length + state.inbox_items.length + state.daily_reviews.length, revision: state.revision };
}

export async function previousMobileState() { return readKey('before-restore'); }

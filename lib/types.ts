export type Dimension = "财富" | "心智" | "身体" | "感受" | "关系" | "精神";
export type TaskType = "项目任务" | "习惯" | "临时任务" | "记录" | "灵感" | "内容任务" | "滋养任务";
export type Priority = "A" | "B" | "C";
export type TaskStatus = "未开始" | "进行中" | "等待反馈" | "完成" | "延期" | "取消" | "跳过" | "未记录";
export type GoalStatus = "未开始" | "进行中" | "暂停" | "完成" | "放弃";
export type ProjectStatus = "待开始" | "进行中" | "等待中" | "已完成" | "暂停";
export type CalendarSyncStatus = "none" | "pending" | "synced" | "failed";
export type ClarifiedType = "今日动作" | "临时事项" | "日程" | "成果项目" | "短期目标" | "长期目标" | "习惯" | "资料记录" | "将来某天" | "删除";
export type RelationType = "目标推进" | "生活维护" | "机会灵感";
export type TaskSource = "planned" | "added" | "habit" | "inbox" | "calendar" | "goal_week" | "manual";

export interface TaskProgress {
  id: string;
  content: string;
  created_at: string;
  status: "进行中" | "等待反馈" | "完成";
  next_action: string;
  waiting_on: string;
  follow_up_date: string | null;
}

export interface TaskRollover {
  from_date: string;
  to_date: string;
  created_at: string;
  status: TaskStatus;
}

export interface Task {
  area_id?: string | null;
  activity_events?: Array<{ request_id: string; changed_at: string; op: string }>;
  waiting_date_history?: Array<{ from_date: string | null; to_date: string; changed_at: string }>;
  title_history?: Array<{ title: string; changed_at: string; status: TaskStatus }>;
  plan_history?: Array<{ date: string; title: string; status: TaskStatus; changed_at: string }>;
  plan_events?: Array<{ from_date: string; to_date: string; changed_at: string }>;
  id: string;
  title: string;
  description: string;
  date: string;
  dimension_primary: Dimension;
  dimension_secondary: Dimension | null;
  type: TaskType;
  priority: Priority;
  priority_source?: "user" | "system";
  status: TaskStatus;
  goal_id: string | null;
  project_id: string | null;
  habit_id: string | null;
  is_habit: boolean;
  is_must_today: boolean;
  due_date: string | null;
  due_time: string | null;
  scheduled_end_time?: string | null;
  reminder_time: string | null;
  calendar_sync_status: CalendarSyncStatus;
  estimated_minutes: number;
  result_note: string;
  checklist: TaskChecklistItem[];
  created_at: string;
  completed_at: string | null;
  postponed_count: number;
  postponed_at?: string | null;
  postponed_from_date?: string | null;
  is_focus: boolean;
  focus_order: number | null;
  source?: TaskSource;
  week_id?: string | null;
  week_task_id?: string | null;
  stage_id?: string | null;
  sort_order?: number;
  first_do_date?: string | null;
  origin?: "planned" | "ad_hoc";
  progress_logs?: TaskProgress[];
  next_action?: string;
  continued_from_task_id?: string | null;
  continued_to_task_id?: string | null;
  waiting_on?: string;
  follow_up_date?: string | null;
  next_follow_up_action?: string;
  next_follow_up_date?: string | null;
  rollovers?: TaskRollover[];
}

export interface TaskChecklistItem {
  id: string;
  text: string;
  done: boolean;
  result_note?: string;
  carry_status?: "none" | "carried" | "waiting";
  carried_to_task_id?: string | null;
  carried_to_date?: string | null;
}

export interface DraftTask extends Omit<Task, "id" | "status" | "created_at" | "completed_at" | "result_note" | "checklist" | "postponed_count" | "is_focus" | "focus_order"> {
  confidence?: number;
  priority_source?: "user" | "system";
  checklist?: TaskChecklistItem[];
}

export interface Goal {
  area_id?: string | null;
  evidence?: string;
  id: string;
  title: string;
  dimension_primary: Dimension;
  success_metric: string;
  time_horizon?: "年度" | "季度" | "90天" | "月度";
  deadline: string | null;
  status: GoalStatus;
  why: string;
  ai_breakdown: string;
  created_at: string;
  updated_at?: string | null;
  next_action?: string;
  next_action_task_id?: string | null;
  cycle_focus?: "本周期重点" | "维持" | "以后再说";
  outcome?: { label: string; baseline: number; current: number; target: number; unit: string; evidence: string; next_action: string; updated_at?: string };
}

export interface GoalBreakdown {
  original_goal: string;
  refined_goal: string;
  target_period: string;
  dimension: {
    primary: Dimension;
    secondary: Dimension[];
    reason: string;
  };
  goal_type: "结果型目标" | "习惯型目标" | "探索型目标" | "项目型目标" | "修复型目标";
  goal_quality: {
    clarity_score: number;
    is_actionable: boolean;
    missing_info: string[];
    suggested_refined_goal: string;
  };
  why: string;
  success_metric: {
    period: string;
    description: string;
    metrics: string[];
  };
  stage_results: Array<{
    id?: string;
    description: string;
    status?: "未开始" | "进行中" | "完成";
    workday_actions?: string[];
  }>;
  current_stage_id?: string | null;
  current_week_tasks?: Array<{
    id?: string;
    day?: string;
    title: string;
    status?: TaskStatus;
    result?: string;
    stage_id?: string | null;
    checklist?: TaskChecklistItem[];
  }>;
  rhythm_plan: RhythmPlan;
  today_first_step: string;
  risks: Array<{
    risk: string;
    countermeasure: string;
  }>;
  review_questions: string[];
}

export interface RhythmPlan {
  weekly: string[];
  monthly: string[];
  quarterly: string[];
  half_year: string[];
  yearly: string[];
}

export interface Project {
  area_id?: string | null;
  id: string;
  title: string;
  dimension_primary: Dimension;
  dimension_secondary: Dimension | null;
  goal_id: string | null;
  status: ProjectStatus;
  description: string;
  next_action: string;
  created_at: string;
}

export interface Habit {
  area_id?: string | null;
  goal_id?: string | null;
  id: string;
  title: string;
  dimension_primary: Dimension;
  frequency: "每日" | "隔天一次" | "每周1次" | "每周3次" | "每周5次" | "指定星期" | "每周自由3次";
  weekdays: number[];
  estimated_minutes: number;
  priority: Priority;
  active: boolean;
  checklist_template?: TaskChecklistItem[];
  created_at: string;
}

export interface DailyReview {
  reflection_dimension?: Dimension;
  experiment?: string;
  task_snapshot?: Array<{ id: string; title: string; status: TaskStatus }>;
  adjustment_task_id?: string;
  id: string;
  date: string;
  wins: string;
  blockers: string;
  tomorrow_adjustment: string;
  principle_alignment?: string;
  needed_resources?: string;
  important_completed_task_id?: string | null;
  important_completed_text?: string;
  important_unfinished_task_id?: string | null;
  important_unfinished_text?: string;
  unfinished_reason_tags?: string[];
  feedback_suggestions?: string[];
  tomorrow_first_task_id?: string | null;
  tomorrow_first_text?: string;
  energy: "高" | "中" | "低";
  pressure: "高" | "中" | "低";
  available_time: "充足" | "一般" | "很少";
  created_at: string;
  updated_at?: string;
  adjustment?: string;
  tomorrow_first_source?: "existing" | "new";
}

export interface AiLog {
  id: string;
  input: string;
  output: DraftTask[];
  mode: "gemini" | "zhipu" | "rules";
  created_at: string;
}

export interface InboxItem {
  area_id?: string | null;
  outputs?: Array<{ kind: string; id: string }>;
  id: string;
  content: string;
  status: "未处理" | "已安排" | "已归档";
  clarified_type?: ClarifiedType | null;
  dimension_primary?: Dimension | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  next_action?: string | null;
  goal_id?: string | null;
  project_id?: string | null;
  relation_type?: RelationType | null;
  created_at: string;
  archived_at: string | null;
}

export interface InboxClarification {
  original: string;
  dimension_primary: Dimension;
  clarified_type: ClarifiedType;
  relation_type: RelationType;
  goal_id: string | null;
  project_id: string | null;
  suggested_title: string;
  reason: string;
  next_action: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
}

export interface LifeCore {
  vision: string;
  mission: string;
  values: string[];
  principles: string[];
}

export interface DimensionVision {
  dimension: Dimension;
  overview?: string;
  vision: string;
  mission?: string;
  values?: string[];
  principles: string[];
  current_focus?: string;
  weekly_actions?: string[];
  review_metrics?: string[];
}

export interface SystemPreferences {
  schedule_view: "today_and_overview" | "overview_only";
  goal_task_priority: "by_dimension" | "always_a" | "always_b";
  checklist_carry_default: "tomorrow" | "next_week";
  inbox_clarify_bias: "execution_first" | "goal_first" | "schedule_first";
}

export interface AppState {
  revision?: number;
  workspace_version?: number;
  areas?: Area[];
  notes?: Note[];
  period_reviews?: PeriodReview[];
  applied_commands?: string[];
  schema_version?: number;
  daily_plans?: Record<string, { available_minutes: number; buffer_minutes: number; focus_limit: number; confirmed?: boolean }>;
  review_baselines?: Record<string, { captured_at: string; tasks: Array<{ id: string; title: string; dimension_primary: Dimension; project_id: string | null; estimated_minutes: number }> }>;
  weekly_plans?: Record<string, { stop: string; continue: string; commit: string }>;
  week_candidates?: Array<{ id: string; week: string; goal_id: string; title: string; reason: string; estimated_minutes: number; stage_id: string | null; task_id?: string; checklist?: TaskChecklistItem[] }>;
  tasks: Task[];
  goals: Goal[];
  projects: Project[];
  habits: Habit[];
  inbox_items: InboxItem[];
  daily_reviews: DailyReview[];
  ai_logs: AiLog[];
  life_core: LifeCore;
  dimension_visions: DimensionVision[];
  dimension_priority_order: Dimension[];
  preferences: SystemPreferences;
}

export interface Area { id: string; title: string; dimension_primary: Dimension; active: boolean; created_at: string }
export interface Note { id: string; content: string; dimension_primary: Dimension; area_id: string | null; project_id: string | null; goal_id: string | null; created_at: string; archived?: boolean }
export interface PeriodReview { id: string; kind: "week" | "month"; period: string; dimension_primary?: Dimension; content: string; created_at: string; updated_at: string }

import { generateGemini, aiFailureMessage } from "@/lib/ai-config";
import { dimensionKeys, isDimension } from "./dimensions";
import { todayKey } from "./date";
import type { Dimension, DraftTask, Priority, TaskChecklistItem, TaskType } from "./types";

const defaultDimensionPriorityOrder: Dimension[] = ["财富", "心智", "身体", "感受", "精神", "关系"];

const dimensionRules: Array<{ dimension: Dimension; words: string[] }> = [
  { dimension: "财富", words: ["客户", "报价", "收款", "订单", "业务", "轮胎", "护栏", "标志牌", "现金流", "产品", "开发", "供应商", "小工具", "变现"] },
  { dimension: "心智", words: ["学习", "阅读", "英语", "法语", "ai", "AI", "编程", "研究", "资料", "课程", "Openclaw", "Hermes"] },
  { dimension: "身体", words: ["运动", "健身", "快走", "拉伸", "睡", "饮食", "康复", "跑步", "身体"] },
  { dimension: "感受", words: ["吉他", "唱歌", "音乐", "美食", "旅行", "摄影", "电影", "开心", "体验"] },
  { dimension: "关系", words: ["家人", "朋友", "问候", "联系", "陪", "合作", "客户关系", "供应商关系", "跟进"] },
  { dimension: "精神", words: ["白哥", "公众号", "写", "日记", "复盘", "人生", "价值观", "感悟", "选题", "内容", "使命", "原则", "宗旨"] },
];

const projectRules = [
  { id: "project_tire", words: ["轮胎", "报价", "小单"] },
  { id: "project_openclaw", words: ["Openclaw", "openclaw", "客户名单", "自动化"] },
  { id: "project_content", words: ["白哥", "公众号", "选题", "文章", "内容"] },
  { id: "project_health", words: ["运动", "健身", "快走", "拉伸"] },
];

function splitInput(input: string) {
  return input
    .split(/\n|[；;。.!！?？]|，(?=.{3,})|,(?=.{3,})/)
    .map((item) => item.trim())
    .map((item) => item.replace(/^[-*•]\s*/, "").replace(/^\d+[\.、)]\s*/, ""))
    .filter(Boolean);
}

function shouldSplitIntoIndependentTasks(input: string) {
  const lines = input.split(/\n/).map((item) => item.trim()).filter(Boolean);
  if (lines.length >= 2 && lines.every((line) => /^(\d+[\.、)]|[-*•])\s*/.test(line))) return true;
  if (/分别|以下几件|这几件|多个任务|拆成任务/.test(input)) return true;
  return false;
}

function draftChecklistItem(text: string, index: number): TaskChecklistItem {
  return {
    id: `draft_check_${Date.now().toString(36)}_${index}`,
    text,
    done: false,
    result_note: "",
    carry_status: "none",
    carried_to_task_id: null,
    carried_to_date: null,
  };
}

function buildSingleTaskDraft(input: string, dimensionPriorityOrder: Dimension[] = defaultDimensionPriorityOrder): DraftTask {
  const parts = splitInput(input);
  const title = parts[0] || input.trim();
  const dimensions = chooseDimension(input);
  const type = chooseType(input, dimensions.primary);
  const priority = choosePriority(input, dimensions.primary, dimensionPriorityOrder);
  const mustToday = priority === "A" || /今天|今晚|早上|上午|下午|晚上/.test(input);
  const date = todayKey();

  return {
    title,
    description: parts.length > 1 ? input : "",
    date,
    dimension_primary: dimensions.primary,
    dimension_secondary: dimensions.secondary,
    type,
    priority,
    priority_source: "system",
    goal_id: null,
    project_id: projectFor(input),
    habit_id: null,
    is_habit: type === "习惯",
    is_must_today: mustToday,
    due_date: /今天.{0,6}(截止|最晚|到期)|(截止|最晚|到期).{0,6}今天/.test(input) ? todayKey() : null,
    due_time: null,
    reminder_time: null,
    calendar_sync_status: "none",
    estimated_minutes: estimateMinutes(input, type),
    checklist: parts.slice(1).map(draftChecklistItem),
    confidence: 0.74,
  };
}

function chooseDimension(text: string): { primary: Dimension; secondary: Dimension | null } {
  const hits = dimensionRules
    .map((rule) => ({ dimension: rule.dimension, count: rule.words.filter((word) => text.includes(word)).length }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    primary: hits[0]?.dimension || "心智",
    secondary: hits[1]?.dimension || null,
  };
}

function chooseType(text: string, dimension: Dimension): TaskType {
  if (/打卡|每日|每天|早睡|运动|阅读|语言/.test(text)) return "习惯";
  if (/想法|灵感|以后|也许|可以/.test(text)) return "灵感";
  if (/复盘|记录|日记|总结/.test(text)) return "记录";
  if (/白哥|公众号|选题|文章|视频|内容/.test(text)) return "内容任务";
  if (dimension === "感受") return "滋养任务";
  if (/项目|开发|验证|整理|跟进|报价|研究/.test(text)) return "项目任务";
  return "临时任务";
}

function choosePriority(text: string, dimension: Dimension, dimensionOrder: Dimension[] = defaultDimensionPriorityOrder): Priority {
  if (/今天|必须|截止|报价|收款|客户|订单|健康|运动|承诺|到期|复诊/.test(text)) return "A";
  if (/学习|阅读|写作|研究|复盘|开发|整理/.test(text)) return "B";
  const rank = dimensionOrder.findIndex((item) => item === dimension);
  if (rank >= 0 && rank <= 1) return "B";
  return "C";
}

function estimateMinutes(text: string, type: TaskType) {
  const explicit = text.match(/(\d+)\s*(分钟|min|小时|h)/i);
  if (explicit) {
    const value = Number(explicit[1]);
    return /小时|h/i.test(explicit[2]) ? value * 60 : value;
  }
  if (type === "习惯") return 20;
  return 0;
}

function projectFor(text: string) {
  return projectRules.find((project) => project.words.some((word) => text.includes(word)))?.id || null;
}

export function organizeWithRules(input: string, dimensionPriorityOrder: Dimension[] = defaultDimensionPriorityOrder): DraftTask[] {
  if (!shouldSplitIntoIndependentTasks(input)) return [buildSingleTaskDraft(input, dimensionPriorityOrder)];

  return splitInput(input).map((title) => {
    const dimensions = chooseDimension(title);
    const type = chooseType(title, dimensions.primary);
    const priority = choosePriority(title, dimensions.primary, dimensionPriorityOrder);
    const mustToday = priority === "A" || /今天|今晚|早上|上午|下午|晚上/.test(title);
    const date = todayKey();

    return {
      title,
      description: "",
      date,
      dimension_primary: dimensions.primary,
      dimension_secondary: dimensions.secondary,
      type,
      priority,
      priority_source: "system",
      goal_id: null,
      project_id: projectFor(title),
      habit_id: null,
      is_habit: type === "习惯",
      is_must_today: mustToday,
      due_date: /今天.{0,6}(截止|最晚|到期)|(截止|最晚|到期).{0,6}今天/.test(title) ? todayKey() : null,
      due_time: null,
      reminder_time: null,
      calendar_sync_status: "none",
      estimated_minutes: estimateMinutes(title, type),
      checklist: [],
      confidence: 0.72,
    };
  });
}

function normalizeDraft(item: Partial<DraftTask>): DraftTask | null {
  if (!item.title || !isDimension(item.dimension_primary)) return null;
  const secondary = isDimension(item.dimension_secondary) ? item.dimension_secondary : null;
  const priority = ["A", "B", "C"].includes(String(item.priority)) ? item.priority as Priority : "B";
  const priority_source = item.priority_source === "user" ? "user" : "system";
  const type = typeof item.type === "string" ? item.type as TaskType : "临时任务";

  return {
    title: String(item.title),
    description: item.description || "",
    date: item.date || todayKey(),
    dimension_primary: item.dimension_primary,
    dimension_secondary: secondary,
    type,
    priority,
    priority_source,
    goal_id: item.goal_id || null,
    project_id: item.project_id || null,
    habit_id: item.habit_id || null,
    is_habit: Boolean(item.is_habit),
    is_must_today: Boolean(item.is_must_today),
    due_date: item.due_date || null,
    due_time: item.due_time || null,
    reminder_time: item.reminder_time || null,
    calendar_sync_status: item.calendar_sync_status || "none",
    estimated_minutes: Number(item.estimated_minutes || 0),
    checklist: Array.isArray(item.checklist) ? item.checklist : [],
    confidence: Number(item.confidence || 0.86),
  };
}

function parseJsonArray(content: string) {
  const cleaned = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned) as Partial<DraftTask>[];
}

export async function organizeInput(input: string, tokenOverride?: string, dimensionPriorityOrder: Dimension[] = defaultDimensionPriorityOrder): Promise<{ tasks: DraftTask[]; mode: "gemini" | "rules"; error?: string }> {
  const token = (tokenOverride || process.env.GEMINI_API_KEY || "").trim();
  if (!token) return { tasks: organizeWithRules(input, dimensionPriorityOrder), mode: "rules" };
  const splitIndependent = shouldSplitIntoIndependentTasks(input);

  try {
    const result = await generateGemini(token, {
      maxOutputTokens: 10000,
      temperature: 0.2,
      json: true,
        messages: [
          {
            role: "system",
            content: `你是我的人生六维 AI 执行系统助手。将用户输入整理为 JSON 数组。维度只能是：${dimensionKeys.join("、")}。优先级 A/B/C，不要把所有任务都判为 A。
默认规则：用户通常是在写一个主任务。不要轻易拆成多个任务；应输出 1 个主任务，并把步骤、对象、检查点、后续动作放入 checklist。
只有在用户明确表达多件互不依赖的独立事项时，才输出多条任务，例如编号清单、项目符号清单、或明确说“以下几件/多个任务/分别处理”。
如果一句话里有“和/与/及/以及/然后/再/并且”，通常仍然是同一个主任务的 checklist，不要拆成多个任务。
字段：title, description, date, dimension_primary, dimension_secondary, type, priority, is_habit, is_must_today, due_date, due_time, reminder_time, estimated_minutes, checklist。
date 是计划执行日期；due_date 只有用户明确给出“截止/最晚/到期”时填写，不能因为计划今天做就填为今天。固定日程时间放在 due_time。信息不足保留未知，不虚构截止日期或估时。
checklist 是数组，每项格式为 {"id":"draft_check_1","text":"步骤文本","done":false,"result_note":"","carry_status":"none","carried_to_task_id":null,"carried_to_date":null}。没有步骤时 checklist 为空数组。
estimated_minutes 只有用户明确写了时长或任务是习惯时才填写；普通任务没有明确时长时填 0。只输出 JSON。当前维度优先级顺序为：${dimensionPriorityOrder.join(" > ")}。如果用户没有选择优先级，请根据这个维度顺序判断优先级。`,
          },
          { role: "user", content: input },
        ],
    }, AbortSignal.timeout(60000));
    const content = result.content;
    const parsed = parseJsonArray(content);
    const tasks = parsed.map(normalizeDraft).filter(Boolean) as DraftTask[];
    if (!splitIndependent && tasks.length > 1) {
      const fallback = buildSingleTaskDraft(input, dimensionPriorityOrder);
      const checklist = tasks.map((task, index) => draftChecklistItem(task.title, index));
      return {
        tasks: [{
          ...fallback,
          dimension_primary: tasks[0].dimension_primary,
          dimension_secondary: tasks[0].dimension_secondary,
          priority: tasks[0].priority,
          priority_source: tasks[0].priority_source,
          type: tasks[0].type,
          estimated_minutes: Math.max(...tasks.map((task) => task.estimated_minutes || fallback.estimated_minutes)),
          checklist,
          confidence: tasks[0].confidence,
        }],
        mode: "gemini",
      };
    }
    return { tasks: tasks.length ? tasks : organizeWithRules(input, dimensionPriorityOrder), mode: tasks.length ? "gemini" : "rules" };
  } catch (error) {
    return { tasks: organizeWithRules(input, dimensionPriorityOrder), mode: "rules", error: aiFailureMessage(error) };
  }
}

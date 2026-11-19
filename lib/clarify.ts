import { generateGemini, aiFailureMessage } from "@/lib/ai-config";
import { todayKey } from "./date";
import { dimensionKeys } from "./dimensions";
import type { AppState, ClarifiedType, Dimension, InboxClarification, Project, RelationType } from "./types";

const clarifiedTypes: ClarifiedType[] = ["今日动作", "临时事项", "日程", "长期目标", "习惯", "将来某天", "删除"];
const dimensions = dimensionKeys;
const relationTypes: RelationType[] = ["目标推进", "生活维护", "机会灵感"];

function inferDimension(text: string): Dimension {
  if (/客户|报价|收款|订单|现金流|轮胎|业务|产品|供应商|变现/.test(text)) return "财富";
  if (/学习|阅读|英语|法语|AI|编程|研究|资料/.test(text)) return "心智";
  if (/运动|健身|睡|饮食|体检|康复|身体/.test(text)) return "身体";
  if (/吉他|唱歌|音乐|旅行|摄影|美食|体验/.test(text)) return "感受";
  if (/家人|朋友|客户|供应商|合作|关系|见|约/.test(text)) return "关系";
  return "精神";
}

function dateOffset(days: number) {
  return todayKey(new Date(Date.now() + days * 86400000));
}

function inferDate(text: string) {
  if (/今天|今晚|上午|下午|晚上/.test(text)) return todayKey();
  if (/明天|明日/.test(text)) return dateOffset(1);
  if (/后天/.test(text)) return dateOffset(2);
  return null;
}

function inferTime(text: string) {
  const match = text.match(/(\d{1,2})[:：点](\d{1,2})?/);
  if (!match) return null;
  const hour = match[1].padStart(2, "0");
  const minute = (match[2] || "00").padStart(2, "0");
  return `${hour}:${minute}`;
}

function inferType(text: string): ClarifiedType {
  if (/删除|不用|算了/.test(text)) return "删除";
  if (/以后|将来|也许|有空| someday/i.test(text)) return "将来某天";
  if (/每天|每周|打卡|坚持|习惯|早睡/.test(text)) return "习惯";
  if (/年内|一年|长期|半年|90天|季度|本月|这个月|目标|拿到|达成|验证/.test(text)) return "长期目标";
  if (inferDate(text) || inferTime(text) || /周一|周二|周三|周四|周五|周六|周日|星期/.test(text)) return "日程";
  return text.length <= 24 ? "今日动作" : "临时事项";
}

function scoreText(text: string, target: string) {
  const source = text.toLowerCase();
  return target
    .toLowerCase()
    .split(/[\s,，。；;、：:「」《》()（）-]+/)
    .filter((word) => word.length >= 2)
    .reduce((score, word) => score + (source.includes(word) ? 1 : 0), 0);
}

function matchGoal(content: string, state?: Pick<AppState, "goals">) {
  return state?.goals
    .map((goal) => ({ goal, score: scoreText(content, `${goal.title} ${goal.success_metric} ${goal.why}`) + (goal.dimension_primary === inferDimension(content) ? 0.5 : 0) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.goal || null;
}

function matchProject(content: string, state?: Pick<AppState, "projects">, goalId?: string | null): Project | null {
  return state?.projects
    .filter((project) => !goalId || project.goal_id === goalId)
    .map((project) => ({ project, score: scoreText(content, `${project.title} ${project.description} ${project.next_action}`) + (project.dimension_primary === inferDimension(content) ? 0.5 : 0) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.project || null;
}

function inferRelation(type: ClarifiedType, goalId: string | null, projectId: string | null): RelationType {
  if (goalId || projectId || type === "成果项目" || type === "短期目标" || type === "长期目标") return "目标推进";
  if (type === "资料记录" || type === "将来某天") return "机会灵感";
  return "生活维护";
}

function normalizeClarifiedType(value: unknown, fallback: ClarifiedType): ClarifiedType {
  if (value === "成果项目" || value === "短期目标") return "长期目标";
  if (value === "资料记录") return "将来某天";
  if (clarifiedTypes.includes(value as ClarifiedType)) return value as ClarifiedType;
  if (fallback === "成果项目" || fallback === "短期目标") return "长期目标";
  if (fallback === "资料记录") return "将来某天";
  return clarifiedTypes.includes(fallback) ? fallback : "临时事项";
}

export function clarifyInboxItem(content: string, state?: Pick<AppState, "goals" | "projects" | "life_core" | "dimension_visions">): InboxClarification {
  const clarified_type = inferType(content);
  const dimension_primary = inferDimension(content);
  const scheduled_date = clarified_type === "日程" || /今天|明天|后天/.test(content) ? inferDate(content) : null;
  const scheduled_time = inferTime(content);
  const goal = matchGoal(content, state);
  const project = matchProject(content, state, goal?.id);
  const relation_type = inferRelation(clarified_type, goal?.id || null, project?.id || null);
  const next_action = clarified_type === "成果项目" ? `写下「${content}」的下一步` : content;

  return {
    original: content,
    dimension_primary,
    clarified_type,
    relation_type,
    goal_id: goal?.id || null,
    project_id: project?.id || null,
    suggested_title: content,
    reason: goal
      ? `这条内容可能服务于目标「${goal.title}」，可在分流前调整。`
      : "根据内容关键词、时间信息和现有目标做出的初步判断，可在分流前调整。",
    next_action,
    scheduled_date,
    scheduled_time,
  };
}

function parseJson(content: string) {
  const cleaned = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned) as Partial<InboxClarification>;
}

function buildContext(state: Pick<AppState, "goals" | "projects" | "life_core" | "dimension_visions">) {
  return {
    life_core: state.life_core,
    dimension_visions: state.dimension_visions.map((item) => ({
      dimension: item.dimension,
      overview: item.overview,
      vision: item.vision,
      mission: item.mission,
      values: item.values,
      principles: item.principles,
      current_focus: item.current_focus,
      weekly_actions: item.weekly_actions,
      review_metrics: item.review_metrics,
    })),
    goals: state.goals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      dimension_primary: goal.dimension_primary,
      success_metric: goal.success_metric,
      why: goal.why,
      status: goal.status,
    })),
    projects: state.projects.map((project) => ({
      id: project.id,
      title: project.title,
      dimension_primary: project.dimension_primary,
      goal_id: project.goal_id,
      status: project.status,
      description: project.description,
      next_action: project.next_action,
    })),
  };
}

function normalizeAiClarification(content: string, value: Partial<InboxClarification>, fallback: InboxClarification, state: Pick<AppState, "goals" | "projects">): InboxClarification {
  const clarified_type = normalizeClarifiedType(value.clarified_type, fallback.clarified_type);
  const dimension_primary = dimensions.includes(value.dimension_primary as Dimension) ? value.dimension_primary as Dimension : fallback.dimension_primary;
  const relation_type = relationTypes.includes(value.relation_type as RelationType) ? value.relation_type as RelationType : fallback.relation_type;
  const goal_id = value.goal_id && state.goals.some((goal) => goal.id === value.goal_id) ? value.goal_id : null;
  const project_id = value.project_id && state.projects.some((project) => project.id === value.project_id && (!goal_id || project.goal_id === goal_id)) ? value.project_id : null;

  return {
    original: content,
    dimension_primary,
    clarified_type,
    relation_type,
    goal_id,
    project_id,
    suggested_title: value.suggested_title?.trim() || fallback.suggested_title,
    reason: value.reason?.trim() || fallback.reason,
    next_action: value.next_action?.trim() || fallback.next_action,
    scheduled_date: value.scheduled_date || fallback.scheduled_date,
    scheduled_time: value.scheduled_time || fallback.scheduled_time,
  };
}

export async function clarifyInboxItemSmart(content: string, state: Pick<AppState, "goals" | "projects" | "life_core" | "dimension_visions">, tokenOverride?: string): Promise<{ clarification: InboxClarification; mode: "gemini" | "rules"; error?: string }> {
  const fallback = clarifyInboxItem(content, state);
  const token = (tokenOverride || process.env.GEMINI_API_KEY || "").trim();
  if (!token) return { clarification: fallback, mode: "rules" };

  try {
    const result = await generateGemini(token, {
      maxOutputTokens: 1800,
      temperature: 0.2,
      json: true,
        messages: [
          {
            role: "system",
            content: `你是人生六维 AI 执行系统的收集箱澄清助手。你要根据用户的人生总纲、六维蓝图、行动原则和已有目标，判断一条收集箱内容应该如何分流。只输出 JSON，不要解释。

术语含义：
- clarified_type 是“分流去向”：只能判断这条内容要进入今日任务、临时事项、日程事项、目标事项、打卡事项、将来/也许，还是删除。

字段必须是：
original, dimension_primary, clarified_type, relation_type, goal_id, project_id, suggested_title, reason, next_action, scheduled_date, scheduled_time。

约束：
- dimension_primary 只能是：财富、心智、身体、感受、关系、精神。
- clarified_type 只能是：今日动作、临时事项、日程、长期目标、习惯、将来某天、删除。
- relation_type 只能是：目标推进、生活维护、机会灵感。
- goal_id 必须来自上下文 goals.id；没有合适目标则为 null。
- project_id 必须为 null。
- 不要为了整齐强行关联目标。生活维护事项可以无目标。
- 优先读取对应维度的愿景/使命、价值观/信念、原则/准则、年度重点、每周行动、复盘指标。
- 如果内容明显服务某个目标、年度重点或每周行动，请给出目标关联并在 reason 中说明。
- 如果内容可能违背人生总纲或六维蓝图里的原则/准则，请在 reason 中温和提醒。
- scheduled_date 使用 YYYY-MM-DD 或 null；scheduled_time 使用 HH:mm 或 null。`,
          },
          {
            role: "user",
            content: JSON.stringify({
              inbox_content: content,
              today: todayKey(),
              context: buildContext(state),
              fallback,
            }),
          },
        ],
    }, AbortSignal.timeout(60000));
    const raw = result.content;
    return { clarification: normalizeAiClarification(content, parseJson(raw), fallback, state), mode: "gemini" };
  } catch (error) {
    return { clarification: fallback, mode: "rules", error: aiFailureMessage(error) };
  }
}

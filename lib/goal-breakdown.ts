import { inferGoalDimension } from "./simple-goals";
import { generateGemini, aiFailureMessage } from "./ai-config";
import { isDimension } from "./dimensions";
import { todayKey, validDate } from "./date";
import type { AppState, Dimension } from "./types";

export interface GoalSuggestion { title: string; success_metric: string; dimension_primary: Dimension; next_action: string; deadline: string | null }

export async function suggestGoal(input: string, tokenOverride?: string, state?: Pick<AppState, "life_core" | "dimension_visions" | "goals">): Promise<{ suggestion: GoalSuggestion; mode: "gemini" | "rules"; error?: string }> {
  const fallback: GoalSuggestion = { title: input.trim(), success_metric: "", dimension_primary: inferGoalDimension(input), next_action: "", deadline: null };
  const token = (tokenOverride || process.env.GEMINI_API_KEY || "").trim();
  if (!token) return { suggestion: fallback, mode: "rules" };
  try {
    const result = await generateGemini(token, {
      maxOutputTokens: 1800, json: true,
      messages: [
        { role: "system", content: `帮助用户把想法整理为一个简单、可推进的目标。只输出 JSON 对象，字段严格为 title, success_metric, dimension_primary, next_action, deadline。
title 是简短目标名称。success_metric 用一句话说明“完成的样子”，允许可观察的成果、交付物、验证或有依据的决定，不要强行量化，不虚构数量和收入。next_action 只给现在能做的一个具体动作。
dimension_primary 大概归入精神、身体、财富、心智、感受、关系之一。
用户未明确提供真实期限时 deadline 必须为 null；有期限时用 YYYY-MM-DD。不要自动套用30天或90天。今天是 ${todayKey()}。
不要生成目标类型、阶段、阶段结果、周期计划、评分、指标矩阵或多层任务。信息不足可留空，最终由用户确认。` },
        { role: "user", content: JSON.stringify({ input, context: state ? { life_core: state.life_core, dimension_visions: state.dimension_visions, existing_goals: state.goals.map(goal => goal.title) } : null }) },
      ],
    }, AbortSignal.timeout(60000));
    const value = JSON.parse(result.content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim());
    if (!value || Array.isArray(value) || typeof value !== "object" || typeof value.title !== "string" || !value.title.trim()) throw new SyntaxError("目标建议不完整");
    const text = (field: string) => typeof value[field] === "string" ? value[field].trim() : "";
    return { suggestion: { title: text("title"), success_metric: text("success_metric"), dimension_primary: isDimension(value.dimension_primary) ? value.dimension_primary : fallback.dimension_primary, next_action: text("next_action"), deadline: /截止|最晚|到期|截至|之前|前完成|完成日期|月底|年底|\d{4}[-年/]\d{1,2}[-月/]\d{1,2}/.test(input) && validDate(value.deadline) ? value.deadline : null }, mode: "gemini" };
  } catch (error) { return { suggestion: fallback, mode: "rules", error: aiFailureMessage(error) }; }
}

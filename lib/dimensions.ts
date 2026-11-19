import type { Dimension } from "./types";

export const dimensions: Array<{
  key: Dimension;
  label: string;
  definition: string;
  accent: string;
}> = [
  { key: "精神", label: "精神", definition: "内在秩序、清醒、韧性、意义感", accent: "#4f46e5" },
  { key: "身体", label: "身体", definition: "健康、运动、睡眠、饮食、精力", accent: "#d97706" },
  { key: "财富", label: "财富", definition: "现金流、业务、客户、产品、收入", accent: "#0f8a5f" },
  { key: "心智", label: "心智", definition: "学习、认知、技能、语言、AI 能力", accent: "#2563eb" },
  { key: "感受", label: "感受", definition: "兴趣、审美、生活体验、情绪滋养", accent: "#c026d3" },
  { key: "关系", label: "关系", definition: "家人、朋友、客户、供应商、合作伙伴", accent: "#dc2626" },
];

export const dimensionKeys = dimensions.map((dimension) => dimension.key);

export function isDimension(value: unknown): value is Dimension {
  return typeof value === "string" && dimensionKeys.includes(value as Dimension);
}

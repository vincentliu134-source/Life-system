export function todayKey(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function weekStartKey(date = new Date()) {
  const start = new Date(date);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  return todayKey(start);
}

export function weekdayLabel(date = new Date()) {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
}

export function addDateDays(key: string, days: number) {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + days);
  return todayKey(date);
}

export function dateBounds(range: "today" | "week" | "month", date = new Date()) {
  const today = todayKey(date);
  if (range === "today") return { start: today, end: today };
  if (range === "week") {
    const start = weekStartKey(date);
    return { start, end: addDateDays(start, 6) };
  }
  return { start: todayKey(new Date(date.getFullYear(), date.getMonth(), 1)), end: todayKey(new Date(date.getFullYear(), date.getMonth() + 1, 0)) };
}

export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && todayKey(date) === value;
}

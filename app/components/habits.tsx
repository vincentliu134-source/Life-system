"use client";

import { HabitHistory } from "@/app/components/planning-panels";
import { weekdayOptions } from "@/app/components/review-task";
import { DimensionDot,StateResponse,createChecklistId } from "@/app/components/shared";
import { apiFetch } from "@/lib/client-api";
import { dimensions } from "@/lib/dimensions";
import type { Dimension,Habit,Priority,Task,TaskChecklistItem } from "@/lib/types";
import { useEffect,useState } from "react";

export function toggleWeekday(days: number[], day: number) {
  return days.includes(day) ? days.filter((item) => item !== day) : [...days, day];
}

export function HabitCreator({ onRefresh }: { onRefresh: () => void }) {
  const [draft, setDraft] = useState<Pick<Habit, "title" | "dimension_primary" | "frequency" | "weekdays" | "estimated_minutes" | "priority" | "active">>({
    title: "",
    dimension_primary: "身体",
    frequency: "每日",
    weekdays: [],
    estimated_minutes: 20,
    priority: "B",
    active: true,
  });
  const [checklistTemplate, setChecklistTemplate] = useState<TaskChecklistItem[]>([]);
  const [checklistDraft, setChecklistDraft] = useState("");

  function addChecklistTemplateItem() {
    const text = checklistDraft.trim();
    if (!text) return;
    setChecklistTemplate((items) => [...items, { id: createChecklistId(), text, done: false, result_note: "", carry_status: "none", carried_to_task_id: null, carried_to_date: null }]);
    setChecklistDraft("");
  }

  function updateChecklistTemplateItem(id: string, text: string) {
    setChecklistTemplate((items) => items.map((item) => item.id === id ? { ...item, text } : item).filter((item) => item.text.trim()));
  }

  function removeChecklistTemplateItem(id: string) {
    setChecklistTemplate((items) => items.filter((item) => item.id !== id));
  }

  async function create() {
    if (!draft.title.trim()) return;
    await apiFetch("/api/habits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, checklist_template: checklistTemplate }),
    });
    setDraft({ title: "", dimension_primary: "身体", frequency: "每日", weekdays: [], estimated_minutes: 20, priority: "B", active: true });
    setChecklistTemplate([]);
    setChecklistDraft("");
    onRefresh();
  }

  return (
    <section className="panel habit-create-panel">
      <div className="section-head compact-head">
        <h2>直接设定习惯</h2>
        <button className="primary" onClick={create} disabled={!draft.title.trim()}>新增</button>
      </div>
      <div className="habit-create-grid">
        <input value={draft.title} placeholder="习惯名称" onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        <label>
          <span>维度</span>
          <select value={draft.dimension_primary} onChange={(event) => setDraft({ ...draft, dimension_primary: event.target.value as Dimension })}>
            {dimensions.map((dimension) => <option key={dimension.key}>{dimension.key}</option>)}
          </select>
        </label>
        <label>
          <span>优先级</span>
          <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}>
            <option>A</option><option>B</option><option>C</option>
          </select>
        </label>
        <label>
          <span>频次</span>
          <select value={draft.frequency} onChange={(event) => setDraft({ ...draft, frequency: event.target.value as Habit["frequency"] })}>
            <option>每日</option>
            <option>隔天一次</option>
            <option>每周1次</option>
            <option>每周3次</option>
            <option>每周5次</option>
            <option>指定星期</option><option>每周自由3次</option>
          </select>
        </label>
        <label>
          <span>时间</span>
          <input type="number" min={1} value={draft.estimated_minutes} onChange={(event) => setDraft({ ...draft, estimated_minutes: Number(event.target.value || 1) })} />
        </label>
      </div>
      {draft.frequency === "每周1次" || draft.frequency === "每周3次" || draft.frequency === "指定星期" ? (
        <div className="weekday-picker" aria-label="选择星期">
          {weekdayOptions.map((day) => (
            <button
              className={draft.weekdays.includes(day.value) ? "active" : ""}
              key={day.value}
              onClick={() => setDraft({
                ...draft,
                weekdays: draft.frequency === "每周1次" ? [day.value] : toggleWeekday(draft.weekdays, day.value),
              })}
            >
              {day.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="habit-template-checklist">
        <span>默认清单</span>
        {checklistTemplate.map((item) => (
          <div className="habit-template-row" key={item.id}>
            <input value={item.text} onChange={(event) => updateChecklistTemplateItem(item.id, event.target.value)} />
            <button onClick={() => removeChecklistTemplateItem(item.id)}>删除</button>
          </div>
        ))}
        <div className="habit-template-row">
          <input
            value={checklistDraft}
            placeholder="例如：有氧 / 肌肉 / 拉伸"
            onChange={(event) => setChecklistDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addChecklistTemplateItem();
            }}
          />
          <button onClick={addChecklistTemplateItem}>添加</button>
        </div>
      </div>
    </section>
  );
}

export function HabitEditor({ habit, onRefresh }: { habit: Habit; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(habit);
  const [checklistDraft, setChecklistDraft] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    setDraft(habit);
  }, [habit]);

  function addChecklistTemplateItem() {
    const text = checklistDraft.trim();
    if (!text) return;
    setDraft((current) => ({
      ...current,
      checklist_template: [...(current.checklist_template || []), { id: createChecklistId(), text, done: false, result_note: "", carry_status: "none", carried_to_task_id: null, carried_to_date: null }],
    }));
    setChecklistDraft("");
  }

  function updateChecklistTemplateItem(id: string, text: string) {
    setDraft((current) => ({
      ...current,
      checklist_template: (current.checklist_template || []).map((item) => item.id === id ? { ...item, text } : item).filter((item) => item.text.trim()),
    }));
  }

  function removeChecklistTemplateItem(id: string) {
    setDraft((current) => ({
      ...current,
      checklist_template: (current.checklist_template || []).filter((item) => item.id !== id),
    }));
  }

  async function save() {
    try {
    setSaveStatus("saving");
    try {
      await apiFetch(`/api/habits/${habit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      setSaveStatus("saved");
      onRefresh();
      window.setTimeout(() => {
        setEditing(false);
        setSaveStatus("idle");
      }, 700);
    } catch {
      setSaveStatus("error");
    }
  
    } catch { setSaveStatus("idle"); }
}

  async function remove() {
    await apiFetch(`/api/habits/${habit.id}`, { method: "DELETE" });
    onRefresh();
  }

  if (!editing) {
    return (
      <article className="habit-card">
        <div className="card-title">
          <DimensionDot dimension={habit.dimension_primary} />
          <h3>{habit.title}</h3>
        </div>
        <p>{habit.frequency} · {habit.priority} · {habit.estimated_minutes} 分钟 · {habit.active ? "启用" : "停用"}</p>
        {habit.checklist_template?.length ? <p>清单：{habit.checklist_template.map((item) => item.text).join(" / ")}</p> : null}
        <button className="text-button" onClick={() => setEditing(true)}>编辑</button>
      </article>
    );
  }

  return (
    <article className="habit-card habit-edit-card">
      <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
      <div className="project-edit-grid">
        <select value={draft.dimension_primary} onChange={(event) => setDraft({ ...draft, dimension_primary: event.target.value as Dimension })}>
          {dimensions.map((dimension) => <option key={dimension.key}>{dimension.key}</option>)}
        </select>
        <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}>
          <option>A</option><option>B</option><option>C</option>
        </select>
        <select value={draft.frequency} onChange={(event) => setDraft({ ...draft, frequency: event.target.value as Habit["frequency"] })}>
          <option>每日</option>
          <option>隔天一次</option>
          <option>每周1次</option>
          <option>每周3次</option>
          <option>每周5次</option>
          <option>指定星期</option><option>每周自由3次</option>
        </select>
      </div>
      <div className="project-edit-grid">
        <input type="number" min={1} value={draft.estimated_minutes} onChange={(event) => setDraft({ ...draft, estimated_minutes: Number(event.target.value || 1) })} />
        <select value={draft.active ? "true" : "false"} onChange={(event) => setDraft({ ...draft, active: event.target.value === "true" })}>
          <option value="true">启用</option>
          <option value="false">停用</option>
        </select>
      </div>
      {draft.frequency === "每周1次" || draft.frequency === "每周3次" || draft.frequency === "指定星期" ? (
        <div className="weekday-picker" aria-label="选择星期">
          {weekdayOptions.map((day) => (
            <button
              className={draft.weekdays.includes(day.value) ? "active" : ""}
              key={day.value}
              onClick={() => setDraft({
                ...draft,
                weekdays: draft.frequency === "每周1次" ? [day.value] : toggleWeekday(draft.weekdays, day.value),
              })}
            >
              {day.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="habit-template-checklist">
        <span>默认清单</span>
        {(draft.checklist_template || []).map((item) => (
          <div className="habit-template-row" key={item.id}>
            <input value={item.text} onChange={(event) => updateChecklistTemplateItem(item.id, event.target.value)} />
            <button onClick={() => removeChecklistTemplateItem(item.id)}>删除</button>
          </div>
        ))}
        <div className="habit-template-row">
          <input
            value={checklistDraft}
            placeholder="例如：有氧 / 肌肉 / 拉伸"
            onChange={(event) => setChecklistDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addChecklistTemplateItem();
            }}
          />
          <button onClick={addChecklistTemplateItem}>添加</button>
        </div>
      </div>
      <div className="project-edit-actions">
        <button className="secondary" onClick={save} disabled={saveStatus === "saving"}>{saveStatus === "saving" ? "保存中..." : saveStatus === "saved" ? "已保存" : saveStatus === "error" ? "保存失败" : "保存"}</button>
        <button className="text-button" onClick={() => setEditing(false)}>取消</button>
        <button className="text-danger" onClick={remove}>删除</button>
      </div>
    </article>
  );
}

export function habitWithVisibleChecklist(habit: Habit, tasks: Task[]): Habit {
  if (habit.checklist_template?.length) return habit;
  const latestTask = tasks
    .filter((task) => task.habit_id === habit.id && task.checklist?.length)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.created_at || "").localeCompare(a.created_at || ""))[0];
  if (!latestTask?.checklist?.length) return habit;
  return {
    ...habit,
    checklist_template: latestTask.checklist.map((item) => ({
      ...item,
      done: false,
      result_note: "",
      carry_status: "none",
      carried_to_task_id: null,
      carried_to_date: null,
    })),
  };
}

export function Habits({ state, onRefresh }: { state: StateResponse; onRefresh: () => void }) {
  return (
    <section className="dimension-group-list">
      <HabitCreator onRefresh={onRefresh} />
      <HabitHistory state={state} onRefresh={onRefresh} />
      {dimensions.map((dimension) => {
        const habits = state.habits
          .filter((habit) => habit.dimension_primary === dimension.key)
          .map((habit) => habitWithVisibleChecklist(habit, state.tasks));
        if (!habits.length) return null;
        return (
          <section className="dimension-group" key={dimension.key}>
            <div className="section-head compact-head">
              <span><DimensionDot dimension={dimension.key} />{dimension.label}</span>
              <span>{habits.length}</span>
            </div>
            <div className="habit-grid">
              {habits.map((habit) => <HabitEditor habit={habit} key={habit.id} onRefresh={onRefresh} />)}
            </div>
          </section>
        );
      })}
    </section>
  );
}

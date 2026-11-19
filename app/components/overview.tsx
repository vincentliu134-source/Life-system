"use client";

import { useState } from "react";
import { todayKey, dateBounds } from "@/lib/date";
import { dimensions } from "@/lib/dimensions";
import { isHabit, isOpen } from "@/lib/planning";
import { sortDailyTasks } from "@/lib/task-workflow";
import { goalIsActive, goalLatestProgress, goalNextAction } from "@/lib/simple-goals";
import { DimensionDot, type MainTab, type StateResponse } from "./shared";

export function OverviewPage({ state, onNavigate }: { state: StateResponse; onNavigate: (tab: MainTab) => void; onRefresh: () => void }) {
  const today = todayKey();
  const [range, setRange] = useState<"week" | "month">("week");
  const [allGoals, setAllGoals] = useState(false);
  const [allAlerts, setAllAlerts] = useState(false);
  const todayTasks = state.tasks.filter(task => task.date === today && !isHabit(task) && task.status !== "取消");
  const open = todayTasks.filter(isOpen);
  const waiting = open.filter(task => task.status === "等待反馈");
  const activeGoals = state.goals.filter(goalIsActive);
  const dueTasks = sortDailyTasks(state.tasks.filter(task => !isHabit(task) && isOpen(task) && ((task.follow_up_date && task.follow_up_date <= today) || (task.due_date && task.due_date <= today))), state);
  const alerts = [
    ...dueTasks.map(task => ({ key: `task:${task.id}`, title: task.title, label: task.due_date && task.due_date < today ? "已逾期" : task.due_date === today ? "今天截止" : "该跟进了", kind: "task" })),
    ...activeGoals.filter(goal => goal.deadline && goal.deadline <= today).map(goal => ({ key: `goal:${goal.id}`, title: goal.title, label: goal.deadline === today ? "目标今天到期" : "目标已到期", kind: "goal" })),
  ];
  const bounds = dateBounds(range);
  const period = state.tasks.filter(task => task.date >= bounds.start && task.date <= bounds.end && task.status !== "取消");

  return <section className="simple-overview page-enter">
    <header className="page-kicker"><h1>总览</h1><p>看状态，处理需要注意的事。</p></header>
    <div className="glance-stats">
      <button onClick={() => onNavigate("今天")}><span>今天未完成</span><strong>{open.length}</strong></button>
      <button onClick={() => onNavigate("今天")}><span>其中等待反馈</span><strong>{waiting.length}</strong></button>
      <button onClick={() => onNavigate("今天")}><span>今天已完成</span><strong>{todayTasks.filter(task => task.status === "完成").length}</strong></button>
    </div>
    {alerts.length ? <section className="panel glance-alerts"><div className="section-head"><h2>需要注意 <small>{alerts.length}</small></h2></div>{(allAlerts ? alerts : alerts.slice(0, 5)).map(alert => <button className="glance-alert-row" key={alert.key} onClick={() => onNavigate(alert.kind === "goal" ? "方向" : "今天")}><span className="attention-label">{alert.label}</span><strong>{alert.title}</strong><span aria-hidden="true">→</span></button>)}{alerts.length > 5 ? <button className="text-button" onClick={() => setAllAlerts(value => !value)}>{allAlerts ? "收起" : `查看其余 ${alerts.length - 5} 项`}</button> : null}</section> : null}
    <section className="panel glance-goals"><div className="section-head"><h2>当前目标 <small>{activeGoals.length}</small></h2><button className="text-button" onClick={() => onNavigate("方向")}>查看目标 →</button></div>
      {(allGoals ? activeGoals : activeGoals.slice(0, 4)).map(goal => { const latest = goalLatestProgress(goal, state); return <button className="glance-goal-row" key={goal.id} onClick={() => onNavigate("方向")}><div className="glance-goal-title"><strong>{goal.title}</strong><span><DimensionDot dimension={goal.dimension_primary} />{goal.dimension_primary}</span></div><p><span>最新</span>{latest?.content || "还没有进展记录"}</p><p><span>下一步</span>{goalNextAction(goal, state) || "待补充具体行动"}</p></button>; })}
      {!activeGoals.length ? <p className="empty">还没有推进中的目标，可以先确定一个想达成的结果。</p> : null}
      {activeGoals.length > 4 ? <button className="text-button" onClick={() => setAllGoals(value => !value)}>{allGoals ? "收起" : `展开其余 ${activeGoals.length - 4} 个目标`}</button> : null}
    </section>
    <details className="panel glance-details"><summary>查看统计</summary><div className="subnav"><button className={range === "week" ? "active" : ""} onClick={() => setRange("week")}>本周</button><button className={range === "month" ? "active" : ""} onClick={() => setRange("month")}>本月</button></div><p className="quiet-note">{bounds.start} — {bounds.end}</p><div className="glance-dimension-stats">{dimensions.map(dimension => { const tasks = period.filter(task => task.dimension_primary === dimension.key && !isHabit(task)); return <div key={dimension.key}><span><DimensionDot dimension={dimension.key} />{dimension.label}</span><strong>{tasks.filter(task => task.status === "完成").length}/{tasks.length}</strong><small>已完成 / 已安排</small></div>; })}</div><p className="quiet-note">习惯打卡：{period.filter(task => isHabit(task) && task.status === "完成").length}/{period.filter(isHabit).length}</p></details>
  </section>;
}

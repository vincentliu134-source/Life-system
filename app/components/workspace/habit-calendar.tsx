'use client';
import { useState } from 'react';
import { dateBounds, todayKey } from '@/lib/date';
import { habitCalendarStats } from '@/lib/habit-calendar';
import type { Habit, Task } from '@/lib/types';

export function HabitCalendar({habit,tasks,onClose}:{habit:Habit;tasks:Task[];onClose:()=>void}){
  const today=todayKey(),[month,setMonth]=useState(today.slice(0,7)),[selected,setSelected]=useState(today);
  const anchor=new Date(month+'-01T12:00:00'),bounds=dateBounds('month',anchor),length=Number(bounds.end.slice(-2));
  const stats=habitCalendarStats(habit,tasks,today,month),logs=tasks.filter(task=>task.habit_id===habit.id);
  const records=new Map<string,Task[]>();for(const task of logs)records.set(task.date,[...(records.get(task.date)||[]),task]);
  function status(day:string){if(day>today)return '未来';if(stats.completedDays.has(day))return '已打卡';const entries=records.get(day)||[];return entries.some(task=>task.status==='跳过')?'已跳过':entries.some(task=>['未开始','进行中','未记录'].includes(task.status))?'未打卡':'无记录';}
  function changeMonth(value:string){if(!value)return;setMonth(value);setSelected(value===today.slice(0,7)?today:value+'-01');}
  function moveMonth(offset:number){const next=new Date(anchor);next.setMonth(next.getMonth()+offset);changeMonth(todayKey(next).slice(0,7));}
  const leading=anchor.getDay(),cells=Array.from({length:Math.ceil((leading+length)/7)*7},(_,index)=>{const day=index-leading+1;return day>0&&day<=length?`${month}-${String(day).padStart(2,'0')}`:null;});
  return <div className="ws-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section className="ws-modal ws-habit-calendar" role="dialog" aria-modal="true" aria-labelledby="ws-habit-calendar-title">
    <header><div><small>{habit.frequency} · {habit.active?'已启用':'已暂停'}</small><h2 id="ws-habit-calendar-title">{habit.title} · 打卡日历</h2></div><button aria-label="关闭打卡日历" onClick={onClose}>关闭</button></header>
    <div className="ws-habit-calendar-body">
      <div className="ws-habit-calendar-stats"><div><strong>{stats.totalDays}</strong><span>累计打卡天数</span></div>{stats.currentStreak!==null?<><div><strong>{stats.currentStreak}</strong><span>当前连续天数</span></div><div><strong>{stats.longestStreak}</strong><span>最长连续天数</span></div></>:<><div><strong>{stats.weekDays}</strong><span>本周打卡次数</span></div><div><strong>{stats.monthDays}</strong><span>本月打卡天数</span></div></>}</div>
      <div className="ws-habit-calendar-toolbar"><button aria-label="上一个打卡月" onClick={()=>moveMonth(-1)}>‹ 上月</button><input aria-label="打卡月份" type="month" value={month} max={today.slice(0,7)} onChange={event=>changeMonth(event.target.value)}/><button aria-label="下一个打卡月" disabled={month>=today.slice(0,7)} onClick={()=>moveMonth(1)}>下月 ›</button><button onClick={()=>changeMonth(today.slice(0,7))}>本月</button></div>
      <p className="ws-habit-calendar-note">{month} · 打卡 {stats.monthDays} 天。绿色为已打卡，点击日期查看记录。</p>
      <div className="ws-habit-calendar-grid">{['日','一','二','三','四','五','六'].map(day=><small key={day}>{day}</small>)}{cells.map((day,index)=>day?<button key={day} className={`${stats.completedDays.has(day)?'is-done':''}${day===today?' is-today':''}${day>today?' is-future':''}`} aria-label={`${day} ${status(day)}`} aria-pressed={selected===day} onClick={()=>setSelected(day)}><span>{Number(day.slice(-2))}</span><i aria-hidden="true">{stats.completedDays.has(day)?'✓':status(day)==='已跳过'?'跳过':''}</i></button>:<span key={`blank-${index}`} aria-hidden="true"/>)}</div>
      <div className="ws-habit-calendar-day" aria-live="polite"><strong>{selected} · {status(selected)}</strong>{(records.get(selected)||[]).filter(task=>task.status==='完成').slice(0,1).map(task=><small key={task.id}>{task.completed_at?`打卡时间：${new Date(task.completed_at).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}`:'已完成打卡'}{task.result_note?` · ${task.result_note}`:''}</small>)}</div>
      <small className="ws-habit-calendar-note">按已有打卡记录统计，同一天只计一次。{habit.frequency==='每日'?'今天未打卡时，当前连续天数暂计至昨天。':'此习惯按设置的频次执行，不按每日连续打卡计算。'}</small>
    </div>
  </section></div>;
}

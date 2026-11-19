import { addDateDays, dateBounds, validDate } from './date';
import type { Habit, Task } from './types';

export function habitCalendarStats(habit:Habit,tasks:Task[],today:string,month=today.slice(0,7)){
  const days=[...new Set(tasks.filter(task=>task.habit_id===habit.id&&task.status==='完成'&&validDate(task.date)&&task.date<=today).map(task=>task.date))].sort();
  const completedDays=new Set(days),week=dateBounds('week',new Date(today+'T12:00:00'));
  let current=0,longest=0,run=0,previous='';
  for(const day of days){run=previous&&addDateDays(previous,1)===day?run+1:1;longest=Math.max(longest,run);previous=day;}
  if(habit.frequency==='每日'){
    let cursor=completedDays.has(today)?today:addDateDays(today,-1);
    while(completedDays.has(cursor)){current++;cursor=addDateDays(cursor,-1);}
  }
  return {completedDays,totalDays:days.length,monthDays:days.filter(day=>day.startsWith(month+'-')).length,weekDays:days.filter(day=>day>=week.start&&day<=week.end).length,currentStreak:habit.frequency==='每日'?current:null,longestStreak:habit.frequency==='每日'?longest:null};
}

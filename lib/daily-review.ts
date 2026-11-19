import { addDateDays, todayKey } from './date';
import type { AppState, Dimension, Task } from './types';

export type ReviewOutcome = '完成' | '改期' | '等待反馈' | '有进展' | '未处理';
export type ReviewRow = {
  id:string;
  title:string;
  dimension:Dimension;
  projectId:string | null;
  task:Task | null;
  origin:'原计划' | '临时加入';
  outcome:ReviewOutcome;
  movedTo:string;
  latestProgress:string;
};

const localDay=(timestamp:string)=>todayKey(new Date(timestamp));
const isAction=(task:Task)=>!task.is_habit&&task.source!=='calendar'&&!task.due_time;

export function dailyReviewReport(state:AppState,date:string){
  const baseline=state.review_baselines?.[date];
  const baselineMap=new Map((baseline?.tasks||[]).map(item=>[item.id,item]));
  const rows:ReviewRow[]=[];
  for(const task of state.tasks){
    if(!isAction(task))continue;
    const events=task.plan_events||[];
    const completedToday=task.status==='完成'&&Boolean(task.completed_at&&localDay(task.completed_at)===date);
    const planned=baselineMap.has(task.id)||task.date===date||completedToday||events.some(event=>event.from_date===date&&localDay(event.changed_at)>=date||event.to_date===date&&localDay(event.changed_at)<=date)||task.plan_history?.some(item=>item.date===date&&localDay(item.changed_at)>=date);
    if(!planned)continue;
    const baselineItem=baselineMap.get(task.id);
    const addedToday=localDay(task.created_at)===date;
    const assignedBeforeCapture=events.some(event=>event.to_date===date&&localDay(event.changed_at)===date&&(!baseline||event.changed_at<=baseline.captured_at));
    const priorPlanTrace=task.date===date&&!addedToday&&!events.some(event=>event.to_date===date&&localDay(event.changed_at)===date)||events.some(event=>event.from_date===date&&localDay(event.changed_at)>=date||event.to_date===date&&localDay(event.changed_at)<date)||Boolean(task.plan_history?.some(item=>item.date===date&&localDay(item.changed_at)>=date));
    const origin:ReviewRow['origin']=baselineItem&&!addedToday&&!assignedBeforeCapture||!baselineItem&&!addedToday&&priorPlanTrace?'原计划':'临时加入';
    const dayEvents=events.filter(event=>localDay(event.changed_at)===date).sort((a,b)=>a.changed_at.localeCompare(b.changed_at));
    const lastEvent=dayEvents.at(-1);
    const legacyMove=!lastEvent&&task.plan_history?.some(item=>item.date===date&&localDay(item.changed_at)===date)&&task.date!==date;
    const movedTo=lastEvent?.from_date===date&&lastEvent.to_date!==date?lastEvent.to_date:legacyMove?task.date:'';
    const dayLogs=(task.progress_logs||[]).filter(log=>localDay(log.created_at)===date);
    const latestProgress=dayLogs.at(-1)?.content||'';
    const outcome:ReviewOutcome=completedToday?'完成':movedTo?'改期':dayLogs.some(log=>log.status==='等待反馈')||task.status==='等待反馈'&&task.date===date?'等待反馈':latestProgress?'有进展':'未处理';
    rows.push({id:task.id,title:baselineItem?.title||task.title,dimension:baselineItem?.dimension_primary||task.dimension_primary,projectId:baselineItem?.project_id||task.project_id,task,origin,outcome,movedTo,latestProgress});
  }
  const counts={planned:rows.filter(row=>row.origin==='原计划').length,added:rows.filter(row=>row.origin==='临时加入').length,completed:0,moved:0,waiting:0,progressed:0,untouched:0};
  for(const row of rows){if(row.outcome==='完成')counts.completed++;else if(row.outcome==='改期')counts.moved++;else if(row.outcome==='等待反馈')counts.waiting++;else if(row.outcome==='有进展')counts.progressed++;else counts.untouched++;}
  const tomorrow=addDateDays(date,1);
  const tomorrowTasks=state.tasks.filter(task=>isAction(task)&&task.date===tomorrow&&!['完成','取消','等待反馈','跳过','未记录'].includes(task.status));
  const movedTomorrowIds=new Set(rows.filter(row=>row.outcome==='改期'&&row.movedTo===tomorrow).map(row=>row.id));
  const candidates=state.tasks.filter(task=>isAction(task)&&!['完成','取消','等待反馈','跳过','未记录'].includes(task.status)&&(!task.date||task.date<date)&&!tomorrowTasks.some(item=>item.id===task.id));
  return {rows,counts,tomorrow,tomorrowTasks,movedTomorrowIds,candidates,baselineCapturedAt:baseline?.captured_at||null};
}

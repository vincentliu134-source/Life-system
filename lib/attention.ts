import type { Task } from './types';
import { todayKey } from './date';

const isOpen = (task:Task) => !['完成','取消','跳过','未记录'].includes(task.status);
const scheduled = (task:Task) => !task.is_habit && (task.source === 'calendar' || Boolean(task.due_time));

export function attentionBuckets(tasks:Task[],date:string,filter='全部'){
  const visible=tasks.filter(task=>!task.is_habit&&(filter==='全部'||task.dimension_primary===filter));
  const waiting=visible.filter(task=>task.status==='等待反馈');
  const due=visible.filter(task=>isOpen(task)&&task.status!=='等待反馈'&&Boolean(task.due_date&&task.due_date<=date||scheduled(task)&&task.date&&task.date<date)&&!(task.date===date&&!scheduled(task)));
  return {waiting,due,excludedCandidateIds:new Set(due.map(task=>task.id))};
}

export function waitingDeadline(task:Task){
  return [task.due_date,task.follow_up_date].filter((value):value is string=>Boolean(value)).sort()[0]||task.next_follow_up_date||null;
}

export function waitingByDate(tasks:Task[],date:string){
  const due:Task[]=[],later:Task[]=[];
  for(const task of tasks){const deadline=waitingDeadline(task);(!deadline||deadline<=date?due:later).push(task);}
  return {due,later};
}

export function completedByDate(tasks:Task[]){
  const days=new Map<string,Task[]>();
  for(const task of tasks){
    if(task.status!=='完成'||task.is_habit)continue;
    const stamp=task.completed_at?new Date(task.completed_at):null;
    const date=stamp&&!Number.isNaN(stamp.getTime())?todayKey(stamp):'';
    days.set(date,[...(days.get(date)||[]),task]);
  }
  return [...days.entries()].sort(([a],[b])=>b.localeCompare(a)).map(([date,items])=>({date,tasks:items.sort((a,b)=>(b.completed_at||'').localeCompare(a.completed_at||''))}));
}

export function sortWaitingTasks(tasks:Task[],dimensionOrder:string[],projectTitles:Record<string,string>={}){
  const groups=new Map<string,Task[]>();
  for(const task of tasks){const key=task.project_id||`dimension:${task.dimension_primary}`;groups.set(key,[...(groups.get(key)||[]),task]);}
  const rank=(task:Task)=>{const index=dimensionOrder.indexOf(task.dimension_primary);return index<0?dimensionOrder.length:index;};
  const earliest=(items:Task[])=>items.map(waitingDeadline).filter((value):value is string=>Boolean(value)).sort()[0]||'9999-12-31';
  return [...groups.entries()].sort(([keyA,a],[keyB,b])=>earliest(a).localeCompare(earliest(b))||rank(a[0])-rank(b[0])||(projectTitles[keyA]||'').localeCompare(projectTitles[keyB]||'','zh-CN')).flatMap(([,items])=>items.sort((a,b)=>(waitingDeadline(a)||'9999-12-31').localeCompare(waitingDeadline(b)||'9999-12-31')||a.priority.localeCompare(b.priority)||a.title.localeCompare(b.title,'zh-CN')));
}

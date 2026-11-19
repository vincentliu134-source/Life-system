import { addDateDays, todayKey } from './date';
import { waitingDeadline } from './attention';
import type { AppState, Dimension, Project, Task } from './types';

export type ProjectReviewGroup = {
  key: string;
  dimension: Dimension;
  project: Project | null;
  completed: Task[];
  scheduled: Task[];
  waiting: Task[];
  unplanned: Task[];
  completedInPeriod: number;
  changedInPeriod: boolean;
  lastChange: string;
  activityCount: number;
  changedTasksInPeriod: number;
  lastActivityInPeriod: string;
  nextAttentionDate: string;
  attentionRank: number;
};

const dayOf = (stamp:string | null | undefined) => {
  if (!stamp) return '';
  const value = new Date(stamp);
  return Number.isNaN(value.getTime()) ? '' : todayKey(value);
};

export function preserveReviewOrder(groups:ProjectReviewGroup[],entryKeys:string[]):ProjectReviewGroup[]{
  const positions=new Map(entryKeys.map((key,index)=>[key,index]));
  return [...groups].sort((a,b)=>(positions.get(a.key)??Number.MAX_SAFE_INTEGER)-(positions.get(b.key)??Number.MAX_SAFE_INTEGER));
}

export function projectReviewGroups(state:AppState,start:string,end:string,asOf=todayKey()):ProjectReviewGroup[] {
  const groups = new Map<string,ProjectReviewGroup>();
  const projectById = new Map(state.projects.map(project => [project.id,project]));
  const getGroup = (dimension:Dimension, project:Project | null) => {
    const key = project?.id || `dimension:${dimension}`;
    let group = groups.get(key);
    if (!group) {
      const created = project?.created_at || '';
      const createdDay = dayOf(created);
      group = {key,dimension,project,completed:[],scheduled:[],waiting:[],unplanned:[],completedInPeriod:0,changedInPeriod:Boolean(createdDay && createdDay>=start && createdDay<=end),lastChange:created,activityCount:0,changedTasksInPeriod:0,lastActivityInPeriod:'',nextAttentionDate:'',attentionRank:4};
      groups.set(key,group);
    }
    return group;
  };
  for (const project of state.projects) {
    if (project.status !== '已完成' && project.status !== '暂停') getGroup(project.dimension_primary,project);
  }
  for (const task of state.tasks) {
    if (task.is_habit || ['跳过','未记录'].includes(task.status)) continue;
    const project = task.project_id ? projectById.get(task.project_id) || null : null;
    const group = getGroup(project?.dimension_primary || task.dimension_primary,project);
    const changes = [task.created_at,task.completed_at||'',...(task.progress_logs||[]).map(log=>log.created_at),...(task.plan_events||task.plan_history||[]).map(event=>event.changed_at),...(task.waiting_date_history||[]).map(event=>event.changed_at),...(task.title_history||[]).map(event=>event.changed_at)];
    // New commands have one canonical event per task. Legacy histories can describe
    // the same operation several times, so collapse those timestamps to a second.
    const canonical=task.activity_events||[],coveredSeconds=new Set(canonical.map(event=>event.changed_at.slice(0,19)));
    const operations=new Map(canonical.map(event=>[event.request_id,event.changed_at]));
    for(const changed of changes)if(changed&&!coveredSeconds.has(changed.slice(0,19)))operations.set(`legacy:${changed.slice(0,19)}`,changed);
    const inPeriod=[...operations.values()].filter(changed=>{const day=dayOf(changed);return day>=start&&day<=end;});
    group.activityCount+=inPeriod.length;
    if(inPeriod.length)group.changedTasksInPeriod++;
    const recent=inPeriod.sort().at(-1)||'';
    if(recent>group.lastActivityInPeriod)group.lastActivityInPeriod=recent;
    changes.push(...canonical.map(event=>event.changed_at));
    const lastChange = changes.filter(Boolean).sort().at(-1)||'';
    if (lastChange > group.lastChange) group.lastChange = lastChange;
    if (inPeriod.length) group.changedInPeriod=true;
    if(task.status==='取消')continue;
    if (task.status==='完成') {
      group.completed.push(task);
      const day=dayOf(task.completed_at);
      if (day>=start&&day<=end) group.completedInPeriod++;
    } else if (task.status==='等待反馈') group.waiting.push(task);
    else if (task.date && (task.date>=asOf || task.source==='calendar' || Boolean(task.due_time))) group.scheduled.push(task);
    else group.unplanned.push(task);
  }
  for (const group of groups.values()) {
    group.completed.sort((a,b)=>(b.completed_at||'').localeCompare(a.completed_at||'')||a.created_at.localeCompare(b.created_at));
    group.scheduled.sort((a,b)=>a.date.localeCompare(b.date)||Number(b.first_do_date===b.date)-Number(a.first_do_date===a.date)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
    group.waiting.sort((a,b)=>(waitingDeadline(a)||'9999-12-31').localeCompare(waitingDeadline(b)||'9999-12-31')||a.created_at.localeCompare(b.created_at));
    group.unplanned.sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
    if(!group.activityCount&&group.changedInPeriod){group.activityCount=1;group.lastActivityInPeriod=group.project?.created_at||'';}
    const open=[...group.scheduled,...group.waiting,...group.unplanned];
    const dates=open.flatMap(task=>task.status==='等待反馈'?[waitingDeadline(task)||asOf]:[task.date,task.due_date||''].filter(Boolean)).sort();
    group.nextAttentionDate=dates[0]||'';
    group.attentionRank=dates.some(date=>date<=asOf)?0:dates.some(date=>date<=addDateDays(asOf,7))?1:group.unplanned.length?2:open.length?3:4;
  }
  const dimensionOrder = state.dimension_priority_order || [];
  const rank = (dimension:Dimension) => {
    const index=dimensionOrder.indexOf(dimension);
    return index<0?dimensionOrder.length:index;
  };
  return [...groups.values()]
    .filter(group=>group.completed.length+group.scheduled.length+group.waiting.length+group.unplanned.length>0 || group.project && !['已完成','暂停'].includes(group.project.status))
    .sort((a,b)=>rank(a.dimension)-rank(b.dimension)||b.activityCount-a.activityCount||a.attentionRank-b.attentionRank||(a.nextAttentionDate||'9999-12-31').localeCompare(b.nextAttentionDate||'9999-12-31')||b.lastActivityInPeriod.localeCompare(a.lastActivityInPeriod)||Number(!a.project)-Number(!b.project)||(a.project?.created_at||'').localeCompare(b.project?.created_at||'')||a.key.localeCompare(b.key));
}

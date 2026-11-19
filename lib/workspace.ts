import { createId } from './id';
import { isDimension } from './dimensions';
import { addDateDays, todayKey, validDate } from './date';
import { validateFields, record } from './validation';
import { taskAtDate } from './task-workflow';
import { reconcileCompletedLegacyActions } from './legacy-split-actions';
import { waitingDeadline } from './attention';
import type { AppState, Task, Goal, Project, Habit, Note, Dimension, TaskStatus, DailyReview } from './types';

export class ConflictError extends Error {}
type Data = Record<string, unknown>;
const stamp = () => new Date().toISOString();
function str(d: Data, k: string, required = false) {
  const value = d[k];
  if (value != null && typeof value !== 'string') throw new Error(`${k} 必须是文字`);
  const text = (value as string || '').trim();
  if (text.length > 12000 || required && !text) throw new Error(required ? '请填写必要的内容（最多12000字）' : '内容过长');
  return text;
}
function choice<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  if (value == null || value === '') return fallback;
  if (!values.includes(value as T)) throw new Error('选项无效');
  return value as T;
}
function day(d: Data, k: string, required = false) { const v = str(d,k); if ((required || v) && !validDate(v)) throw new Error('请填写有效日期'); return v; }
function find<T extends {id:string}>(items: T[], id: string): T { const item=items.find(x=>x.id===id); if(!item) throw new Error('记录已变化或不存在，请同步后重试'); return item; }
function deadlineConflict(deadline:string|null|undefined,date:string){return Boolean(deadline&&(date?date>deadline:deadline<=todayKey()));}
function resolvedDeadline(deadline:string|null|undefined,date:string,d:Data){
  if(!deadlineConflict(deadline,date))return deadline||null;
  const choice=str(d,'deadline_choice');
  if(choice==='keep')return deadline||null;
  if(choice==='change'){
    const replacement=day(d,'new_due_date',true);
    if(date&&replacement<date)throw new Error('新的截止日期不能早于执行日期');
    return replacement;
  }
  throw new Error('执行日期晚于截止日期，请选择是否同时修改截止日期');
}
export function setHabitActive(s:AppState,h:Habit,active:boolean){
  h.active=active;
  const today=todayKey();
  for(const task of s.tasks){
    if(task.habit_id!==h.id||task.date<today||task.status==='完成')continue;
    if(!active&&['未开始','进行中','等待反馈'].includes(task.status))task.status='取消';
    else if(active&&task.date===today&&task.status==='取消')task.status='未开始';
  }
}
export function deleteHabit(s:AppState,id:string){
  find(s.habits,id);
  s.habits=s.habits.filter(h=>h.id!==id);
  for(const task of s.tasks)if(task.habit_id===id&&task.date>=todayKey()&&['未开始','进行中','等待反馈'].includes(task.status))task.status='取消';
}
function scope(s: AppState, d: Data) {
  const project_id=str(d,'project_id')||null, goal_id=str(d,'goal_id')||null;
  const p=project_id?find(s.projects,project_id):null, g=goal_id?find(s.goals,goal_id):null;
  const dimension=p?.dimension_primary||g?.dimension_primary||d.dimension_primary;
  if(!isDimension(dimension)) throw new Error('请选择所属维度');
  if(p&&g&&p.dimension_primary!==g.dimension_primary) throw new Error('项目与目标需属于同一维度');
  const area_id=p?.area_id||str(d,'area_id')||g?.area_id||null;
  if(area_id&&find(s.areas||[],area_id).dimension_primary!==dimension) throw new Error('板块与维度不一致');
  return { dimension_primary:dimension, area_id, project_id, goal_id:goal_id||p?.goal_id||null };
}
export function rememberPlan(task: Task) {
  if(task.date) task.plan_history=[...(task.plan_history||[]),{date:task.date,title:task.title,status:task.status,changed_at:stamp()}];
}
function clearProjectNextAction(s:AppState,task:Task){
  const project=s.projects.find(project=>project.id===task.project_id&&project.next_action?.trim()===task.title.trim());
  if(project)project.next_action='';
}
export function makeAction(s: AppState,d: Data): Task {
  const refs=scope(s,d), date=day(d,'date');
  const source=d.kind==='日程'?'calendar':'manual';
  const due_time=str(d,'due_time')||null;
  if(source==='calendar'&&!date) throw new Error('日程需要指定日期');
  const task:Task={...refs,id:createId('task'),title:str(d,'title',true),description:str(d,'description'),date,dimension_secondary:null,type:'项目任务',priority:choice(d.priority,['A','B','C'],'B'),priority_source:'user',status:'未开始',habit_id:null,is_habit:false,is_must_today:false,due_date:day(d,'due_date')||null,due_time,scheduled_end_time:str(d,'scheduled_end_time')||null,reminder_time:null,calendar_sync_status:'none',estimated_minutes:Number(d.estimated_minutes||0),result_note:'',checklist:[],created_at:stamp(),completed_at:null,postponed_count:0,is_focus:false,focus_order:null,source,origin:'planned',next_action:'',waiting_on:'',follow_up_date:null,next_follow_up_action:'',next_follow_up_date:null};
  validateFields(task);return task;
}
function saveEntity(s:AppState,d:Data):{kind:string;id:string} {
  const kind=str(d,'kind',true), id=str(d,'id');
  if(kind==='板块') {
    const title=str(d,'title',true), dimension=d.dimension_primary;
    if(!isDimension(dimension))throw new Error('请选择维度');
    if((s.areas||[]).some(a=>a.id!==id&&a.dimension_primary===dimension&&a.title===title))throw new Error('这个维度已有同名板块');
    if(id){const area=find(s.areas||[],id);if(area.dimension_primary!==dimension)throw new Error('板块不能跨维度移动');area.title=title;if(typeof d.active==='boolean')area.active=d.active;return {kind,id};}
    const item={id:createId('area'),title,dimension_primary:dimension,active:true,created_at:stamp()};s.areas!.push(item);return {kind,id:item.id};
  }
  if(kind==='行动'||kind==='日程') {
    const task=makeAction(s,d);
    if(id){const existing=find(s.tasks,id);if(existing.is_habit)throw new Error('请在习惯管理中修改模板');if(existing.date!==task.date||existing.title!==task.title)rememberPlan(existing);
      const linkedProject=s.projects.find(project=>project.id===existing.project_id&&project.next_action?.trim()===existing.title.trim());
      if(existing.title!==task.title)existing.title_history=[...(existing.title_history||[]),{title:existing.title,changed_at:stamp(),status:existing.status}];
      for(const key of ['title','description','date','dimension_primary','area_id','goal_id','project_id','priority','due_date','due_time','scheduled_end_time','estimated_minutes','source'] as const) (existing as unknown as Data)[key]=task[key];
      if(linkedProject)linkedProject.next_action=existing.project_id===linkedProject.id?existing.title:'';
      if(existing.status==='等待反馈'){existing.follow_up_date=existing.due_date||null;existing.next_follow_up_action='';existing.next_follow_up_date=null;}
      if(existing.first_do_date&&existing.first_do_date!==existing.date)existing.first_do_date=null;
      return {kind,id};}
    s.tasks.unshift(task);return {kind,id:task.id};
  }
  const refs=scope(s,{...d,project_id:kind==='项目'||kind==='习惯'?'':d.project_id,goal_id:kind==='目标'||kind==='习惯'?'':d.goal_id,area_id:kind==='习惯'?'':d.area_id});
  if(kind==='记录') {
    const content=str(d,'content',true);
    if(id){Object.assign(find(s.notes!,id),refs,{content});return {kind,id};}
    const note:Note={id:createId('note'),...refs,content,created_at:stamp()};s.notes!.unshift(note);return {kind,id:note.id};
  }
  const title=str(d,'title',true);
  if(kind==='项目') {
    const existing=id?find(s.projects,id):null;
    if(existing&&existing.dimension_primary!==refs.dimension_primary)throw new Error('已有项目请保留原维度，以保持历史归属');
    const nextDate=day(d,'next_date');
    const p:Project={...existing,id:id||createId('project'),...refs,title,dimension_secondary:existing?.dimension_secondary||null,description:str(d,'description'),next_action:str(d,'next_action'),status:choice(d.status,['待开始','进行中','等待中','已完成','暂停'],'进行中'),created_at:existing?.created_at||stamp()};
    if(existing)Object.assign(existing,p);else s.projects.unshift(p);
    // A project's next step is an actionable item, not just a note on the project.
    // Match any existing task, including completed ones, so re-saving a project is idempotent.
    if(p.next_action&&!s.tasks.some(task=>task.project_id===p.id&&task.title===p.next_action)){
      s.tasks.unshift(makeAction(s,{kind:'行动',title:p.next_action,dimension_primary:p.dimension_primary,project_id:p.id,date:nextDate}));
    }
    return {kind,id:p.id};
  }
  if(kind==='目标') {
    const existing=id?find(s.goals,id):null;
    if(existing&&existing.dimension_primary!==refs.dimension_primary)throw new Error('已有目标请保留原维度');
    const g:Goal={...existing,id:id||createId('goal'),...refs,title,success_metric:str(d,'success_metric',true),next_action:str(d,'next_action'),evidence:str(d,'evidence'),deadline:day(d,'deadline')||null,status:choice(d.status,['未开始','进行中','暂停','完成','放弃'],'进行中'),why:existing?.why||'',ai_breakdown:existing?.ai_breakdown||'',created_at:existing?.created_at||stamp(),updated_at:stamp()};
    if(existing)Object.assign(existing,g);else s.goals.unshift(g);return {kind,id:g.id};
  }
  if(kind==='习惯') {
    const existing=id?find(s.habits,id):null;
    const weekdays=Array.isArray(d.weekdays)?d.weekdays.map(Number):[];
    const frequency=choice(d.frequency,['每日','隔天一次','每周1次','每周3次','每周5次','指定星期','每周自由3次'],'每日');
    if(frequency==='指定星期'&&!weekdays.length)throw new Error('请至少选择一个星期');
    const h:Habit={...existing,id:id||createId('habit'),...refs,title,frequency,weekdays,estimated_minutes:Number(d.estimated_minutes||0),priority:'B',active:typeof d.active==='boolean'?d.active:true,created_at:existing?.created_at||stamp()};delete (h as Habit & {project_id?:string|null}).project_id;validateFields(h);
    if(existing){Object.assign(existing,h);setHabitActive(s,existing,h.active);}else s.habits.unshift(h);return {kind,id:h.id};
  }
  throw new Error('内容类型无效');
}
function completeStepAndContinue(s:AppState,d:Data){
  const current=find(s.tasks,str(d,'id',true));
  if(current.is_habit||['完成','取消','跳过','未记录'].includes(current.status))throw new Error('这条事项已结束，请同步后核对');
  if(current.continued_to_task_id)throw new Error('这一步已经安排过后续行动，请直接查看后续行动');
  const result=str(d,'content',true),next=str(d,'next_action',true),date=day(d,'next_date');
  const wasWaiting=current.status==='等待反馈';
  const successor=makeAction(s,{kind:'行动',title:next,date,dimension_primary:current.dimension_primary,area_id:current.area_id||'',project_id:current.project_id||'',goal_id:current.goal_id||'',priority:current.priority});
  successor.continued_from_task_id=current.id;
  validateFields(successor);
  const finishedAt=stamp();
  current.progress_logs=[...(current.progress_logs||[]),{id:createId('progress'),content:result,created_at:finishedAt,status:'完成',next_action:next,waiting_on:current.waiting_on||'',follow_up_date:wasWaiting?current.due_date||current.follow_up_date||null:null}];
  current.status='完成';current.completed_at=finishedAt;current.next_action='';current.waiting_on='';current.follow_up_date=null;current.next_follow_up_action='';current.next_follow_up_date=null;current.first_do_date=null;current.continued_to_task_id=successor.id;
  if(wasWaiting)current.due_date=null;
  s.tasks.unshift(successor);
  const project=s.projects.find(item=>item.id===current.project_id);
  if(project&&(!project.next_action||project.next_action.trim()===current.title.trim()))project.next_action=next;
  const goal=s.goals.find(item=>item.id===current.goal_id);
  if(goal&&goal.next_action?.trim()===current.title.trim())goal.next_action=next;
  reconcileCompletedLegacyActions(s.tasks);
}
export function applyWorkspaceCommand(s:AppState,body:Data) {
  record(body);const requestId=str(body,'request_id',true);
  s.areas ||= [];s.notes ||= [];s.period_reviews ||= [];s.applied_commands ||= [];
  if(s.applied_commands.includes(requestId))return;
  if(body.revision!== (s.revision||0))throw new ConflictError('另一设备或页面已更新数据。请同步后重试；编辑中的内容保留，请关闭后重新打开核对。');
  const d=body.data;record(d);validateFields(d);
  const op=str(body,'op',true);
  const previousTasks=new Map(s.tasks.filter(task=>!task.is_habit).map(task=>[task.id,JSON.stringify(task)]));
  if(op==='save')saveEntity(s,d);
  else if(op==='capture')s.inbox_items.unshift({id:createId('inbox'),content:str(d,'content',true),status:'未处理',created_at:stamp(),archived_at:null});
  else if(op==='clarify') {
    const item=find(s.inbox_items,str(d,'inbox_id',true));
    if(item.status!=='未处理'||item.outputs?.length)throw new Error('这条内容已经整理，请直接查看关联结果');
    const kind=str(d,'kind',true);
    if(['将来／也许','回收站'].includes(kind)){item.status='已归档';item.clarified_type=kind==='回收站'?'删除':'将来某天';item.archived_at=stamp();}
    else {
      const refs=scope(s,d);Object.assign(item,refs);
      const output=saveEntity(s,{...d,id:'',title:str(d,'title')||item.content,content:str(d,'content')||item.content});
      item.outputs=[output];item.status='已安排';item.archived_at=stamp();
      item.clarified_type=kind==='记录'?'资料记录':kind==='项目'?'成果项目':kind==='目标'?'长期目标':kind==='习惯'?'习惯':kind==='日程'?'日程':'临时事项';
      if(kind==='项目')item.project_id=output.id;if(kind==='目标')item.goal_id=output.id;
      if(str(d,'next_action')&&['项目','记录','目标'].includes(kind)){
        const action=kind==='项目'
          ? s.tasks.find(task=>task.project_id===output.id&&task.title===str(d,'next_action'))!
          : makeAction(s,{...d,title:str(d,'next_action'),kind:'行动',project_id:refs.project_id,goal_id:kind==='目标'?output.id:refs.goal_id});
        if(kind!=='项目')s.tasks.unshift(action);
        item.outputs.push({kind:'行动',id:action.id});
      }
    }
  }
  else if(op==='inbox_batch_project') {
    const ids=d.ids;
    if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)throw new Error('请选择 1–100 条不同的待整理内容');
    const items=ids.map(id=>find(s.inbox_items,id));
    if(items.some(item=>item.status!=='未处理'||item.outputs?.length))throw new Error('有内容已经整理，请同步后重新选择');
    const target=choice(d.project_mode,['existing','new'],'existing');
    let project:Project;
    if(target==='existing'){
      project=find(s.projects,str(d,'project_id',true));
      if(['已完成','暂停'].includes(project.status))throw new Error('请选择仍在推进的项目');
    }else{
      const dimension=d.dimension_primary;
      if(!isDimension(dimension))throw new Error('请选择新项目的所属维度');
      const output=saveEntity(s,{kind:'项目',title:str(d,'new_project_title',true),dimension_primary:dimension,area_id:str(d,'area_id'),status:'进行中'});
      project=find(s.projects,output.id);
    }
    for(const item of items){
      const title=item.content.split(/\r?\n/).map(line=>line.trim()).find(Boolean)||item.content.trim();
      const action=makeAction(s,{kind:'行动',title,description:item.content.trim()===title?'':item.content,dimension_primary:project.dimension_primary,area_id:project.area_id||'',project_id:project.id,goal_id:project.goal_id||'',date:''});
      s.tasks.unshift(action);
      Object.assign(item,{dimension_primary:project.dimension_primary,area_id:project.area_id||null,project_id:project.id,goal_id:project.goal_id||null,outputs:[{kind:'行动',id:action.id}],status:'已安排',clarified_type:'临时事项',archived_at:stamp()});
    }
  }
  else if(op==='inbox_restore') {const item=find(s.inbox_items,str(d,'id',true));if(item.outputs?.length)throw new Error('已整理的内容请编辑关联结果');item.status='未处理';item.clarified_type=null;item.archived_at=null;}
  else if(op==='schedule') {
    const t=find(s.tasks,str(d,'id',true));if(t.is_habit)throw new Error('习惯按频次生成，无需改期');const date=day(d,'date');
    if((t.source==='calendar'||t.due_time)&&!date)throw new Error('固定日程请改期或取消');
    const nextDeadline=resolvedDeadline(t.due_date,date,d);
    if(d.mark_first===true&&(t.source==='calendar'||t.due_time||t.status==='等待反馈'||!date||date<todayKey()))throw new Error('只有已安排的普通行动可以置顶优先');
    if(t.date!==date){rememberPlan(t);t.date=date;t.sort_order=undefined;if(t.first_do_date!==date)t.first_do_date=null;}
    t.due_date=nextDeadline;
    if(d.mark_first===true)t.first_do_date=date;
  }
  else if(op==='first_do') {
    const t=find(s.tasks,str(d,'id',true));if(t.is_habit||t.source==='calendar'||t.due_time||['等待反馈','完成','取消','跳过','未记录'].includes(t.status))throw new Error('只有开放的普通行动可以标记明日优先');
    if(typeof d.active!=='boolean')throw new Error('请选择是否标记明日优先');
    if(d.active){const tomorrow=addDateDays(todayKey(),1);if(deadlineConflict(t.due_date,tomorrow))throw new Error('明日优先晚于截止日期，请先确认截止日期');if(t.date!==tomorrow){rememberPlan(t);t.date=tomorrow;t.sort_order=undefined;}t.first_do_date=tomorrow;}
    else t.first_do_date=null;
  }
  else if(op==='priority') {
    const t=find(s.tasks,str(d,'id',true));
    if(t.is_habit||t.source==='calendar'||t.due_time||['等待反馈','完成','取消','跳过','未记录'].includes(t.status))throw new Error('只有开放的普通行动可以设为优先事项');
    if(typeof d.active!=='boolean'||!t.date||t.date<todayKey()||d.date!==t.date)throw new Error('请先为行动安排有效的执行日期');
    t.first_do_date=d.active?t.date:null;
  }
  else if(op==='task_status') {
    const t=find(s.tasks,str(d,'id',true));const status=choice<TaskStatus>(d.status,['未开始','进行中','等待反馈','完成','取消','跳过','未记录'],'未开始');
    if(['跳过','未记录'].includes(status)&&!t.is_habit)throw new Error('只有习惯可以跳过');
    if(status==='等待反馈'&&t.is_habit)throw new Error('习惯不使用等待反馈');
    if(t.date&&t.date<todayKey()&&t.status!==status)rememberPlan(t);
    t.status=status;t.completed_at=status==='完成'?stamp():null;
    if(status==='完成'||status==='取消')clearProjectNextAction(s,t);
    if(status==='完成')reconcileCompletedLegacyActions(s.tasks);
  }
  else if(op==='repair_legacy_split_actions')reconcileCompletedLegacyActions(s.tasks);
  else if(op==='task_delete') {
    const ids=d.ids;if(!Array.isArray(ids)||!ids.length||ids.length>1000||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw new Error('请选择要删除的事项');
    const removed=new Set<string>(ids);
    for(const id of ids){const task=find(s.tasks,id);if(task.status!=='取消'||task.is_habit)throw new Error('只能删除已取消的普通行动');}
    s.tasks=s.tasks.filter(task=>!removed.has(task.id));
    for(const task of s.tasks){if(task.continued_from_task_id&&removed.has(task.continued_from_task_id))task.continued_from_task_id=null;if(task.continued_to_task_id&&removed.has(task.continued_to_task_id))task.continued_to_task_id=null;}
    for(const task of s.tasks)for(const item of task.checklist||[])if(item.carried_to_task_id&&removed.has(item.carried_to_task_id))item.carried_to_task_id=null;
    for(const goal of s.goals)if(goal.next_action_task_id&&removed.has(goal.next_action_task_id))goal.next_action_task_id=null;
    for(const review of s.daily_reviews){if(review.adjustment_task_id&&removed.has(review.adjustment_task_id))delete review.adjustment_task_id;for(const key of ['important_completed_task_id','important_unfinished_task_id','tomorrow_first_task_id'] as const)if(review[key]&&removed.has(review[key]!))review[key]=null;}
    for(const item of s.inbox_items)if(item.outputs?.length)item.outputs=item.outputs.filter(output=>!removed.has(output.id));
    for(const candidate of s.week_candidates||[])if(candidate.task_id&&removed.has(candidate.task_id))delete candidate.task_id;
  }
  else if(op==='follow_up') {
    const t=find(s.tasks,str(d,'id',true));if(t.is_habit)throw new Error('习惯没有跟进日期');
    t.follow_up_date=day(d,'follow_up_date')||null;
    if(t.status==='等待反馈')t.due_date=t.follow_up_date;
  }
  else if(op==='waiting_defer') {
    const t=find(s.tasks,str(d,'id',true));
    if(t.status!=='等待反馈'||t.is_habit)throw new Error('这条事项已不在等待反馈中，请同步后重试');
    const target=day(d,'date',true),today=todayKey(),previous=waitingDeadline(t);
    if(target!==addDateDays(today,1))throw new Error('日期已变化，请刷新后重新选择明日再看');
    if(previous&&previous>today)throw new Error('这条事项已安排在未来等待，请按需调整等待日期');
    t.waiting_date_history=[...(t.waiting_date_history||[]),{from_date:previous,to_date:target,changed_at:stamp()}];
    t.due_date=target;t.follow_up_date=target;t.next_follow_up_action='';t.next_follow_up_date=null;
  }
  else if(op==='waiting_plan') {
    const t=find(s.tasks,str(d,'id',true));if(t.status!=='等待反馈'||t.is_habit)throw new Error('这条事项已不在等待反馈中，请同步后重试');
    const waiting=str(d,'waiting_on',true),limit=day(d,'follow_up_date')||null;
    t.waiting_on=waiting;t.follow_up_date=limit;t.due_date=limit;t.next_follow_up_action='';t.next_follow_up_date=null;
  }
  else if(op==='waiting_follow_up') {
    const t=find(s.tasks,str(d,'id',true));if(t.status!=='等待反馈'||t.is_habit)throw new Error('这条事项已不在等待反馈中，请同步后重试');
    const content=str(d,'content',true),waiting=str(d,'waiting_on',true),limit=day(d,'follow_up_date')||null;
    t.progress_logs=[...(t.progress_logs||[]),{id:createId('progress'),content,created_at:stamp(),status:'等待反馈',next_action:t.next_action||'',waiting_on:waiting,follow_up_date:limit}];
    t.waiting_on=waiting;t.follow_up_date=limit;t.due_date=limit;t.next_follow_up_action='';t.next_follow_up_date=null;
  }
  else if(op==='waiting_to_action') {
    const t=find(s.tasks,str(d,'id',true));if(t.status!=='等待反馈'||t.is_habit)throw new Error('这条事项已不在等待反馈中，请同步后重试');
    const next=str(d,'next_action',true),date=day(d,'next_date',true);
    const previousWaiting=t.waiting_on||'',previousDeadline=t.due_date||t.follow_up_date||null;
    const content=`停止等待，转为行动${previousWaiting?`；此前等待：${previousWaiting}`:''}${previousDeadline?`；原等待截止：${previousDeadline}`:''}`.slice(0,12000);
    if(t.date!==date){rememberPlan(t);t.sort_order=undefined;}
    t.progress_logs=[...(t.progress_logs||[]),{id:createId('progress'),content,created_at:stamp(),status:'进行中',next_action:next,waiting_on:previousWaiting,follow_up_date:previousDeadline}];
    t.status='进行中';t.completed_at=null;t.next_action=next;t.date=date;t.waiting_on='';t.follow_up_date=null;t.due_date=null;t.next_follow_up_action='';t.next_follow_up_date=null;t.first_do_date=null;
    t.source='manual';t.due_time=null;t.scheduled_end_time=null;
  }
  else if(op==='habit_active') {const h=find(s.habits,str(d,'id',true));if(typeof d.active!=='boolean')throw new Error('请选择启用或暂停');setHabitActive(s,h,d.active);}
  else if(op==='habit_delete')deleteHabit(s,str(d,'id',true));
  else if((op==='progress'||op==='waiting_feedback')&&d.status==='接续下一步')completeStepAndContinue(s,d);
  else if(op==='progress') {
    const t=find(s.tasks,str(d,'id',true));const status=choice(d.status,['进行中','等待反馈','完成'],'进行中');
    const content=str(d,'content'), next=status==='进行中'?str(d,'next_action'):status==='完成'?'':t.next_action||'', waiting=status==='等待反馈'?str(d,'waiting_on'):'';
    if(t.is_habit)throw new Error('习惯请直接打卡');
    if(d.create_next===true)throw new Error('请保存进展后，在项目下单独添加新行动');
    if(status==='等待反馈'&&!waiting)throw new Error('请记录在等谁或什么反馈');
    if(status==='完成'&&!content)throw new Error('请先填写完成结果，再结束事项');
    const follow=status==='等待反馈'?day(d,'follow_up_date')||null:null;
    const nextDate=status==='进行中'?day(d,'next_date'):status==='完成'||t.source==='calendar'||t.due_time?t.date:'';
    if(t.source==='calendar'||t.due_time){if(status==='进行中'&&!nextDate)throw new Error('固定日程需要执行日期');}
    const nextDeadline=status==='等待反馈'?follow:t.status==='等待反馈'&&status==='进行中'?null:status==='进行中'&&nextDate!==t.date?resolvedDeadline(t.due_date,nextDate,d):t.due_date;
    const changed=status!==t.status||next!==t.next_action||waiting!==t.waiting_on||follow!==t.follow_up_date||nextDate!==t.date||nextDeadline!==t.due_date;
    if(!content&&!changed)throw new Error('请填写本次进展，或调整下一步与日期');
    if(t.date!==nextDate||(t.date&&t.date<todayKey()&&t.status!==status)){rememberPlan(t);t.sort_order=undefined;}
    if(content)t.progress_logs=[...(t.progress_logs||[]),{id:createId('progress'),content,created_at:stamp(),status,next_action:next,waiting_on:waiting,follow_up_date:follow}];
    t.status=status;t.completed_at=status==='完成'?(t.completed_at||stamp()):null;t.next_action=next;t.waiting_on=waiting;t.follow_up_date=follow;t.due_date=nextDeadline;t.next_follow_up_action='';t.next_follow_up_date=null;t.date=nextDate;if(status==='完成'||t.first_do_date!==nextDate)t.first_do_date=null;
    if(status==='完成'){
      clearProjectNextAction(s,t);
      reconcileCompletedLegacyActions(s.tasks);
    }
  }
  else if(op==='waiting_feedback') {
    const t=find(s.tasks,str(d,'id',true));if(t.is_habit||t.status!=='等待反馈')throw new Error('这条事项已不在等待反馈中，请同步后重试');
    const content=str(d,'content',true), status=choice(d.status,['完成','进行中','等待反馈'],'进行中');
    const next=status==='进行中'?str(d,'next_action',true):status==='等待反馈'?t.next_action||'':'';
    const waiting=status==='等待反馈'?str(d,'waiting_on',true):'';
    const follow=status==='等待反馈'?day(d,'follow_up_date')||null:null;
    const nextDate=status==='进行中'?day(d,'next_date'):(t.source==='calendar'||t.due_time)?t.date:'';
    if(status==='进行中'&&(t.source==='calendar'||t.due_time)&&!nextDate)throw new Error('固定日程需要执行日期');
    if(t.date!==nextDate){rememberPlan(t);t.sort_order=undefined;}
    t.progress_logs=[...(t.progress_logs||[]),{id:createId('progress'),content,created_at:stamp(),status,next_action:next,waiting_on:waiting,follow_up_date:follow}];
    t.status=status;t.completed_at=status==='完成'?stamp():null;t.next_action=next;t.waiting_on=waiting;t.follow_up_date=follow;t.due_date=status==='等待反馈'?follow:null;t.next_follow_up_action='';t.next_follow_up_date=null;t.date=nextDate;
    if(t.first_do_date!==nextDate)t.first_do_date=null;
    if(status==='完成'){
      clearProjectNextAction(s,t);
      reconcileCompletedLegacyActions(s.tasks);
    }
  }
  else if(op==='order') {
    const ids=d.ids;if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw new Error('排序无效');
    ids.forEach((id,i)=>{find(s.tasks,id).sort_order=i;});
  }
  else if(op==='guidance') {
    if(!isDimension(d.dimension_primary))throw new Error('请选择维度');const guide=s.dimension_visions.find(v=>v.dimension===d.dimension_primary)!;
    guide.mission=str(d,'mission');guide.vision=str(d,'vision');guide.values=str(d,'values_text').split('\n').filter(Boolean);guide.principles=str(d,'principles_text').split('\n').filter(Boolean);
  }
  else if(op==='daily_review') {
    const date=day(d,'date',true);const old=s.daily_reviews.find(r=>r.date===date);
    const r:DailyReview={...old,id:old?.id||createId('review'),date,wins:str(d,'wins'),blockers:str(d,'blockers'),needed_resources:str(d,'needed_resources'),adjustment:str(d,'adjustment'),tomorrow_adjustment:str(d,'adjustment'),principle_alignment:str(d,'principle_alignment'),experiment:str(d,'experiment'),energy:choice(d.energy,['高','中','低'],'中'),pressure:old?.pressure||'中',available_time:old?.available_time||'一般',created_at:old?.created_at||stamp(),updated_at:stamp(),task_snapshot:old?.task_snapshot||s.tasks.map(t=>taskAtDate(t,date)).filter((t):t is Task=>!!t).map(t=>({id:t.id,title:t.title,status:t.status}))};
    if(isDimension(d.reflection_dimension))r.reflection_dimension=d.reflection_dimension;
    if(d.create_next===true){const title=str(d,'adjustment',true);let t=r.adjustment_task_id?s.tasks.find(t=>t.id===r.adjustment_task_id):undefined;
      if(t&&t.status!=='完成'){t.title=title;if(t.date!==addDateDays(date,1)){rememberPlan(t);t.date=addDateDays(date,1);}}
      else if(!t){t=makeAction(s,{title,dimension_primary:r.reflection_dimension||'精神',date:addDateDays(date,1)});s.tasks.unshift(t);r.adjustment_task_id=t.id;}
    }
    if(old)Object.assign(old,r);else s.daily_reviews.unshift(r);
  }
  else if(op==='period_review') {
    const kind=choice(d.kind,['week','month'],'week'),period=str(d,'period',true),content=str(d,'content');
    if(kind==='week'?!validDate(period):!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new Error('复盘周期无效');
    const dimension=kind==='month'&&isDimension(d.dimension_primary)?d.dimension_primary:undefined;
    if(kind==='month'&&!dimension)throw new Error('请选择维度');
    const old=s.period_reviews.find(r=>r.kind===kind&&r.period===period&&r.dimension_primary===dimension);
    const entry={id:old?.id||createId('period'),kind,period,dimension_primary:dimension,content,created_at:old?.created_at||stamp(),updated_at:stamp()};
    if(old)Object.assign(old,entry);else s.period_reviews.unshift(entry);
  }
  else throw new Error('操作无效');
  const changedAt=stamp();
  for(const task of s.tasks){
    if(!task.is_habit&&previousTasks.get(task.id)!==JSON.stringify(task))task.activity_events=[...(task.activity_events||[]),{request_id:requestId,changed_at:changedAt,op}];
  }
  s.applied_commands=[...s.applied_commands,requestId].slice(-500);
}

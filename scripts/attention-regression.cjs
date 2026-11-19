const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
process.env.TZ='Europe/Istanbul';
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {attentionBuckets,sortWaitingTasks,waitingDeadline,waitingByDate,completedByDate}=require('../lib/attention.ts');
const date='2026-10-26';
const task=(id,fields={})=>({id,date:'',dimension_primary:'财富',source:'manual',due_time:null,due_date:null,status:'未开始',is_habit:false,...fields});
const tasks=[
  task('waiting-now',{status:'等待反馈',follow_up_date:date,project_id:'project-a'}),
  task('waiting-later',{status:'等待反馈',follow_up_date:'2026-10-28',project_id:'project-a'}),
  task('waiting-overdue',{status:'等待反馈',due_date:'2026-10-25',project_id:'project-b'}),
  task('due-candidate',{due_date:date}),
  task('rescheduled-with-old-deadline',{date:'2026-10-29',due_date:'2026-10-25'}),
  task('scheduled-today',{date,due_date:date}),
  task('overdue-calendar',{source:'calendar',date:'2026-10-25'}),
  task('other-dimension',{dimension_primary:'心智',due_date:date}),
];
const buckets=attentionBuckets(tasks,date,'财富');
assert.deepEqual(buckets.waiting.map(item=>item.id),['waiting-now','waiting-later','waiting-overdue']);
assert.deepEqual(buckets.due.map(item=>item.id),['due-candidate','rescheduled-with-old-deadline','overdue-calendar']);
assert.deepEqual(sortWaitingTasks(buckets.waiting,['财富'],{'project-a':'A','project-b':'B'}).map(item=>item.id),['waiting-overdue','waiting-now','waiting-later'],'urgent projects come first while items in the same project stay together');
assert.equal(waitingDeadline(tasks[2]),'2026-10-25');
const waitingGroups=waitingByDate(buckets.waiting,date);
assert.deepEqual(waitingGroups.due.map(item=>item.id),['waiting-now','waiting-overdue'],'only waits whose date has arrived need attention today');
assert.deepEqual(waitingGroups.later.map(item=>item.id),['waiting-later'],'a future wait stays in the full waiting pool without counting as due today');
assert.deepEqual(waitingByDate([task('undated-wait',{status:'等待反馈'})],date).due.map(item=>item.id),['undated-wait'],'undated waits remain visible for attention rather than silently hidden in future waits');
assert.ok(!buckets.excludedCandidateIds.has('scheduled-today'),'today execution stays in its own list');
assert.ok(buckets.excludedCandidateIds.has('due-candidate'),'a due candidate is shown once, in attention');
const completed=completedByDate([
  task('completed-next-local-day',{status:'完成',date:'2026-10-20',completed_at:'2026-10-26T22:30:00.000Z'}),
  task('completed-day',{status:'完成',date:'2026-10-29',completed_at:'2026-10-26T12:00:00.000Z'}),
  task('completed-no-stamp',{status:'完成',completed_at:null}),
  task('still-open',{status:'未开始',completed_at:'2026-10-26T12:00:00.000Z'}),
]);
assert.deepEqual(completed.map(group=>[group.date,group.tasks.map(item=>item.id)]),[['2026-10-27',['completed-next-local-day']],['2026-10-26',['completed-day']],['',['completed-no-stamp']]],'completion groups use the local check-off day, not the execution date');
console.log('PASS: due and waiting aggregation, dimension filter, and no duplicate execution/candidate rows.');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...rest) { return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, ...rest); };
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);

const { todayKey, addDateDays } = require('../lib/date.ts');
const { dailyReviewReport } = require('../lib/daily-review.ts');
const { projectReviewGroups, preserveReviewOrder } = require('../lib/project-review.ts');
const day = todayKey(), tomorrow = addDateDays(day, 1);
const now = new Date().toISOString();
const yesterday = new Date(Date.now() - 86400000).toISOString();
function task(id, date, extras = {}) { return { id, title: id, date, dimension_primary: '财富', project_id: 'project', is_habit: false, source: 'manual', due_time: null, status: '未开始', created_at: yesterday, estimated_minutes: 20, ...extras }; }
const state = {
  tasks: [
    task('completed', day, { status: '完成', completed_at: now }),
    task('moved', tomorrow, { plan_events: [{ from_date: day, to_date: tomorrow, changed_at: now }], plan_history: [{ date: day, title: 'moved', status: '未开始', changed_at: now }] }),
    task('added', day, { created_at: now, status: '进行中', progress_logs: [{ id: 'log', content: '已联系客户', created_at: now, status: '进行中', next_action: '', waiting_on: '', follow_up_date: null }] }),
    task('already-tomorrow', tomorrow),
    task('candidate', ''),
    task('unplanned-done', '', { status: '完成', completed_at: now }),
  ],
  review_baselines: { [day]: { captured_at: yesterday, tasks: ['completed', 'moved'].map(id => ({ id, title: id, dimension_primary: '财富', project_id: 'project', estimated_minutes: 20 })) } },
};
const report = dailyReviewReport(state, day);
assert.equal(report.counts.planned, 2);
assert.equal(report.counts.added, 2);
assert.equal(report.counts.completed, 2);
assert.equal(report.counts.moved, 1);
assert.equal(report.counts.progressed, 1);
assert.equal(report.rows.length, 4, 'an unscheduled action completed today enters the review, without counting other candidates');
assert.equal(report.rows.find(row => row.id === 'unplanned-done').origin, '临时加入');
assert.equal(report.tomorrowTasks.length, 2);
assert.ok(report.movedTomorrowIds.has('moved'));
assert.ok(!report.movedTomorrowIds.has('already-tomorrow'));
assert.deepEqual(report.candidates.map(item => item.id), ['candidate']);
state.tasks.find(item => item.id === 'unplanned-done').status = '未开始';
state.tasks.find(item => item.id === 'unplanned-done').completed_at = null;
assert.ok(!dailyReviewReport(state, day).rows.some(row => row.id === 'unplanned-done'), 'undoing completion returns an unscheduled action to the candidate pool');
const projectState = {
  dimension_priority_order: ['财富','心智'],
  projects: [{ id: 'project', title: '沥青供应', dimension_primary: '财富', status: '进行中', created_at: yesterday }],
  tasks: [
    task('finished-before-review', '', { status: '完成', completed_at: `${addDateDays(day,-1)}T12:00:00` }),
    task('scheduled-future', addDateDays(day,3)),
    task('expired-plan', addDateDays(day,-2)),
    task('waiting', '', { status: '等待反馈', waiting_on: '客户确认', follow_up_date: tomorrow }),
    task('unplanned', ''),
    task('cancelled', '', { status: '取消' }),
  ],
};
let projectGroup = projectReviewGroups(projectState,day,day,day).find(group => group.project?.id === 'project');
assert.deepEqual([projectGroup.completed.length,projectGroup.scheduled.length,projectGroup.waiting.length,projectGroup.unplanned.length],[1,1,1,2], 'the project retains completed, dated, waiting, undated and expired actions together');
assert.ok(projectGroup.unplanned.some(item=>item.id==='expired-plan'),'an expired execution date needs a new arrangement');
assert.equal(projectGroup.completedInPeriod,0, 'older completion remains visible without counting as completed today');
projectState.tasks.find(item => item.id === 'expired-plan').date = tomorrow;
projectGroup = projectReviewGroups(projectState,day,day,day).find(group => group.project?.id === 'project');
assert.ok(projectGroup.scheduled.some(item => item.id === 'expired-plan') && !projectGroup.unplanned.some(item => item.id === 'expired-plan'), 'arranging an expired action moves the same task into the project scheduled section');
projectState.tasks.find(item => item.id === 'scheduled-future').date = addDateDays(day,9);
projectGroup = projectReviewGroups(projectState,day,day,day).find(group => group.project?.id === 'project');
assert.ok(projectGroup.scheduled.some(item => item.id === 'scheduled-future'), 'rescheduling does not remove an action from its project review');
const stableState={...projectState,projects:[...projectState.projects,{id:'new-project',title:'新项目',dimension_primary:'财富',status:'进行中',created_at:now}],tasks:[...projectState.tasks,task('new-action','',{project_id:'new-project',created_at:now})]};
const originalOrder=projectReviewGroups(stableState,day,day,day).map(group=>group.key);
assert.deepEqual(originalOrder,['new-project','project'],'a project changed in the review period ranks before an inactive project');
stableState.tasks.find(item=>item.id==='new-action').status='取消';
assert.deepEqual(projectReviewGroups(stableState,day,day,day).map(group=>group.key),originalOrder,'canceling an action does not reorder projects');
stableState.tasks.push(task('older-undated','',{created_at:'2026-01-01T00:00:00Z'}),task('new-expired',addDateDays(day,-5),{created_at:now}));
const pending=projectReviewGroups(stableState,day,day,day).find(group=>group.key==='project').unplanned;
assert.equal(pending[0].id,'older-undated','pending actions use creation time rather than expired execution dates');
stableState.tasks.push(task('tomorrow-normal',tomorrow,{created_at:'2026-01-01T00:00:00Z'}),task('tomorrow-priority',tomorrow,{created_at:now,first_do_date:tomorrow}));
const tomorrowRows=projectReviewGroups(stableState,day,day,day).find(group=>group.key==='project').scheduled.filter(item=>item.date===tomorrow);
assert.equal(tomorrowRows[0].id,'tomorrow-priority','priority actions appear before ordinary actions on the same execution date');
stableState.tasks.find(item=>item.id==='tomorrow-priority').first_do_date=null;
const unpinnedRows=projectReviewGroups(stableState,day,day,day).find(group=>group.key==='project').scheduled.filter(item=>item.date===tomorrow);
assert.equal(unpinnedRows[0].id,'tomorrow-normal','removing priority restores creation order within the date');
const rankProjects=['busy','changed','due','near','pending','far','farther','history'].map(id=>({id,title:id,dimension_primary:'财富',status:'进行中',created_at:yesterday}));
const rankedState={dimension_priority_order:['财富'],projects:rankProjects,tasks:[
  task('busy-action',addDateDays(day,30),{project_id:'busy',activity_events:[{request_id:'one',changed_at:now,op:'schedule'},{request_id:'two',changed_at:now,op:'save'}],plan_events:[{from_date:day,to_date:addDateDays(day,30),changed_at:now}],progress_logs:[{created_at:now}]}),
  task('changed-action','',{project_id:'changed',progress_logs:[{created_at:now}],plan_events:[{changed_at:now}]}),
  task('due-action',day,{project_id:'due'}),task('near-action',tomorrow,{project_id:'near'}),
  task('pending-action','',{project_id:'pending'}),task('far-action',addDateDays(day,30),{project_id:'far'}),
  task('farther-action',addDateDays(day,60),{project_id:'farther'}),task('historic-action','',{project_id:'history',status:'完成',completed_at:yesterday})
]};
let rankedGroups=projectReviewGroups(rankedState,day,day,day);
assert.deepEqual(rankedGroups.map(group=>group.key),['busy','changed','due','near','pending','far','farther','history'],'activity first, then due, near, unplanned, distant and history-only projects');
assert.equal(rankedGroups[0].activityCount,2,'canonical commands are counted once even if histories overlap');
assert.equal(rankedGroups[1].activityCount,1,'overlapping legacy histories do not inflate activity');
rankedState.tasks.reverse();
assert.deepEqual(projectReviewGroups(rankedState,day,day,day).map(group=>group.key),rankedGroups.map(group=>group.key),'storage order does not change review ordering');
assert.equal(projectReviewGroups(rankedState,addDateDays(day,-3),addDateDays(day,-2),day).find(group=>group.key==='busy').activityCount,0,'activity ranking is scoped to the selected review period');
const entryKeys=rankedGroups.map(group=>group.key);
rankedState.tasks.find(item=>item.id==='pending-action').activity_events=Array.from({length:4},(_,index)=>({request_id:`edited-${index}`,changed_at:now,op:'schedule'}));
const afterEdits=projectReviewGroups(rankedState,day,day,day);
assert.equal(afterEdits[0].key,'pending','the next entry ranks the newly active project first');
const kept=preserveReviewOrder(afterEdits,entryKeys);
assert.deepEqual(kept.map(group=>group.key),entryKeys,'project order stays frozen during review edits');
assert.equal(kept.find(group=>group.key==='pending').activityCount,4,'live counts update without moving the project');
rankedState.projects.push({id:'added-in-review',title:'新增项目',dimension_primary:'财富',status:'进行中',created_at:now});
assert.equal(preserveReviewOrder(projectReviewGroups(rankedState,day,day,day),entryKeys).at(-1).key,'added-in-review','a new project is appended without displacing existing projects');
console.log('PASS: daily baseline, project activity ranking, attention dates, completion, postponement and tomorrow commitments.');

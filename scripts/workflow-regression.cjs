const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...rest) { return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, ...rest); };
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-workflow-'));
process.env.LIFE_DATA_DIR = directory;
const store = require('../lib/store.ts');
const { todayKey, addDateDays } = require('../lib/date.ts');
const { sortDailyTasks, taskCategory, taskAtDate } = require('../lib/task-workflow.ts');
const { isOpen } = require('../lib/planning.ts');
const { validateBackup } = require('../lib/validation.ts');
const order = require('../app/api/tasks/order/route.ts');
const progress = require('../app/api/tasks/[id]/progress/route.ts');
const taskRoute = require('../app/api/tasks/[id]/route.ts');
const today = todayKey(), yesterday = addDateDays(today, -1), now = new Date().toISOString();
const task = (id, updates = {}) => ({ id, title: id, description: '', date: today, dimension_primary: '心智', dimension_secondary: null, type: '临时任务', priority: 'B', status: '未开始', goal_id: null, project_id: null, habit_id: null, is_habit: false, is_must_today: false, due_date: null, due_time: null, reminder_time: null, calendar_sync_status: 'none', estimated_minutes: 30, result_note: '', checklist: [], created_at: now, completed_at: null, postponed_count: 0, is_focus: false, focus_order: null, source: 'manual', ...updates });
const request = body => new Request('http://localhost/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const context = id => ({ params: Promise.resolve({ id }) });
async function run() {
  let state = await store.readState();
  state.tasks = [task('low', { priority: 'C' }), task('high', { priority: 'A' }), task('middle')];
  assert.deepEqual(sortDailyTasks(state.tasks, state).map(t => t.id), ['high', 'middle', 'low']);
  await store.writeState(state);
  assert.equal((await order.PATCH(request({ date: today, ids: ['low', 'high', 'middle'] }))).status, 200);
  state = await store.readState();
  assert.deepEqual(sortDailyTasks(state.tasks, state).map(t => t.id), ['low', 'high', 'middle'], 'manual order survives a new read');
  const before = fs.readFileSync(path.join(directory, 'app-state.json'), 'utf8');
  for (const ids of [['low', 'low', 'high'], ['low', 'high'], ['low', 'high', 'foreign']]) {
    assert.equal((await order.PATCH(request({ date: today, ids }))).status, 400);
    assert.equal(fs.readFileSync(path.join(directory, 'app-state.json'), 'utf8'), before, 'invalid/stale orders must not partially save');
  }
  await order.PATCH(request({ date: today, reset: true }));
  state = await store.readState();
  assert.deepEqual(sortDailyTasks(state.tasks, state).map(t => t.id), ['high', 'middle', 'low']);
  for (const extra of [{ goal_id: 'goal' }, { project_id: 'project' }, { source: 'calendar' }, { source: 'goal_week' }, { source: 'planned' }]) assert.equal(taskCategory(task('planned', extra)), '计划内');
  assert.equal(taskCategory(task('extra', { goal_id: 'goal', origin: 'ad_hoc' })), '临时新增', 'linking a newly added task does not change its origin');
  assert.equal(taskCategory(task('extra')), '临时新增');
  await store.updateState(s => { s.tasks[0].result_note = '原有备注'; });
  for (const data of [
    { content: '发出报价', status: '等待反馈', waiting_on: '客户确认规格', next_action: '收到反馈后修订', follow_up_date: addDateDays(today, 1) },
    { content: '收到反馈，需要修改数量', status: '进行中', next_action: '更新报价' },
    { content: '更新报价后继续等待确认', status: '等待反馈', waiting_on: '最终确认' },
  ]) {
    assert.equal((await progress.POST(request(data), context('low'))).status, 200);
    const current = (await store.readState()).tasks.find(t => t.id === 'low');
    assert.ok(isOpen(current));
    assert.equal(current.completed_at, null);
  }
  state = await store.readState();
  assert.equal(state.tasks.find(t => t.id === 'low').progress_logs.length, 3);
  assert.equal(state.tasks.find(t => t.id === 'low').result_note, '原有备注');
  assert.equal(state.tasks.length, 3, 'progress must not clone tasks');
  assert.equal((await progress.POST(request({ content: '最终确认，事项结束', status: '完成' }), context('low'))).status, 200);
  let closed = (await store.readState()).tasks.find(t => t.id === 'low');
  assert.equal(closed.status, '完成'); assert.ok(closed.completed_at); assert.equal(closed.progress_logs.length, 4);
  for (const bad of [{ content: '', status: '进行中' }, { content: 'test', status: '错误' }, { content: 'test', status: '进行中', follow_up_date: 'invalid' }]) assert.equal((await progress.POST(request(bad), context('low'))).status, 400);
  await taskRoute.PATCH(request({ status: '进行中' }), context('low'));
  assert.equal((await store.readState()).tasks.find(t => t.id === 'low').progress_logs.length, 4, 'reopening retains progress');

  state = await store.readState();
  state.tasks = [
    task('started', { date: yesterday, status: '进行中', due_date: yesterday, source: 'goal_week', goal_id: 'goal', sort_order: 0, progress_logs: closed.progress_logs }),
    task('waiting', { date: yesterday, status: '等待反馈', waiting_on: '客户反馈', next_action: '继续沟通' }),
    task('idle', { date: addDateDays(today, -5) }),
    task('old-postponed', { date: yesterday, status: '延期' }),
    task('done', { date: yesterday, status: '完成' }),
    task('cancelled', { date: yesterday, status: '取消' }),
    task('unscheduled', { date: '' }),
    task('future', { date: addDateDays(today, 2) }),
    task('habit', { date: yesterday, is_habit: true, source: 'habit' }),
  ];
  await store.writeState(state);
  await store.ensureTodayHabitTasks();
  const rolled = await store.readState();
  for (const id of ['started', 'waiting', 'idle', 'old-postponed']) assert.equal(rolled.tasks.find(t => t.id === id).date, state.tasks.find(t => t.id === id).date, 'unfinished actions wait for an explicit new date');
  assert.equal(rolled.tasks.length, state.tasks.length);
  assert.equal(rolled.tasks.find(t => t.id === 'started').due_date, yesterday, 'planning changes must preserve the real deadline');
  assert.equal(rolled.tasks.find(t => t.id === 'started').progress_logs.length, 4);
  assert.equal(rolled.tasks.find(t => t.id === 'started').sort_order, 0);
  assert.equal(rolled.tasks.find(t => t.id === 'waiting').status, '等待反馈');
  for (const id of ['done', 'cancelled']) assert.equal(rolled.tasks.find(t => t.id === id).date, yesterday);
  assert.equal(rolled.tasks.find(t => t.id === 'unscheduled').date, '');
  assert.equal(rolled.tasks.find(t => t.id === 'future').date, addDateDays(today, 2));
  assert.equal(rolled.tasks.find(t => t.id === 'habit').status, '未记录');
  const historic = taskAtDate(rolled.tasks.find(t => t.id === 'waiting'), yesterday);
  assert.equal(historic.status, '等待反馈'); assert.equal(historic.date, yesterday);
  await taskRoute.PATCH(request({ status: '完成' }), context('waiting'));
  assert.equal(taskAtDate((await store.readState()).tasks.find(t => t.id === 'waiting'), yesterday).status, '等待反馈', 'later completion must not rewrite prior day state');
  const unchanged = fs.readFileSync(path.join(directory, 'app-state.json'), 'utf8');
  const mtime = fs.statSync(path.join(directory, 'app-state.json')).mtimeMs;
  await store.ensureTodayHabitTasks();
  assert.equal(fs.readFileSync(path.join(directory, 'app-state.json'), 'utf8'), unchanged);
  assert.equal(fs.statSync(path.join(directory, 'app-state.json')).mtimeMs, mtime);
  validateBackup(await store.readState());
  await store.restoreWithSnapshot(await store.readState());
  assert.equal((await store.readState()).tasks.find(t => t.id === 'started').progress_logs.length, 4, 'backup restore retains the progress history');
  console.log('PASS: importance/manual ordering/reset/stale writes, origins, waiting/progress/closure/reopen, explicit replanning, deadlines/history and backup compatibility.');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(directory, { recursive: true, force: true }));

// One-time, syntax-aware mechanical extraction of the original page modules.
import fs from 'node:fs';
import ts from 'typescript';
const path = 'app/page.tsx';
let source = fs.readFileSync(path, 'utf8');
source = source.replaceAll('await fetch(', 'await apiFetch(');
source = source.replace('let today = todayKey();', '');
// Replace only identifier references, never literal tab names such as "today".
let ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const edits = [];
function walk(node) { if (ts.isIdentifier(node) && node.text === 'today') edits.push([node.getStart(ast), node.end, 'todayKey()']); ts.forEachChild(node, walk); }
walk(ast);
for (const [start, end, text] of edits.sort((a,b) => b[0]-a[0])) source = source.slice(0,start) + text + source.slice(end);
source = source.replace('return task.date === current || (!task.date && task.due_date === current);', 'return task.date === current;');
source = source.replaceAll('due_date: targetDate,', 'due_date: null,').replaceAll('due_date: todayKey(),', 'due_date: null,').replaceAll('due_date: tomorrow,', 'due_date: null,');
source = source.replace('onPatch(task.id, { date: todayKey(), due_date: null,', 'onPatch(task.id, { date: todayKey(),');
source = source.replace('onPatch(task.id, { date: "", due_date: null,', 'onPatch(task.id, { date: "",');
source = source.replace('body: JSON.stringify({ date: tomorrow, due_date: null,', 'body: JSON.stringify({ date: tomorrow,');
source = source.replaceAll('due_date: date,', 'due_date: null,');
// A PATCH which reschedules never changes the deadline. New tasks still have
// an explicit null deadline until the user provides a real one.
source = source.replaceAll(/(body: JSON\.stringify\(\{\s*date,)\s*due_date: null,/g, '$1');
source = source.replace(/(status: "延期",\s*date,)\s*due_date: null,/, '$1');
source = source.replace(', due_date: addDaysKey(taskRangeDate(task) || todayKey(), 1)', '');
source = source.replaceAll('<option>指定星期</option>', '<option>指定星期</option><option>每周自由3次</option>');
source = source.replace('今日打卡已完成。', '今天没有待安排的习惯。');
source = source.replace('blockers: "",\n    needed_resources: latest?', 'blockers: latest?.blockers || "",\n    needed_resources: latest?');
source = source.replaceAll('/3</strong>', '/{state.big_three.length}</strong>');
source = source.replaceAll('`${state.big_three.filter((task) => task.status === "完成").length}/3`', '`${state.big_three.filter((task) => task.status === "完成").length}/${state.big_three.length}`');
source = source.replaceAll('"容量正常"', '(dailyCapacity(state).unknown ? "仍有待估时" : "容量内")');
source = source.replace('const normalized = normalizeBackupState(parsed);', 'const normalized = parsed;');
source = source.replaceAll('task.status !== "完成" && task.status !== "取消" && !postponedTodayIds.has(task.id)', '!isHabit(task) && isOpen(task) && !postponedTodayIds.has(task.id)');
source = source.replace('const weekUnfinished = weekTasks.filter((task) => task.status !== "完成");', 'const weekUnfinished = weekTasks.filter((task) => !isHabit(task) && isOpen(task));');
source = source.replace('return task.status !== "完成" && task.status !== "取消";', 'return !isHabit(task) && isOpen(task);');
source = source.replace(/\.sort\(\(a, b\) => \{\s*const score = \(task: Task\) =>[\s\S]*?return score\(b\) - score\(a\);\s*\}\)/, '.sort((a, b) => recommendation(b, state).score - recommendation(a, state).score)');
// Collapse the previous day's cleanup by default.
source = source.replace('<section className="panel stale-panel">', '<details className="panel stale-panel"><summary>历史未完成（展开处理）</summary>');
const staleStart = source.indexOf('<details className="panel stale-panel">');
if (staleStart >= 0) { const end = source.indexOf('</section>', staleStart); source = source.slice(0,end) + '</details>' + source.slice(end + '</section>'.length); }
// Keep range boundaries in the date domain module.
source = source.replace(/function rangeBounds\(range: OverviewRange\) \{[\s\S]*?\n\}/, 'function rangeBounds(range: OverviewRange) { return dateBounds(range); }');
ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const boundaries = [['shared','TaskChecklist'], ['tasks','TodayPage'], ['today','LifeCorePanel'], ['direction','ReviewUnfinishedTask'], ['review-task','toggleWeekday'], ['habits','DirectionPage'], ['direction','OverviewPage'], ['overview','Reviews'], ['reviews','AiSettingsPanel'], ['settings','Home']];
let groupIndex = 0;
const groups = new Map();
const owners = new Map();
const imports = [];
function names(node) {
  if (ts.isVariableStatement(node)) return node.declarationList.declarations.map((d) => d.name.getText(ast));
  return node.name ? [node.name.getText(ast)] : [];
}
for (const node of ast.statements) {
  if (ts.isImportDeclaration(node)) { imports.push(node.getText(ast).replace('"./components/planning-panels"','"@/app/components/planning-panels"')); continue; }
  if (ts.isExpressionStatement(node) && node.getText(ast).includes('use client')) continue;
  const ns = names(node);
  while (groupIndex < boundaries.length && ns.includes(boundaries[groupIndex][1])) groupIndex++;
  const group = groupIndex < boundaries.length ? boundaries[groupIndex][0] : 'home';
  let text = node.getText(ast);
  if (!text.startsWith('export')) text = 'export ' + text;
  if (!groups.has(group)) groups.set(group, []);
  groups.get(group).push(text);
  ns.forEach((name) => owners.set(name, group));
}
fs.mkdirSync('app/components', { recursive: true });
for (const [group, nodes] of groups) {
  const body = nodes.join('\n\n');
  const used = new Set();
  const parsed = ts.createSourceFile('part.tsx', body, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function collect(n) { if (ts.isIdentifier(n)) used.add(n.text); ts.forEachChild(n, collect); }
  collect(parsed);
  const dependencies = new Map();
  for (const [name, owner] of owners) if (owner !== group && used.has(name)) {
    if (!dependencies.has(owner)) dependencies.set(owner, []);
    dependencies.get(owner).push(name);
  }
  const extra = [...dependencies].map(([owner, list]) => `import { ${list.join(', ')} } from "@/app/components/${owner}";`);
  const text = '"use client";\n\n' + imports.join('\n') + '\n' + extra.join('\n') + '\n\n' + body + '\n';
  fs.writeFileSync(group === 'home' ? path : `app/components/${group}.tsx`, text);
}
console.log('Extracted:', [...groups.keys()].join(', '));

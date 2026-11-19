// Import an XMind map into the isolated life-system test workspace.
const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const file = process.argv[2];
const baseUrl = process.env.LIFE_IMPORT_URL || 'http://127.0.0.1:3040';
if (!file) throw new Error('用法：node scripts/import-xmind.cjs <xmind 文件>');
if (!existsSync(file)) throw new Error(`文件不存在：${file}`);

const dimensionByTitle = new Map([
  ['精神维度', '精神'], ['身体维度', '身体'], ['财富维度', '财富'],
  ['心智维度', '心智'], ['感受维度', '感受'], ['关系维度', '关系'],
]);
const areaTitles = new Set([
  '沥青业务', '防护业务', '钢材业务', '轮胎业务', '防护栏标志牌业务',
  '打卡多领国', 'ChatGPT 口语练习', '得到', '写作', '外贸研究',
  '吉他弹唱', '父母', '伴侣', '孩子', '朋友', '饮食', '睡眠', '运动',
]);
const containerTitles = new Set(['供应链', '询价', '报价', '合同', '发货', '收款', '维护', '其他事项']);
const projectTitles = new Set([
  '马岛CSCEC 500吨 40/50供应', 'CHICO Malawi  620吨 50/70供应', '喀麦隆中交二公局 1000吨 50/70供应',
  '客户管理系统优化', '整理分类微信通信录', '处理吉布提520吨', '何总亲戚常总合作项目', '坦桑武夷项目',
  '约旦出差', '土耳其出差', '江总合作', '处理积累的素材',
]);

function children(node) { return node.children?.attached || []; }
function descendants(node) {
  return children(node).flatMap(child => [child, ...descendants(child)]);
}
function leafTitles(node) {
  const kids = children(node);
  return kids.length ? kids.flatMap(leafTitles) : [node.title.trim()];
}
function habitSpec(node, parentTitle) {
  const title = node.title.trim();
  const dailyParent = parentTitle === '打卡多领国' || parentTitle === 'ChatGPT 口语练习';
  const daily = /^每日/.test(title) || title.includes('每天') || dailyParent;
  const weekly = /^每周/.test(title);
  if (!daily && !weekly) return null;
  const details = children(node).length ? leafTitles(node).join('；') : '';
  return {
    title: details ? `${title} · ${details}` : title,
    frequency: daily ? '每日' : '每周1次',
  };
}
function requestId(node, kind) { return `xmind-${node.id}-${kind}`; }

async function getState() {
  const response = await fetch(`${baseUrl}/api/state`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`无法连接测试系统（${response.status}）`);
  return response.json();
}

let state;
const counts = { '板块': 0, '项目': 0, '行动': 0, '习惯': 0, '跳过': 0 };
async function command(node, kind, data) {
  const response = await fetch(`${baseUrl}/api/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      op: 'save',
      data: { kind, ...data },
      revision: state.revision || 0,
      request_id: requestId(node, kind),
    }),
  });
  const result = await response.json();
  if (response.status === 409) {
    state = await getState();
    return command(node, kind, data);
  }
  if (!response.ok) throw new Error(`${data.title || node.title}：${result.message || '导入失败'}`);
  state = result;
  counts[kind] += 1;
}

function findArea(title, dimension) {
  return (state.areas || []).find(item => item.title === title && item.dimension_primary === dimension);
}
function findProject(title, dimension, areaId) {
  return state.projects.find(item => item.title === title && item.dimension_primary === dimension && (item.area_id || '') === (areaId || ''));
}
function findTask(node, dimension, areaId, projectId) {
  return state.tasks.find(item => item.title === node.title.trim() && item.dimension_primary === dimension &&
    (item.area_id || '') === (areaId || '') && (item.project_id || '') === (projectId || ''));
}
function findHabit(title, dimension, areaId, projectId) {
  return state.habits.find(item => item.title === title && item.dimension_primary === dimension &&
    (item.area_id || '') === (areaId || '') && (item.project_id || '') === (projectId || ''));
}

async function ensureArea(node, dimension) {
  let item = findArea(node.title.trim(), dimension);
  if (item) { counts['跳过'] += 1; return item; }
  await command(node, '板块', { title: node.title.trim(), dimension_primary: dimension });
  item = findArea(node.title.trim(), dimension);
  if (!item) throw new Error(`板块导入后未找到：${node.title}`);
  return item;
}
async function ensureProject(node, dimension, areaId, trail) {
  let item = findProject(node.title.trim(), dimension, areaId);
  if (item) { counts['跳过'] += 1; return item; }
  await command(node, '项目', {
    title: node.title.trim(), dimension_primary: dimension, area_id: areaId || '',
    description: '', next_action: '', status: '进行中',
  });
  item = findProject(node.title.trim(), dimension, areaId);
  if (!item) throw new Error(`项目导入后未找到：${node.title}`);
  return item;
}
async function ensureAction(node, dimension, areaId, projectId, trail) {
  if (findTask(node, dimension, areaId, projectId)) { counts['跳过'] += 1; return; }
  await command(node, '行动', {
    title: node.title.trim(), dimension_primary: dimension, area_id: areaId || '', project_id: projectId || '',
    description: '', date: '', due_date: '', priority: dimension === '财富' ? 'A' : 'B',
  });
}
async function ensureHabit(node, spec, dimension, areaId, projectId) {
  if (findHabit(spec.title, dimension, areaId, projectId)) { counts['跳过'] += 1; return; }
  await command(node, '习惯', {
    title: spec.title, dimension_primary: dimension, area_id: areaId || '', project_id: projectId || '',
    frequency: spec.frequency, weekdays: [], estimated_minutes: 0, active: true,
  });
}

async function importProjectDescendants(node, dimension, areaId, projectId, trail) {
  for (const child of children(node)) {
    const nextTrail = [...trail, child.title.trim()];
    const habit = habitSpec(child, node.title.trim());
    if (habit) await ensureHabit(child, habit, dimension, areaId, projectId);
    else {
      await ensureAction(child, dimension, areaId, projectId, nextTrail);
      await importProjectDescendants(child, dimension, areaId, projectId, nextTrail);
    }
  }
}
async function importAreaChildren(areaNode, dimension, areaId, trail) {
  for (const child of children(areaNode)) {
    const nextTrail = [...trail, child.title.trim()];
    await importStructuredNode(child, dimension, areaId, '', nextTrail, areaNode.title.trim());
  }
}
async function importStructuredNode(node, dimension, areaId, projectId, trail, parentTitle) {
  const title = node.title.trim();
  const habit = habitSpec(node, parentTitle);
  if (habit) return ensureHabit(node, habit, dimension, areaId, projectId);
  if (!projectId && projectTitles.has(title)) {
    const project = await ensureProject(node, dimension, areaId, trail);
    return importProjectDescendants(node, dimension, areaId, project.id, trail);
  }
  if (!projectId && containerTitles.has(title)) {
    if (!children(node).length) return ensureAction(node, dimension, areaId, '', trail);
    for (const child of children(node)) {
      await importStructuredNode(child, dimension, areaId, '', [...trail, child.title.trim()], title);
    }
    return;
  }
  if (!projectId && children(node).length) {
    const project = await ensureProject(node, dimension, areaId, trail);
    return importProjectDescendants(node, dimension, areaId, project.id, trail);
  }
  await ensureAction(node, dimension, areaId, projectId, trail);
  for (const child of children(node)) {
    await importStructuredNode(child, dimension, areaId, projectId, [...trail, child.title.trim()], title);
  }
}

async function main() {
  const raw = execFileSync('unzip', ['-p', path.resolve(file), 'content.json'], { encoding: 'utf8', maxBuffer: 5_000_000 });
  const sheets = JSON.parse(raw);
  const root = sheets[0]?.rootTopic;
  if (!root) throw new Error('这份 XMind 没有可读的主题树');
  state = await getState();
  if (!state.test_mode && process.env.XMIND_ALLOW_FORMAL !== '1') {
    throw new Error('安全停止：当前不是独立测试环境。');
  }
  for (const dimensionNode of children(root)) {
    const dimension = dimensionByTitle.get(dimensionNode.title.trim());
    if (!dimension) continue;
    for (const node of children(dimensionNode)) {
      const trail = [root.title.trim(), dimensionNode.title.trim(), node.title.trim()];
      if (areaTitles.has(node.title.trim())) {
        const area = await ensureArea(node, dimension);
        await importAreaChildren(node, dimension, area.id, trail);
      } else {
        const habit = habitSpec(node, dimensionNode.title.trim());
        if (habit) await ensureHabit(node, habit, dimension, '', '');
        else if (projectTitles.has(node.title.trim()) || children(node).length) {
          const project = await ensureProject(node, dimension, '', trail);
          await importProjectDescendants(node, dimension, '', project.id, trail);
        } else await ensureAction(node, dimension, '', '', trail);
      }
    }
  }
  state = await getState();
  console.log(JSON.stringify({
    source: path.resolve(file), imported: counts,
    totals: { areas: state.areas.length, projects: state.projects.length, tasks: state.tasks.length, habits: state.habits.length },
    revision: state.revision,
  }, null, 2));
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });

import type { Task } from './types';

// An older progress flow created a second task with the same text as the
// original task's next step. Match the creation event, not just the title:
// unrelated actions in the same project can legitimately have similar names.
function isLegacySuccessor(parent: Task, successor: Task) {
  if (!parent.project_id || parent.project_id !== successor.project_id || parent.id === successor.id) return false;
  if (parent.dimension_primary !== successor.dimension_primary || parent.next_action?.trim() !== successor.title.trim()) return false;
  const created = Date.parse(successor.created_at);
  return Number.isFinite(created) && Boolean(parent.progress_logs?.some(log =>
    log.next_action?.trim() === successor.title.trim() &&
    Number.isFinite(Date.parse(log.created_at)) &&
    Math.abs(Date.parse(log.created_at) - created) <= 5000
  ));
}

export function reconcileCompletedLegacyActions(tasks: Task[]) {
  const changed: string[] = [];
  for (const parent of tasks) {
    if (!parent.next_action || ['完成', '取消'].includes(parent.status)) continue;
    const successor = tasks.find(task => task.status === '完成' && isLegacySuccessor(parent, task));
    if (!successor) continue;
    parent.next_action = '';
    // The old plan was for the separately created action. Keep the original
    // item open for a fresh decision, without silently claiming it is complete.
    if (parent.date && !parent.due_time && parent.source !== 'calendar' && parent.date >= successor.date) {
      parent.plan_history = [...(parent.plan_history || []), {
        date: parent.date, title: parent.title, status: parent.status, changed_at: new Date().toISOString(),
      }];
      parent.date = '';
      parent.sort_order = undefined;
      parent.first_do_date = null;
    }
    changed.push(parent.id);
  }
  return changed;
}

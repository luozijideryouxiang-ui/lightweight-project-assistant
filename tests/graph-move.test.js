import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moveTaskAcrossLists } from '../graph-move.js';

function responseError(message, statusCode) {
  const error = new Error(message);
  if (statusCode) error.statusCode = statusCode;
  error.definite = Boolean(statusCode && statusCode >= 400 && statusCode < 500);
  return error;
}

function fixture(options = {}) {
  const calls = [];
  const source = {
    id: 'task-1', title: '带资料任务', body: { contentType: 'text', content: '正文' },
    importance: 'high', status: 'inProgress', categories: ['项目'],
    startDateTime: { dateTime: '2026-09-12T09:00:00', timeZone: 'Asia/Shanghai' },
    dueDateTime: { dateTime: '2026-09-12T18:00:00', timeZone: 'Asia/Shanghai' },
    reminderDateTime: { dateTime: '2026-09-12T08:30:00', timeZone: 'Asia/Shanghai' },
    isReminderOn: true,
  };
  const graphRequest = async (path, init = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ path, method, body });
    const sourceRoot = '/me/todo/lists/source/tasks/task-1';
    const targetRoot = '/me/todo/lists/target/tasks';
    if (path === sourceRoot && method === 'GET') {
      if (options.sourceMissingAfterDelete && calls.some(call => call.path === sourceRoot && call.method === 'DELETE')) throw responseError('missing', 404);
      return structuredClone(source);
    }
    if (path === `${sourceRoot}/checklistItems`) return { value: [{ id: 'c1', displayName: '步骤一', isChecked: true }] };
    if (path === `${sourceRoot}/linkedResources`) return { value: [{ id: 'l1', webUrl: 'https://example.com', applicationName: 'Example', displayName: '资料', externalId: 'x1' }] };
    if (path === `${sourceRoot}/attachments`) return { value: [{ id: 'a1', name: 'a.txt', size: options.oversized ? 3 * 1024 * 1024 : 12, contentType: 'text/plain' }] };
    if (path === `${sourceRoot}/attachments/a1`) return { id: 'a1', name: 'a.txt', size: 12, contentType: 'text/plain', contentBytes: 'aGVsbG8=' };
    if (path === `${sourceRoot}/extensions`) return { value: [{ id: 'com.example.meta', extensionName: 'com.example.meta', '@odata.type': '#microsoft.graph.openTypeExtension', label: 'keep-me' }] };
    if (path === targetRoot && method === 'POST') return { id: 'moved-1', ...body };
    if (path === `${targetRoot}/moved-1/checklistItems` && method === 'POST') {
      if (options.failChecklistCopy) throw responseError('copy failed', 400);
      return { id: 'new-c1', ...body };
    }
    if (path.startsWith(`${targetRoot}/moved-1/`) && method === 'POST') return { id: 'created-child', ...body };
    if (path === `${targetRoot}/moved-1` && method === 'DELETE') return null;
    if (path === sourceRoot && method === 'DELETE') {
      if (options.failSourceDelete) throw responseError('timeout');
      return null;
    }
    throw new Error(`unexpected ${method} ${path}`);
  };
  return { calls, graphRequest };
}

test('cross-list move preserves task fields and supported relationships before deleting source', async () => {
  const { calls, graphRequest } = fixture();
  const result = await moveTaskAcrossLists({ graphRequest, fromListId: 'source', taskId: 'task-1', targetListId: 'target', targetListName: '目标' });
  assert.equal(result.warning, '');
  const taskCreate = calls.find(call => call.path === '/me/todo/lists/target/tasks' && call.method === 'POST');
  assert.deepEqual(taskCreate.body.startDateTime, { dateTime: '2026-09-12T09:00:00', timeZone: 'Asia/Shanghai' });
  assert.deepEqual(taskCreate.body.reminderDateTime, { dateTime: '2026-09-12T08:30:00', timeZone: 'Asia/Shanghai' });
  assert.ok(calls.some(call => call.path.endsWith('/checklistItems') && call.method === 'POST'));
  assert.ok(calls.some(call => call.path.endsWith('/linkedResources') && call.method === 'POST'));
  assert.ok(calls.some(call => call.path.endsWith('/extensions') && call.method === 'POST' && call.body.label === 'keep-me'));
  assert.ok(calls.some(call => call.path.endsWith('/attachments') && call.method === 'POST' && call.body.contentBytes === 'aGVsbG8='));
  const sourceDeleteIndex = calls.findIndex(call => call.path === '/me/todo/lists/source/tasks/task-1' && call.method === 'DELETE');
  const lastChildCopyIndex = Math.max(...calls.map((call, index) => call.method === 'POST' && call.path.includes('/moved-1/') ? index : -1));
  assert.ok(sourceDeleteIndex > lastChildCopyIndex, 'source must only be deleted after all child data is copied');
});

test('cross-list move rolls back incomplete target copy and leaves source retry-safe', async () => {
  const { calls, graphRequest } = fixture({ failChecklistCopy: true });
  await assert.rejects(
    () => moveTaskAcrossLists({ graphRequest, fromListId: 'source', taskId: 'task-1', targetListId: 'target', targetListName: '目标' }),
    error => error.definite === true && /已回滚/.test(error.message),
  );
  assert.ok(calls.some(call => call.path === '/me/todo/lists/target/tasks/moved-1' && call.method === 'DELETE'));
  assert.equal(calls.some(call => call.path === '/me/todo/lists/source/tasks/task-1' && call.method === 'DELETE'), false);
});

test('cross-list move refuses large attachments before creating any target copy', async () => {
  const { calls, graphRequest } = fixture({ oversized: true });
  await assert.rejects(
    () => moveTaskAcrossLists({ graphRequest, fromListId: 'source', taskId: 'task-1', targetListId: 'target', targetListName: '目标' }),
    /3 MB/,
  );
  assert.equal(calls.some(call => call.path === '/me/todo/lists/target/tasks' && call.method === 'POST'), false);
});

test('cross-list move reports a duplicate only when failed source deletion is confirmed', async () => {
  const { graphRequest } = fixture({ failSourceDelete: true });
  const result = await moveTaskAcrossLists({ graphRequest, fromListId: 'source', taskId: 'task-1', targetListId: 'target', targetListName: '目标' });
  assert.match(result.warning, /原清单.*仍存在/);

  const missing = fixture({ failSourceDelete: true, sourceMissingAfterDelete: true });
  const reconciled = await moveTaskAcrossLists({ graphRequest: missing.graphRequest, fromListId: 'source', taskId: 'task-1', targetListId: 'target', targetListName: '目标' });
  assert.equal(reconciled.warning, '');
});

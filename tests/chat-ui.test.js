import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const workspace = { lists: [{ id: 'list-a', displayName: '测试清单' }, { id: 'list-b', displayName: '另一清单' }], tasksByList: {} };

function chatHarness(replies = [], storage = new Map()) {
  const calls = [];
  const window = {
    addEventListener() {},
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  };
  const document = { readyState: 'loading', addEventListener() {}, getElementById() { return null; }, querySelector() { return null; } };
  // Test the existing controller in isolation; production code needs no test exports.
  const instrumented = source.replace(/\}\)\(\);\s*$/, 'window.chat = { appState, selectAiConversation, saveAiConversation, savePreferences, runAiCommand, applyAiPreview, renderAiView, renderAiConfirmation, renderAuth, normalizeAuth, renderLayoutResizer, handleInput, applyLayoutValue, resetLayout, layoutValue, hasPendingAiEdits, normalizeWorkspace, getFocusTasks, renderFocusView, renderListView, renderMonthCalendar, calendarRecords, todayKey, applyBoardScale, handleBoardWheel, handleBoardGestureStart, handleBoardGestureChange, handleBoardGestureEnd }; })();');
  runInNewContext(instrumented, {
    window, document, navigator: {}, console,
    fetch: async (path, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : undefined;
      calls.push({ path, body });
      let reply = path === '/api/workspace' ? workspace : path === '/api/health' ? { ok: true, mode: 'deepseek' } : replies.shift();
      if (reply instanceof Error) throw reply;
      assert.notEqual(reply, undefined, 'Unexpected request: ' + path);
      return { ok: true, status: 200, text: async () => JSON.stringify(reply) };
    },
  });
  const chat = window.chat;
  chat.appState.workspace = { lists: [{ id: 'list-a', name: '测试清单' }, { id: 'list-b', name: '另一清单' }], tasksByList: {} };
  chat.appState.activeListId = 'list-a';
  chat.appState.loading = false;
  chat.selectAiConversation('list-a');
  return { ...chat, calls, storage };
}

const preview = {
  previewId: 'preview-one', listId: 'list-a', mode: 'deepseek', message: '建议明天下午催付款。',
  operations: [{ type: 'create', title: '催付款', reminderDateTime: '2026-09-08T14:00:00' }],
  assumptions: ['下午暂按 14:00。'],
};

test('chat carries clarification and server preview across revisions; confirmation is explicit', async () => {
  const h = chatHarness([
    { message: '哪天开始？', clarification: '哪天开始？', operations: [] }, preview,
    { ...preview, previewId: 'preview-two', message: '已改为后天。' },
    { ...preview, previewId: 'preview-two', complete: true, results: [{ type: 'created', task: { title: '催付款' } }] },
  ]);
  h.appState.ai.input = '帮我安排催付款';
  await h.runAiCommand();
  assert.equal(h.appState.ai.messages[1].content, '哪天开始？');
  assert.equal(h.appState.ai.preview, null);
  assert.equal(h.renderAiConfirmation(), '');
  h.appState.ai.input = '明天下午';
  await h.runAiCommand();
  assert.equal(h.calls[1].body.messages[0].content, '帮我安排催付款');
  assert.match(h.renderAiConfirmation(), /确认日程/);
  h.appState.ai.input = '改到后天';
  await h.applyAiPreview();
  assert.equal(h.calls.length, 2, 'Unsent changes must block confirmation');
  await h.runAiCommand();
  assert.equal(h.calls[2].body.previewId, 'preview-one');
  assert.ok(h.calls.every(call => call.path !== '/api/ai/apply'));
  await h.applyAiPreview();
  assert.equal(h.calls.find(call => call.path === '/api/ai/apply').body.previewId, 'preview-two');
  assert.match(h.renderAiConfirmation(), /已确认日程/);
  await h.applyAiPreview();
  assert.equal(h.calls.filter(call => call.path === '/api/ai/apply').length, 1);
});

test('chat restores draft and pending plan per list; error retry keeps clean context', async () => {
  const h = chatHarness([new Error('offline'), preview]);
  h.appState.ai.input = '明天下午提醒催付款';
  await h.runAiCommand();
  assert.equal(h.appState.ai.input, '明天下午提醒催付款');
  await h.runAiCommand();
  assert.equal(h.calls[1].body.messages.length, 0);
  h.appState.ai.input = '后天也行';
  h.saveAiConversation(h.appState.ai);
  h.selectAiConversation('list-b');
  assert.equal(h.appState.ai.messages.length, 0);
  h.selectAiConversation('list-a');
  assert.equal(h.appState.ai.contextPreviewId, 'preview-one');
  const reopened = chatHarness([], h.storage);
  assert.equal(reopened.appState.ai.input, '后天也行');
  assert.equal(reopened.appState.ai.preview.previewId, 'preview-one');
  assert.match(reopened.renderAiConfirmation(), /disabled/);
  reopened.appState.ai.messages.push({ role: 'assistant', content: '<script>bad()</script>' });
  assert.ok(!reopened.renderAiView().includes('<script>bad()'));
});

test('partial apply preserves same preview for retry and blocks replanning', async () => {
  const h = chatHarness([preview, { ...preview, complete: false, results: [], error: '请求结果尚不确定' }]);
  h.appState.ai.input = '明天下午提醒催付款';
  await h.runAiCommand();
  await h.applyAiPreview();
  h.appState.ai.input = '再来一次';
  await h.runAiCommand();
  assert.equal(h.calls.length, 2);
  assert.equal(h.appState.ai.preview.previewId, 'preview-one');
  assert.match(h.renderAiConfirmation(), /重试未完成项/);
});

test('layout values clamp and persist through the existing preferences store', () => {
  const h = chatHarness();
  assert.match(h.renderLayoutResizer('sidebar'), /role="separator".*aria-orientation="vertical".*aria-valuemin="220".*aria-valuemax="360"/);
  assert.match(h.renderLayoutResizer('chat'), /role="separator".*aria-orientation="horizontal".*aria-valuemin="170".*aria-valuemax="620"/);
  h.applyLayoutValue('sidebar', 9999);
  h.applyLayoutValue('chat', -10);
  h.applyLayoutValue('focus', 1);
  h.applyLayoutValue('timeline', 99);
  h.savePreferences();
  const saved = JSON.parse(h.storage.get('todo-console-ui-prefs'));
  assert.deepEqual(saved.layout, { sidebarWidth: 360, aiLogHeight: 170, focusRatio: 25, timelineRatio: 75 });

  const reopened = chatHarness([], h.storage);
  assert.equal(reopened.appState.layout.sidebarWidth, 360);
  assert.equal(reopened.appState.layout.aiLogHeight, 170);
  assert.equal(reopened.layoutValue('focus'), 25);
  assert.equal(reopened.layoutValue('timeline'), 75);
  reopened.resetLayout('chat');
  assert.equal(reopened.appState.layout.aiLogHeight, null);
});

test('Microsoft login screen exposes one clear action and device code state', () => {
  const h = chatHarness();
  h.appState.workspace = null;
  h.appState.auth = h.normalizeAuth({ supported: true, authenticated: false, status: 'signed_out', message: '请登录 Microsoft To Do。' });
  const signedOut = h.renderAuth();
  assert.match(signedOut, /连接 Microsoft To Do/);
  assert.match(signedOut, /data-action="start-auth"/);
  assert.doesNotMatch(signedOut, /API Key/);

  h.appState.auth = h.normalizeAuth({
    supported: true,
    authenticated: false,
    status: 'pending',
    userCode: 'ABCD-1234',
    verificationUri: 'https:\/\/microsoft.com\/devicelogin',
    expiresAt: Date.now() + 600000
  });
  const pending = h.renderAuth();
  assert.match(pending, /ABCD-1234/);
  assert.match(pending, /data-action="copy-auth-code"/);
  assert.match(pending, /打开 Microsoft 登录页/);
});

test('board zoom responds to trackpad gestures and stays local to the board', () => {
  const h = chatHarness();
  const board = { style: { setProperty() {} }, getBoundingClientRect: () => ({ left: 0, right: 800, top: 0, bottom: 600 }) };
  const target = { closest: selector => selector === '.board' ? board : null };
  const prevented = { value: 0 };
  const event = (extra = {}) => ({
    target,
    preventDefault: () => { prevented.value += 1; },
    ...extra,
  });

  h.handleBoardGestureStart(event());
  h.handleBoardGestureChange(event({ scale: 1.15 }));
  assert.equal(h.appState.boardScale, 1.15);
  h.handleBoardGestureEnd(event());
  assert.equal(JSON.parse(h.storage.get('todo-console-ui-prefs')).boardScale, 1.15);

  h.handleBoardWheel(event({ ctrlKey: true, deltaY: -10 }));
  assert.equal(h.appState.boardScale, 1.2, 'pinch wheel is clamped to the board maximum');
  const before = h.appState.boardScale;
  h.handleBoardWheel(event({ deltaY: -10 }));
  assert.equal(h.appState.boardScale, before, 'normal scrolling does not zoom the board');
  assert.ok(prevented.value >= 3, 'zoom gestures prevent the page from intercepting the gesture');
});

test('a normal partial result keeps the pending preview when a follow-up is only clarification', async () => {
  const pendingPreview = {
    ...preview,
    operations: [
      ...preview.operations,
      { type: 'create', title: '确认收货', reminderDateTime: '2026-09-09T09:00:00' },
    ],
  };
  const h = chatHarness([
    pendingPreview,
    { ...pendingPreview, complete: false, completed: [0], results: [{ type: 'created', task: { title: '催付款' } }] },
    { message: '请说明要调整哪一项。', clarification: '请说明要调整哪一项。', operations: [] },
  ]);
  h.appState.ai.input = '安排两项任务';
  await h.runAiCommand();
  await h.applyAiPreview();
  const before = h.appState.ai.preview;
  h.appState.ai.input = '改一下时间';
  await h.runAiCommand();
  const commands = h.calls.filter(call => call.path === '/api/ai/commands');
  assert.equal(commands[1].body.previewId, pendingPreview.previewId);
  assert.equal(h.appState.ai.preview.previewId, before.previewId);
  assert.equal(h.appState.ai.preview.operations.length, 2);
});

test('clarification keeps pending edits and locks an unexecuted preview', async () => {
  const h = chatHarness([
    preview,
    { message: '请补充清单。', clarification: '请补充清单。', operations: [] },
  ]);
  h.appState.ai.input = '安排催付款';
  await h.runAiCommand();
  h.appState.ai.opEdits = { 0: { reminderDateTime: '2026-09-09T10:00:00' } };
  h.appState.ai.input = '改到后天上午';
  await h.runAiCommand();

  const commands = h.calls.filter(call => call.path === '/api/ai/commands');
  assert.deepEqual(commands[1].body.previewEdits, [{ index: 0, reminderDateTime: '2026-09-09T10:00:00' }]);
  assert.equal(h.appState.ai.preview.previewId, preview.previewId);
  assert.deepEqual(h.appState.ai.opEdits, { 0: { reminderDateTime: '2026-09-09T10:00:00' } });
  assert.equal(h.appState.ai.needsClarification, true);
  assert.match(h.renderAiConfirmation(), /disabled/);
  assert.match(h.renderAiConfirmation(), /请先回答问题/);
  assert.match(h.renderAiView(), /data-action="apply-op"[^>]*disabled/);

  await h.applyAiPreview();
  assert.equal(h.calls.filter(call => call.path === '/api/ai/apply').length, 0);
});

test('a completed preview cannot reappear as an executable plan after a failed follow-up', async () => {
  const h = chatHarness([
    preview,
    { ...preview, complete: true, completed: [0], results: [{ type: 'created', task: { title: '催付款' } }] },
    new Error('offline'),
  ]);
  h.appState.ai.input = '明天下午提醒催付款';
  await h.runAiCommand();
  await h.applyAiPreview();
  assert.equal(h.appState.ai.applyResult.complete, true);
  h.appState.ai.input = '再安排一件新的事';
  await h.runAiCommand();
  assert.equal(h.appState.ai.preview, null);
  assert.equal(h.calls.filter(call => call.path === '/api/ai/apply').length, 1);
  assert.equal(h.appState.ai.input, '再安排一件新的事');
});

test('Today includes every due/reminded task across lists, without focus truncation', () => {
  const h = chatHarness();
  const due = h.todayKey() + 'T12:00:00';
  const make = (id, fields = {}) => ({ id, title: id, status: 'notStarted', ...fields });
  h.appState.workspace = h.normalizeWorkspace({
    lists: [{ id: 'list-a', displayName: 'Tasks' }, { id: 'mail', displayName: 'Flagged Emails', wellknownListName: 'flaggedEmails' }],
    tasksByList: {
      'list-a': [...Array.from({ length: 12 }, (_, i) => make('due-' + i, { dueDateTime: due })),
        make('unscheduled'), make('future', { dueDateTime: '2099-01-01T12:00:00' }),
        make('reminded', { reminderDateTime: due, isReminderOn: true }),
        make('disabled-reminder', { reminderDateTime: due, isReminderOn: false }),
        make('completed-today', { dueDateTime: due, status: 'completed' })],
      mail: [make('flagged-today', { dueDateTime: due })]
    }
  });
  // 焦点/今日视图跟随全局 scope：'all' 跨清单汇总（原有行为），'list' 只看当前清单。
  h.appState.scope = 'all';
  const today = h.getFocusTasks().map(r => r.task.id);
  assert.equal(today.length, 15);
  for (const id of ['due-11', 'reminded', 'flagged-today', 'completed-today']) assert.ok(today.includes(id));
  for (const id of ['unscheduled', 'future', 'disabled-reminder']) assert.ok(!today.includes(id));
  h.appState.scope = 'list';
  h.appState.activeListId = 'list-a';
  assert.equal(h.getFocusTasks().length, 14);
  h.appState.scope = 'all';
  const focus = h.renderFocusView();
  assert.match(focus, /data-task-row="due-11"/);
  assert.match(focus, /data-list-id="mail" data-task-id="flagged-today"/);
  h.appState.view = 'all';
  const all = h.renderListView();
  assert.equal((all.match(/data-task-row=/g) || []).length, 18);
  assert.match(all, /data-task-row="unscheduled"/);
  assert.match(all, /data-task-row="completed-today"/);
  h.appState.listFilter = 'completed';
  assert.equal((h.renderListView().match(/data-task-row=/g) || []).length, 1);
});

test('Month calendar expansion exposes every task for a busy day and can collapse', () => {
  const h = chatHarness();
  const key = h.todayKey();
  h.appState.workspace.tasksByList['list-a'] = Array.from({ length: 8 }, (_, i) => ({ id: 'calendar-' + i, title: 'Calendar ' + i, status: 'notStarted', dueDateTime: key + 'T12:00:00' }));
  const render = () => h.renderMonthCalendar(h.calendarRecords(), new Date());
  assert.equal((render().match(/class="calendar-task/g) || []).length, 3);
  assert.match(render(), /展开全部（共 8 条）/);
  h.appState.expandedCalendarDays[key] = true;
  assert.equal((render().match(/class="calendar-task/g) || []).length, 8);
  assert.match(render(), /aria-expanded="true">收起/);
  h.appState.expandedCalendarDays[key] = false;
  assert.equal((render().match(/class="calendar-task/g) || []).length, 3);
});

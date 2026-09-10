// 全组合矩阵测试：任意「视图 × 范围 × 清单」点击路径都必须表现一致，不能错。
// 覆盖：点清单保持视图、切范围保持视图、每个组合渲染不抛错且数据与范围对应、拖卡片按任务所属清单路由。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

const now = new Date();
const pad = n => String(n).padStart(2, '0');
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T12:00:00`;

const WORKSPACE = {
  lists: [
    { id: 'list-a', displayName: '工作' },
    { id: 'list-b', displayName: '生活' },
    { id: 'list-c', displayName: 'Tasks' },
  ],
  tasksByList: {
    'list-a': [
      { id: 'a1', title: '工作甲', status: 'notStarted', importance: 'important', dueDateTime: TODAY },
      { id: 'a2', title: '工作乙', status: 'inProgress', dueDateTime: TODAY },
      { id: 'a3', title: '工作丙', status: 'completed', dueDateTime: TODAY },
    ],
    'list-b': [
      { id: 'b1', title: '生活甲', status: 'notStarted', dueDateTime: TODAY },
      { id: 'b2', title: '生活乙', status: 'completed', dueDateTime: TODAY },
    ],
    'list-c': [],
  },
};

function matrixHarness(storage = new Map()) {
  const calls = [];
  const window = {
    addEventListener() {},
    setInterval() {},
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
  };
  const document = {
    readyState: 'loading',
    addEventListener() {},
    getElementById() { return null; }, // render() 拿不到 #app 会直接返回，状态更新仍可断言。
    querySelector() { return null; },
    body: { classList: { toggle() {} } },
  };
  const exportList = 'window.chat = { appState, handleClick, handleDrop, renderMainView, pageHeading, renderListView, renderBoardView, renderTimelineView, renderMatrixView, renderCalendarView, renderFocusView, getScopeRecords, isScopeAll, normalizeWorkspace, getActiveList, selectAiConversation }; })();';
  const instrumented = source.replace(/\}\)\(\);\s*$/, exportList);
  runInNewContext(instrumented, {
    window, document, navigator: {}, console,
    fetch: async (path, options = {}) => {
      calls.push({ path: String(path), method: (options.method || 'GET').toUpperCase() });
      return { ok: true, status: 200, text: async () => '{}' };
    },
  });
  const chat = window.chat;
  chat.appState.workspace = chat.normalizeWorkspace(WORKSPACE);
  chat.appState.activeListId = 'list-a';
  chat.appState.loading = false;
  chat.selectAiConversation('list-a');
  return { ...chat, calls };
}

// 模拟一次点击：closest 命中带给定 data-* 属性的元素。
const tap = (h, attrs) => h.handleClick({
  target: { closest: () => ({ matches: () => false, getAttribute: k => (k in attrs ? attrs[k] : null) }) },
});

const LIST_SCOPED_VIEWS = ['list', 'board', 'calendar', 'timeline', 'matrix'];
const RENDERABLE_VIEWS = [...LIST_SCOPED_VIEWS, 'focus'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('点击左侧任意清单：保持当前视图、范围钉回该清单', () => {
  for (const view of LIST_SCOPED_VIEWS) {
    const h = matrixHarness();
    h.appState.view = view;
    h.appState.scope = 'all';
    tap(h, { 'data-action': 'open-list', 'data-list-id': 'list-b' });
    assert.equal(h.appState.view, view, `${view}: 视图不能跳走`);
    assert.equal(h.appState.activeListId, 'list-b', `${view}: 选中清单`);
    assert.equal(h.appState.scope, 'list', `${view}: 范围切到当前清单`);
    assert.equal(h.getActiveList().name, '生活', `${view}: 取到的清单正确`);
  }
  for (const view of ['focus', 'ai']) {
    const h = matrixHarness();
    h.appState.view = view;
    h.appState.scope = 'all';
    tap(h, { 'data-action': 'open-list', 'data-list-id': 'list-b' });
    assert.equal(h.appState.view, 'list', `${view}: 无清单视图回退到列表`);
    assert.equal(h.appState.activeListId, 'list-b');
    assert.equal(h.appState.scope, 'list');
  }
});

test('点击清单/全部待办在空清单与无选中时也不出错', () => {
  const h = matrixHarness();
  h.appState.view = 'board';
  h.appState.scope = 'all';
  tap(h, { 'data-action': 'open-list', 'data-list-id': 'list-c' });
  assert.equal(h.appState.activeListId, 'list-c');
  assert.equal(h.appState.view, 'board');
  const board = h.renderMainView();
  assert.match(board, /状态看板/);
  assert.match(board, /把任务拖到这里/);
});

test('切换「当前清单/全部待办」：任意视图下都保持视图不变', () => {
  for (const view of RENDERABLE_VIEWS) {
    const h = matrixHarness();
    h.appState.view = view;
    tap(h, { 'data-action': 'set-scope', 'data-scope': 'all' });
    assert.equal(h.appState.scope, 'all', `${view}: 切全部`);
    assert.equal(h.appState.view, view, `${view}: 视图不变`);
    tap(h, { 'data-action': 'set-scope', 'data-scope': 'list' });
    assert.equal(h.appState.scope, 'list', `${view}: 切回当前清单`);
    assert.equal(h.appState.view, view, `${view}: 视图不变`);
  }
});

test('每个「视图 × 范围」组合都能渲染，且数据与范围严格对应', () => {
  for (const view of RENDERABLE_VIEWS) {
    for (const scope of ['list', 'all']) {
      const h = matrixHarness();
      h.appState.view = view;
      h.appState.scope = scope;
      const html = h.renderMainView();
      assert.equal(typeof html, 'string', `${view}/${scope}: 渲染成功`);
      assert.doesNotMatch(html, /undefined/, `${view}/${scope}: 不含未定义占位`);
      if (view === 'calendar') {
        // 月视图每天默认只展开前 3 条，其余折叠；用当天计数验证数据与范围对应。
        const expected = scope === 'all' ? 5 : 3;
        assert.match(html, new RegExp(`<small>${expected} 件</small>`), `${view}/${scope}: 当天任务数`);
        continue;
      }
      if (scope === 'all') {
        assert.match(html, /工作甲/, `${view}/all: 包含清单A任务`);
        assert.match(html, /生活甲/, `${view}/all: 包含清单B任务`);
      } else {
        assert.match(html, /工作甲/, `${view}/list: 包含当前清单任务`);
        assert.doesNotMatch(html, /生活甲/, `${view}/list: 不包含其他清单任务`);
      }
    }
  }
});

test('页面标题跟随范围：当前清单显示清单名，全部显示「全部待办」', () => {
  for (const view of LIST_SCOPED_VIEWS) {
    const h = matrixHarness();
    h.appState.view = view;
    h.appState.scope = 'list';
    assert.equal(h.pageHeading().title, '工作', `${view}: 单清单标题`);
    h.appState.scope = 'all';
    assert.equal(h.pageHeading().title, '全部待办', `${view}: 全部标题`);
  }
});

test('看板拖卡片：状态更新发到任务所属清单，而不是当前清单', async () => {
  const makeColumn = status => ({
    classList: { remove() {}, add() {} },
    getAttribute: k => (k === 'data-board-status' ? status : null),
  });
  const makeDrop = column => ({ preventDefault() {}, target: { closest: () => column }, dataTransfer: null });

  // 全部待办模式：跨清单拖动生效，请求打到任务自己的清单。
  const h = matrixHarness();
  h.appState.view = 'board';
  h.appState.scope = 'all';
  h.appState.drag = { listId: 'list-b', taskId: 'b1' };
  h.handleDrop(makeDrop(makeColumn('inProgress')));
  await sleep(20);
  const patch = h.calls.find(call => call.method === 'PATCH');
  assert.ok(patch, '全部模式：发出 PATCH');
  assert.match(patch.path, /\/api\/lists\/list-b\/tasks\/b1$/, '全部模式：路由到 list-b');

  // 单清单模式：拖别的清单的卡片必须被忽略，不发请求。
  const h2 = matrixHarness();
  h2.appState.view = 'board';
  h2.appState.scope = 'list';
  h2.appState.activeListId = 'list-a';
  h2.appState.drag = { listId: 'list-b', taskId: 'b1' };
  h2.handleDrop(makeDrop(makeColumn('inProgress')));
  await sleep(20);
  assert.ok(!h2.calls.some(call => call.method === 'PATCH'), '单清单模式：跨清单拖动被拒绝');
});

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { mock, test } from 'node:test';

function clone(value) {
  return value === undefined ? value : structuredClone(value);
}

function jsonResponse(status, value) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return clone(value); },
    async text() { return JSON.stringify(value); },
  };
}

class MockRequest extends Readable {
  constructor(method, url, body, headers) {
    super();
    this.method = method;
    this.url = url;
    this.headers = headers;
    this.body = Buffer.from(body || '', 'utf8');
    this.sent = false;
  }

  _read() {
    if (this.sent) return;
    this.sent = true;
    if (this.body.length) this.push(this.body);
    this.push(null);
  }
}

class MockResponse extends Writable {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
  }

  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = value;
  }

  writeHead(status, headers = {}) {
    this.statusCode = status;
    for (const [name, value] of Object.entries(headers)) this.setHeader(name, value);
  }

  _write(chunk, encoding, callback) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    callback();
  }

  get text() {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

async function request(server, method, url, body, extraHeaders = {}) {
  const req = new MockRequest(method, url, body ? JSON.stringify(body) : '', {
    host: '127.0.0.1:4177',
    ...(body ? { 'content-type': 'application/json' } : {}),
    ...extraHeaders,
  });
  const res = new MockResponse();
  const finished = new Promise((resolve, reject) => {
    res.once('finish', resolve);
    res.once('error', reject);
  });
  server.emit('request', req, res);
  await finished;
  let data;
  try { data = res.text ? JSON.parse(res.text) : undefined; } catch { data = undefined; }
  return { status: res.statusCode, headers: res.headers, text: res.text, data };
}

function makeGraphFixture() {
  const state = {
    lists: [{ id: 'list-1', displayName: '日常跟进' }],
    tasks: {
      'list-1': [{
        id: 'task-1',
        title: '已有任务',
        status: 'notStarted',
        importance: 'normal',
        body: { contentType: 'text', content: '' },
        dueDateTime: null,
        reminderDateTime: null,
        isReminderOn: false,
        recurrence: null,
        categories: [],
      }],
    },
    nextTask: 1,
    fetches: [],
    blockedFetches: [],
    graphWrites: [],
  };

  const ensureTasks = listId => { state.tasks[listId] ||= []; return state.tasks[listId]; };
  const nextId = prefix => `${prefix}-${++state.nextTask}`;
  const findTask = (listId, taskId) => ensureTasks(listId).find(task => task.id === taskId);

  const graph = {
    async listTaskLists() { return clone(state.lists); },
    async listTasks(listId) { return clone(ensureTasks(listId)); },
    async getTask(listId, taskId) {
      const task = findTask(listId, taskId);
      if (!task) {
        const error = new Error('Graph 404: task not found');
        error.definite = true;
        throw error;
      }
      return clone(task);
    },
    async createTask(listId, input) {
      const task = {
        id: nextId('mock-task'),
        title: input.title,
        status: input.status || 'notStarted',
        importance: input.importance || 'normal',
        body: typeof input.body === 'string' ? { contentType: 'text', content: input.body } : (input.body || { contentType: 'text', content: '' }),
        dueDateTime: input.dueDateTime ? { dateTime: input.dueDateTime, timeZone: input.timeZone } : null,
        reminderDateTime: input.reminderDateTime ? { dateTime: input.reminderDateTime, timeZone: input.reminderTimeZone || input.timeZone } : null,
        isReminderOn: input.isReminderOn || Boolean(input.reminderDateTime),
        recurrence: input.recurrence || null,
        categories: input.categories || [],
      };
      ensureTasks(listId).push(task);
      return clone(task);
    },
    async updateTask(listId, taskId, patch) {
      const task = findTask(listId, taskId);
      if (!task) {
        const error = new Error('Graph 404: task not found');
        error.definite = true;
        throw error;
      }
      if (patch.body !== undefined) task.body = typeof patch.body === 'string' ? { contentType: 'text', content: patch.body } : patch.body;
      for (const key of ['title', 'status', 'importance', 'dueDateTime', 'reminderDateTime', 'isReminderOn', 'recurrence', 'categories']) {
        if (patch[key] !== undefined) task[key] = patch[key];
      }
      return clone(task);
    },
    async deleteTask(listId, taskId) {
      const tasks = ensureTasks(listId);
      const index = tasks.findIndex(task => task.id === taskId);
      if (index < 0) {
        const error = new Error('Graph 404: task not found');
        error.definite = true;
        throw error;
      }
      tasks.splice(index, 1);
    },
  };

  const fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method || 'GET';
    state.fetches.push({ url, method, body: init.body, headers: init.headers });
    const parsed = new URL(url);
    if (parsed.origin !== 'https://graph.microsoft.com') {
      state.blockedFetches.push({ url, method });
      throw new Error(`blocked unmocked host: ${parsed.origin}`);
    }

    const path = parsed.pathname.replace('/v1.0', '');
    const segments = path.split('/').filter(Boolean).map(decodeURIComponent);
    if (method === 'POST' && path === '/me/todo/lists') {
      const body = JSON.parse(init.body);
      const list = { id: `list-${state.lists.length + 1}`, displayName: body.displayName };
      state.lists.push(list);
      state.graphWrites.push({ method, path, body });
      return jsonResponse(201, list);
    }
    if (segments[0] === 'me' && segments[1] === 'todo' && segments[2] === 'lists' && segments.length === 4 && method === 'PATCH') {
      const body = JSON.parse(init.body);
      const list = state.lists.find(item => item.id === segments[3]);
      if (!list) return jsonResponse(404, { error: { message: 'list not found' } });
      Object.assign(list, body);
      state.graphWrites.push({ method, path, body });
      return jsonResponse(200, list);
    }
    if (segments[0] === 'me' && segments[1] === 'todo' && segments[2] === 'lists' && segments[4] === 'tasks') {
      const listId = segments[3];
      const taskId = segments[5];
      if (segments.length === 6 && method === 'GET') {
        const task = findTask(listId, taskId);
        return task ? jsonResponse(200, task) : jsonResponse(404, { error: { message: 'task not found' } });
      }
      if (segments.length === 6 && method === 'DELETE') {
        const tasks = ensureTasks(listId);
        const index = tasks.findIndex(task => task.id === taskId);
        if (index < 0) return jsonResponse(404, { error: { message: 'task not found' } });
        tasks.splice(index, 1);
        state.graphWrites.push({ method, path, listId, taskId });
        return jsonResponse(204, null);
      }
      if (method === 'POST' && segments.length === 5) {
        const body = JSON.parse(init.body);
        const task = {
          id: nextId('graph-task'),
          ...clone(body),
          status: body.status || 'notStarted',
          importance: body.importance || 'normal',
        };
        ensureTasks(listId).push(task);
        state.graphWrites.push({ method, path, listId, body: clone(body) });
        return jsonResponse(201, task);
      }
      if (method === 'PATCH' && segments.length === 6) {
        const task = findTask(listId, taskId);
        if (!task) return jsonResponse(404, { error: { message: 'task not found' } });
        const body = JSON.parse(init.body);
        Object.assign(task, clone(body));
        state.graphWrites.push({ method, path, listId, taskId, body: clone(body) });
        return jsonResponse(200, task);
      }
      if (segments.length === 7 && method === 'GET' && ['checklistItems', 'linkedResources', 'attachments', 'extensions'].includes(segments[6])) {
        return jsonResponse(200, { value: [] });
      }
    }
    throw new Error(`unmocked Graph request: ${method} ${path}`);
  };

  return { state, graph, fetch };
}

test('server integration stays isolated and applies plans exactly once', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'todo-server-test-'));
  const fixture = makeGraphFixture();
  const envNames = ['CONSOLE_DATA_DIR', 'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL', 'OLLAMA_URL', 'OLLAMA_MODEL'];
  const savedEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  const savedFetch = globalThis.fetch;
  for (const name of envNames) delete process.env[name];
  process.env.CONSOLE_DATA_DIR = dataDirectory;

  mock.module('@mag-cie/mcp-microsoft-todo/dist/graph.js', { namedExports: fixture.graph });
  mock.module('@mag-cie/mcp-microsoft-todo/dist/auth.js', { namedExports: { getAccessToken: async () => 'fixture-access-token' } });
  globalThis.fetch = fixture.fetch;

  try {
    const { server } = await import(`../server.js?server-test=${randomUUID()}`);

    const initialSettings = await request(server, 'GET', '/api/settings');
    assert.equal(initialSettings.status, 200);
    assert.equal(Object.hasOwn(initialSettings.data, 'apiKey'), false);
    assert.equal(initialSettings.data.ai.configured, false);

    const crossOrigin = await request(server, 'POST', '/api/settings', { apiKey: 'cross-origin-must-not-save' }, { origin: 'https://evil.example' });
    assert.equal(crossOrigin.status, 403);
    assert.equal((await request(server, 'GET', '/api/settings')).data.ai.configured, false);

    const preview = await request(server, 'POST', '/api/projects/preview', { projectName: '春季活动', startDate: '2026-01-30' });
    assert.equal(preview.status, 200);
    assert.match(preview.data.previewId, /^[a-f\d-]{36}$/);
    assert.equal(preview.data.project.projectName, '春季活动');
    assert.equal(fixture.state.graphWrites.length, 0);

    const firstApply = await request(server, 'POST', '/api/projects/apply', { previewId: preview.data.previewId });
    assert.equal(firstApply.status, 200);
    assert.equal(firstApply.data.complete, true);
    assert.equal(firstApply.data.results.length, 5);
    assert.equal(fixture.state.graphWrites.length, 5);
    assert.deepEqual(fixture.state.graphWrites[0].body, { displayName: '春季活动' });
    const paymentWrite = fixture.state.graphWrites.find(write => write.body?.title === '催付款');
    assert.ok(paymentWrite);
    assert.deepEqual(paymentWrite.body.dueDateTime, { dateTime: '2026-02-01T18:00:00', timeZone: 'Asia/Shanghai' });
    assert.deepEqual(paymentWrite.body.reminderDateTime, { dateTime: '2026-02-01T09:00:00', timeZone: 'Asia/Shanghai' });
    assert.equal(paymentWrite.body.isReminderOn, true);
    assert.match(paymentWrite.body.body.content, /项目接入日期：2026-01-30/);

    const writesAfterFirstApply = fixture.state.graphWrites.length;
    const secondApply = await request(server, 'POST', '/api/projects/apply', { previewId: preview.data.previewId });
    assert.equal(secondApply.status, 200);
    assert.equal(secondApply.data.complete, true);
    assert.equal(fixture.state.graphWrites.length, writesAfterFirstApply);

    const duplicatePreview = await request(server, 'POST', '/api/projects/preview', { projectName: '春季活动', startDate: '2026-01-30' });
    assert.equal(duplicatePreview.status, 500);
    assert.match(duplicatePreview.data.error, /同名项目/);
    assert.equal(fixture.state.graphWrites.length, writesAfterFirstApply);

    const aiPreview = await request(server, 'POST', '/api/ai/commands', {
      listId: 'list-1',
      instruction: '提醒2026年4月1日上午9点喝水，每天重复',
    });
    assert.equal(aiPreview.status, 200);
    assert.equal(aiPreview.data.complete, false);
    assert.equal(aiPreview.data.operations.length, 1);
    assert.equal(aiPreview.data.operations[0].type, 'create');
    assert.equal(aiPreview.data.operations[0].recurrence, 'daily');
    assert.equal(aiPreview.data.operations[0].dueDateTime, '2026-04-01T09:00:00');
    assert.equal(aiPreview.data.operations[0].reminderDateTime, '2026-04-01T09:00:00');
    const writesBeforeAiApply = fixture.state.graphWrites.length;

    const aiApply = await request(server, 'POST', '/api/ai/apply', { previewId: aiPreview.data.previewId });
    assert.equal(aiApply.status, 200);
    assert.equal(aiApply.data.complete, true);
    assert.equal(fixture.state.graphWrites.length, writesBeforeAiApply + 1);
    const aiWrite = fixture.state.graphWrites.at(-1);
    assert.deepEqual(aiWrite.body.dueDateTime, { dateTime: '2026-04-01T09:00:00', timeZone: 'Asia/Shanghai' });
    assert.deepEqual(aiWrite.body.reminderDateTime, { dateTime: '2026-04-01T09:00:00', timeZone: 'Asia/Shanghai' });
    assert.equal(aiWrite.body.isReminderOn, true);
    assert.deepEqual(aiWrite.body.recurrence, {
      pattern: { type: 'daily', interval: 1 },
      range: { type: 'noEnd', startDate: '2026-04-01', recurrenceTimeZone: 'Asia/Shanghai' },
    });

    const configuredSettings = await request(server, 'POST', '/api/settings', { apiKey: 'fixture-only-key', model: 'deepseek-v4-flash' });
    assert.equal(configuredSettings.status, 200);
    assert.equal(Object.hasOwn(configuredSettings.data, 'apiKey'), false);
    assert.equal(configuredSettings.data.ai.configured, true);
    const readSettings = await request(server, 'GET', '/api/settings');
    assert.equal(Object.hasOwn(readSettings.data, 'apiKey'), false);
    assert.equal(readSettings.data.ai.configured, true);

    assert.ok(fixture.state.blockedFetches.length > 0, 'the rules fallback should be isolated from Ollama/network');
    assert.ok(fixture.state.blockedFetches.every(call => new URL(call.url).origin !== 'https://graph.microsoft.com'));
  } finally {
    globalThis.fetch = savedFetch;
    for (const name of envNames) {
      if (savedEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[name];
    }
    mock.reset();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test('AI advice clarification is HTTP 200, keeps the workflow hint, and saves no plan', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'todo-server-ai-advice-test-'));
  const fixture = makeGraphFixture();
  const envNames = ['CONSOLE_DATA_DIR', 'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL', 'OLLAMA_URL', 'OLLAMA_MODEL'];
  const savedEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  const savedFetch = globalThis.fetch;
  for (const name of envNames) delete process.env[name];
  process.env.CONSOLE_DATA_DIR = dataDirectory;
  mock.module('@mag-cie/mcp-microsoft-todo/dist/graph.js', { namedExports: fixture.graph });
  mock.module('@mag-cie/mcp-microsoft-todo/dist/auth.js', { namedExports: { getAccessToken: async () => 'fixture-access-token' } });
  globalThis.fetch = fixture.fetch;

  try {
    const { server } = await import(`../server.js?ai-advice-test=${randomUUID()}`);
    const beforeWrites = fixture.state.graphWrites.length;
    const response = await request(server, 'POST', '/api/ai/commands', {
      listId: 'list-1',
      instruction: '帮我设计一下我的工作流程',
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.previewId, undefined);
    assert.deepEqual(response.data.operations, []);
    assert.match(response.data.message, /明确目标|关键步骤|负责人|验收/);
    assert.match(response.data.clarification, /哪项工作流程|具体事项/);
    assert.match(response.data.message, /哪项工作流程|具体事项/);
    assert.deepEqual(response.data.assumptions, []);
    assert.equal(fixture.state.graphWrites.length, beforeWrites);
  } finally {
    globalThis.fetch = savedFetch;
    for (const name of envNames) {
      if (savedEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[name];
    }
    mock.reset();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test('AI partial previews reject full replanning and stale preview IDs without extra writes', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'todo-server-ai-partial-test-'));
  const fixture = makeGraphFixture();
  const envNames = ['CONSOLE_DATA_DIR', 'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL', 'OLLAMA_URL', 'OLLAMA_MODEL'];
  const savedEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  const savedFetch = globalThis.fetch;
  for (const name of envNames) delete process.env[name];
  process.env.CONSOLE_DATA_DIR = dataDirectory;
  mock.module('@mag-cie/mcp-microsoft-todo/dist/graph.js', { namedExports: fixture.graph });
  mock.module('@mag-cie/mcp-microsoft-todo/dist/auth.js', { namedExports: { getAccessToken: async () => 'fixture-access-token' } });
  globalThis.fetch = fixture.fetch;

  try {
    const { server } = await import(`../server.js?ai-partial-test=${randomUUID()}`);
    const preview = await request(server, 'POST', '/api/ai/commands', {
      listId: 'list-1', instruction: '新建任务 A；新建任务 B',
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.data.operations.length, 2);
    const partial = await request(server, 'POST', '/api/ai/apply', {
      previewId: preview.data.previewId, indices: [0],
    });
    assert.equal(partial.status, 200);
    assert.deepEqual(partial.data.completed, [0]);
    const writesAfterPartial = fixture.state.graphWrites.length;

    const revision = await request(server, 'POST', '/api/ai/commands', {
      listId: 'list-1', previewId: preview.data.previewId, instruction: '再加一个任务 C',
    });
    assert.equal(revision.status, 200);
    assert.deepEqual(revision.data.operations, []);
    assert.match(revision.data.message, /部分执行|逐项确认|新对话/);
    assert.equal(revision.data.previewId, undefined);
    assert.equal(fixture.state.graphWrites.length, writesAfterPartial);

    const stale = await request(server, 'POST', '/api/ai/commands', {
      listId: 'list-1', previewId: randomUUID(), instruction: '再加一个任务 D',
    });
    assert.equal(stale.status, 409);
    assert.equal(fixture.state.graphWrites.length, writesAfterPartial);
  } finally {
    globalThis.fetch = savedFetch;
    for (const name of envNames) {
      if (savedEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[name];
    }
    mock.reset();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test('AI revisions use server pending context, restore short task IDs, and write only on apply', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'todo-server-ai-revision-test-'));
  const fixture = makeGraphFixture();
  const envNames = ['CONSOLE_DATA_DIR', 'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL', 'OLLAMA_URL', 'OLLAMA_MODEL'];
  const savedEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  const savedFetch = globalThis.fetch;
  const providerBodies = [];
  for (const name of envNames) delete process.env[name];
  process.env.CONSOLE_DATA_DIR = dataDirectory;
  process.env.DEEPSEEK_API_KEY = 'fixture-deepseek-key';
  process.env.DEEPSEEK_MODEL = 'deepseek-v4-pro';
  mock.module('@mag-cie/mcp-microsoft-todo/dist/graph.js', { namedExports: fixture.graph });
  mock.module('@mag-cie/mcp-microsoft-todo/dist/auth.js', { namedExports: { getAccessToken: async () => 'fixture-access-token' } });
  globalThis.fetch = async (input, init = {}) => {
    if (String(input) === 'https://api.deepseek.com/chat/completions') {
      const body = JSON.parse(init.body);
      providerBodies.push(body);
      const operations = providerBodies.length === 1
        ? [
          { type: 'create', title: '采购合同确认' },
          { type: 'update', taskId: 't1', dueDateTime: '2026-09-10T09:00:00' },
        ]
        : [
          { type: 'create', title: '采购合同确认', dueDateTime: '2026-09-12T09:00:00' },
          { type: 'update', taskId: 't1', dueDateTime: '2026-09-12T09:00:00' },
        ];
      return jsonResponse(200, {
        choices: [{ message: { content: JSON.stringify({
          message: providerBodies.length === 1 ? '已整理两项安排。' : '已按后天调整，并保留完整计划。',
          operations,
        }) } }],
      });
    }
    return fixture.fetch(input, init);
  };

  try {
    const { server } = await import(`../server.js?ai-revision-test=${randomUUID()}`);
    const longUser = '用户约束'.repeat(600);
    const longAssistant = '助手说明'.repeat(250);
    const first = await request(server, 'POST', '/api/ai/commands', {
      listId: 'list-1',
      instruction: '安排采购合同，并处理已有任务',
      messages: [
        { role: 'system', content: '必须过滤此消息' },
        { role: 'user', content: '旧消息 1' },
        { role: 'assistant', content: '旧回复 1' },
        { role: 'user', content: '旧消息 2' },
        { role: 'assistant', content: '旧回复 2' },
        { role: 'user', content: longUser },
        { role: 'assistant', content: longAssistant },
      ],
    });
    assert.equal(first.status, 200);
    assert.match(first.data.previewId, /^[a-f\d-]{36}$/);
    assert.equal(first.data.originListId, 'list-1');
    assert.equal(first.data.mode, 'deepseek');
    assert.equal(first.data.model, 'deepseek-v4-pro');
    assert.equal(first.data.operations.length, 2);
    assert.equal(first.data.operations[1].taskId, 'task-1');
    assert.equal(fixture.state.graphWrites.length, 0);

    const firstHistory = providerBodies[0].messages.slice(1, -1);
    assert.equal(firstHistory.length, 4);
    assert.equal(firstHistory[0].content, '旧消息 2');
    assert.equal(firstHistory[2].content.length, 2000);
    assert.equal(firstHistory[3].content.length, 600);
    assert.equal(firstHistory.some(message => message.role === 'system'), false);

    const second = await request(server, 'POST', '/api/ai/commands', {
      listId: 'list-1',
      previewId: first.data.previewId,
      instruction: '请把它们改到后天上午9点，保留完整计划',
      previewEdits: [{ index: 0, reminderDateTime: '2026-09-11T10:00:00' }],
      messages: [
        { role: 'user', content: '安排采购合同，并处理已有任务' },
        { role: 'assistant', content: '已整理两项安排。' },
      ],
    });
    assert.equal(second.status, 200);
    assert.match(second.data.previewId, /^[a-f\d-]{36}$/);
    assert.notEqual(second.data.previewId, first.data.previewId);
    assert.equal(second.data.operations.length, 2);
    assert.equal(second.data.operations[0].title, '采购合同确认');
    assert.equal(second.data.operations[1].taskId, 'task-1');
    assert.equal(second.data.message, '已按后天调整，并保留完整计划。');
    assert.equal(fixture.state.graphWrites.length, 0);

    const revisionPayload = JSON.parse(providerBodies[1].messages.at(-1).content);
    assert.equal(revisionPayload.pendingPlanContext.status, 'pending');
    assert.equal(revisionPayload.pendingPlanContext.previewId, first.data.previewId);
    assert.deepEqual(revisionPayload.pendingPlanContext.operations.map(operation => operation.taskId), [undefined, 't1']);
    assert.equal(revisionPayload.pendingPlanContext.operations[0].reminderDateTime, '2026-09-11T10:00:00');
    assert.equal(revisionPayload.projectTemplate.steps.length, 4);
    assert.equal(providerBodies[1].messages.filter(message => message.content === '安排采购合同，并处理已有任务').length, 1);
    assert.equal(providerBodies[1].messages.filter(message => message.content === '已整理两项安排。').length, 1);
    assert.equal(providerBodies[1].messages.slice(1, -1).some(message => message.content === '请把它们改到后天上午9点，保留完整计划'), false);

    const oldApply = await request(server, 'POST', '/api/ai/apply', { previewId: first.data.previewId });
    assert.equal(oldApply.status, 409);
    assert.equal(fixture.state.graphWrites.length, 0);

    const applied = await request(server, 'POST', '/api/ai/apply', { previewId: second.data.previewId });
    assert.equal(applied.status, 200);
    assert.equal(applied.data.complete, true);
    assert.ok(fixture.state.graphWrites.some(write => write.taskId === 'task-1'));
    const writesAfterApply = fixture.state.graphWrites.length;
    const duplicate = await request(server, 'POST', '/api/ai/apply', { previewId: second.data.previewId });
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.data.complete, true);
    assert.equal(fixture.state.graphWrites.length, writesAfterApply);
  } finally {
    globalThis.fetch = savedFetch;
    for (const name of envNames) {
      if (savedEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[name];
    }
    mock.reset();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test('DeepSeek JSON mode receives an explicit JSON instruction', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'todo-server-deepseek-test-'));
  const fixture = makeGraphFixture();
  const envNames = ['CONSOLE_DATA_DIR', 'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL', 'OLLAMA_URL', 'OLLAMA_MODEL'];
  const savedEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  const savedFetch = globalThis.fetch;
  for (const name of envNames) delete process.env[name];
  process.env.CONSOLE_DATA_DIR = dataDirectory;
  process.env.DEEPSEEK_API_KEY = 'fixture-deepseek-key';
  process.env.DEEPSEEK_MODEL = 'deepseek-v4-flash';

  mock.module('@mag-cie/mcp-microsoft-todo/dist/graph.js', { namedExports: fixture.graph });
  mock.module('@mag-cie/mcp-microsoft-todo/dist/auth.js', { namedExports: { getAccessToken: async () => 'fixture-access-token' } });
  globalThis.fetch = async (input, init = {}) => {
    if (String(input) === 'https://api.deepseek.com/chat/completions') {
      const body = JSON.parse(init.body);
      const systemPrompt = body.messages.find(message => message.role === 'system')?.content || '';
      assert.equal(body.response_format?.type, 'json_object');
      if (!/\bjson\b/i.test(systemPrompt)) {
        return jsonResponse(400, { error: { message: "Prompt must contain the word 'json' in some form to use 'response_format' of type 'json_object'." } });
      }
      return jsonResponse(200, {
        choices: [{ message: { content: JSON.stringify({ operations: [{ type: 'create', title: '供应商回归任务' }] }) } }],
      });
    }
    return fixture.fetch(input, init);
  };

  try {
    const { server } = await import(`../server.js?deepseek-json-test=${randomUUID()}`);
    const preview = await request(server, 'POST', '/api/ai/commands', {
      listId: 'list-1',
      instruction: '新建一个供应商回归任务',
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.data.operations[0].title, '供应商回归任务');
  } finally {
    globalThis.fetch = savedFetch;
    for (const name of envNames) {
      if (savedEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[name];
    }
    mock.reset();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test('model list endpoint and nested cross-list move operations are normalized', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'todo-server-models-move-test-'));
  const fixture = makeGraphFixture();
  fixture.state.lists.push({ id: 'list-2', displayName: '工作' });
  fixture.state.tasks['list-1'][0].title = '待迁移任务';
  fixture.state.tasks['list-2'] = [];
  const envNames = ['CONSOLE_DATA_DIR', 'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL', 'OLLAMA_URL', 'OLLAMA_MODEL'];
  const savedEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  const savedFetch = globalThis.fetch;
  for (const name of envNames) delete process.env[name];
  process.env.CONSOLE_DATA_DIR = dataDirectory;
  process.env.DEEPSEEK_API_KEY = 'fixture-deepseek-key';
  process.env.DEEPSEEK_MODEL = 'deepseek-flash';

  mock.module('@mag-cie/mcp-microsoft-todo/dist/graph.js', { namedExports: fixture.graph });
  mock.module('@mag-cie/mcp-microsoft-todo/dist/auth.js', { namedExports: { getAccessToken: async () => 'fixture-access-token' } });
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url === 'https://api.deepseek.com/models') return jsonResponse(200, { data: [{ id: 'deepseek-v4-pro' }, { id: 'deepseek-flash' }] });
    if (url === 'https://api.deepseek.com/chat/completions') {
      return jsonResponse(200, { choices: [{ message: { content: JSON.stringify({ operations: [{ moveTask: { taskId: 't1', toListName: '工作' } }] }) } }] });
    }
    return fixture.fetch(input, init);
  };

  try {
    const { server } = await import(`../server.js?models-move-test=${randomUUID()}`);
    const models = await request(server, 'GET', '/api/models');
    assert.equal(models.status, 200);
    assert.deepEqual(models.data.models, ['deepseek-flash', 'deepseek-v4-pro']);
    assert.equal(models.data.current, 'deepseek-flash');

    const preview = await request(server, 'POST', '/api/ai/commands', {
      listId: 'list-1', instruction: '把待迁移任务移到工作清单',
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.data.operations[0].type, 'moveTask');
    assert.equal(preview.data.operations[0].toListName, '工作');
    assert.equal(preview.data.operations[0].fromListId, 'list-1');

    const applied = await request(server, 'POST', '/api/ai/apply', { previewId: preview.data.previewId });
    assert.equal(applied.status, 200);
    assert.equal(applied.data.complete, true);
    assert.equal(applied.data.results[0].type, 'moved');
    assert.equal(applied.data.results[0].listId, 'list-2');
    assert.equal(fixture.state.tasks['list-1'].some(task => task.id === 'task-1'), false);
    assert.equal(fixture.state.tasks['list-2'].some(task => task.title === '待迁移任务'), true);
    assert.ok(fixture.state.fetches.some(write => write.method === 'GET' && new URL(write.url).pathname.endsWith('/lists/list-1/tasks/task-1')));
    assert.ok(fixture.state.graphWrites.some(write => write.method === 'DELETE' && write.path.endsWith('/lists/list-1/tasks/task-1')));
  } finally {
    globalThis.fetch = savedFetch;
    for (const name of envNames) {
      if (savedEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[name];
    }
    mock.reset();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

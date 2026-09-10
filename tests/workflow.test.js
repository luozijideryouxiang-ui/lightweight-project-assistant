import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  DEFAULT_TEMPLATE,
  PlanStore,
  applyPlanEdits,
  ensureEstimatedReminders,
  localDate,
  localDateTime,
  parseRules,
  projectSchedule,
  recurrenceRule,
  shiftDate,
  taskFields,
  validDate,
  validateTemplate,
} from '../workflow.js';

test('local date helpers preserve the intended calendar day across midnight', () => {
  const instant = new Date('2026-03-31T23:30:00.000Z');

  assert.equal(localDate(instant, 'Asia/Shanghai'), '2026-04-01');
  assert.equal(localDate(instant, 'America/New_York'), '2026-03-31');
  assert.equal(localDateTime('2026-03-31T23:30:00Z', 'Asia/Shanghai'), '2026-04-01T07:30:00');
  assert.equal(localDateTime('2026-03-31T23:30:00-06:00', 'Asia/Shanghai'), '2026-04-01T13:30:00');
});

test('date validation rejects impossible dates and shifts across month boundaries', () => {
  assert.equal(validDate('2026-02-28'), '2026-02-28');
  assert.throws(() => validDate('2026-02-29'), /日期不存在/);
  assert.throws(() => validDate('2026-04-31'), /日期不存在/);
  assert.throws(() => validDate('26-04-01'), /日期请使用/);
  assert.equal(shiftDate('2026-01-31', 1), '2026-02-01');
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
});

test('task fields map reminder and recurrence to Microsoft Graph shapes', () => {
  const fields = taskFields({
    title: '  收款  ',
    body: '客户确认后跟进',
    importance: 'high',
    categories: ['客户', '财务'],
    dueDateTime: '2026-04-01T09:00',
    reminderDateTime: '2026-04-01T08:45',
    recurrence: 'weekly',
  }, { creating: true, timeZone: 'Asia/Shanghai' });

  assert.equal(fields.title, '收款');
  assert.deepEqual(fields.body, { contentType: 'text', content: '客户确认后跟进' });
  assert.deepEqual(fields.categories, ['客户', '财务']);
  assert.deepEqual(fields.dueDateTime, { dateTime: '2026-04-01T09:00:00', timeZone: 'Asia/Shanghai' });
  assert.deepEqual(fields.reminderDateTime, { dateTime: '2026-04-01T08:45:00', timeZone: 'Asia/Shanghai' });
  assert.equal(fields.isReminderOn, true);
  assert.deepEqual(fields.recurrence, {
    pattern: { type: 'weekly', interval: 1, daysOfWeek: ['wednesday'], firstDayOfWeek: 'monday' },
    range: { type: 'noEnd', startDate: '2026-04-01', recurrenceTimeZone: 'Asia/Shanghai' },
  });
});

test('clearing a due date requires closing an existing recurrence', () => {
  const existing = {
    dueDateTime: { dateTime: '2026-04-01T09:00:00', timeZone: 'Asia/Shanghai' },
    recurrence: recurrenceRule('daily', '2026-04-01T09:00:00', 'Asia/Shanghai'),
    isReminderOn: true,
    reminderDateTime: { dateTime: '2026-04-01T08:45:00', timeZone: 'Asia/Shanghai' },
  };

  assert.throws(
    () => taskFields({ clearDueDate: true }, { existing, timeZone: 'Asia/Shanghai' }),
    /重复任务请保留日期/,
  );
  assert.deepEqual(
    taskFields({ clearDueDate: true, clearRecurrence: true }, { existing, timeZone: 'Asia/Shanghai' }),
    { dueDateTime: null, recurrence: null },
  );
  assert.deepEqual(
    taskFields({ clearReminder: true }, { existing, timeZone: 'Asia/Shanghai' }),
    { reminderDateTime: null, isReminderOn: false },
  );
});

test('project templates produce shifted due and reminder dates across months', () => {
  const template = validateTemplate({
    name: '回款流程',
    steps: [
      { title: '确认需求', offsetDays: 0, reminderTime: '09:00' },
      { title: '催付款', offsetDays: 2, reminderTime: '10:30' },
      { title: '收货确认', offsetDays: 5, reminderTime: '11:00' },
    ],
  });
  const plan = projectSchedule('春季活动', '2026-01-30', template, '2026-01-01');

  assert.equal(plan.projectName, '春季活动');
  assert.deepEqual(plan.steps, [
    { title: '确认需求', dueDateTime: '2026-01-30T18:00:00', reminderDateTime: '2026-01-30T09:00:00' },
    { title: '催付款', dueDateTime: '2026-02-01T18:00:00', reminderDateTime: '2026-02-01T10:30:00' },
    { title: '收货确认', dueDateTime: '2026-02-04T18:00:00', reminderDateTime: '2026-02-04T11:00:00' },
  ]);
  assert.deepEqual(plan.warnings, []);
  assert.equal(DEFAULT_TEMPLATE.steps.length, 4);
  assert.throws(() => validateTemplate({ name: '坏模板', steps: [{ title: '缺时间', offsetDays: 0 }] }), /提醒时间/);
});

test('rule commands refuse ambiguous or missing task names instead of creating a task', () => {
  const tasks = [
    { id: 'a', title: '收款合同', status: 'notStarted' },
    { id: 'b', title: '收款发票', status: 'notStarted' },
    { id: 'log', title: '【项目日志】', status: 'completed' },
  ];

  assert.throws(() => parseRules('完成 收款', tasks, '2026-04-01'), /多个任务/);
  assert.throws(() => parseRules('完成 不存在的任务', tasks, '2026-04-01'), /没有找到对应任务/);
  assert.throws(() => parseRules('修改项目名称', tasks, '2026-04-01'), /DeepSeek|项目排期/);
  assert.deepEqual(parseRules('完成 收款合同', tasks, '2026-04-01'), [{
    type: 'status', taskId: 'a', title: '收款合同', status: 'completed',
  }]);
});

test('rule-created reminder titles contain the task content without scheduling phrases', () => {
  const [operation] = parseRules('提醒2026年4月1日上午9点喝水，每天重复', [], '2026-01-01');

  assert.equal(operation.title, '喝水');
});

test('PlanStore is idempotent, resumes definite failures, stops on uncertainty, and blocks concurrency', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'todo-workflow-test-'));
  try {
    const store = new PlanStore(directory);
    const plan = await store.create({ operations: [{ name: 'one' }, { name: 'two' }] });
    const calls = [];
    const first = await store.apply(plan.previewId, async operation => {
      calls.push(operation.name);
      return { type: 'ok', name: operation.name };
    });
    assert.equal(first.complete, true);
    assert.deepEqual(calls, ['one', 'two']);
    const planPath = join(directory, `${plan.previewId}.json`);
    const before = await stat(planPath);
    const beforeContents = await readFile(planPath, 'utf8');
    await new Promise(resolve => setTimeout(resolve, 20));
    const second = await store.apply(plan.previewId, async () => {
      throw new Error('completed preview must not execute again');
    });
    const after = await stat(planPath);
    assert.equal(second.complete, true);
    assert.equal((await readFile(planPath, 'utf8')), beforeContents);
    assert.equal(after.mtimeNs, before.mtimeNs);

    const retryPlan = await store.create({ operations: [{ name: 'saved' }, { name: 'retry' }, { name: 'after' }] });
    let shouldFail = true;
    const retryCalls = [];
    const failed = await store.apply(retryPlan.previewId, async operation => {
      retryCalls.push(operation.name);
      if (operation.name === 'retry' && shouldFail) {
        const error = new Error('明确失败');
        error.definite = true;
        throw error;
      }
      return { type: 'ok', name: operation.name };
    });
    assert.deepEqual(failed.completed, [0]);
    assert.equal(failed.inFlight, null);
    shouldFail = false;
    const resumed = await store.apply(retryPlan.previewId, async operation => {
      retryCalls.push(operation.name);
      return { type: 'ok', name: operation.name };
    });
    assert.equal(resumed.complete, true);
    assert.deepEqual(retryCalls, ['saved', 'retry', 'retry', 'after']);

    const uncertainPlan = await store.create({ operations: [{ name: 'network' }] });
    let uncertainCalls = 0;
    const uncertain = await store.apply(uncertainPlan.previewId, async () => {
      uncertainCalls += 1;
      throw new Error('连接在服务器处理后中断');
    });
    assert.equal(uncertainCalls, 1);
    assert.equal(uncertain.inFlight, 0);
    assert.match(uncertain.error, /不确定/);
    await assert.rejects(
      () => store.apply(uncertainPlan.previewId, async () => { uncertainCalls += 1; }),
      /结果不确定/,
    );
    assert.equal(uncertainCalls, 1);

    const concurrentPlan = await store.create({ operations: [{ name: 'slow' }] });
    let started;
    const startedPromise = new Promise(resolve => { started = resolve; });
    let release;
    const releasePromise = new Promise(resolve => { release = resolve; });
    const running = store.apply(concurrentPlan.previewId, async () => {
      started();
      await releasePromise;
      return { type: 'ok' };
    });
    await startedPromise;
    await assert.rejects(
      () => store.apply(concurrentPlan.previewId, async () => ({ type: 'unexpected' })),
      /正在执行/,
    );
    release();
    assert.equal((await running).complete, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('estimated reminders fill in only when the user did not specify a time', () => {
  const plan = {
    assumptions: [],
    operations: [
      { type: 'create', title: '无日期任务' },
      { type: 'create', title: '有日期任务', dueDateTime: '2026-09-10T18:00:00' },
      { type: 'create', title: '已有提醒', reminderDateTime: '2026-09-12T20:00:00' },
      { type: 'update', taskId: 't1', title: '更新任务' },
    ],
  };
  ensureEstimatedReminders(plan, '帮我安排一下', '2026-09-07', '2026-09-07T08:00:00');
  assert.equal(plan.operations[0].reminderDateTime, '2026-09-08T09:00:00');
  assert.equal(plan.operations[0].estimatedReminder, true);
  assert.deepEqual(plan.operations[0].patch.reminderDateTime, { dateTime: '2026-09-08T09:00:00', timeZone: 'Asia/Shanghai' });
  assert.equal(plan.operations[0].patch.isReminderOn, true);
  assert.equal(plan.operations[1].reminderDateTime, '2026-09-10T09:00:00');
  assert.equal(plan.operations[2].reminderDateTime, '2026-09-12T20:00:00');
  assert.equal(plan.operations[2].estimatedReminder, undefined);
  assert.equal(plan.operations[3].reminderDateTime, undefined);
  assert.match(plan.assumptions.at(-1), /预估/);

  const declined = { assumptions: [], operations: [{ type: 'create', title: '不需要提醒的任务' }] };
  ensureEstimatedReminders(declined, '新建任务 复习，不用提醒', '2026-09-07');
  assert.equal(declined.operations[0].reminderDateTime, undefined);
  assert.deepEqual(declined.assumptions, []);

  const past = { assumptions: [], operations: [{ type: 'create', title: '已过提醒', dueDateTime: '2026-09-07T18:00:00', patch: { title: '已过提醒' } }] };
  ensureEstimatedReminders(past, '帮我安排一下', '2026-09-07', '2026-09-08T10:00:00');
  assert.equal(past.operations[0].reminderDateTime, '2026-09-09T09:00:00');
  assert.deepEqual(past.operations[0].patch.reminderDateTime, { dateTime: '2026-09-09T09:00:00', timeZone: 'Asia/Shanghai' });
});

test('plan edits validate index, completion state, and operation type before updating times', () => {
  const plan = {
    completed: [1],
    operations: [
      { type: 'create', title: 'A', patch: { title: 'A' }, reminderDateTime: '2026-09-08T09:00:00' },
      { type: 'status', taskId: 't1', status: 'completed', patch: { status: 'completed' } },
    ],
  };
  assert.equal(applyPlanEdits(plan, [{ index: 0, reminderDateTime: '2026-09-09T14:30' }], 'Asia/Shanghai'), true);
  assert.deepEqual(plan.operations[0].patch.reminderDateTime, { dateTime: '2026-09-09T14:30:00', timeZone: 'Asia/Shanghai' });
  assert.equal(plan.operations[0].reminderDateTime, '2026-09-09T14:30:00');
  assert.equal(plan.operations[0].estimatedReminder, false);
  assert.throws(() => applyPlanEdits(plan, [{ index: 5, reminderDateTime: '2026-09-09T14:30:00' }]), /不存在/);
  assert.throws(() => applyPlanEdits(plan, [{ index: 1, reminderDateTime: '2026-09-09T14:30:00' }]), /已执行/);
  assert.throws(
    () => applyPlanEdits({ completed: [], operations: [{ type: 'progressNote', text: 'x', patch: {} }] }, [{ index: 0, reminderDateTime: '2026-09-09T14:30:00' }]),
    /不支持/,
  );
  assert.equal(applyPlanEdits(plan, []), false);

  const atomic = {
    completed: [],
    operations: [
      { type: 'create', title: '保持 A', patch: { title: '保持 A' } },
      { type: 'create', title: '保持 B', patch: { title: '保持 B' } },
    ],
  };
  const beforeAtomic = structuredClone(atomic);
  assert.throws(
    () => applyPlanEdits(atomic, [
      { index: 0, reminderDateTime: '2026-09-10T09:00:00' },
      { index: 1, reminderDateTime: '不是有效时间' },
    ]),
    /ISO 日期时间/,
  );
  assert.deepEqual(atomic, beforeAtomic);
});

test('PlanStore.apply executes selected indices only and completes when every item is done', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'todo-workflow-select-'));
  try {
    const store = new PlanStore(directory);
    const calls = [];
    const plan = await store.create({ operations: [{ name: 'one' }, { name: 'two' }, { name: 'three' }] });
    const perform = async operation => { calls.push(operation.name); return { type: 'ok', name: operation.name }; };

    const partial = await store.apply(plan.previewId, perform, { indices: [2] });
    assert.deepEqual(calls, ['three']);
    assert.deepEqual(partial.completed, [2]);
    assert.equal(partial.complete, false);

    const repeated = await store.apply(plan.previewId, perform, { indices: [2, 2] });
    assert.deepEqual(repeated.completed, [2]);
    assert.deepEqual(calls, ['three']);

    const mutated = await store.apply(plan.previewId, perform, {
      indices: [0, 1],
      mutate: candidate => { candidate.operations[1].name = 'two-edited'; return true; },
    });
    assert.deepEqual(calls, ['three', 'one', 'two-edited']);
    assert.deepEqual(mutated.completed, [2, 0, 1]);
    assert.equal(mutated.complete, true);

    const emptyPlan = await store.create({ operations: [{ name: 'must-not-run' }] });
    let emptyCalls = 0;
    await assert.rejects(
      () => store.apply(emptyPlan.previewId, async () => { emptyCalls += 1; }, { indices: [] }),
      /至少选择一项/,
    );
    assert.equal(emptyCalls, 0);

    const projectPlan = await store.create({
      project: { projectName: '顺序项目' },
      listId: 'origin-list',
      operations: [
        { type: 'create', title: '项目节点' },
        { type: 'createProject', title: '顺序项目' },
      ],
    });
    const projectCalls = [];
    const projectApplied = await store.apply(projectPlan.previewId, async (operation, current) => {
      projectCalls.push({ type: operation.type, listId: current.listId });
      return operation.type === 'createProject' ? { type: 'createdProject', listId: 'new-project-list' } : { type: 'created' };
    });
    assert.deepEqual(projectCalls, [
      { type: 'createProject', listId: 'origin-list' },
      { type: 'create', listId: 'new-project-list' },
    ]);
    assert.equal(projectApplied.listId, 'new-project-list');

    const dependentPlan = await store.create({
      project: { projectName: '需先建清单' },
      listId: 'origin-list',
      operations: [
        { type: 'createProject', title: '需先建清单' },
        { type: 'create', title: '节点' },
      ],
    });
    let dependentCalls = 0;
    await assert.rejects(
      () => store.apply(dependentPlan.previewId, async () => { dependentCalls += 1; }, { indices: [1] }),
      /先执行项目创建/,
    );
    assert.equal(dependentCalls, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('PlanStore.replace keeps preview snapshots immutable and refuses replacement during apply', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'todo-workflow-replace-'));
  try {
    const store = new PlanStore(directory);
    const original = await store.create({ operations: [{ name: 'old' }] });
    const replacement = await store.replace(original.previewId, { operations: [{ name: 'new' }] });
    assert.notEqual(replacement.previewId, original.previewId);
    assert.deepEqual((await store.get(original.previewId)).supersededBy, replacement.previewId);
    let oldCalls = 0;
    await assert.rejects(
      () => store.apply(original.previewId, async () => { oldCalls += 1; }),
      /新的预览/,
    );
    assert.equal(oldCalls, 0);

    const applyingPlan = await store.create({ operations: [{ name: 'apply-first' }, { name: 'apply-next' }] });
    let started;
    const startedPromise = new Promise(resolve => { started = resolve; });
    let release;
    const releasePromise = new Promise(resolve => { release = resolve; });
    const running = store.apply(applyingPlan.previewId, async operation => {
      started();
      await releasePromise;
      return { type: 'ok', name: operation.name };
    }, { indices: [0] });
    await startedPromise;
    await assert.rejects(
      () => store.replace(applyingPlan.previewId, { operations: [{ name: 'must-not-replace' }] }),
      /正在执行/,
    );
    release();
    const applied = await running;
    assert.deepEqual(applied.completed, [0]);
    assert.equal((await store.get(applyingPlan.previewId)).supersededBy, undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

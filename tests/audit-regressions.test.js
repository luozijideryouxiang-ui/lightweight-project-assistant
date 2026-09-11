import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  ensureEstimatedReminders,
  parseDatePhrase,
  readPrivateJson,
  recurrenceRule,
  taskFields,
} from '../workflow.js';

test('month/day phrases roll into the next future year instead of the past', () => {
  assert.equal(parseDatePhrase('1月2日', '2026-12-31'), '2027-01-02');
  assert.equal(parseDatePhrase('12月31日', '2026-12-31'), '2026-12-31');
  assert.equal(parseDatePhrase('2月29日', '2027-03-01'), '2028-02-29');
});

test('moving a recurring task also moves its recurrence anchor', () => {
  const existing = {
    dueDateTime: { dateTime: '2026-09-01T18:00:00', timeZone: 'Asia/Shanghai' },
    recurrence: recurrenceRule('weekly', '2026-09-01T18:00:00', 'Asia/Shanghai'),
  };
  const patch = taskFields({ dueDateTime: '2026-09-08T18:00:00' }, { existing, timeZone: 'Asia/Shanghai' });
  assert.equal(patch.recurrence.range.startDate, '2026-09-08');
  assert.deepEqual(patch.recurrence.pattern.daysOfWeek, ['tuesday']);
});

test('estimated reminders use the requested timezone', () => {
  const plan = { assumptions: [], operations: [{ type: 'create', title: '测试时区' }] };
  ensureEstimatedReminders(plan, '帮我安排一下', '2026-09-10', new Date('2026-09-10T23:30:00Z'), 'America/Los_Angeles');
  assert.equal(plan.operations[0].patch.reminderDateTime.timeZone, 'America/Los_Angeles');
});

test('malformed private JSON is quarantined and defaults are recovered', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'todo-corrupt-settings-'));
  try {
    const path = join(directory, 'settings.json');
    await writeFile(path, '{broken-json', 'utf8');
    assert.deepEqual(await readPrivateJson(path, { recovered: true }), { recovered: true });
    const names = await readdir(directory);
    assert.ok(names.some(name => name.startsWith('settings.json.corrupt-')));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

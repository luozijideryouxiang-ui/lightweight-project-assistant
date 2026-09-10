import { mkdir, readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const DEFAULT_TEMPLATE = {
  name: '项目跟进',
  steps: [
    { title: '确认项目需求', offsetDays: 0, reminderTime: '09:00' },
    { title: '催付款', offsetDays: 2, reminderTime: '09:00' },
    { title: '确认收货', offsetDays: 3, reminderTime: '09:00' },
    { title: '安排发货', offsetDays: 5, reminderTime: '09:00' },
  ],
};
export const STATUSES = new Set(['notStarted', 'inProgress', 'waitingOnOthers', 'completed', 'deferred']);

export function localDate(now = new Date(), timeZone = 'Asia/Shanghai') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(key => parts.find(p => p.type === key).value).join('-');
}

export function validDate(value) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) throw new Error('日期请使用 YYYY-MM-DD');
  const date = new Date(value + 'T12:00:00Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('日期不存在');
  return value;
}

export function shiftDate(value, days) {
  validDate(value);
  const date = new Date(value + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return validDate(date.toISOString().slice(0, 10));
}

export function localDateTime(value, timeZone = 'Asia/Shanghai') {
  if (typeof value !== 'string') throw new Error('时间格式无效');
  const match = value.match(/^(20\d{2}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/);
  if (!match) throw new Error('时间请使用 ISO 日期时间格式');
  validDate(match[1]);
  if (+match[2] > 23 || +match[3] > 59 || +(match[4] || 0) > 59) throw new Error('时间不存在');
  if (match[5]) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('时区格式无效');
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const p = key => parts.find(item => item.type === key).value;
    return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}:${p('second')}`;
  }
  return `${match[1]}T${match[2]}:${match[3]}:${match[4] || '00'}`;
}

export function recurrenceRule(kind, date, timeZone = 'Asia/Shanghai') {
  if (kind === 'none' || kind === null) return null;
  if (!['daily', 'weekly', 'monthly'].includes(kind)) throw new Error('重复方式仅支持每天、每周或每月');
  if (!date) throw new Error('请先设置日期，再设置重复');
  const startDate = localDateTime(date, timeZone).slice(0, 10);
  const day = new Date(startDate + 'T12:00:00Z');
  const pattern = { type: kind === 'monthly' ? 'absoluteMonthly' : kind, interval: 1 };
  if (kind === 'weekly') Object.assign(pattern, { daysOfWeek: [['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][day.getUTCDay()]], firstDayOfWeek: 'monday' });
  if (kind === 'monthly') pattern.dayOfMonth = day.getUTCDate();
  return { pattern, range: { type: 'noEnd', startDate, recurrenceTimeZone: timeZone } };
}

// Graph uses local wall-clock strings paired with a timeZone, rather than a Z suffix.
export function taskFields(input, { creating = false, existing = {}, timeZone = 'Asia/Shanghai' } = {}) {
  const patch = {};
  if (creating || Object.hasOwn(input, 'title')) {
    if (typeof input.title !== 'string' || !input.title.trim()) throw new Error('任务标题不能为空');
    patch.title = input.title.trim().slice(0, 500);
  }
  if (input.status !== undefined) {
    if (!STATUSES.has(input.status)) throw new Error('任务状态无效');
    patch.status = input.status;
  }
  if (input.importance !== undefined) {
    if (!['low', 'normal', 'high'].includes(input.importance)) throw new Error('优先级无效');
    patch.importance = input.importance;
  }
  if (typeof input.body === 'string') patch.body = { contentType: 'text', content: input.body.slice(0, 20000) };
  if (Array.isArray(input.categories)) patch.categories = input.categories.filter(v => typeof v === 'string').slice(0, 12);
  for (const field of ['dueDateTime', 'reminderDateTime']) {
    if (input[field]) patch[field] = { dateTime: localDateTime(input[field], timeZone), timeZone };
  }
  if (patch.reminderDateTime) patch.isReminderOn = true;
  if (input.clearDueDate === true) patch.dueDateTime = null;
  if (input.clearReminder === true) { patch.reminderDateTime = null; patch.isReminderOn = false; }
  if (input.recurrence !== undefined) patch.recurrence = recurrenceRule(input.recurrence, input.dueDateTime || existing.dueDateTime?.dateTime, timeZone);
  if (input.clearRecurrence === true) patch.recurrence = null;
  if (patch.dueDateTime === null && (patch.recurrence || (existing.recurrence && patch.recurrence !== null))) throw new Error('重复任务请保留日期，或同时关闭重复');
  return patch;
}

export function validateTemplate(value) {
  if (!value || typeof value.name !== 'string' || !value.name.trim()) throw new Error('模板名称不能为空');
  if (!Array.isArray(value.steps) || !value.steps.length || value.steps.length > 20) throw new Error('模板需要 1–20 个节点');
  const steps = value.steps.map(step => {
    if (typeof step.title !== 'string' || !step.title.trim()) throw new Error('节点标题不能为空');
    if (!Number.isInteger(step.offsetDays) || Math.abs(step.offsetDays) > 365) throw new Error('相对天数须为 -365 到 365 的整数');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(step.reminderTime || '')) throw new Error('提醒时间请使用 HH:mm');
    return { title: step.title.trim().slice(0, 200), offsetDays: step.offsetDays, reminderTime: step.reminderTime };
  });
  return { name: value.name.trim().slice(0, 100), steps };
}

export function projectSchedule(projectName, startDate, template = DEFAULT_TEMPLATE, today = localDate()) {
  if (typeof projectName !== 'string' || !projectName.trim()) throw new Error('项目名称不能为空');
  validDate(startDate);
  const normalized = validateTemplate(template);
  const steps = normalized.steps.map(step => {
    const date = shiftDate(startDate, step.offsetDays);
    return { title: step.title, dueDateTime: date + 'T18:00:00', reminderDateTime: date + 'T' + step.reminderTime + ':00' };
  });
  return { projectName: projectName.trim().slice(0, 200), startDate, steps, warnings: steps.some(s => s.dueDateTime.slice(0, 10) < today) ? ['部分节点已在过去，请检查接入日期与模板。'] : [] };
}

export function parseDatePhrase(text, today = localDate()) {
  const full = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/u);
  if (full) return validDate(`${full[1]}-${full[2].padStart(2, '0')}-${full[3].padStart(2, '0')}`);
  const short = text.match(/(\d{1,2})月(\d{1,2})日?/u);
  if (short) return validDate(`${today.slice(0, 4)}-${short[1].padStart(2, '0')}-${short[2].padStart(2, '0')}`);
  if (/后天/.test(text)) return shiftDate(today, 2);
  if (/明天/.test(text)) return shiftDate(today, 1);
  if (/今天|今晚/.test(text)) return today;
  const week = text.match(/(下)?(?:周|星期)([一二三四五六日天])/u);
  if (week) {
    const current = (new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7;
    const target = '一二三四五六日'.indexOf(week[2].replace('天', '日'));
    return shiftDate(today, week[1] ? 7 - current + target : (target - current + 7) % 7);
  }
  return undefined;
}

function phraseTime(text, fallback) {
  const m = text.match(/(上午|早上|下午|晚上|今晚)?\s*(\d{1,2})(?:[:：](\d{2})|点(?:(\d{1,2})分?)?)/u);
  if (!m) return fallback;
  let hour = +m[2];
  if (/下午|晚上|今晚/.test(m[1] || '') && hour < 12) hour += 12;
  const minute = +(m[3] || m[4] || 0);
  if (hour > 23 || minute > 59) throw new Error('指令中的时间不存在');
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

export function parseRules(instruction, tasks, today = localDate()) {
  const operations = [];
  const segments = instruction.split(/[\n；;。]+/u).map(v => v.trim()).filter(Boolean);
  if (segments.length > 30) throw new Error('一次最多处理 30 项操作');
  const findTask = keyword => {
    const matches = tasks.filter(task => !task.title.startsWith('【项目日志】') && (task.title === keyword || task.title.includes(keyword)));
    const exact = matches.filter(task => task.title === keyword);
    if (exact.length === 1) return exact[0];
    if (matches.length !== 1) throw new Error(matches.length ? '匹配到多个任务，请说完整标题' : '没有找到对应任务，请说完整标题');
    return matches[0];
  };
  for (const segment of segments) {
    if (/^(记录进展|进度|汇报)[：:]/u.test(segment)) { operations.push({ type: 'progressNote', text: segment.replace(/^[^：:]+[：:]\s*/u, '') }); continue; }
    const status = segment.match(/^(完成|做完|开始|等待|延期)\s*(?:任务)?[：:]?\s*(.+)$/u);
    if (status && !/改到|改为|推迟到/.test(segment)) {
      const task = findTask(status[2].trim());
      operations.push({ type: 'status', taskId: task.id, title: task.title, ...(task.listId ? { sourceListId: task.listId } : {}), status: { 完成: 'completed', 做完: 'completed', 开始: 'inProgress', 等待: 'waitingOnOthers', 延期: 'deferred' }[status[1]] }); continue;
    }
    const update = segment.match(/^(?:把)?(.+?)(?:改到|安排到|推迟到)(.+)$/u);
    if (update) {
      const task = findTask(update[1].trim());
      const date = parseDatePhrase(update[2], today);
      if (!date) throw new Error('请补充明确的调整日期');
      const dueDateTime = date + 'T' + phraseTime(update[2], '18:00:00');
      operations.push({ type: 'update', taskId: task.id, title: task.title, ...(task.listId ? { sourceListId: task.listId } : {}), dueDateTime, ...(task.isReminderOn || /提醒/.test(update[2]) ? { reminderDateTime: dueDateTime } : {}) }); continue;
    }
    // Unrecognised editing requests must never silently become new tasks.
    if (/删除|取消|修改|改成|改为|设置|所有|全部|移动|重命名|项目|排期/.test(segment)) throw new Error('这条指令需要 DeepSeek，或请使用任务编辑与项目排期入口');
    if (!/^(请|帮我|添加|新建|创建|提醒|明天|后天|今天|今晚|周|星期|下周|\d)/u.test(segment)) throw new Error('规则模式支持：添加任务、完成任务、把任务改到明天；复杂指令请配置 DeepSeek');
    const date = parseDatePhrase(segment, today);
    if (!date && /提醒|每天|每周|每月/.test(segment)) throw new Error('请同时指定开始日期，例如“今天上午9点提醒喝水，每天重复”');
    const title = segment
      .replace(/^(?:(?:请|帮我|添加|新建|创建|提醒我|提醒|任务)[：:\s]*)+/u, '')
      .replace(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?|\d{1,2}月\d{1,2}日?/gu, '')
      .replace(/今天|今晚|明天|后天|(?:下)?(?:周|星期)[一二三四五六日天]/gu, '')
      .replace(/(?:上午|早上|下午|晚上)?\s*\d{1,2}(?:[:：]\d{2}|点(?:\d{1,2}分?)?)/gu, '')
      .replace(/[，,]?\s*(?:每天|每周|每月)(?:重复)?/gu, '')
      .replace(/^[，,：:\s]+|[，,：:\s]+$/gu, '').trim();
    if (!title) throw new Error('请说出任务内容');
    const recurrence = /每天/.test(segment) ? 'daily' : /每周/.test(segment) ? 'weekly' : /每月/.test(segment) ? 'monthly' : undefined;
    const dueDateTime = date ? date + 'T' + phraseTime(segment, /提醒/.test(segment) ? '09:00:00' : '18:00:00') : undefined;
    operations.push({ type: 'create', title, importance: /重要|紧急/.test(segment) ? 'high' : 'normal', ...(dueDateTime ? { dueDateTime } : {}), ...(/提醒/.test(segment) ? { reminderDateTime: dueDateTime } : {}), ...(recurrence ? { recurrence } : {}) });
  }
  if (!operations.length) throw new Error('没有识别到可执行操作');
  return operations;
}

export async function readPrivateJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw new Error('本地设置文件无法读取，请检查文件权限或格式'); }
}

export async function writePrivateJson(path, value) {
  const temp = path + '.' + randomUUID() + '.tmp';
  await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
  await rename(temp, path);
  await chmod(path, 0o600);
}

export class PlanStore {
  constructor(directory) { this.directory = directory; this.running = new Set(); }
  path(id) { if (!/^[a-f\d-]{36}$/.test(id || '')) throw new Error('操作预览无效'); return join(this.directory, id + '.json'); }
  async save(plan) { await mkdir(this.directory, { recursive: true, mode: 0o700 }); await writePrivateJson(this.path(plan.previewId), plan); }
  async create(value) {
    const plan = { ...value, previewId: randomUUID(), createdAt: Date.now(), results: [], completed: [], inFlight: null, complete: false };
    await this.save(plan);
    return plan;
  }
  async get(id) { const plan = await readPrivateJson(this.path(id), null); if (!plan) throw new Error('操作预览已失效，请重新生成'); return plan; }
  async replace(id, value) {
    if (this.running.has(id)) throw new Error('该操作正在执行，请稍候再修改');
    this.running.add(id);
    try {
      const previous = await this.get(id);
      if (previous.supersededBy) throw new Error('该操作预览已经被新的预览替换，请使用最新预览');
      if (previous.complete === true) throw new Error('该操作预览已经执行完成，请开启新的预览');
      if (Array.isArray(previous.completed) && previous.completed.length) throw new Error('该操作预览已经部分执行，不能重建整单');
      if (previous.inFlight !== null && previous.inFlight !== undefined) throw new Error('该操作正在执行或结果不确定，请先同步核对');

      // Create the replacement while the old id is locked, then mark the old
      // immutable snapshot. Any concurrent apply is rejected by the same lock.
      const replacement = await this.create(value);
      previous.supersededBy = replacement.previewId;
      previous.supersededAt = Date.now();
      await this.save(previous);
      return replacement;
    } finally { this.running.delete(id); }
  }
  async apply(id, perform, options = {}) {
    if (this.running.has(id)) throw new Error('该操作正在执行，请稍候');
    this.running.add(id);
    try {
      const plan = await this.get(id);
      if (!Array.isArray(plan.operations)) throw new Error('操作预览无效');
      if (!Array.isArray(plan.completed)) plan.completed = [];
      if (plan.supersededBy) {
        const error = new Error('该操作预览已经被新的预览替换，请使用最新预览');
        error.statusCode = 409;
        throw error;
      }
      if (plan.complete) return plan;
      if (plan.inFlight !== null && plan.inFlight !== undefined) throw new Error('上一次请求结果不确定。请先同步核对已创建的项目和任务，避免重复执行');
      if (!plan.completed.length && Date.now() - plan.createdAt > 86400000) throw new Error('预览已超过24小时，请重新生成');

      const pending = plan.operations.map((_, i) => i).filter(i => !plan.completed.includes(i));
      let targets = pending;
      if (Array.isArray(options.indices)) {
        if (!options.indices.length) throw new Error('至少选择一项要执行的操作');
        const requested = [...new Set(options.indices.map(Number))];
        if (requested.some(i => !Number.isInteger(i) || i < 0 || i >= plan.operations.length)) throw new Error('要执行的项目不存在');
        targets = pending.filter(i => requested.includes(i));
        // The client can retry with a stale selection after another item was
        // completed. Treat that as an idempotent no-op instead of writing it
        // again or forcing the caller into an error loop.
        if (!targets.length) return plan;
      }
      const projectIndex = plan.operations.findIndex(operation => operation?.type === 'createProject');
      if (plan.project && projectIndex < 0) throw new Error('项目预览缺少项目创建操作，已阻止写入错误清单');
      if (projectIndex >= 0 && !plan.completed.includes(projectIndex) && !targets.includes(projectIndex) && targets.some(i => i !== projectIndex)) {
        throw new Error('请先执行项目创建操作，再执行项目节点');
      }
      // A malformed project plan must still create its list before any node,
      // even when createProject was stored after the node operations.
      if (projectIndex >= 0 && !plan.completed.includes(projectIndex) && targets.includes(projectIndex)) {
        targets = [projectIndex, ...targets.filter(i => i !== projectIndex)];
      }
      if (typeof options.mutate === 'function') {
        const mutated = options.mutate(plan);
        if (mutated) await this.save(plan);
      }
      for (const i of targets) {
        plan.inFlight = i;
        await this.save(plan);
        try {
          const result = await perform(plan.operations[i], plan);
          plan.results.push(result);
          if (result.listId) plan.listId = result.listId;
          plan.completed.push(i);
          plan.inFlight = null;
          delete plan.error;
          await this.save(plan);
        } catch (error) {
          if (error.definite === true) plan.inFlight = null;
          plan.error = error.definite === true ? error.message : '请求结果尚不确定，请先同步核对，避免重复创建。';
          await this.save(plan);
          return plan;
        }
      }
      plan.complete = plan.operations.every((_, i) => plan.completed.includes(i));
      await this.save(plan);
      return plan;
    } finally { this.running.delete(id); }
  }
}

function localClock(now, timeZone = 'Asia/Shanghai') {
  if (typeof now === 'string') {
    const value = now.trim().replace(' ', 'T');
    if (/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return value.length === 16 ? `${value}:00` : value;
  }
  const date = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const value = type => parts.find(part => part.type === type)?.value || '00';
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}:${value('second')}`;
}

function futureEstimatedReminder(preferredDate, today, now) {
  const nowLocal = localClock(now);
  const baseDate = typeof today === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(today) ? today : localDate();
  let date = typeof preferredDate === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(preferredDate) ? preferredDate : shiftDate(baseDate, 1);
  let value = `${date}T09:00:00`;
  if (value <= nowLocal) value = `${shiftDate(nowLocal.slice(0, 10), 1)}T09:00:00`;
  return value;
}

// 用户没有说时间时，为新建任务补一个可调整的预估提醒（到期日当天或次日上午 09:00）。
export function ensureEstimatedReminders(plan, instruction, today = localDate(), now = new Date()) {
  if (!plan || !Array.isArray(plan.operations)) return plan;
  if (typeof instruction === 'string' && /不用提醒|无需提醒|不需要提醒|不设置提醒|别提醒|不要提醒|关闭提醒|有空|不急/.test(instruction)) return plan;
  const estimated = [];
  for (const operation of plan.operations) {
    if (!operation || operation.type !== 'create' || operation.reminderDateTime || operation.clearReminder) continue;
    const preferredDate = operation.dueDateTime ? operation.dueDateTime.slice(0, 10) : shiftDate(today, 1);
    const reminderDateTime = futureEstimatedReminder(preferredDate, today, now);
    operation.reminderDateTime = reminderDateTime;
    operation.estimatedReminder = true;
    const reminderPatch = taskFields({ reminderDateTime }, {
      existing: operation.dueDateTime ? { dueDateTime: { dateTime: operation.dueDateTime }, recurrence: operation.recurrence } : {},
      timeZone: 'Asia/Shanghai',
    });
    if (!operation.patch || typeof operation.patch !== 'object') {
      operation.patch = taskFields({
        title: operation.title,
        ...(operation.body ? { body: operation.body } : {}),
        ...(operation.importance ? { importance: operation.importance } : {}),
        ...(operation.dueDateTime ? { dueDateTime: operation.dueDateTime } : {}),
        reminderDateTime,
      }, { creating: true, timeZone: 'Asia/Shanghai' });
    } else {
      Object.assign(operation.patch, reminderPatch);
    }
    estimated.push(operation.title);
  }
  if (estimated.length) {
    const assumptions = Array.isArray(plan.assumptions) ? plan.assumptions.slice() : [];
    const names = estimated.slice(0, 3).map(title => `「${title}」`).join('');
    assumptions.push(`${names}${estimated.length > 3 ? ` 等 ${estimated.length} 项` : ''}未指定时间，已按预估未来上午 09:00 设置提醒；预览中可逐项调整后单独确认。`);
    plan.assumptions = assumptions;
  }
  return plan;
}

// 预览中逐项调整时间：先在副本中完成所有校验，再一次性提交，避免半套编辑被保存。
export function applyPlanEdits(plan, edits, timeZone = 'Asia/Shanghai') {
  if (!plan || !Array.isArray(plan.operations)) return false;
  if (!Array.isArray(edits) || !edits.length) return false;
  const draft = structuredClone(plan);
  let changed = false;
  for (const edit of edits) {
    const index = Number(edit && edit.index);
    if (!Number.isInteger(index) || index < 0 || index >= draft.operations.length) throw new Error('要调整的项不存在');
    if (Array.isArray(draft.completed) && draft.completed.includes(index)) throw new Error('该项已执行，不能调整');
    const operation = draft.operations[index];
    if (!operation || !['create', 'update'].includes(operation.type)) throw new Error('该项不支持调整时间');
    const fields = {};
    if (edit && edit.clearReminder === true) fields.clearReminder = true;
    if (edit && edit.dueDateTime !== undefined && edit.dueDateTime !== null && edit.dueDateTime !== '') fields.dueDateTime = edit.dueDateTime;
    if (edit && edit.reminderDateTime !== undefined && edit.reminderDateTime !== null && edit.reminderDateTime !== '') fields.reminderDateTime = edit.reminderDateTime;
    if (!Object.keys(fields).length) continue;
    const existing = {
      ...(operation.dueDateTime ? { dueDateTime: { dateTime: operation.dueDateTime } } : {}),
      ...(operation.recurrence ? { recurrence: operation.recurrence } : {}),
    };
    // Rebuild the Graph recurrence when its anchor due date moves. Otherwise
    // a repeating task keeps the old recurrence startDate after the preview
    // edit, even though its displayed due date changed.
    if (fields.dueDateTime && typeof operation.recurrence === 'string') fields.recurrence = operation.recurrence;
    const patch = taskFields(fields, { existing, timeZone });
    if (!operation.patch || typeof operation.patch !== 'object') operation.patch = {};
    Object.assign(operation.patch, patch);
    if (patch.reminderDateTime) { operation.reminderDateTime = patch.reminderDateTime.dateTime; operation.estimatedReminder = false; }
    if (patch.dueDateTime) operation.dueDateTime = patch.dueDateTime.dateTime;
    if (fields.clearReminder === true) { operation.reminderDateTime = null; operation.clearReminder = true; operation.estimatedReminder = false; }
    changed = true;
  }
  if (changed) Object.assign(plan, draft);
  return changed;
}

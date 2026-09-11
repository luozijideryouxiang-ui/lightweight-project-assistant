import { readFile, writeFile } from 'node:fs/promises';

async function patch(path, edits) {
  let text = await readFile(path, 'utf8');
  for (const { from, to, label } of edits) {
    const count = text.split(from).length - 1;
    if (count !== 1) throw new Error(`${path}: ${label} expected exactly once, found ${count}`);
    text = text.replace(from, to);
  }
  await writeFile(path, text);
}

await patch('workflow.js', [
  {
    label: 're-anchor existing recurrence when due date moves',
    from: "  if (input.recurrence !== undefined) patch.recurrence = recurrenceRule(input.recurrence, input.dueDateTime || existing.dueDateTime?.dateTime, timeZone);\n  if (input.clearRecurrence === true) patch.recurrence = null;",
    to: "  if (input.recurrence !== undefined) patch.recurrence = recurrenceRule(input.recurrence, input.dueDateTime || existing.dueDateTime?.dateTime, timeZone);\n  // Moving the due date of an existing recurring task must also move the\n  // recurrence anchor. Otherwise Graph keeps the old startDate even though\n  // the task now displays a different due date.\n  if (input.dueDateTime && input.recurrence === undefined && existing.recurrence) {\n    const type = existing.recurrence?.pattern?.type;\n    const kind = type === 'absoluteMonthly' ? 'monthly' : (type === 'daily' || type === 'weekly' ? type : null);\n    if (kind) patch.recurrence = recurrenceRule(kind, input.dueDateTime, timeZone);\n  }\n  if (input.clearRecurrence === true) patch.recurrence = null;"
  },
  {
    label: 'roll month-day phrases into the next year',
    from: "  const short = text.match(/(\\d{1,2})月(\\d{1,2})日?/u);\n  if (short) return validDate(`${today.slice(0, 4)}-${short[1].padStart(2, '0')}-${short[2].padStart(2, '0')}`);",
    to: "  const short = text.match(/(\\d{1,2})月(\\d{1,2})日?/u);\n  if (short) {\n    const month = short[1].padStart(2, '0');\n    const day = short[2].padStart(2, '0');\n    const currentYear = Number(today.slice(0, 4));\n    const current = `${currentYear}-${month}-${day}`;\n    try {\n      validDate(current);\n      if (current >= today) return current;\n    } catch { /* Try the next valid future year (for example Feb 29). */ }\n    for (let year = currentYear + 1; year <= currentYear + 8; year += 1) {\n      const candidate = `${year}-${month}-${day}`;\n      try { return validDate(candidate); } catch { /* continue */ }\n    }\n    throw new Error('日期不存在');\n  }"
  },
  {
    label: 'recover malformed private json',
    from: "export async function readPrivateJson(path, fallback) {\n  try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw new Error('本地设置文件无法读取，请检查文件权限或格式'); }\n}",
    to: "export async function readPrivateJson(path, fallback) {\n  try {\n    return JSON.parse(await readFile(path, 'utf8'));\n  } catch (error) {\n    if (error.code === 'ENOENT') return fallback;\n    // A truncated/corrupt JSON file should not brick the local service. Keep a\n    // forensic copy and recover with defaults; permission/I/O errors still fail.\n    if (error instanceof SyntaxError) {\n      try { await rename(path, `${path}.corrupt-${Date.now()}`); } catch { /* best effort */ }\n      return fallback;\n    }\n    throw new Error('本地设置文件无法读取，请检查文件权限或格式');\n  }\n}"
  },
  {
    label: 'respect configured timezone for estimated reminders',
    from: "function futureEstimatedReminder(preferredDate, today, now) {\n  const nowLocal = localClock(now);",
    to: "function futureEstimatedReminder(preferredDate, today, now, timeZone) {\n  const nowLocal = localClock(now, timeZone);"
  },
  {
    label: 'pass timezone through estimated reminder generation',
    from: "export function ensureEstimatedReminders(plan, instruction, today = localDate(), now = new Date()) {",
    to: "export function ensureEstimatedReminders(plan, instruction, today = localDate(new Date(), process.env.TIME_ZONE || 'Asia/Shanghai'), now = new Date(), timeZone = process.env.TIME_ZONE || 'Asia/Shanghai') {"
  },
  {
    label: 'timezone estimated reminder call',
    from: "    const reminderDateTime = futureEstimatedReminder(preferredDate, today, now);",
    to: "    const reminderDateTime = futureEstimatedReminder(preferredDate, today, now, timeZone);"
  },
  {
    label: 'timezone estimated reminder patch',
    from: "      timeZone: 'Asia/Shanghai',\n    });",
    to: "      timeZone,\n    });"
  },
  {
    label: 'timezone estimated reminder create patch',
    from: "      }, { creating: true, timeZone: 'Asia/Shanghai' });",
    to: "      }, { creating: true, timeZone });"
  }
]);

await patch('server.js', [
  {
    label: 'serialize project log writes',
    from: "async function appendProjectLog(listId, text) {\n  if (typeof text !== \"string\" || !text.trim()) throw new Error(\"进度内容不能为空\");\n  const line = `[${formatLocalTimestamp()}] ${text.trim().replace(/\\s+/g, \" \")}`;\n  const tasks = await listTasks(listId, { paginate: true, top: 100 });\n  const existing = tasks.find((task) => task.title === PROJECT_LOG_TITLE);\n  if (existing) {\n    const current = existing.body?.content || \"\";\n    const next = `${current}${current ? \"\\n\" : \"\"}${line}`.slice(-20000);\n    return updateTask(listId, existing.id, { body: next });\n  }\n  const created = await createTask(listId, {\n    title: PROJECT_LOG_TITLE,\n    body: line,\n    importance: \"low\",\n  });\n  return updateTask(listId, created.id, { status: \"completed\" });\n}",
    to: "const projectLogQueues = new Map();\n\nasync function appendProjectLog(listId, text) {\n  if (typeof text !== \"string\" || !text.trim()) throw new Error(\"进度内容不能为空\");\n  const previous = projectLogQueues.get(listId) || Promise.resolve();\n  const run = previous.catch(() => {}).then(async () => {\n    const line = `[${formatLocalTimestamp()}] ${text.trim().replace(/\\s+/g, \" \")}`;\n    const tasks = await listTasks(listId, { paginate: true, top: 100 });\n    const existing = tasks.find((task) => task.title === PROJECT_LOG_TITLE);\n    if (existing) {\n      const current = existing.body?.content || \"\";\n      const next = `${current}${current ? \"\\n\" : \"\"}${line}`.slice(-20000);\n      return updateTask(listId, existing.id, { body: next });\n    }\n    const created = await createTask(listId, {\n      title: PROJECT_LOG_TITLE,\n      body: line,\n      importance: \"low\",\n    });\n    return updateTask(listId, created.id, { status: \"completed\" });\n  });\n  projectLogQueues.set(listId, run);\n  try { return await run; } finally { if (projectLogQueues.get(listId) === run) projectLogQueues.delete(listId); }\n}"
  },
  {
    label: 'preserve OpenAI-compatible version prefix for models endpoint',
    from: "function modelsEndpointFor(provider) {\n  if (!provider || !provider.endpoint) return null;\n  try {\n    const url = new URL(provider.endpoint);\n    if (url.hostname.endsWith('deepseek.com')) return `${url.origin}/models`;\n    if (url.hostname.endsWith('openrouter.ai')) return `${url.origin}/api/v1/models`;\n    return `${url.origin}/models`;\n  } catch {\n    return null;\n  }\n}",
    to: "function modelsEndpointFor(provider) {\n  if (!provider || !provider.endpoint) return null;\n  try {\n    const url = new URL(provider.endpoint);\n    const path = url.pathname.replace(/\\/+$/, '');\n    if (/\\/chat\\/completions$/i.test(path)) {\n      url.pathname = path.replace(/\\/chat\\/completions$/i, '/models');\n      url.search = '';\n      url.hash = '';\n      return url.toString().replace(/\\/$/, '');\n    }\n    url.pathname = `${path}/models`.replace(/\\/{2,}/g, '/');\n    url.search = '';\n    url.hash = '';\n    return url.toString().replace(/\\/$/, '');\n  } catch {\n    return null;\n  }\n}"
  }
]);

await patch('public/app.js', [
  {
    label: 'align template offset range with backend',
    from: 'min="0" max="3650"',
    to: 'min="-365" max="365"'
  }
]);

await patch('macos/ConsoleApp.swift', [
  {
    label: 'watchdog cooldown recovery',
    from: "        restartAttempts += 1\n        guard restartAttempts <= 5 else {\n            logger.error(\"本地服务连续重启失败，已暂停自动恢复，等待下次触发\")\n            return\n        }",
    to: "        if restartAttempts >= 5 {\n            // Do not permanently disable self-healing. After a one-minute\n            // cooldown, allow a fresh bounded retry window.\n            guard now.timeIntervalSince(lastRestartAt) >= 60 else { return }\n            restartAttempts = 0\n        }\n        restartAttempts += 1"
  },
  {
    label: 'terminate hung bundled server before replacement',
    from: "    private func startServer() async {\n        // 开发环境可以复用已有服务；可分发 bundle 必须启动自己的内嵌服务，",
    to: "    private func startServer() async {\n        // A bundled Node process can stay alive while its HTTP loop is wedged.\n        // Kill it before replacing serverProcess or it becomes an orphan that\n        // can keep a port/resources until logout.\n        if usesBundledRuntime, let previous = serverProcess, previous.isRunning {\n            previous.terminationHandler = nil\n            previous.terminate()\n            try? await Task.sleep(nanoseconds: 150_000_000)\n            serverProcess = nil\n        }\n        // 开发环境可以复用已有服务；可分发 bundle 必须启动自己的内嵌服务，"
  }
]);

await patch('macos/widget/TodoModels.swift', [
  {
    label: 'decode reminder fields for widget focus parity',
    from: "    let status: String\n    let due: Date?\n\n    enum CodingKeys: String, CodingKey { case id, title, status, dueDateTime, dueDate }",
    to: "    let status: String\n    let due: Date?\n    let reminder: Date?\n    let isReminderOn: Bool\n\n    enum CodingKeys: String, CodingKey { case id, title, status, dueDateTime, dueDate, reminderDateTime, isReminderOn }"
  },
  {
    label: 'parse widget reminder',
    from: "        due = parseDate(raw)\n    }",
    to: "        due = parseDate(raw)\n        isReminderOn = (try? c.decodeIfPresent(Bool.self, forKey: .isReminderOn)) ?? false\n        var reminderRaw: String? = nil\n        if let s = try? c.decodeIfPresent(String.self, forKey: .reminderDateTime) { reminderRaw = s }\n        else if let obj = try? c.decodeIfPresent([String: String].self, forKey: .reminderDateTime) { reminderRaw = obj[\"dateTime\"] ?? obj[\"date\"] }\n        reminder = parseDate(reminderRaw)\n    }"
  },
  {
    label: 'align widget today focus semantics and counts',
    from: "                total += 1\n                if t.status == \"completed\" { done += 1; continue }\n                let overdue = t.due.map { $0 < todayStart } ?? false\n                let dueToday = t.due.map { $0 >= todayStart && $0 < tomorrowStart } ?? false\n                guard overdue || dueToday || t.due == nil else { continue }\n                items.append(FocusItem(\n                    id: t.id, title: t.title, listName: list.displayName,\n                    due: t.due, isOverdue: overdue, isDueToday: dueToday))",
    to: "                let overdue = t.due.map { $0 < todayStart } ?? false\n                let dueToday = t.due.map { $0 >= todayStart && $0 < tomorrowStart } ?? false\n                let reminderToday = t.isReminderOn && (t.reminder.map { $0 >= todayStart && $0 < tomorrowStart } ?? false)\n                guard dueToday || reminderToday else { continue }\n                total += 1\n                if t.status == \"completed\" { done += 1; continue }\n                items.append(FocusItem(\n                    id: t.id, title: t.title, listName: list.displayName,\n                    due: t.due, isOverdue: overdue, isDueToday: dueToday))"
  }
]);

console.log('Audit fixes applied.');

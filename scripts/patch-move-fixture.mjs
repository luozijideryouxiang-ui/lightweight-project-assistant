import { readFile, writeFile } from 'node:fs/promises';

const path = 'tests/server.test.js';
let text = await readFile(path, 'utf8');
const needle = `      if (method === 'PATCH' && segments.length === 6) {\n        const task = findTask(listId, taskId);\n        if (!task) return jsonResponse(404, { error: { message: 'task not found' } });\n        const body = JSON.parse(init.body);\n        Object.assign(task, clone(body));\n        state.graphWrites.push({ method, path, listId, taskId, body: clone(body) });\n        return jsonResponse(200, task);\n      }\n`;
const replacement = `${needle}      if (segments.length === 7 && method === 'GET' && ['checklistItems', 'linkedResources', 'attachments', 'extensions'].includes(segments[6])) {\n        return jsonResponse(200, { value: [] });\n      }\n`;
if (!text.includes(needle)) throw new Error('server fixture insertion point not found');
if (text.includes("['checklistItems', 'linkedResources', 'attachments', 'extensions'].includes(segments[6])")) {
  console.log('fixture already patched');
  process.exit(0);
}
text = text.replace(needle, replacement);
await writeFile(path, text);
console.log('server fixture patched');

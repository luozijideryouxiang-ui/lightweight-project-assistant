const DIRECT_ATTACHMENT_LIMIT = 3 * 1024 * 1024;

function collection(value) {
  return Array.isArray(value?.value) ? value.value : [];
}

function encode(value) {
  return encodeURIComponent(String(value));
}

function definiteError(message) {
  const error = new Error(message);
  error.definite = true;
  return error;
}

export function copyableTaskFields(source) {
  const copy = { title: source.title };
  for (const field of ['body', 'importance', 'status', 'startDateTime', 'dueDateTime', 'recurrence', 'categories']) {
    if (source[field] !== undefined && source[field] !== null) copy[field] = source[field];
  }
  if (source.reminderDateTime) {
    copy.reminderDateTime = source.reminderDateTime;
    copy.isReminderOn = source.isReminderOn !== false;
  } else if (source.isReminderOn === false) {
    copy.isReminderOn = false;
  }
  return copy;
}

function checklistPayload(item) {
  const payload = { displayName: item.displayName || '' };
  if (typeof item.isChecked === 'boolean') payload.isChecked = item.isChecked;
  if (item.checkedDateTime) payload.checkedDateTime = item.checkedDateTime;
  return payload;
}

function linkedResourcePayload(item) {
  const payload = {};
  for (const field of ['webUrl', 'applicationName', 'displayName', 'externalId']) {
    if (item[field] !== undefined && item[field] !== null) payload[field] = item[field];
  }
  return payload;
}

function extensionPayload(item) {
  const payload = {};
  for (const [key, value] of Object.entries(item || {})) {
    if (key === 'id' || key === '@odata.context' || key === '@odata.etag') continue;
    payload[key] = value;
  }
  payload['@odata.type'] ||= '#microsoft.graph.openTypeExtension';
  payload.extensionName ||= item?.extensionName || item?.id;
  return payload;
}

function attachmentPayload(item) {
  return {
    '@odata.type': '#microsoft.graph.taskFileAttachment',
    name: item.name,
    contentBytes: item.contentBytes,
    ...(item.contentType ? { contentType: item.contentType } : {}),
  };
}

async function confirmMissing(graphRequest, path) {
  try {
    await graphRequest(path);
    return false;
  } catch (error) {
    if (error?.statusCode === 404) return true;
    return null;
  }
}

export async function moveTaskAcrossLists({ graphRequest, fromListId, taskId, targetListId, targetListName }) {
  if (typeof graphRequest !== 'function') throw new Error('graphRequest is required');
  const sourceRoot = `/me/todo/lists/${encode(fromListId)}/tasks/${encode(taskId)}`;
  const targetRoot = `/me/todo/lists/${encode(targetListId)}/tasks`;
  const source = await graphRequest(sourceRoot);

  // Read every relationship before creating anything. If a relationship cannot
  // be read, abort with the source untouched instead of silently losing data.
  const [checklistResult, linkedResult, attachmentResult, extensionResult] = await Promise.all([
    graphRequest(`${sourceRoot}/checklistItems`),
    graphRequest(`${sourceRoot}/linkedResources`),
    graphRequest(`${sourceRoot}/attachments`),
    graphRequest(`${sourceRoot}/extensions`),
  ]);
  const checklistItems = collection(checklistResult);
  const linkedResources = collection(linkedResult);
  const attachmentHeaders = collection(attachmentResult);
  const extensions = collection(extensionResult);

  const oversized = attachmentHeaders.find(item => Number(item?.size || 0) >= DIRECT_ATTACHMENT_LIMIT);
  if (oversized) {
    throw definiteError(`任务「${source.title}」包含 3 MB 或更大的附件「${oversized.name || '未命名附件'}」，为避免附件丢失，已取消跨清单移动。`);
  }

  const attachments = await Promise.all(attachmentHeaders.map(item =>
    graphRequest(`${sourceRoot}/attachments/${encode(item.id)}`),
  ));

  const created = await graphRequest(targetRoot, {
    method: 'POST',
    body: JSON.stringify(copyableTaskFields(source)),
  });
  const createdRoot = `${targetRoot}/${encode(created.id)}`;

  try {
    for (const item of checklistItems) {
      await graphRequest(`${createdRoot}/checklistItems`, { method: 'POST', body: JSON.stringify(checklistPayload(item)) });
    }
    for (const item of linkedResources) {
      await graphRequest(`${createdRoot}/linkedResources`, { method: 'POST', body: JSON.stringify(linkedResourcePayload(item)) });
    }
    for (const item of extensions) {
      await graphRequest(`${createdRoot}/extensions`, { method: 'POST', body: JSON.stringify(extensionPayload(item)) });
    }
    for (const item of attachments) {
      if (!item?.contentBytes) throw new Error(`附件「${item?.name || '未命名附件'}」未返回内容`);
      await graphRequest(`${createdRoot}/attachments`, { method: 'POST', body: JSON.stringify(attachmentPayload(item)) });
    }
  } catch (copyError) {
    // Compensation: keep the original task and remove the incomplete target
    // copy. Only allow a retry when rollback is confirmed.
    try {
      await graphRequest(createdRoot, { method: 'DELETE' });
      const error = definiteError(`移动未完成，附加内容复制失败；目标清单中的不完整副本已回滚，原任务仍保留。${copyError?.message ? ` 原因：${copyError.message}` : ''}`);
      error.cause = copyError;
      throw error;
    } catch (rollbackError) {
      if (rollbackError?.definite === true && rollbackError?.cause === copyError) throw rollbackError;
      const error = new Error(`移动结果不确定：附加内容复制失败，且目标副本回滚未确认。原任务未主动删除，请先同步两个清单后再重试。`);
      error.definite = false;
      error.cause = rollbackError;
      throw error;
    }
  }

  let warning = '';
  try {
    await graphRequest(sourceRoot, { method: 'DELETE' });
  } catch (deleteError) {
    if (deleteError?.statusCode !== 404) {
      const missing = await confirmMissing(graphRequest, sourceRoot);
      if (missing === false) {
        warning = `已完整复制到「${targetListName}」，但原清单里的「${source.title}」仍存在，请手动删除原任务。`;
      } else if (missing === null) {
        warning = `已完整复制到「${targetListName}」，但原任务删除结果不确定，请同步两个清单核对是否出现重复。`;
      }
    }
  }

  return { source, created, warning };
}

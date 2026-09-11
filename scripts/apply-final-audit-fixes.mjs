import { readFile, writeFile } from 'node:fs/promises';

async function edit(path, mutate) {
  const before = await readFile(path, 'utf8');
  const after = mutate(before);
  if (after === before) throw new Error(`No change made to ${path}`);
  await writeFile(path, after);
}

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (text.indexOf(from, first + 1) >= 0) throw new Error(`Ambiguous ${label}`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

function replaceBetween(text, start, end, replacement, label) {
  const a = text.indexOf(start);
  if (a < 0) throw new Error(`Missing start ${label}`);
  const b = text.indexOf(end, a + start.length);
  if (b < 0) throw new Error(`Missing end ${label}`);
  return text.slice(0, a) + replacement + text.slice(b);
}

await edit('server.js', text => {
  text = replaceOnce(
    text,
    "import { DEFAULT_TEMPLATE, localDate, shiftDate, taskFields, validateTemplate, projectSchedule, parseDatePhrase, parseRules, readPrivateJson, writePrivateJson, PlanStore, ensureEstimatedReminders, applyPlanEdits } from './workflow.js';\n",
    "import { DEFAULT_TEMPLATE, localDate, shiftDate, taskFields, validateTemplate, projectSchedule, parseDatePhrase, parseRules, readPrivateJson, writePrivateJson, PlanStore, ensureEstimatedReminders, applyPlanEdits } from './workflow.js';\nimport { moveTaskAcrossLists } from './graph-move.js';\n",
    'graph move import',
  );
  text = replaceOnce(
    text,
    "  const error = new Error(`Microsoft Graph ${response.status}: ${detail}`);\n  error.definite = response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status);\n",
    "  const error = new Error(`Microsoft Graph ${response.status}: ${detail}`);\n  error.statusCode = response.status;\n  error.definite = response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status);\n",
    'Graph status code',
  );
  const moveStart = "  if (operation.type === 'moveTask') {\n";
  const moveEnd = "  if (operation.type === 'progressNote') {\n";
  const moveBlock = `  if (operation.type === 'moveTask') {\n    const lists = await listTaskLists({ paginate: true });\n    const wanted = String(operation.toListName || '').trim().toLowerCase();\n    const target = lists.find(list => String(list.displayName).trim().toLowerCase() === wanted\n      && !HIDDEN_WELLKNOWN_LISTS.has(String(list.wellknownListName || '').trim().toLowerCase()));\n    if (!target) {\n      const error = new Error(\`找不到清单「\${operation.toListName}」，请确认清单名\`); error.definite = true; throw error;\n    }\n    if (target.id === operation.fromListId) return { type: 'moved', task: null, warning: '任务已在该清单中，无需移动' };\n\n    // Graph v1.0 has no documented todoTask move endpoint, so use a\n    // transaction-like copy + relationship copy + source delete sequence.\n    // The helper rolls back incomplete target copies and never deletes the\n    // source until every supported relationship has been copied.\n    const moved = await moveTaskAcrossLists({\n      graphRequest,\n      fromListId: operation.fromListId,\n      taskId: operation.taskId,\n      targetListId: target.id,\n      targetListName: target.displayName,\n    });\n    const warning = moved.warning || await logAfterChange(target.id, \`移动任务「\${moved.created.title}」到「\${target.displayName}」\`);\n    return { type: 'moved', task: moved.created, warning, listId: target.id };\n  }\n`;
  return replaceBetween(text, moveStart, moveEnd, moveBlock, 'moveTask block');
});

await edit('macos/ConsoleApp.swift', text => replaceOnce(
  text,
  `        // 确认没有可用服务，才重启；带退避与次数上限，避免重启风暴。\n        let now = Date()\n        guard now.timeIntervalSince(lastRestartAt) >= 5 else { return }\n        lastRestartAt = now\n        if restartAttempts >= 5 {\n            // Do not permanently disable self-healing. After a one-minute\n            // cooldown, allow a fresh bounded retry window.\n            guard now.timeIntervalSince(lastRestartAt) >= 60 else { return }\n            restartAttempts = 0\n        }\n        restartAttempts += 1\n`,
  `        // 确认没有可用服务，才重启；5 次失败后冷却一分钟，再开启新的重试窗口。\n        let now = Date()\n        if restartAttempts >= 5 {\n            guard now.timeIntervalSince(lastRestartAt) >= 60 else { return }\n            restartAttempts = 0\n        }\n        guard now.timeIntervalSince(lastRestartAt) >= 5 else { return }\n        restartAttempts += 1\n        lastRestartAt = now\n`,
  'watchdog cooldown ordering',
));

await edit('macos/build-app.sh', text => {
  text = replaceBetween(
    text,
    '# 1) 解析 Node 路径（构建期写进 Info.plist 默认值；Swift 端运行时会再次解析）\n',
    'for required_path in \\\n',
    `# 1) 固定官方 Node runtime 版本；构建时下载并校验 arm64 + x64 两套官方二进制。\n#    这样目标机器无需预装 Node，也不会依赖 Homebrew dylib。\nNODE_RUNTIME_VERSION="\${NODE_RUNTIME_VERSION:-22.22.1}"\nNODE_DIST_ROOT="\${NODE_DIST_ROOT:-https://nodejs.org/dist/v\${NODE_RUNTIME_VERSION}}"\nNODE_CACHE_DIR="\${NODE_RUNTIME_CACHE_DIR:-\${HOME}/Library/Caches/MicrosoftTodoFocusConsole/node-v\${NODE_RUNTIME_VERSION}}"\necho "Node runtime：v\${NODE_RUNTIME_VERSION}（官方 arm64 + x64）"\necho "项目根：$PROJECT_ROOT"\n\nfor required_tool in curl shasum tar file xcrun; do\n  if ! command -v "$required_tool" >/dev/null 2>&1; then\n    echo "构建失败：缺少工具 $required_tool" >&2\n    exit 1\n  fi\ndone\n\n`,
    'node runtime discovery',
  );

  text = replaceBetween(
    text,
    '# 3.5) 嵌入 Node 服务、静态资源、依赖和构建机 Node 运行时。\n',
    '# 4) 写主程序 Info.plist\n',
    `# 3.5) 嵌入服务资源与可分发 Node runtime。\nBUNDLE_SERVER_DIR="$STAGED_APP/Contents/Resources/server"\nBUNDLE_NODE_ROOT="$STAGED_APP/Contents/Resources/node"\nBUNDLE_NODE_BIN="$BUNDLE_NODE_ROOT/bin/node"\nmkdir -p "$BUNDLE_SERVER_DIR" "$BUNDLE_NODE_ROOT/bin"\ncp "$PROJECT_ROOT/server.js" "$BUNDLE_SERVER_DIR/server.js"\ncp "$PROJECT_ROOT/workflow.js" "$BUNDLE_SERVER_DIR/workflow.js"\ncp "$PROJECT_ROOT/graph-move.js" "$BUNDLE_SERVER_DIR/graph-move.js"\ncp -R "$PROJECT_ROOT/public" "$BUNDLE_SERVER_DIR/"\ncp -R "$PROJECT_ROOT/node_modules" "$BUNDLE_SERVER_DIR/"\n\nmkdir -p "$NODE_CACHE_DIR"\nCHECKSUM_FILE="$NODE_CACHE_DIR/SHASUMS256.txt"\nif [[ ! -s "$CHECKSUM_FILE" ]]; then\n  curl -fL --retry 3 "$NODE_DIST_ROOT/SHASUMS256.txt" -o "$CHECKSUM_FILE"\nfi\n\ninstall_node_runtime() {\n  local dist_arch="$1"\n  local bundle_arch="$2"\n  local archive="node-v\${NODE_RUNTIME_VERSION}-darwin-\${dist_arch}.tar.gz"\n  local archive_path="$NODE_CACHE_DIR/$archive"\n  local expected actual extracted\n  if [[ ! -s "$archive_path" ]]; then\n    curl -fL --retry 3 "$NODE_DIST_ROOT/$archive" -o "$archive_path"\n  fi\n  expected="$(awk -v name="$archive" '$2 == name { print $1 }' "$CHECKSUM_FILE")"\n  if [[ -z "$expected" ]]; then\n    echo "构建失败：官方校验文件中找不到 $archive" >&2\n    exit 1\n  fi\n  actual="$(shasum -a 256 "$archive_path" | awk '{print $1}')"\n  if [[ "$actual" != "$expected" ]]; then\n    echo "构建失败：Node runtime 校验失败：$archive" >&2\n    rm -f "$archive_path"\n    exit 1\n  fi\n  tar -xzf "$archive_path" -C "$STAGE_ROOT"\n  extracted="$STAGE_ROOT/node-v\${NODE_RUNTIME_VERSION}-darwin-\${dist_arch}/bin/node"\n  mkdir -p "$BUNDLE_NODE_ROOT/$bundle_arch/bin"\n  cp "$extracted" "$BUNDLE_NODE_ROOT/$bundle_arch/bin/node"\n  chmod 755 "$BUNDLE_NODE_ROOT/$bundle_arch/bin/node"\n}\n\ninstall_node_runtime arm64 arm64\ninstall_node_runtime x64 x86_64\n\ncat > "$BUNDLE_NODE_BIN" <<'NODE_WRAPPER'\n#!/bin/sh\nROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"\ncase "$(uname -m)" in\n  arm64) exec "$ROOT/arm64/bin/node" "$@" ;;\n  x86_64) exec "$ROOT/x86_64/bin/node" "$@" ;;\n  *) echo "Unsupported macOS architecture: $(uname -m)" >&2; exit 126 ;;\nesac\nNODE_WRAPPER\nchmod 755 "$BUNDLE_NODE_BIN"\n\nfor bundled_path in \\\n  "$BUNDLE_SERVER_DIR/server.js" \\\n  "$BUNDLE_SERVER_DIR/workflow.js" \\\n  "$BUNDLE_SERVER_DIR/graph-move.js" \\\n  "$BUNDLE_SERVER_DIR/public" \\\n  "$BUNDLE_SERVER_DIR/node_modules" \\\n  "$BUNDLE_NODE_ROOT/arm64/bin/node" \\\n  "$BUNDLE_NODE_ROOT/x86_64/bin/node"; do\n  if [[ ! -e "$bundled_path" ]]; then\n    echo "构建失败：运行时资源嵌入不完整：$bundled_path" >&2\n    exit 1\n  fi\ndone\nfile "$BUNDLE_NODE_ROOT/arm64/bin/node" | grep -q 'arm64' || { echo "构建失败：arm64 Node 架构不正确" >&2; exit 1; }\nfile "$BUNDLE_NODE_ROOT/x86_64/bin/node" | grep -Eq 'x86_64|x86_64h' || { echo "构建失败：x64 Node 架构不正确" >&2; exit 1; }\nif ! "$BUNDLE_NODE_BIN" --version >/dev/null 2>&1; then\n  echo "构建失败：当前机器无法运行 bundle 内对应架构的 Node" >&2\n  exit 1\nfi\n\n# 4) 写主程序 Info.plist\n`,
    'bundled node runtime',
  );

  text = replaceBetween(
    text,
    '# 5) 编译主程序 Swift\n',
    '# 5.5) 编译并嵌入 WidgetKit 桌面小组件扩展（源码：macos/widget）\n',
    `# 5) 编译 universal 主程序 Swift（Apple Silicon + Intel）\necho "编译 universal 主程序 Swift..."\nMAIN_EXEC="$STAGED_APP/Contents/MacOS/\${APP_NAME}"\n"$SWIFT_BIN" -O "$SOURCE" -o "$MAIN_EXEC.arm64" \\\n  -parse-as-library -target "arm64-apple-macos14" \\\n  -framework SwiftUI -framework AppKit -framework WebKit -framework Speech -framework AVFoundation\n"$SWIFT_BIN" -O "$SOURCE" -o "$MAIN_EXEC.x86_64" \\\n  -parse-as-library -target "x86_64-apple-macos14" \\\n  -framework SwiftUI -framework AppKit -framework WebKit -framework Speech -framework AVFoundation\nxcrun lipo -create "$MAIN_EXEC.arm64" "$MAIN_EXEC.x86_64" -output "$MAIN_EXEC"\nrm -f "$MAIN_EXEC.arm64" "$MAIN_EXEC.x86_64"\nxcrun lipo -verify_arch arm64 x86_64 "$MAIN_EXEC"\n\n# 5.5) 编译并嵌入 WidgetKit 桌面小组件扩展（源码：macos/widget）\n`,
    'main universal compile',
  );

  text = replaceOnce(
    text,
    `"$SWIFT_BIN" -O "$WIDGET_SRC_DIR"/*.swift -o "$WIDGET_APPLEX/Contents/MacOS/\${WIDGET_EXEC}" \\\n  -parse-as-library \\\n  -target "$TARGET_TRIPLE" \\\n  -framework WidgetKit -framework SwiftUI -framework Foundation\n`,
    `WIDGET_BIN="$WIDGET_APPLEX/Contents/MacOS/\${WIDGET_EXEC}"\n"$SWIFT_BIN" -O "$WIDGET_SRC_DIR"/*.swift -o "$WIDGET_BIN.arm64" \\\n  -parse-as-library -target "arm64-apple-macos14" \\\n  -framework WidgetKit -framework SwiftUI -framework Foundation\n"$SWIFT_BIN" -O "$WIDGET_SRC_DIR"/*.swift -o "$WIDGET_BIN.x86_64" \\\n  -parse-as-library -target "x86_64-apple-macos14" \\\n  -framework WidgetKit -framework SwiftUI -framework Foundation\nxcrun lipo -create "$WIDGET_BIN.arm64" "$WIDGET_BIN.x86_64" -output "$WIDGET_BIN"\nrm -f "$WIDGET_BIN.arm64" "$WIDGET_BIN.x86_64"\nxcrun lipo -verify_arch arm64 x86_64 "$WIDGET_BIN"\n`,
    'widget universal compile',
  );
  return text;
});

await edit('package.json', text => replaceOnce(
  text,
  '"check": "node --check server.js && node --check workflow.js && node --check public/app.js",',
  '"check": "node --check server.js && node --check workflow.js && node --check graph-move.js && node --check public/app.js",',
  'package check',
));

await edit('.github/workflows/ci.yml', text => replaceOnce(
  text,
  '      - name: Syntax check\n        run: npm run check\n      - name: Test\n',
  '      - name: Syntax check\n        run: npm run check\n      - name: macOS build script syntax\n        run: bash -n macos/build-app.sh\n      - name: Test\n',
  'CI shell syntax',
));

await edit('README.md', text => {
  text = replaceOnce(
    text,
    '- 自动探测 Node（优先使用本机托管版本，其次 Homebrew，最后 `/usr/bin/node`）。\n- 用 `swiftc` 编译 `ConsoleApp.swift`（运行需 macOS 14+，构建需包含 macOS 26 SDK 的 Xcode）。',
    '- 下载并校验 Node.js 官方固定版本的 macOS arm64 与 x64 runtime，打包时不再复制 Homebrew/构建机 Node。可用 `NODE_RUNTIME_VERSION` 覆盖版本，并通过缓存目录复用下载。\n- 用 `swiftc` 分别编译 arm64 / x86_64，再用 `lipo` 合成 universal 主程序与 Widget（运行需 macOS 14+，构建需包含相应 SDK 的 Xcode）。',
    'README build bullets',
  );
  text = replaceOnce(
    text,
    '构建后的 `.app` 会把 `server.js`、`workflow.js`、`public/`、`node_modules/` 和构建机的 Node 运行时一起放进 `Contents/Resources/`，安装目标机器不需要另装 Node 或复制源码。',
    '构建后的 `.app` 会把 `server.js`、`workflow.js`、`graph-move.js`、`public/`、`node_modules/` 和经过 SHA-256 校验的官方 Node arm64/x64 runtime 一起放进 `Contents/Resources/`，安装目标机器不需要另装 Node 或复制源码；同一 App bundle 可在 Apple Silicon 与 Intel Mac 上运行。',
    'README runtime paragraph',
  );
  return text;
});

console.log('final audit fixes applied');

# 轻量项目助理

这是 Microsoft To Do 的本机中文控制台。项目、任务、任务状态和进度记录写入 Microsoft To Do；网页端负责多视图展示、语音输入和指令解析。界面偏好保存在浏览器，流程模板、AI 设置和操作预览保存在本机应用支持目录。

## 开源说明

本项目按 [MIT License](LICENSE) 发布，欢迎学习、修改和提交改进。它是社区项目，与 Microsoft、Apple 或 DeepSeek 没有隶属关系；相关商标和服务仍归各自所有者。

项目默认只监听本机地址，并把 Microsoft To Do 登录令牌和 AI 设置保存在当前 macOS 用户目录。请不要把 API Key、令牌、`settings.json` 或构建生成的 `.app`、`.dmg` 提交到仓库。

## 从源码运行

要求：Node.js 20+；构建 macOS 原生 App 还需要 macOS 14+ 和可用的 Xcode/Swift 工具链。

```bash
git clone https://github.com/luozijideryouxiang-ui/lightweight-project-assistant.git
cd lightweight-project-assistant
npm ci
npm run check
npm test
npm start
```

首次使用 Microsoft To Do 时，在另一个终端运行 `npm run auth`，按设备码完成登录。DeepSeek 等 AI 服务通过设置页面或环境变量配置，示例见 `.env.example`；示例文件不包含任何真实密钥。

## 一期更新（2026-09-10）

- 中性浅色/深色界面，单一蓝色强调，减少重复按钮、说明与多层卡片。
- 新建项目、设置、同步、项目排期与各视图一级直达；任务行直接切状态、勾选完成，编辑按钮悬停显示，删除留在详情。
- Mac 与网页共用“今日、列表、看板、日历、AI”底栏；保留原生浮窗、菜单栏与快捷键。Mac 启动时清理旧网页资源缓存，保留登录与界面偏好，避免安装了新版却继续显示旧界面。
- 浮窗支持紧凑显示、置顶开关与位置记忆；只有勾选按钮完成任务，服务器失败不会先移除任务。macOS 26 使用系统玻璃效果，较低版本回退。
- 任务编辑支持提醒和每天、每周、每月重复；已有其他重复规则可以保留。
- “设置”可填写 DeepSeek API Key 与模型名称。保存表示已配置；首次生成指令预览时才会实际调用 API。Key 只保存在本机服务端的 `settings.json`（权限 `0600`），不返回浏览器、不写入 localStorage。它是受文件权限保护的配置，并非钥匙串加密。
- 首次打开 App 会显示 Microsoft To Do 登录界面，使用设备码在浏览器完成登录；登录状态、验证码轮询和退出登录都在本机服务端处理，任务接口在未登录时不会读取或写入数据。
- 设置面板可从 `/api/models` 读取当前 DeepSeek 账号可用模型；默认模型为 `deepseek-flash`，列表暂时不可用时仍可手动填写模型名。
- “项目排期”填写项目名称、接入日期，查看生成的节点后点击创建。默认模板只是可修改的样例：第 0 天确认需求、第 2 天催付款、第 3 天确认收货、第 5 天安排发货，09:00 提醒、18:00 到期；偏移按自然日计算。
- 一句话示例：`新建项目 秋季直播，9月10日接入，按模板排期`；`把确认文案改到明天下午3点提醒`；`完成确认文案`。指令先生成操作预览，再点一次执行。模型只能通过白名单操作待办和日程，不能修改源码、执行系统命令或新增软件功能。
- 执行记录按预览编号保存，重复点击不会重复执行；明确失败可重试剩余步骤，网络结果不确定时提示先核对。已保存的预览执行中不受模板后续修改影响。

本机设置与操作记录默认目录：`~/Library/Application Support/MicrosoftTodoFocusConsole/`。任务提醒由 Microsoft To Do 执行，实际通知还依赖该设备的系统通知设置；本应用退出后不负责常驻计时。

本期不包含 iPhone Live Activities / 灵动岛、习惯打卡、番茄统计、协作或日历订阅。Mac 浮窗和已嵌入的 WidgetKit 扩展只覆盖本机桌面场景，不等同于 iPhone 灵动岛。

验证（测试使用 Node.js 22 的内置模拟模块，不访问真实账户；Node.js 20+ 为支持范围）：

```bash
npm run check
npm test
```

## 数据对应关系

- Microsoft To Do 列表 = 项目
- 普通 To Do 任务 = 项目任务
- `notStarted / inProgress / waitingOnOthers / deferred / completed` = 看板列
- 每个列表中的 `【项目日志】` 已完成任务 = 带时间戳的项目进度追溯
- 项目完成率 = 排除进度记录后，已完成任务数 / 全部任务数

## 三种打开方式

1. **macOS 原生 App（推荐）** — 双击 `macos/轻量项目助理.app`，窗口带 Apple Liquid Glass 效果，原生中文语音识别，菜单栏与快捷键齐全。
2. **本机 Web 控制台** — 双击 `启动.command` 启动本机 API，然后在浏览器打开 <http://127.0.0.1:4177>。
3. **重新登录** — 首次连接或登录过期时，双击 `重新登录.command`，或在终端运行：

   ```bash
   npm run auth
   ```

开发方式：

```bash
npm start
```

## 原生 App 打包

```bash
cd macos
bash build-app.sh
```

构建脚本会：

- 自动探测 Node（优先使用本机托管版本，其次 Homebrew，最后 `/usr/bin/node`）。
- 用 `swiftc` 编译 `ConsoleApp.swift`（运行需 macOS 14+，构建需包含 macOS 26 SDK 的 Xcode）。
- 用 `make-icon.swift` 现场绘制 .icns 图标。
- 写入 `Info.plist`（含 `ServerProjectPath`、`NodeBinaryPath`、`NSMicrophoneUsageDescription` 等）。
- ad-hoc 签名。

构建后的 `.app` 会把 `server.js`、`workflow.js`、`public/`、`node_modules/` 和构建机的 Node 运行时一起放进 `Contents/Resources/`，安装目标机器不需要另装 Node 或复制源码。首次打开时在 App 内完成 Microsoft To Do 设备码登录；登录令牌按用户写入 `~/.mcp-microsoft-todo/token-cache.json`，不同 macOS 用户互不共享。

推荐交付 `dist/轻量项目助理-1.1.0.dmg`：打开 DMG 后将 App 拖到“应用程序”文件夹即可。当前使用 ad-hoc 或本机自签名，未加入 Apple Developer notarization；其他用户首次打开若遇到 Gatekeeper，需要在 Finder 中右键 App 选择“打开”。

## 主要改动

> 自 2026-09-01 起持续改版；构建产物和本机交付记录不纳入公开源码。

### 1. 交互体验（消除原版最反感的几个点）

- **再也不会全屏 loading 闪烁**。原版每次勾选/拖动任务都会用 `appState.loading=true` 把整个页面替换成「正在读取你的工作区」。新版只会在**首次加载**显示整屏 loading；之后所有同步都是**静默后台**（顶栏一个微小的同步指示），UI 完全不打断。
- **任务勾选/拖动/状态切换走乐观更新**：UI 立即变化，失败自动回滚并提示。
- **输入焦点与滚动位置保留**：re-render 不再清掉你正在打字的光标位置和滚动条位置；快速收集成功后会**自动清空 + 重新聚焦输入框**，可连续录入任务。
- **新项目/删除确认用玻璃弹窗**：不再触发系统的 `window.prompt` / `window.confirm`，而是 Apple 风格的 in-app 弹窗。
- **网络优先的 Service Worker**：升级缓存版本后，浏览器会立即拿到新版界面（之前是缓存优先，要等 SW 主动更新）。

### 2. 界面与可访问性

- **Apple Liquid Glass 视觉**：所有面板用 `backdrop-filter: blur(...) saturate(...)` 真实玻璃效果，跟随系统浅色/深色模式自适应。
- **深色模式**：CSS 变量随 `prefers-color-scheme: dark` 切换，玻璃卡、按钮、文字均有专门配色。
- **`[data-native]` 透明模式**：原生 App 把页面背景变透明，露出底下的 `NSVisualEffectView`，实现真正的 macOS 视觉穿透。
- **统一滚动条 / 选区色 / 输入光标色 / 弹窗弹性动效**。
- **键盘快捷键**：
  - `1`–`7` 切换 7 个视图
  - `/` 聚焦快速收集（指令区时聚焦 AI 输入框）
  - `N` 新建任务
  - `⌘ + ↩` 执行 AI 指令
  - `Esc` 关闭弹窗
  - 原生 App 菜单栏还提供了 `⌘N`、`⌘R`、`⌘/` 等标准快捷键。
- **本地偏好持久化**：当前视图、清单、干扰模式、日历模式写入 localStorage；任务数据仍然只存在 Microsoft To Do。

## AI 模式

服务端按以下优先级选择处理模式：`DEEPSEEK_API_KEY`（DeepSeek 官方）→ `OPENROUTER_API_KEY`（OpenRouter）→ `OPENAI_API_KEY`（OpenAI-compatible）→ 可连接的本机 Ollama → 规则模式。若同时配置多个远程密钥，优先级更高的配置生效；密钥只在服务端读取，不会返回给浏览器。

规则模式支持"创建任务""完成/开始/等待某任务""记录进展"等常用中文指令，但不冒充生成式 AI。

如需使用 DeepSeek 官方 API（按量付费），启动前设置：

```bash
export DEEPSEEK_API_KEY="你的密钥"
export DEEPSEEK_MODEL="deepseek-flash"
npm start
```

如需使用 OpenRouter 的免费 DeepSeek 模型（有额度限制，模型的可用性也可能波动），启动前设置：

```bash
export OPENROUTER_API_KEY="你的密钥"
export OPENROUTER_MODEL="deepseek/deepseek-r1-0528:free"
npm start
```

如需 OpenAI-compatible API，启动前设置：

```bash
export OPENAI_API_KEY="你的密钥"
export OPENAI_BASE_URL="https://api.openai.com/v1/chat/completions"
export OPENAI_MODEL="gpt-4o-mini"
npm start
```

也可配置本机 Ollama：

```bash
export OLLAMA_URL="http://127.0.0.1:11434/api/chat"
export OLLAMA_MODEL="qwen2.5:7b"
npm start
```

密钥不会写进源码，也不会发送给浏览器。

## 语音输入

- **浏览器**：使用 `Web SpeechRecognition`（zh-CN），无需授权页（首次需允许麦克风）。
- **macOS 原生 App**：使用 `SFSpeechRecognizer`（zh-CN），由 Swift 端拉取麦克风音频、转写后通过 `window.__nativeSpeechUpdate()` 推回 Web 端。首次使用会触发系统的"轻量项目助理想使用麦克风/语音识别"授权弹窗。

## 手机使用边界

界面已适配手机，但服务器默认只监听本机，避免同一网络中的其他人获得 To Do 写权限。Microsoft To Do 本身会把所有改动同步到官方手机端。若要直接在手机浏览器打开本控制台，需要额外增加登录保护并部署到 HTTPS 环境；当前版本没有冒充已完成这一步。

## 贡献

提交修改前请运行 `npm run check` 和 `npm test`。请在 issue 或 pull request 中描述可复现步骤和验证结果，不要上传账号令牌、API Key、个人任务数据或本机安装包。

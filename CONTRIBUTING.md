# 贡献指南

感谢参与轻量项目助理。请先阅读 README，确认改动仍符合“本机优先、操作可回退、界面简洁”的目标。

## 开始开发

```bash
npm ci
npm run check
npm test
```

前端文件在 `public/`，本机 API 和 Microsoft To Do 适配在 `server.js`，指令规划逻辑在 `workflow.js`，macOS 原生壳和 WidgetKit 代码在 `macos/`。

## 提交修改

- 一个 pull request 聚焦一个问题，并写明复现步骤、行为变化和验证命令。
- 不要提交 API Key、登录令牌、`settings.json`、真实任务数据、`.app` 或 `.dmg`。
- 改动 UI 或交互时，请同时覆盖加载、空状态和请求失败状态。
- 提交前至少运行 `npm run check` 和 `npm test`。

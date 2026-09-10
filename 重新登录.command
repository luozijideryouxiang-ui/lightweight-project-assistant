#!/bin/zsh
set -e

app_dir="$(cd "$(dirname "$0")" && pwd)"
node_bin="$(command -v node || true)"

if [[ -z "$node_bin" && -x "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node" ]]; then
  node_bin="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node"
fi

if [[ -z "$node_bin" ]]; then
  echo "未找到 Node.js。请先安装 Node.js 20 或更高版本。"
  read -k 1 "?按任意键关闭..."
  exit 1
fi

cd "$app_dir"
MS_TENANT=common "$node_bin" node_modules/@mag-cie/mcp-microsoft-todo/dist/auth.js
echo "Microsoft To Do 登录完成。"
read -k 1 "?按任意键关闭..."

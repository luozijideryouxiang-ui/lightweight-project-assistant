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
"$node_bin" server.js &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT INT TERM
sleep 1
open "http://127.0.0.1:4177"
wait "$server_pid"

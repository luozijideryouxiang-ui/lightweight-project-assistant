#!/usr/bin/env bash
# 构建轻量项目助理 macOS 原生 App（含原生浮窗 + WidgetKit 桌面小组件扩展）
# - 用 swiftc 编译单文件 Swift 主程序源
# - 用 make-icon.swift 生成 .icns
# - 把 Node 服务和构建机 Node 运行时嵌入 Contents/Resources
# - 写入 Info.plist（含 bundle 内 ServerProjectPath、NodeBinaryPath 等运行时信息）
# - 编译 macos/widget 下的 WidgetKit 扩展并嵌入 Contents/PlugIns
# 「桌面组件」同时提供主程序内浮窗（DesktopWidgetView）与系统 WidgetKit 小组件。
set -euo pipefail

cd "$(dirname "$0")"
APP_NAME="轻量项目助理"
PROJECT_ROOT="$(cd .. && pwd)"
DEFAULT_APP_BUNDLE="$PROJECT_ROOT/macos/${APP_NAME}.app"
APP_BUNDLE="${BUILD_APP_BUNDLE:-$DEFAULT_APP_BUNDLE}"
SOURCE="ConsoleApp.swift"
ICON_SOURCE="make-icon.swift"

if [[ "$APP_BUNDLE" != /* ]]; then
  echo "BUILD_APP_BUNDLE 必须是绝对路径：$APP_BUNDLE" >&2
  exit 2
fi
case "$APP_BUNDLE" in
  *"/../"*|*"/.."|*"/./"*|*"/.")
    echo "拒绝包含 . 或 .. 路径段的 BUILD_APP_BUNDLE：$APP_BUNDLE" >&2
    exit 2
    ;;
  "/"|"/System"|"/System/"*|"/Applications"|"/Applications/"*|"/Library"|"/Library/"*|"/Volumes"|"/Volumes/"*|"/usr"|"/usr/"*|"/bin"|"/bin/"*|"/sbin"|"/sbin/"*|"/etc"|"/etc/"*|"/var"|"/var/"*|"/dev"|"/dev/"*|"/cores"|"/cores/"*)
    echo "拒绝写入受保护路径：$APP_BUNDLE" >&2
    exit 2
    ;;
esac
if [[ "$APP_BUNDLE" == "/private" || ( "$APP_BUNDLE" == /private/* && "$APP_BUNDLE" != "/private/tmp" && "$APP_BUNDLE" != "/private/tmp/"* ) ]]; then
  echo "拒绝写入受保护路径：$APP_BUNDLE" >&2
  exit 2
fi
if [[ "${APP_BUNDLE##*/}" != *.app ]]; then
  echo "BUILD_APP_BUNDLE 必须指向以 .app 结尾的 bundle：$APP_BUNDLE" >&2
  exit 2
fi

APP_PARENT="$(dirname "$APP_BUNDLE")"
if [[ -L "$APP_BUNDLE" || ( -e "$APP_BUNDLE" && ! -d "$APP_BUNDLE" ) ]]; then
  echo "输出路径必须是目录或不存在，且不能是符号链接：$APP_BUNDLE" >&2
  exit 2
fi
if [[ -L "$APP_PARENT" && "$APP_PARENT" != "/tmp" ]]; then
  echo "拒绝使用符号链接作为输出目录：$APP_PARENT" >&2
  exit 2
fi
mkdir -p "$APP_PARENT"

STAGE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/light-project-assistant-build.XXXXXX")"
STAGED_APP="$STAGE_ROOT/${APP_NAME}.app"
BACKUP_APP=""
NEW_BUNDLE_INSTALLED=0

rollback_and_cleanup() {
  local exit_status=$?
  if (( exit_status != 0 )) && [[ -n "$BACKUP_APP" && -e "$BACKUP_APP" ]]; then
    # 新 bundle 已经移入目标目录时，把它留在 staging 中，再恢复旧 bundle。
    if (( NEW_BUNDLE_INSTALLED == 1 )) && [[ -e "$APP_BUNDLE" ]]; then
      mv "$APP_BUNDLE" "$STAGE_ROOT/failed.app" 2>/dev/null || true
    fi
    # 即使新 bundle 的 mv 失败，只要目标路径为空，也必须恢复旧版本。
    if [[ ! -e "$APP_BUNDLE" ]]; then
      mv "$BACKUP_APP" "$APP_BUNDLE" 2>/dev/null || true
    fi
  fi
  rm -rf "$STAGE_ROOT" 2>/dev/null || true
  exit "$exit_status"
}
trap rollback_and_cleanup EXIT

# 1) 解析 Node 路径（构建期写进 Info.plist 默认值；Swift 端运行时会再次解析）
NODE_CANDIDATES=(
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node"
  "/opt/homebrew/bin/node"
  "/usr/local/bin/node"
  "/usr/bin/node"
)
NODE_BIN=""
if [[ -n "${NODE_BINARY:-}" ]]; then
  if [[ ! -x "$NODE_BINARY" ]]; then
    echo "NODE_BINARY 不可执行：$NODE_BINARY" >&2
    exit 1
  fi
  NODE_BIN="$NODE_BINARY"
else
  for c in "${NODE_CANDIDATES[@]}"; do
    if [[ -x "$c" ]]; then NODE_BIN="$c"; break; fi
  done
fi
if [[ -z "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node || true)"
fi
if [[ -z "$NODE_BIN" ]]; then
  echo "未找到 Node.js。请先安装 Node.js 20+。" >&2
  exit 1
fi
echo "使用 Node：$NODE_BIN"
echo "项目根：$PROJECT_ROOT"

for required_path in \
  "$PROJECT_ROOT/server.js" \
  "$PROJECT_ROOT/workflow.js" \
  "$PROJECT_ROOT/public" \
  "$PROJECT_ROOT/node_modules"; do
  if [[ ! -e "$required_path" ]]; then
    echo "构建失败：缺少运行时资源：$required_path" >&2
    exit 1
  fi
done

# 2) 在临时 staging 中构建，避免失败时破坏现有 bundle
mkdir -p "$STAGED_APP/Contents/MacOS"
mkdir -p "$STAGED_APP/Contents/Resources"

# 3) 生成图标
echo "生成图标..."
SWIFT_BIN="/usr/bin/swiftc"
SWIFT_INTERP="/usr/bin/swift"
"$SWIFT_INTERP" "$ICON_SOURCE" "$STAGED_APP/Contents/Resources" "$APP_NAME" || {
  echo "图标生成失败" >&2; exit 1;
}
if [[ ! -f "$STAGED_APP/Contents/Resources/icon.icns" ]]; then
  echo "图标生成失败：未找到 icon.icns" >&2; exit 1;
fi

# 3.5) 嵌入 Node 服务、静态资源、依赖和构建机 Node 运行时。
#      server.js 使用 import.meta.url 定位同目录下的 public/ 和 node_modules/，
#      因此整个服务目录必须保持在同一个 bundle 内路径下。
BUNDLE_SERVER_DIR="$STAGED_APP/Contents/Resources/server"
BUNDLE_NODE_BIN="$STAGED_APP/Contents/Resources/node/bin/node"
mkdir -p "$BUNDLE_SERVER_DIR" "$(dirname "$BUNDLE_NODE_BIN")"
cp "$PROJECT_ROOT/server.js" "$BUNDLE_SERVER_DIR/server.js"
cp "$PROJECT_ROOT/workflow.js" "$BUNDLE_SERVER_DIR/workflow.js"
cp -R "$PROJECT_ROOT/public" "$BUNDLE_SERVER_DIR/"
cp -R "$PROJECT_ROOT/node_modules" "$BUNDLE_SERVER_DIR/"
cp -L "$NODE_BIN" "$BUNDLE_NODE_BIN"
chmod 755 "$BUNDLE_NODE_BIN"

for bundled_path in \
  "$BUNDLE_SERVER_DIR/server.js" \
  "$BUNDLE_SERVER_DIR/workflow.js" \
  "$BUNDLE_SERVER_DIR/public" \
  "$BUNDLE_SERVER_DIR/node_modules"; do
  if [[ ! -e "$bundled_path" ]]; then
    echo "构建失败：运行时资源嵌入不完整：$bundled_path" >&2
    exit 1
  fi
done
if [[ ! -x "$BUNDLE_NODE_BIN" ]]; then
  echo "构建失败：bundle 内 Node 不可执行：$BUNDLE_NODE_BIN" >&2
  exit 1
fi
if ! "$BUNDLE_NODE_BIN" --version >/dev/null 2>&1; then
  echo "构建失败：bundle 内 Node 无法运行：$BUNDLE_NODE_BIN" >&2
  exit 1
fi

# 4) 写主程序 Info.plist
echo "写 Info.plist..."
cat > "$STAGED_APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleExecutable</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>com.local.MicrosoftTodoFocusConsole</string>
    <key>CFBundleVersion</key>
    <string>2</string>
    <key>CFBundleShortVersionString</key>
    <string>1.1.0</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleIconFile</key>
    <string>icon</string>
    <key>CFBundleSignature</key>
    <string>????</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>LSApplicationCategoryType</key>
    <string>public.app-category.productivity</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSPrincipalClass</key>
    <string>NSApplication</string>
    <key>NSSupportsAutomaticTermination</key>
    <true/>
    <key>NSSupportsSuddenTermination</key>
    <false/>
    <key>NSMicrophoneUsageDescription</key>
    <string>需要使用麦克风提供中文语音输入。</string>
    <key>NSSpeechRecognitionUsageDescription</key>
    <string>需要使用语音识别把口头指令转成文字。</string>
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleURLName</key>
            <string>com.local.MicrosoftTodoFocusConsole</string>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>todo-console</string>
            </array>
        </dict>
    </array>
    <key>ServerProjectPath</key>
    <string>server</string>
    <key>NodeBinaryPath</key>
    <string>node/bin/node</string>
    <key>NSHumanReadableCopyright</key>
    <string>本地 Microsoft To Do 控制台</string>
</dict>
</plist>
PLIST

# 5) 编译主程序 Swift
echo "编译主程序 Swift..."
ARCH=$(uname -m)
case "$ARCH" in
  arm64) TARGET_TRIPLE="arm64-apple-macos14" ;;
  x86_64) TARGET_TRIPLE="x86_64-apple-macos14" ;;
  *) echo "未知架构 $ARCH"; exit 1 ;;
esac

"$SWIFT_BIN" -O "$SOURCE" -o "$STAGED_APP/Contents/MacOS/${APP_NAME}" \
  -parse-as-library \
  -target "$TARGET_TRIPLE" \
  -framework SwiftUI -framework AppKit -framework WebKit -framework Speech -framework AVFoundation

# 5.5) 编译并嵌入 WidgetKit 桌面小组件扩展（源码：macos/widget）
echo "编译 WidgetKit 桌面小组件..."
WIDGET_SRC_DIR="widget"
WIDGET_EXEC="TodoWidget"
WIDGET_APPLEX_NAME="${APP_NAME}Widget.appex"
WIDGET_APPLEX="$STAGED_APP/Contents/PlugIns/$WIDGET_APPLEX_NAME"
mkdir -p "$WIDGET_APPLEX/Contents/MacOS"

cat > "$WIDGET_APPLEX/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>${APP_NAME}小组件</string>
    <key>CFBundleDisplayName</key>
    <string>今日焦点</string>
    <key>CFBundleExecutable</key>
    <string>${WIDGET_EXEC}</string>
    <key>CFBundleIdentifier</key>
    <string>com.local.MicrosoftTodoFocusConsole.widget</string>
    <key>CFBundleVersion</key>
    <string>2</string>
    <key>CFBundleShortVersionString</key>
    <string>1.1.0</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundlePackageType</key>
    <string>XPC!</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>NSExtension</key>
    <dict>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.widgetkit-extension</string>
    </dict>
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsLocalNetworking</key>
        <true/>
    </dict>
</dict>
</plist>
PLIST

"$SWIFT_BIN" -O "$WIDGET_SRC_DIR"/*.swift -o "$WIDGET_APPLEX/Contents/MacOS/${WIDGET_EXEC}" \
  -parse-as-library \
  -target "$TARGET_TRIPLE" \
  -framework WidgetKit -framework SwiftUI -framework Foundation

if [[ ! -x "$WIDGET_APPLEX/Contents/MacOS/${WIDGET_EXEC}" ]]; then
  echo "构建失败：小组件扩展可执行文件缺失" >&2
  exit 1
fi

# 6) 签名（整体 --deep 签主程序）
#    优先用固定的本地签名身份：ad-hoc 签名每次重建 cdhash 都变，macOS 会把它当新应用，
#    导致麦克风/语音权限每次都被重新询问。运行 macos/create-signing-identity.sh 创建一次即可长期复用。
SIGN_IDENTITY=""
if security find-identity -v -p codesigning 2>/dev/null | grep -q "LightProjectAssistant Local Signer"; then
  SIGN_IDENTITY="LightProjectAssistant Local Signer"
fi
if [[ -n "$SIGN_IDENTITY" ]]; then
  echo "签名（本地稳定身份：${SIGN_IDENTITY}）..."
  codesign --force --deep --sign "$SIGN_IDENTITY" "$STAGED_APP"
else
  echo "Ad-hoc 签名（整体）..."
  echo "提示：运行 bash macos/create-signing-identity.sh 可创建本地稳定签名，"
  echo "      避免每次重新构建后系统再次询问麦克风/语音权限。"
  codesign --force --deep --sign - "$STAGED_APP"
fi

# 7) 在安装前验证 staging，失败时旧 bundle 尚未被触碰。
if [[ ! -x "$STAGED_APP/Contents/MacOS/${APP_NAME}" ]]; then
  echo "构建失败：主程序不存在或不可执行" >&2
  exit 1
fi
codesign --verify --deep --strict "$STAGED_APP"

# 8) 原子替换目标 bundle。旧版本先改名为同目录受控备份，失败由 trap 恢复。
if [[ -e "$APP_BUNDLE" ]]; then
  BACKUP_APP="${APP_BUNDLE}.previous.$$"
  if [[ -e "$BACKUP_APP" ]]; then
    echo "无法安全替换：备份路径已存在：$BACKUP_APP" >&2
    exit 1
  fi
  mv "$APP_BUNDLE" "$BACKUP_APP"
fi
mv "$STAGED_APP" "$APP_BUNDLE"
NEW_BUNDLE_INSTALLED=1

if [[ ! -x "$APP_BUNDLE/Contents/MacOS/${APP_NAME}" ]]; then
  echo "安装失败：主程序不存在或不可执行，正在恢复旧 bundle" >&2
  exit 1
fi
codesign --verify --deep --strict "$APP_BUNDLE"
if [[ -n "$BACKUP_APP" ]]; then
  # 不自动删除上一版：.app 目录交给用户自行清理，避免构建脚本隐式删除应用。
  echo "上一版已保留：$BACKUP_APP"
  echo "（确认新版运行正常后可自行删除）"
  BACKUP_APP=""
fi

# 9) 验证
echo "构建完成：$APP_BUNDLE"
echo "--- 校验主程序 ---"
codesign -v --verbose=2 "$APP_BUNDLE" 2>&1 | head -5
echo
echo "启动：open \"$APP_BUNDLE\""

# 10) 生成可分发安装包（dmg）：应用 + Applications 快捷方式，支持拖拽安装。
APP_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || echo '1.0.0')"
DIST_DIR="$PROJECT_ROOT/dist"
DMG_PATH="$DIST_DIR/${APP_NAME}-${APP_VERSION}.dmg"
mkdir -p "$DIST_DIR"
DMG_STAGE="$STAGE_ROOT/dmg"
mkdir -p "$DMG_STAGE"
cp -R "$APP_BUNDLE" "$DMG_STAGE/"
ln -s /Applications "$DMG_STAGE/Applications"
cat > "$DMG_STAGE/首次打开请看这里.txt" <<'NOTE'
首次打开请这样操作（macOS 安全提示）

1. 把「轻量项目助理」拖到右侧的 Applications 文件夹；
2. 在「应用程序」里找到它，按住 Control 点按图标 → 选择「打开」→ 再点「打开」；
3. 之后就能像普通软件一样双击启动了。

为什么需要这样做：本安装包未经 Apple 开发者签名与公证，macOS 会默认拦截首次运行。
软件完全在本机运行：任务数据直接来自你的 Microsoft To Do 账号，登录令牌只保存在本机。
NOTE

echo "生成安装包 dmg（首次会稍慢）..."
rm -f "$DMG_PATH"
if hdiutil create -volname "$APP_NAME" -srcfolder "$DMG_STAGE" -ov -format UDZO "$DMG_PATH" >/dev/null 2>&1; then
  echo "安装包：${DMG_PATH}（$(du -h "$DMG_PATH" | cut -f1)）"
else
  echo "警告：dmg 生成失败，但 .app 可直接使用：${APP_BUNDLE}" >&2
fi

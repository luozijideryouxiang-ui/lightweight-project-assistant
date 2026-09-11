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

# 1) 固定官方 Node runtime 版本；构建时下载并校验 arm64 + x64 两套官方二进制。
#    这样目标机器无需预装 Node，也不会依赖 Homebrew dylib。
NODE_RUNTIME_VERSION="${NODE_RUNTIME_VERSION:-22.22.1}"
NODE_DIST_ROOT="${NODE_DIST_ROOT:-https://nodejs.org/dist/v${NODE_RUNTIME_VERSION}}"
NODE_CACHE_DIR="${NODE_RUNTIME_CACHE_DIR:-${HOME}/Library/Caches/MicrosoftTodoFocusConsole/node-v${NODE_RUNTIME_VERSION}}"
echo "Node runtime：v${NODE_RUNTIME_VERSION}（官方 arm64 + x64）"
echo "项目根：$PROJECT_ROOT"

for required_tool in curl shasum tar file xcrun; do
  if ! command -v "$required_tool" >/dev/null 2>&1; then
    echo "构建失败：缺少工具 $required_tool" >&2
    exit 1
  fi
done

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

# 3.5) 嵌入服务资源与可分发 Node runtime。
BUNDLE_SERVER_DIR="$STAGED_APP/Contents/Resources/server"
BUNDLE_NODE_ROOT="$STAGED_APP/Contents/Resources/node"
BUNDLE_NODE_BIN="$BUNDLE_NODE_ROOT/bin/node"
mkdir -p "$BUNDLE_SERVER_DIR" "$BUNDLE_NODE_ROOT/bin"
cp "$PROJECT_ROOT/server.js" "$BUNDLE_SERVER_DIR/server.js"
cp "$PROJECT_ROOT/workflow.js" "$BUNDLE_SERVER_DIR/workflow.js"
cp "$PROJECT_ROOT/graph-move.js" "$BUNDLE_SERVER_DIR/graph-move.js"
cp -R "$PROJECT_ROOT/public" "$BUNDLE_SERVER_DIR/"
cp -R "$PROJECT_ROOT/node_modules" "$BUNDLE_SERVER_DIR/"

mkdir -p "$NODE_CACHE_DIR"
CHECKSUM_FILE="$NODE_CACHE_DIR/SHASUMS256.txt"
if [[ ! -s "$CHECKSUM_FILE" ]]; then
  curl -fL --retry 3 "$NODE_DIST_ROOT/SHASUMS256.txt" -o "$CHECKSUM_FILE"
fi

install_node_runtime() {
  local dist_arch="$1"
  local bundle_arch="$2"
  local archive="node-v${NODE_RUNTIME_VERSION}-darwin-${dist_arch}.tar.gz"
  local archive_path="$NODE_CACHE_DIR/$archive"
  local expected actual extracted
  if [[ ! -s "$archive_path" ]]; then
    curl -fL --retry 3 "$NODE_DIST_ROOT/$archive" -o "$archive_path"
  fi
  expected="$(awk -v name="$archive" '$2 == name { print $1 }' "$CHECKSUM_FILE")"
  if [[ -z "$expected" ]]; then
    echo "构建失败：官方校验文件中找不到 $archive" >&2
    exit 1
  fi
  actual="$(shasum -a 256 "$archive_path" | awk '{print $1}')"
  if [[ "$actual" != "$expected" ]]; then
    echo "构建失败：Node runtime 校验失败：$archive" >&2
    rm -f "$archive_path"
    exit 1
  fi
  tar -xzf "$archive_path" -C "$STAGE_ROOT"
  extracted="$STAGE_ROOT/node-v${NODE_RUNTIME_VERSION}-darwin-${dist_arch}/bin/node"
  mkdir -p "$BUNDLE_NODE_ROOT/$bundle_arch/bin"
  cp "$extracted" "$BUNDLE_NODE_ROOT/$bundle_arch/bin/node"
  chmod 755 "$BUNDLE_NODE_ROOT/$bundle_arch/bin/node"
}

install_node_runtime arm64 arm64
install_node_runtime x64 x86_64

cat > "$BUNDLE_NODE_BIN" <<'NODE_WRAPPER'
#!/bin/sh
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
case "$(uname -m)" in
  arm64) exec "$ROOT/arm64/bin/node" "$@" ;;
  x86_64) exec "$ROOT/x86_64/bin/node" "$@" ;;
  *) echo "Unsupported macOS architecture: $(uname -m)" >&2; exit 126 ;;
esac
NODE_WRAPPER
chmod 755 "$BUNDLE_NODE_BIN"

for bundled_path in \
  "$BUNDLE_SERVER_DIR/server.js" \
  "$BUNDLE_SERVER_DIR/workflow.js" \
  "$BUNDLE_SERVER_DIR/graph-move.js" \
  "$BUNDLE_SERVER_DIR/public" \
  "$BUNDLE_SERVER_DIR/node_modules" \
  "$BUNDLE_NODE_ROOT/arm64/bin/node" \
  "$BUNDLE_NODE_ROOT/x86_64/bin/node"; do
  if [[ ! -e "$bundled_path" ]]; then
    echo "构建失败：运行时资源嵌入不完整：$bundled_path" >&2
    exit 1
  fi
done
file "$BUNDLE_NODE_ROOT/arm64/bin/node" | grep -q 'arm64' || { echo "构建失败：arm64 Node 架构不正确" >&2; exit 1; }
file "$BUNDLE_NODE_ROOT/x86_64/bin/node" | grep -Eq 'x86_64|x86_64h' || { echo "构建失败：x64 Node 架构不正确" >&2; exit 1; }
if ! "$BUNDLE_NODE_BIN" --version >/dev/null 2>&1; then
  echo "构建失败：当前机器无法运行 bundle 内对应架构的 Node" >&2
  exit 1
fi

# 4) 写主程序 Info.plist
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

# 5) 编译 universal 主程序 Swift（Apple Silicon + Intel）
echo "编译 universal 主程序 Swift..."
MAIN_EXEC="$STAGED_APP/Contents/MacOS/${APP_NAME}"
"$SWIFT_BIN" -O "$SOURCE" -o "$MAIN_EXEC.arm64" \
  -parse-as-library -target "arm64-apple-macos14" \
  -framework SwiftUI -framework AppKit -framework WebKit -framework Speech -framework AVFoundation
"$SWIFT_BIN" -O "$SOURCE" -o "$MAIN_EXEC.x86_64" \
  -parse-as-library -target "x86_64-apple-macos14" \
  -framework SwiftUI -framework AppKit -framework WebKit -framework Speech -framework AVFoundation
xcrun lipo -create "$MAIN_EXEC.arm64" "$MAIN_EXEC.x86_64" -output "$MAIN_EXEC"
rm -f "$MAIN_EXEC.arm64" "$MAIN_EXEC.x86_64"
xcrun lipo -verify_arch arm64 x86_64 "$MAIN_EXEC"

# 5.5) 编译并嵌入 WidgetKit 桌面小组件扩展（源码：macos/widget）
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

WIDGET_BIN="$WIDGET_APPLEX/Contents/MacOS/${WIDGET_EXEC}"
"$SWIFT_BIN" -O "$WIDGET_SRC_DIR"/*.swift -o "$WIDGET_BIN.arm64" \
  -parse-as-library -target "arm64-apple-macos14" \
  -framework WidgetKit -framework SwiftUI -framework Foundation
"$SWIFT_BIN" -O "$WIDGET_SRC_DIR"/*.swift -o "$WIDGET_BIN.x86_64" \
  -parse-as-library -target "x86_64-apple-macos14" \
  -framework WidgetKit -framework SwiftUI -framework Foundation
xcrun lipo -create "$WIDGET_BIN.arm64" "$WIDGET_BIN.x86_64" -output "$WIDGET_BIN"
rm -f "$WIDGET_BIN.arm64" "$WIDGET_BIN.x86_64"
xcrun lipo -verify_arch arm64 x86_64 "$WIDGET_BIN"

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

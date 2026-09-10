#!/bin/bash
# 创建本地稳定的代码签名身份（只需运行一次）。
#
# 为什么需要：
#   ad-hoc 签名（codesign -s -）没有稳定身份，每次重新构建 app 的 cdhash 都会变化，
#   macOS 的隐私保护（TCC）会把它当成一个全新应用，于是麦克风/语音识别权限每次都要重新点「允许」。
#   用一个固定的自签名证书签名后，系统按证书身份记住权限，重建 app 也不会再重复询问。
#
# 用法：bash macos/create-signing-identity.sh
#   （脚本可重复运行；身份已存在时会直接跳过。）
set -euo pipefail

IDENTITY_NAME="LightProjectAssistant Local Signer"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

if [[ ! -f "$KEYCHAIN" ]]; then
  echo "找不到登录钥匙串：$KEYCHAIN" >&2
  exit 1
fi

if security find-identity -v -p codesigning 2>/dev/null | grep -q "$IDENTITY_NAME"; then
  echo "✓ 签名身份已存在：$IDENTITY_NAME（无需重复创建）"
  exit 0
fi

# 清理之前失败遗留的同名证书（未受信任的副本，避免钥匙串里堆叠）。
security delete-certificate -c "$IDENTITY_NAME" "$KEYCHAIN" >/dev/null 2>&1 || true

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/local-signer.XXXXXX")"
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

# 系统自带的是 LibreSSL，不支持 openssl req 的 -addext，改用配置文件声明证书用途。
# 证书名必须用纯英文：LibreSSL 会把配置文件里的中文二次编码，导致钥匙串里出现乱码名、系统找不到该身份。
cat > "$WORK_DIR/openssl.cnf" <<'CONF'
[ req ]
distinguished_name = dn
x509_extensions = v3_ext
prompt = no
[ dn ]
CN = LightProjectAssistant Local Signer
[ v3_ext ]
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
basicConstraints = critical, CA:false
CONF

echo "正在生成自签名代码签名证书…"
openssl req -x509 -newkey rsa:2048 \
  -keyout "$WORK_DIR/key.pem" \
  -out "$WORK_DIR/cert.pem" \
  -days 3650 -nodes \
  -config "$WORK_DIR/openssl.cnf"

# LibreSSL 导出的 p12 在空密码下会被 security import 拒绝，这里用一次性临时密码。
IMPORT_PASS="local-signer-import"
echo "正在生成并导入证书…"
openssl pkcs12 -export \
  -out "$WORK_DIR/identity.p12" \
  -inkey "$WORK_DIR/key.pem" \
  -in "$WORK_DIR/cert.pem" \
  -passout "pass:$IMPORT_PASS"

if ! security import "$WORK_DIR/identity.p12" \
  -k "$KEYCHAIN" \
  -P "$IMPORT_PASS" \
  -T /usr/bin/codesign \
  -A 2>&1; then
  echo "导入钥匙串失败（可能需要解锁登录钥匙串后重试）。" >&2
  exit 1
fi

# 自签名证书默认不被信任，而 macOS 只把「受信任」的证书当作有效签名身份。
# 这里把该证书设为代码签名信任根（系统可能弹窗要求输入登录密码，属正常）。
echo "正在设置证书信任（可能弹窗要求解锁/输入密码）…"
if ! security add-trusted-cert -r trustRoot -p codeSign -k "$KEYCHAIN" "$WORK_DIR/cert.pem" 2>&1; then
  echo "自动设置信任失败。请手动完成一次：" >&2
  echo "  打开「钥匙串访问」→ 找到「$IDENTITY_NAME」→ 双击 → 展开「信任」→" >&2
  echo "  将「代码签名」设为「始终信任」。" >&2
fi

# 允许 codesign 无需交互访问私钥。未设置钥匙串密码时会失败，属正常情况。
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "" "$KEYCHAIN" >/dev/null 2>&1 || true

if security find-identity -v -p codesigning 2>/dev/null | grep -q "$IDENTITY_NAME"; then
  echo "✓ 已创建签名身份：$IDENTITY_NAME"
  echo "  之后重新构建（bash macos/build-app.sh）会自动使用它签名。"
  echo "  系统首次询问麦克风/语音权限并允许后，更新版本不会再重复询问。"
else
  echo "创建失败：未在钥匙串中找到 codesigning 身份。" >&2
  echo "可改用「钥匙串访问 → 证书助理 → 创建证书」，类型选「代码签名」。" >&2
  exit 1
fi

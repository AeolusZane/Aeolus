#!/bin/bash
# Aeolus 一键安装脚本
#
# 用法:
#   curl -fsSL https://raw.githubusercontent.com/AeolusZane/aeolus/main/quick-install.sh | bash
#
# 携带凭证安装（推荐）:
#   JIRA_TOKEN=xxx bash <(curl -fsSL https://raw.githubusercontent.com/AeolusZane/aeolus/main/quick-install.sh)
#
# 可用环境变量:
#   AEOLUS_INSTALL_DIR   安装目录，默认 $HOME/Aeolus
#   AEOLUS_BRANCH        分支，默认 main
#   JIRA_TOKEN / JIRA_BASE_URL / JIRA_USERNAME
#   BITBUCKET_TOKEN / BITBUCKET_BASE_URL / BITBUCKET_USERNAME
#   CONF_TOKEN / CONF_BASE_URL / CONF_SPACE
#   FIGMA_API_KEY

set -e

REPO="https://github.com/AeolusZane/aeolus"
BRANCH="${AEOLUS_BRANCH:-main}"
ARCHIVE_URL="$REPO/archive/refs/heads/$BRANCH.tar.gz"
INSTALL_DIR="${AEOLUS_INSTALL_DIR:-$HOME/Aeolus}"

# ── 颜色 ──────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
die()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# ── 依赖检查 ──────────────────────────────────────────
echo "=== Aeolus Quick Installer ==="
echo ""
command -v curl >/dev/null 2>&1 || die "需要安装 curl"
command -v node >/dev/null 2>&1 || die "需要安装 Node.js（https://nodejs.org）"
command -v tar  >/dev/null 2>&1 || die "需要安装 tar"

# ── 下载 & 解压 ───────────────────────────────────────
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "下载 Aeolus ($BRANCH)..."
curl -fsSL "$ARCHIVE_URL" -o "$TMP_DIR/aeolus.tar.gz" || die "下载失败，请检查网络或仓库地址: $ARCHIVE_URL"
tar -xzf "$TMP_DIR/aeolus.tar.gz" -C "$TMP_DIR"

EXTRACTED=$(find "$TMP_DIR" -maxdepth 1 -mindepth 1 -type d | head -1)
[ -d "$EXTRACTED/Aeolus" ] || die "压缩包结构异常，未找到 Aeolus 目录"

# ── 安装/升级 文件 ────────────────────────────────────
if [ -d "$INSTALL_DIR" ]; then
  echo "检测到已安装，升级中: $INSTALL_DIR"
  # 保留 credentials 目录，只同步其他文件
  rsync -a --delete \
    --exclude='credentials/' \
    "$EXTRACTED/Aeolus/" "$INSTALL_DIR/" 2>/dev/null \
    || { cp -r "$EXTRACTED/Aeolus/." "$INSTALL_DIR/"; }
  ok "文件已同步"
else
  echo "全新安装到: $INSTALL_DIR"
  cp -r "$EXTRACTED/Aeolus" "$INSTALL_DIR"
  ok "文件已复制"
fi

# ── 写入凭证（仅当环境变量存在时写入，不覆盖已有文件内容） ──
mkdir -p "$INSTALL_DIR/credentials"

write_cred() {
  local file="$INSTALL_DIR/credentials/$1"; shift
  # 有新值才写；已存在则跳过（不强制覆盖，避免丢掉旧凭证）
  local has_new=0
  for pair in "$@"; do
    local val="${pair#*=}"
    [ -n "$val" ] && has_new=1 && break
  done
  [ "$has_new" = 0 ] && return
  if [ -f "$file" ]; then
    warn "凭证文件已存在，跳过: $file （若需更新请手动编辑）"
    return
  fi
  {
    for pair in "$@"; do
      local key="${pair%%=*}" val="${pair#*=}"
      [ -n "$val" ] && echo "export $key=\"$val\""
    done
  } > "$file"
  ok "凭证已写入: credentials/$(basename "$file")"
}

write_cred "jira.env" \
  "JIRA_TOKEN=${JIRA_TOKEN}" \
  "JIRA_BASE_URL=${JIRA_BASE_URL:-https://work.fineres.com}" \
  "JIRA_USERNAME=${JIRA_USERNAME:-Aeolus.Zhang}"

write_cred "bitbucket.env" \
  "BITBUCKET_TOKEN=${BITBUCKET_TOKEN}" \
  "BITBUCKET_BASE_URL=${BITBUCKET_BASE_URL}" \
  "BITBUCKET_USERNAME=${BITBUCKET_USERNAME}"

write_cred "confluence.env" \
  "CONF_TOKEN=${CONF_TOKEN}" \
  "CONF_BASE_URL=${CONF_BASE_URL}" \
  "CONF_SPACE=${CONF_SPACE}"

write_cred "figma.env" \
  "FIGMA_API_KEY=${FIGMA_API_KEY}"

# ── 执行 install.sh ───────────────────────────────────
echo ""
echo "执行安装脚本..."
# 非交互模式：settings.json 有差异时自动跳过（不覆盖）
AEOLUS_SETTINGS_ANSWER="${AEOLUS_SETTINGS_ANSWER:-n}" bash "$INSTALL_DIR/install.sh"

# ── 完成提示 ──────────────────────────────────────────
echo ""
echo "==============================="
echo "  Aeolus 安装完成!"
echo "==============================="
echo ""
echo "执行以下命令使环境变量生效:"
echo "  source ~/.zshenv"
echo ""
echo "重启 Claude Code 后所有 Skills 和 MCP 即可使用"

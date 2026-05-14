#!/bin/bash
# Aeolus 一键安装脚本
#
# 用法 1 — 首次安装（交互式填写凭证，填完自动保存到 ~/.aeolus-creds.env）:
#   curl -fsSL https://raw.githubusercontent.com/AeolusZane/aeolus/main/quick-install.sh | bash
#
# 用法 2 — 重装 / 换机器（凭证文件一键导入）:
#   AEOLUS_CREDS_FILE=~/.aeolus-creds.env bash <(curl -fsSL ...)
#
# 用法 3 — 纯自动化（通过环境变量）:
#   JIRA_TOKEN=xxx BITBUCKET_TOKEN=yyy bash <(curl -fsSL ...)
#
# 可用环境变量:
#   AEOLUS_INSTALL_DIR   安装目录，默认 $HOME/Aeolus
#   AEOLUS_BRANCH        分支，默认 main
#   AEOLUS_SKIP_CREDS    设为 1 则跳过凭证步骤
#   AEOLUS_CREDS_FILE    统一凭证文件路径（source 后自动读取所有变量）

set -e

REPO="https://github.com/AeolusZane/aeolus"
BRANCH="${AEOLUS_BRANCH:-main}"
ARCHIVE_URL="$REPO/archive/refs/heads/$BRANCH.tar.gz"
INSTALL_DIR="${AEOLUS_INSTALL_DIR:-$HOME/Aeolus}"

# ── 颜色 ──────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
die()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }


# ── 凭证文件路径 ──────────────────────────────────────
CREDS_FILE="${AEOLUS_CREDS_FILE:-$HOME/.aeolus-creds.env}"
CREDS_FILE="${CREDS_FILE/#\~/$HOME}"   # 展开 ~

# ── Step 1：凭证模板不存在 → 生成模板，提示填写后重跑 ──
if [ ! -f "$CREDS_FILE" ] && [ "${AEOLUS_SKIP_CREDS:-0}" != "1" ]; then
  echo ""
  echo -e "${BOLD}── 首次安装：生成凭证模板 ──────────────────────────${NC}"
  cat > "$CREDS_FILE" << 'EOF'
# Aeolus 凭证文件
# 填写完毕后重新运行安装命令即可
# 请勿提交到 git（建议备份到密码管理器）

# Jira
export JIRA_TOKEN=""
export JIRA_BASE_URL="https://work.fineres.com"
export JIRA_USERNAME="Aeolus.Zhang"

# Bitbucket
export BITBUCKET_TOKEN=""
export BITBUCKET_BASE_URL="https://code.fineres.com"
export BITBUCKET_USERNAME=""

# Confluence
export CONF_TOKEN=""
export CONF_BASE_URL=""
export CONF_SPACE=""

# Figma
export FIGMA_API_KEY=""
EOF
  chmod 600 "$CREDS_FILE"
  ok "凭证模板已生成: $CREDS_FILE"
  echo ""
  echo "  1. 编辑凭证文件，填入各服务的 Token："
  echo "       open $CREDS_FILE"
  echo ""
  echo "  2. 填完后重新运行安装命令："
  echo "       curl -fsSL <url> | bash"
  echo ""
  exit 0
fi

# ── Step 2：加载凭证文件 ──────────────────────────────
if [ -f "$CREDS_FILE" ] && [ "${AEOLUS_SKIP_CREDS:-0}" != "1" ]; then
  # shellcheck disable=SC1090
  source "$CREDS_FILE"
  ok "已加载凭证: $CREDS_FILE"
fi

# ── 依赖检查 ──────────────────────────────────────────
echo ""
echo -e "${BOLD}=== Aeolus Quick Installer ===${NC}"
echo ""
command -v curl >/dev/null 2>&1 || die "需要安装 curl"
command -v node >/dev/null 2>&1 || die "需要安装 Node.js（https://nodejs.org）"
command -v tar  >/dev/null 2>&1 || die "需要安装 tar"

# ── 下载 & 解压 ───────────────────────────────────────
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "下载 Aeolus ($BRANCH)..."
curl -fsSL "$ARCHIVE_URL" -o "$TMP_DIR/aeolus.tar.gz" || die "下载失败，请检查网络: $ARCHIVE_URL"
tar -xzf "$TMP_DIR/aeolus.tar.gz" -C "$TMP_DIR"

EXTRACTED=$(find "$TMP_DIR" -maxdepth 1 -mindepth 1 -type d | head -1)
[ -d "$EXTRACTED/Aeolus" ] || die "压缩包结构异常，未找到 Aeolus 目录"

# ── 安装/升级 文件 ────────────────────────────────────
if [ -d "$INSTALL_DIR" ]; then
  echo "检测到已安装，升级中: $INSTALL_DIR"
  rsync -a --delete \
    --exclude='credentials/' \
    "$EXTRACTED/Aeolus/" "$INSTALL_DIR/" 2>/dev/null \
    || cp -r "$EXTRACTED/Aeolus/." "$INSTALL_DIR/"
  ok "文件已同步"
else
  echo "全新安装到: $INSTALL_DIR"
  cp -r "$EXTRACTED/Aeolus" "$INSTALL_DIR"
  ok "文件已复制"
fi

mkdir -p "$INSTALL_DIR/credentials"


# ── 写入凭证文件 ──────────────────────────────────────
# 有值则写；文件已存在则追加/更新（不全量覆盖）
write_cred() {
  local file="$INSTALL_DIR/credentials/$1"; shift
  local has_val=0
  for pair in "$@"; do
    [ -n "${pair#*=}" ] && has_val=1 && break
  done
  [ "$has_val" = 0 ] && return

  if [ -f "$file" ]; then
    warn "凭证文件已存在，跳过写入: credentials/$(basename "$file")（手动编辑可更新）"
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
  "JIRA_BASE_URL=${JIRA_BASE_URL}" \
  "JIRA_USERNAME=${JIRA_USERNAME}"

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

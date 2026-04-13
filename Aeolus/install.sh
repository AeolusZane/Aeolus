#!/bin/bash
set -e

AEOLUS_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Aeolus AI Tools Installer ==="
echo "安装目录: $AEOLUS_DIR"
echo ""

# ─── 1. 设置环境变量（~/.zshenv） ───

setup_env_in_file() {
  local target="$1"
  local label="$2"
  touch "$target"

  # 清理旧的独立变量（如果有）
  sed -i '' '/^export XHS_MCP_DIR=.*Desktop\/ai\/mcp/d' "$target" 2>/dev/null || true
  sed -i '' '/^export CLAUDE_WORK_DIR=.*Desktop\/claude/d' "$target" 2>/dev/null || true
  sed -i '' '/^# Claude skills 用到的路径/d' "$target" 2>/dev/null || true

  if grep -q 'AEOLUS_DIR' "$target" 2>/dev/null; then
    sed -i '' "s|^export AEOLUS_DIR=.*|export AEOLUS_DIR=\"$AEOLUS_DIR\"|" "$target"
    echo "[ok] $label 环境变量已更新"
  else
    cat >> "$target" << 'ENVEOF'

# Aeolus AI Tools
export AEOLUS_DIR="__AEOLUS_DIR__"
export XHS_MCP_DIR="$AEOLUS_DIR/mcp/xiaohongshu"
export CLAUDE_WORK_DIR="$AEOLUS_DIR"
ENVEOF
    sed -i '' "s|__AEOLUS_DIR__|$AEOLUS_DIR|" "$target"
    echo "[ok] $label 环境变量已添加"
  fi
}

setup_env_in_file "$HOME/.zshenv" "~/.zshenv"

# 清理 ~/.zshrc 和 ~/.zprofile 中的旧残留
for old_file in "$HOME/.zshrc" "$HOME/.zprofile"; do
  if grep -q 'AEOLUS_DIR' "$old_file" 2>/dev/null; then
    sed -i '' '/^# Aeolus AI Tools$/d' "$old_file"
    sed -i '' '/^export AEOLUS_DIR=/d' "$old_file"
    sed -i '' '/^export XHS_MCP_DIR=.*AEOLUS_DIR/d' "$old_file"
    sed -i '' '/^export CLAUDE_WORK_DIR=.*AEOLUS_DIR/d' "$old_file"
    echo "[ok] 已清理 $old_file 中的旧环境变量"
  fi
done

# 立即生效
export AEOLUS_DIR="$AEOLUS_DIR"
export XHS_MCP_DIR="$AEOLUS_DIR/mcp/xiaohongshu"
export CLAUDE_WORK_DIR="$AEOLUS_DIR"

# ─── 2. 创建 ~/.claude 目录 ───

mkdir -p "$HOME/.claude/skills"

# ─── 3. 链接 Skills（支持分类子目录，拍平链接到 ~/.claude/skills/） ───

LINK_COUNT=0
# 遍历 skills/ 下所有包含 SKILL.md 的目录
find "$AEOLUS_DIR/skills" -name "SKILL.md" -type f | while read -r skill_file; do
  skill_dir=$(dirname "$skill_file")
  name=$(basename "$skill_dir")
  target="$HOME/.claude/skills/$name"

  # 如果已是指向本目录的链接，跳过
  if [ -L "$target" ] && [ "$(readlink "$target")" = "$skill_dir" -o "$(readlink "$target")" = "$skill_dir/" ]; then
    continue
  fi

  # 如果是链接但指向别处，删掉重建
  if [ -L "$target" ]; then
    rm "$target"
  fi

  # 如果是真实目录，备份
  if [ -d "$target" ]; then
    mv "$target" "${target}.bak"
    echo "  备份已有 skill: $name → ${name}.bak"
  fi

  ln -s "$skill_dir" "$target"
done
LINK_COUNT=$(find "$AEOLUS_DIR/skills" -name "SKILL.md" -type f | wc -l | tr -d ' ')
echo "[ok] Skills 已链接 ($LINK_COUNT 个)"

# ─── 4. 链接 ai-capabilities.md ───

ln -sf "$AEOLUS_DIR/config/ai-capabilities.md" "$HOME/.claude/ai-capabilities.md"
echo "[ok] ai-capabilities.md 已链接"

# ─── 5. 安装 settings.json ───

if [ -f "$HOME/.claude/settings.json" ]; then
  if diff -q "$AEOLUS_DIR/config/settings.json" "$HOME/.claude/settings.json" > /dev/null 2>&1; then
    echo "[ok] settings.json 已是最新"
  else
    echo ""
    echo "[warn] 检测到已有 settings.json，与 Aeolus 版本不同"
    echo "  Aeolus 版本: $AEOLUS_DIR/config/settings.json"
    echo "  当前版本:    ~/.claude/settings.json"
    echo ""
    printf "  覆盖当前 settings.json？(y=覆盖并备份 / n=跳过) [n]: "
    if [ -n "${AEOLUS_SETTINGS_ANSWER}" ]; then
      answer="${AEOLUS_SETTINGS_ANSWER}"
      echo "$answer"
    else
      read -r answer
    fi
    if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
      cp "$HOME/.claude/settings.json" "$HOME/.claude/settings.json.bak"
      cp "$AEOLUS_DIR/config/settings.json" "$HOME/.claude/settings.json"
      echo "[ok] settings.json 已覆盖（原文件备份为 settings.json.bak）"
    else
      echo "[skip] settings.json 未改动"
    fi
  fi
else
  cp "$AEOLUS_DIR/config/settings.json" "$HOME/.claude/settings.json"
  echo "[ok] settings.json 已安装"
fi

# 注入安装路径到 settings.json 的 env 字段
SETTINGS_FILE="$HOME/.claude/settings.json"
if [ -f "$SETTINGS_FILE" ]; then
  node -e "
    const fs = require('fs');
    const f = process.argv[1];
    const d = process.argv[2];
    const s = JSON.parse(fs.readFileSync(f, 'utf8'));
    s.env = s.env || {};
    s.env.AEOLUS_DIR = d;
    s.env.CLAUDE_WORK_DIR = d;
    s.env.XHS_MCP_DIR = d + '/mcp/xiaohongshu';
    if (process.env.FIGMA_API_KEY) s.env.FIGMA_API_KEY = process.env.FIGMA_API_KEY;
    fs.writeFileSync(f, JSON.stringify(s, null, 2) + '\n');
  " "$SETTINGS_FILE" "$AEOLUS_DIR"
  echo "[ok] settings.json 已注入环境变量（AEOLUS_DIR, CLAUDE_WORK_DIR, XHS_MCP_DIR）"
fi

# ─── 6. 生成 work.mcp.json ───

# 读取凭证文件
load_env() {
  local file="$1"
  if [ -f "$file" ]; then
    # shellcheck disable=SC1090
    source "$file"
  fi
}
load_env "$AEOLUS_DIR/credentials/figma.env"
load_env "$AEOLUS_DIR/credentials/jira.env"
load_env "$AEOLUS_DIR/credentials/confluence.env"
load_env "$AEOLUS_DIR/credentials/bitbucket.env"

cat > "$AEOLUS_DIR/config/work.mcp.json" << EOF
{
  "mcpServers": {
    "figma": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "figma-mcp"],
      "env": {
        "FIGMA_API_KEY": "${FIGMA_API_KEY}"
      }
    },
    "jira": {
      "type": "stdio",
      "command": "node",
      "args": ["$AEOLUS_DIR/mcp/jira/index.js"],
      "env": {
        "JIRA_BASE_URL": "${JIRA_BASE_URL}",
        "JIRA_USERNAME": "${JIRA_USERNAME}",
        "JIRA_TOKEN": "${JIRA_TOKEN}"
      }
    },
    "bitbucket": {
      "command": "node",
      "args": ["$AEOLUS_DIR/mcp/bitbucket/dist/mcp-server.js"],
      "env": {
        "BITBUCKET_BASE_URL": "${BITBUCKET_BASE_URL}",
        "BITBUCKET_TOKEN": "${BITBUCKET_TOKEN}",
        "BITBUCKET_USERNAME": "${BITBUCKET_USERNAME}"
      }
    },
    "claw-mcp": {
      "type": "stdio",
      "command": "$AEOLUS_DIR/mcp/claw-mcp/.venv/bin/python3",
      "args": ["$AEOLUS_DIR/mcp/claw-mcp/bug_agent_mcp.py"],
      "env": {}
    },
    "confluence": {
      "type": "stdio",
      "command": "node",
      "args": ["$AEOLUS_DIR/mcp/confluence-node/dist/mcp-server.js"],
      "env": {
        "CONF_BASE_URL": "${CONF_BASE_URL}",
        "CONF_TOKEN": "${CONF_TOKEN}",
        "CONF_SPACE": "${CONF_SPACE}"
      }
    }
  }
}
EOF
echo "[ok] work.mcp.json 已生成"

# ─── 7. 安装 MCP 依赖 ───

echo ""
echo "安装 MCP 依赖..."
for mcp_dir in "$AEOLUS_DIR"/mcp/*/; do
  [ -d "$mcp_dir" ] || continue
  name=$(basename "$mcp_dir")
  if [ -f "$mcp_dir/package.json" ]; then
    echo "  npm install: $name"
    (cd "$mcp_dir" && npm install --silent 2>&1 | tail -1) || echo "  [warn] $name 安装失败，请手动检查"
  fi
  if [ -f "$mcp_dir/requirements.txt" ]; then
    echo "  pip install (venv): $name"
    if [ ! -d "$mcp_dir/.venv" ]; then
      python3 -m venv "$mcp_dir/.venv"
    fi
    ("$mcp_dir/.venv/bin/pip" install -r "$mcp_dir/requirements.txt" -q 2>&1 | tail -1) || echo "  [warn] $name 安装失败，请手动检查"
  fi
done
echo "[ok] MCP 依赖安装完成"

# ─── 8. 写入安装标记 ───

node -e "
  const fs = require('fs');
  fs.writeFileSync(process.argv[2], JSON.stringify({ installPath: process.argv[1] }, null, 2) + '\n');
" "$AEOLUS_DIR" "$HOME/.claude/aeolus.json"
echo "[ok] 安装标记已写入 (~/.claude/aeolus.json)"

# ─── 9. 凭证检查 ───

echo ""
if [ -f "$AEOLUS_DIR/credentials/bitbucket.env" ]; then
  echo "[ok] 凭证文件已就位"
else
  echo "[warn] 缺少 credentials/bitbucket.env，submit-pr 功能将不可用"
  echo "  请创建文件并填入 BITBUCKET_BASE_URL、BITBUCKET_TOKEN、BITBUCKET_USERNAME"
fi

# ─── 完成 ───

echo ""
echo "==============================="
echo "  安装完成!"
echo "==============================="
echo ""
echo "请执行: source ~/.zshrc"
echo ""
echo "已安装:"
echo "  - $(find "$AEOLUS_DIR/skills" -name "SKILL.md" -type f | wc -l | tr -d ' ') 个 Skills → ~/.claude/skills/"
echo "  - $(ls -d "$AEOLUS_DIR"/mcp/*/ 2>/dev/null | wc -l | tr -d ' ') 个 MCP 服务"
echo "  - settings.json → ~/.claude/settings.json"
echo "  - ai-capabilities.md → ~/.claude/ai-capabilities.md"
echo ""
echo "在工作项目中使用 /setup-work-mcp 即可配置 MCP"

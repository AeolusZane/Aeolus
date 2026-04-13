#!/bin/bash
set -e

AEOLUS_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Aeolus 升级 ==="
echo "安装目录: $AEOLUS_DIR"
echo ""

# ─── 1. 重新链接 Skills（新增的 skill 自动被发现和链接） ───

mkdir -p "$HOME/.claude/skills"

LINK_COUNT=0
NEW_COUNT=0
while read -r skill_file; do
  skill_dir=$(dirname "$skill_file")
  name=$(basename "$skill_dir")
  target="$HOME/.claude/skills/$name"

  if [ -L "$target" ] && [ "$(readlink "$target")" = "$skill_dir" ]; then
    LINK_COUNT=$((LINK_COUNT + 1))
    continue
  fi

  if [ -L "$target" ]; then
    rm "$target"
  fi

  if [ -d "$target" ]; then
    mv "$target" "${target}.bak"
    echo "  备份已有 skill: $name → ${name}.bak"
  fi

  ln -s "$skill_dir" "$target"
  LINK_COUNT=$((LINK_COUNT + 1))
  NEW_COUNT=$((NEW_COUNT + 1))
  echo "  [new] $name"
done < <(find "$AEOLUS_DIR/skills" -name "SKILL.md" -type f)
echo "[ok] Skills 已链接 ($LINK_COUNT 个，新增 $NEW_COUNT 个)"

# ─── 2. 链接 ai-capabilities.md ───

ln -sf "$AEOLUS_DIR/config/ai-capabilities.md" "$HOME/.claude/ai-capabilities.md"
echo "[ok] ai-capabilities.md 已链接"

# ─── 3. 更新 settings.json ───

if [ -f "$HOME/.claude/settings.json" ]; then
  if diff -q "$AEOLUS_DIR/config/settings.json" "$HOME/.claude/settings.json" > /dev/null 2>&1; then
    echo "[ok] settings.json 已是最新"
  else
    if [ "${AEOLUS_SETTINGS_ANSWER}" = "y" ] || [ "${AEOLUS_SETTINGS_ANSWER}" = "Y" ]; then
      cp "$HOME/.claude/settings.json" "$HOME/.claude/settings.json.bak"
      cp "$AEOLUS_DIR/config/settings.json" "$HOME/.claude/settings.json"
      echo "[ok] settings.json 已更新（原文件备份为 settings.json.bak）"
    else
      echo "[skip] settings.json 有差异，已跳过"
    fi
  fi
else
  cp "$AEOLUS_DIR/config/settings.json" "$HOME/.claude/settings.json"
  echo "[ok] settings.json 已安装"
fi

# 更新 settings.json 中的路径
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
    fs.writeFileSync(f, JSON.stringify(s, null, 2) + '\n');
  " "$SETTINGS_FILE" "$AEOLUS_DIR"
  echo "[ok] settings.json 路径已更新"
fi

# ─── 4. 更新安装标记 ───

node -e "
  const fs = require('fs');
  fs.writeFileSync(process.argv[2], JSON.stringify({ installPath: process.argv[1] }, null, 2) + '\n');
" "$AEOLUS_DIR" "$HOME/.claude/aeolus.json"
echo "[ok] 安装标记已更新"

# ─── 完成 ───

echo ""
echo "==============================="
echo "  升级完成!"
echo "==============================="
echo ""
SKILL_COUNT=$(find "$AEOLUS_DIR/skills" -name "SKILL.md" -type f | wc -l | tr -d ' ')
echo "  Skills: $SKILL_COUNT 个"
echo ""
echo "重启 Claude Code 后生效"

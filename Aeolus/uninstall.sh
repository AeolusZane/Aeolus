#!/bin/bash
set -e

AEOLUS_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Aeolus AI Tools Uninstaller ==="
echo ""

# ─── 1. 移除 Skills 链接（只删指向 Aeolus 的链接，不动用户自己的） ───

REMOVED=0
for link in "$HOME/.claude/skills/"*; do
  [ -L "$link" ] || continue
  target=$(readlink "$link")
  if echo "$target" | grep -q "$AEOLUS_DIR"; then
    rm "$link"
    REMOVED=$((REMOVED + 1))
  fi
done
echo "[ok] 已移除 $REMOVED 个 skill 链接"

# ─── 2. 移除 ai-capabilities.md 链接 ───

if [ -L "$HOME/.claude/ai-capabilities.md" ]; then
  target=$(readlink "$HOME/.claude/ai-capabilities.md")
  if echo "$target" | grep -q "$AEOLUS_DIR"; then
    rm "$HOME/.claude/ai-capabilities.md"
    echo "[ok] 已移除 ai-capabilities.md 链接"
  fi
else
  echo "[skip] ai-capabilities.md 不是链接，未改动"
fi

# ─── 3. 还原 settings.json ───

if [ -f "$HOME/.claude/settings.json.bak" ]; then
  mv "$HOME/.claude/settings.json.bak" "$HOME/.claude/settings.json"
  echo "[ok] settings.json 已还原为备份版本"
else
  echo "[skip] 无 settings.json 备份，未改动"
fi

# ─── 4. 清理环境变量（~/.zshenv） ───

clean_env_in_file() {
  local target="$1"
  local label="$2"
  if grep -q 'AEOLUS_DIR' "$target" 2>/dev/null; then
    sed -i '' '/^# Aeolus AI Tools$/d' "$target"
    sed -i '' '/^export AEOLUS_DIR=/d' "$target"
    sed -i '' '/^export XHS_MCP_DIR=.*AEOLUS_DIR/d' "$target"
    sed -i '' '/^export CLAUDE_WORK_DIR=.*AEOLUS_DIR/d' "$target"
    echo "[ok] 已从 $label 移除环境变量"
  else
    echo "[skip] $label 中未找到 Aeolus 环境变量"
  fi
}

clean_env_in_file "$HOME/.zshenv" "~/.zshenv"

# ─── 5. 移除 aeolus.json ───

if [ -f "$HOME/.claude/aeolus.json" ]; then
  rm "$HOME/.claude/aeolus.json"
  echo "[ok] 已移除 aeolus.json"
else
  echo "[skip] aeolus.json 不存在，未改动"
fi

# ─── 6. 删除 Aeolus 安装目录 ───

if [ -d "$AEOLUS_DIR" ]; then
  rm -rf "$AEOLUS_DIR"
  echo "[ok] 已删除 Aeolus 安装目录: $AEOLUS_DIR"
else
  echo "[skip] 安装目录不存在，无需删除"
fi

# ─── 完成 ───

echo ""
echo "==============================="
echo "  卸载完成"
echo "==============================="
echo ""
echo "已清理:"
echo "  - ~/.claude/skills/ 中指向 Aeolus 的链接"
echo "  - ~/.claude/ai-capabilities.md 链接"
echo "  - ~/.zshenv 中的 AEOLUS_DIR 相关变量"
echo "  - ~/.claude/aeolus.json 安装标记"
echo "  - $AEOLUS_DIR（安装目录已删除）"
echo ""
echo "  - ~/.claude/settings.json$([ -f "$HOME/.claude/settings.json.bak" ] || echo '（无备份可还原）')"
echo ""
echo "请执行: source ~/.zshenv"

# Aeolus Installer

Aeolus 的 GUI 安装程序，基于 Electron 构建。用户拿到单个 `.app` 文件即可在任意 Mac 上完成安装。

## 背景

Aeolus 是一套 Claude Code 的 Skills + MCP 工具集，包含 15 个 Skill（分 work/personal 两类）和 5 个 MCP 服务。最初这些都是散落在本地的脚本和配置，通过一个 `install.sh` 手动安装。随着组件越来越多，需要一个可分发的图形化安装程序。

## 设计决策

| 功能 | 处理方式 |
|------|----------|
| Skill 归类 | 在 `Aeolus/skills/` 下按 `work/`、`personal/` 分类组织，`install.sh` 遍历所有含 `SKILL.md` 的目录，拍平软链接到 `~/.claude/skills/`；skill 内的数据文件（tasks.md、cookies.json 等）通过目录链接一并可访问 |
| Skill 链接实现 | 用 `while read done < <(find ...)` 替代 `find \| while`，避免管道创建子 shell 导致 `set -e` 静默中断、链接未创建 |
| MCP 服务管理 | 5 个 MCP 各自独立目录（`Aeolus/mcp/`），`install.sh` 自动检测 `package.json` 或 `requirements.txt` 安装依赖 |
| 凭证配置 | Installer GUI 填写凭证 → 内存暂存 → 复制到目标路径后写入 `.env` 文件，不写入打包资源（只读） |
| MCP 配置生成 | `install.sh` 读取凭证 `.env`，模板替换生成 `work.mcp.json`，包含所有 MCP 的路径和环境变量 |
| settings.json 冲突 | Installer 检测 `~/.claude/settings.json` 是否已存在且不同，弹窗让用户选择覆盖（自动备份 `.bak`）或跳过 |
| 环境变量 | `install.sh` 写入 `~/.zshenv`，设置 `AEOLUS_DIR`、`XHS_MCP_DIR`、`CLAUDE_WORK_DIR`，并清理旧残留 |
| ai-capabilities.md | 软链接 `Aeolus/config/ai-capabilities.md` → `~/.claude/ai-capabilities.md` |
| 自动注册新 Skill | `settings.json` 中配置 `PostToolUse` hook，写入 SKILL.md 时自动追加到能力清单 |
| 安装路径选择 | 默认 `$HOME`，用户可通过系统文件夹选择器更改，安装到 `<路径>/Aeolus/` |
| 独立分发 | Aeolus 内容通过 `extraResources` 打包进 `.app`（排除 `node_modules`、`.venv`），依赖安装时现场执行 |
| 安装程序自清理 | 安装完成后默认勾选"删除安装程序"，点完成时通过 `shell.trashItem` 移到废纸篓 |
| 进度反馈 | `install.sh` 的 stdout/stderr 实时输出到终端面板，匹配关键字驱动进度条 |

## 安装流程

```
.app 启动
  → Welcome 页
  → 选择安装路径 + 填写凭证（可跳过）
  → 复制 Aeolus 到目标路径
  → 写入凭证 .env 文件
  → 执行 install.sh（环境变量 → 链接 Skills → 配置文件 → 生成 MCP 配置 → 安装依赖）
  → Done 页（显示 Skill/MCP 数量，可选删除安装程序）
```

## 目录结构

```
aeolus-installer/
├── main.js          # Electron 主进程，IPC 处理、文件复制、子进程调用
├── preload.js       # contextBridge 暴露 API 到渲染进程
├── renderer/
│   ├── index.html   # 4 页向导：Welcome → Credentials → Installing → Done
│   ├── app.js       # 页面逻辑、进度条里程碑匹配
│   └── style.css    # macOS 风格 UI
└── package.json     # electron-builder 配置，extraResources 打包 Aeolus
```

## 开发

```bash
npm install
npm start          # 开发模式运行
npm run build      # 构建 .app（输出到 dist/，postbuild 自动复制到上级目录）
```

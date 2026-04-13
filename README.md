# Aeolus

一套 Claude Code 的 Skills + MCP 工具集。

## 快速安装

### 首次安装

**Step 1 — 生成凭证模板**

```bash
curl -fsSL https://raw.githubusercontent.com/AeolusZane/aeolus/main/quick-install.sh | bash
```

脚本会在 `~/.aeolus-creds.env` 生成模板并退出。

**Step 2 — 填写凭证**

```bash
open ~/.aeolus-creds.env
```

填入 Jira / Bitbucket / Confluence / Figma 的 Token，保存。

**Step 3 — 正式安装**

```bash
curl -fsSL https://raw.githubusercontent.com/AeolusZane/aeolus/main/quick-install.sh | bash
```

---

### 重装 / 换机器

把 `~/.aeolus-creds.env` 拷到新机器，然后直接运行安装命令，无需重新填写凭证：

```bash
curl -fsSL https://raw.githubusercontent.com/AeolusZane/aeolus/main/quick-install.sh | bash
```

---

### 环境变量选项

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `AEOLUS_INSTALL_DIR` | 安装目录 | `$HOME/Aeolus` |
| `AEOLUS_BRANCH` | 安装分支 | `main` |
| `AEOLUS_CREDS_FILE` | 凭证文件路径 | `~/.aeolus-creds.env` |
| `AEOLUS_SKIP_CREDS` | 设为 `1` 跳过凭证步骤 | — |

---

## 目录结构

```
aeolus-installer/
├── README.md
├── quick-install.sh       # 一键安装脚本（curl | bash）
├── Aeolus/                # 实际安装内容（可单独作为 git 仓库分发）
│   ├── install.sh         # 本地安装脚本（由 quick-install.sh 调用）
│   ├── upgrade.sh         # 升级脚本
│   ├── uninstall.sh       # 卸载脚本
│   ├── config/            # settings.json、ai-capabilities.md 等配置
│   ├── credentials/       # 凭证文件（本地，不提交 git）
│   ├── mcp/               # MCP 服务（jira、bitbucket、confluence 等）
│   └── skills/            # Claude Code Skills（work/、personal/ 分类）
└── aeolus-installer/      # Electron GUI 安装程序（可选）
    ├── main.js
    ├── preload.js
    ├── renderer/
    └── package.json
```

---

## GUI 安装程序（Electron）

> 用户拿到单个 `.app` 文件即可在任意 Mac 上完成安装，适合非技术用户分发。

### 设计说明

| 功能 | 处理方式 |
|------|----------|
| Skill 归类 | 在 `Aeolus/skills/` 下按 `work/`、`personal/` 分类，`install.sh` 拍平软链接到 `~/.claude/skills/` |
| MCP 服务管理 | 5 个 MCP 各自独立目录，`install.sh` 自动检测 `package.json` 或 `requirements.txt` 安装依赖 |
| 凭证配置 | Installer GUI 填写凭证 → 内存暂存 → 复制到目标路径后写入 `.env` 文件，不写入打包资源 |
| MCP 配置生成 | `install.sh` 读取凭证 `.env`，模板替换生成 `work.mcp.json` |
| settings.json 冲突 | 检测已有文件是否不同，弹窗让用户选择覆盖（自动备份 `.bak`）或跳过 |
| 环境变量 | 写入 `~/.zshenv`，设置 `AEOLUS_DIR`、`XHS_MCP_DIR`、`CLAUDE_WORK_DIR` |

### 安装流程

```
.app 启动
  → Welcome 页
  → 选择安装路径 + 填写凭证（可跳过）
  → 复制 Aeolus 到目标路径
  → 写入凭证 .env 文件
  → 执行 install.sh
  → Done 页（显示 Skill/MCP 数量，可选删除安装程序）
```

### 开发

```bash
npm install
npm start          # 开发模式运行
npm run build      # 构建 .app（输出到 dist/）
```

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

### 开发

```bash
npm install
npm start          # 开发模式运行
npm run build      # 构建 .app（输出到 dist/）
```

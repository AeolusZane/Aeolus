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
├── .gitignore
├── .claude/               # Claude Code 本地配置
└── Aeolus/                # 实际安装内容
    ├── install.sh         # 本地安装脚本（由 quick-install.sh 调用）
    ├── upgrade.sh         # 升级脚本
    ├── uninstall.sh       # 卸载脚本
    ├── DEVELOPMENT.md     # 开发指南：如何新增 MCP / Skill
    ├── config/            # settings.json、ai-capabilities.md、work.mcp.json 等配置模板
    ├── credentials/       # 凭证文件（本地，不提交 git）
    │   ├── jira.env
    │   ├── bitbucket.env
    │   ├── confluence.env
    │   ├── figma.env
    │   └── git.env
    ├── mcp/               # MCP 服务
    │   ├── jira/
    │   ├── bitbucket/
    │   ├── confluence-node/
    │   ├── claw-mcp/
    │   ├── git-mcp/
    │   └── xiaohongshu/
    └── skills/            # Claude Code Skills
        ├── work/          # 工作类（jira-bugs、fix-bug、submit-pr 等）
        └── personal/      # 个人类（notify、health、finance 等）
```

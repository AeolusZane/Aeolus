# Aeolus 开发指南：如何新增 MCP / Skill

## 一、新增 MCP

### 1. 写 MCP Server 代码

在 `Aeolus/mcp/<名称>/` 下创建 MCP Server，入口文件为 `index.js`（或 `index.py`），遵循 MCP 协议。

```
Aeolus/mcp/<名称>/
├── index.js          # MCP Server 入口
├── package.json      # (Node) 依赖声明
└── .env              # (可选) 本地调试用的环境变量
```

### 2. 添加凭证文件

在 `Aeolus/credentials/<名称>.env` 中定义该 MCP 需要的环境变量，一行一个 `KEY=VALUE`。

```env
# 示例: Aeolus/credentials/git.env
GITHUB_TOKEN=your_token_here
```

### 3. 更新 config/work.mcp.json 模板

在 `Aeolus/config/work.mcp.json` 的 `mcpServers` 中添加一项，格式参考已有的 MCP：

```json
"<名称>": {
  "type": "stdio",
  "command": "node",
  "args": ["$AEOLUS_DIR/mcp/<名称>/index.js"],
  "env": {
    "ENV_KEY": "${ENV_KEY}"
  }
}
```

- `$AEOLUS_DIR` 是安装目录占位符，install.sh 会自动替换
- `env` 里的 `${ENV_KEY}` 会从 credentials 文件读取

### 4. 更新 install.sh

在 `Aeolus/install.sh` 中做两处修改：

**a) 加载凭证文件** — 在其他 `load_env` 后加一行：

```bash
load_env "$AEOLUS_DIR/credentials/<名称>.env"
```

**b) 生成 MCP 配置** — 在 `work.mcp.json` 的 EOF 块中，参照其他 MCP 添加一段：

```json
"<名称>": {
  "type": "stdio",
  "command": "node",
  "args": ["$AEOLUS_DIR/mcp/<名称>/index.js"],
  "env": {
    "ENV_KEY": "${ENV_KEY}"
  }
}
```

### 5. 更新 setup-work-mcp Skill（可选）

如果该 MCP 属于"帆软工作用 MCP"，更新 `Aeolus/skills/work/setup-work-mcp/SKILL.md` 的 description 和完成提示，把新 MCP 名称加上。

---

## 二、新增 Skill

### 1. 创建 SKILL.md

在 `Aeolus/skills/work/`（工作类）或 `Aeolus/skills/personal/`（个人类）下新建目录，目录名即为 skill 名称，目录内放 `SKILL.md`。

```
Aeolus/skills/work/<skill名称>/
└── SKILL.md
```

### 2. SKILL.md 格式

```markdown
---
name: <skill名称>
description: <一句话描述，包含触发关键词。当用户说"XX"时使用。>
argument-hint: [参数提示]
allowed-tools: <允许调用的工具，逗号分隔>
---

# <标题>

执行步骤和说明...
```

### 3. 安装生效

install.sh 会自动扫描 `Aeolus/skills/` 下所有包含 `SKILL.md` 的目录，链接到 `~/.claude/skills/`，无需额外配置。

---

## 三、关键文件一览

| 文件 | 作用 |
|------|------|
| `Aeolus/mcp/<名称>/` | MCP Server 代码 |
| `Aeolus/credentials/<名称>.env` | 该 MCP 的凭证（敏感信息） |
| `Aeolus/config/work.mcp.json` | 工作 MCP 配置模板 |
| `Aeolus/install.sh` | 安装脚本，加载凭证并生成最终配置 |
| `Aeolus/skills/<分类>/<名称>/SKILL.md` | Skill 定义 |

---
name: setup-work-mcp
description: 把帆软工作用的 MCP 配置（jira/bitbucket/figma/confluence/claw-mcp）复制到当前项目目录下的 .mcp.json。当用户说"配置帆软工作的mcp"、"配置工作mcp"、"setup mcp"、"帮我配置mcp"时使用。
allowed-tools: Bash
---

# 配置帆软工作 MCP

执行以下命令，把工作 MCP 配置复制到当前项目：

```bash
cp "$CLAUDE_WORK_DIR/config/work.mcp.json" "$(pwd)/.mcp.json"
```

完成后告知用户：已将 jira、bitbucket、figma、confluence、claw-mcp 配置写入当前项目的 `.mcp.json`，重启 Claude Code 或执行 `/mcp` 后生效。

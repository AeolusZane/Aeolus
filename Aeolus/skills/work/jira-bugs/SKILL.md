---
name: jira-bugs
description: 查询 Jira 当前版本待处理的 bug 列表，返回任务编号和简要信息。当用户问我还有多少bug要处理时使用。 Use when user asks about current bugs, tasks to fix, or Jira issues.
argument-hint: [版本号，默认 7.0.9]
allowed-tools: mcp__jira__jira_get_bugs
---

查询 Jira 中当前版本需要处理的 bug，版本号为 $ARGUMENTS（若未提供则用 7.0.9）。

调用 MCP 工具 `mcp__jira__jira_get_bugs`，参数：
- `version`: "$ARGUMENTS"（若为空则传 "7.0.9"）

根据返回结果，以简洁格式展示每条任务，并统计总数。

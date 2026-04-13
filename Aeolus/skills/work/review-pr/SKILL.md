---
name: review-pr
description: 用 Bitbucket MCP 处理 PR：评论、通过、needs-work。对于合并分支类 PR，直接通过。当用户提供 Bitbucket PR 链接并让你处理/审查/通过/评论 PR 时使用。
argument-hint: <PR链接> [指令或评论内容]
allowed-tools: mcp__bitbucket__bitbucket_get_pr, mcp__bitbucket__bitbucket_add_comment, mcp__bitbucket__bitbucket_approve_pr, mcp__bitbucket__bitbucket_needs_work_pr
---

# 处理 PR

输入：**$ARGUMENTS**

## 解析 URL

从参数中提取：URL 格式 `https://<host>/projects/<PROJECT>/repos/<repo>/pull-requests/<prId>/...`，解析出 `project`、`repo`、`prId`。

## 执行逻辑

**如果参数中没有明确指令**（只有 URL）：
- 调用 `mcp__bitbucket__bitbucket_get_pr` 获取 PR 标题
- 若标题符合合并分支模式（以 `Merge branch`、`Merge remote-tracking branch` 开头，或匹配 `merge .* into .*` 不区分大小写）→ 直接 approve
- 否则 → 告知用户"请告诉我要执行什么操作（通过/打回/评论内容）"，等待指令

**如果参数中有明确指令**，直接执行，不需要先读 PR：
- `通过` / `approve` → 调用 `mcp__bitbucket__bitbucket_approve_pr`
- `打回` / `needs-work` / `need work` → 调用 `mcp__bitbucket__bitbucket_needs_work_pr`
- 其他文字 → 作为评论内容调用 `mcp__bitbucket__bitbucket_add_comment`

完成后一句话告知结果，不需要多余说明。

---
name: merge-pr
description: 合并 Bitbucket PR 后的完整处理流程：通过PR → 提取 bug 编号 → 把PR描述写入 Jira 评论 → 询问转测参数 → 转测。当用户说"合并PR"、"merge pr"、"处理合并"、"合并分支"并提供 PR 链接时使用。
argument-hint: <PR链接>
allowed-tools: mcp__bitbucket__bitbucket_get_pr, mcp__bitbucket__bitbucket_approve_pr, mcp__jira__jira_add_comment, mcp__jira__jira_transition_to_test, AskUserQuestion
---

# 合并 PR 完整处理流程

输入：**$ARGUMENTS**

## 第一步：解析 PR 链接

从参数中提取 URL，格式：
`https://<host>/projects/<PROJECT>/repos/<repo>/pull-requests/<prId>/...`

解析出 `project`、`repo`、`prId`。

---

## 第二步：获取 PR 详情

调用 `mcp__bitbucket__bitbucket_get_pr`，获取：
- PR 标题（用于提取 bug 编号）
- PR 描述（用于写入 Jira 评论）

从标题中提取所有 bug 编号（格式 `BI-\d+`）。

---

## 第三步：通过 PR

调用 `mcp__bitbucket__bitbucket_approve_pr` 批准该 PR。

---

## 第四步：把 PR 描述写入 Jira 评论

对每个提取到的 bug 编号，调用 `mcp__jira__jira_add_comment`：
- issueKey = bug 编号
- comment = PR 的描述内容（原文）

---

## 第五步：询问转测参数

调用 `AskUserQuestion` 询问用户：

> 需要转测，请确认以下参数：
> - 改动原因：非改动导致 / 改动导致 / 未知改动（默认：非改动导致）
> - 备注（需重点测试功能点）：（默认：rt）

等待用户回复后继续。

---

## 第六步：转测

对每个 bug 编号，调用 `mcp__jira__jira_transition_to_test`：
- issueKey = bug 编号
- changeReason = 用户填写的改动原因
- note = 用户填写的备注

---

## 完成

输出一句话汇总结果，如：
> PR #7138 已通过，BI-188980 & BI-195157 评论已写入并转测完成。

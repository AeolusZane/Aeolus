---
name: fix-bug
description: 处理 Jira bug 的完整流程：读取 bug → 分析根因给方案 → 写 Jira 评论 → 记工作日志。当用户提供 bug 编号并让你处理/解决 bug 时使用。
argument-hint: <bug编号，如 BI-187804>
allowed-tools: mcp__jira__jira_get_issue, mcp__jira__jira_add_comment, mcp__jira__jira_log_work, Read, Grep, Glob, Bash
---

# Bug 处理流程

目标 Bug：**$ARGUMENTS**

按以下步骤顺序执行，每步完成后再进行下一步。

---

## 第一步：看 bug，把问题搞清

调用 `mcp__jira__jira_get_issue`，issue_key = `$ARGUMENTS`，获取：
- 问题描述、复现步骤、截图
- 报告人、环境信息、版本

完成后输出 bug 核心描述。

---

## 第二步：分析根因，给解决方案

基于第一步的现象，在代码库中分析根因：

1. 根据 bug 描述定位相关代码（用 Grep/Glob/Read）
2. 找到问题所在，分析根因
3. 给出修复方案（可以是代码改动，也可以是方向建议）

完成后输出：
- **根因**：X 处逻辑有误，原因是…
- **方案**：具体改法

---

## 第三步：修复代码，提交 commit

完成代码修改后，只 `git add` 本次 bug 涉及的文件，然后提交：

```
git commit -m "$ARGUMENTS fix: <10~15字描述改动内容>"
```

描述要求：简明说清楚改了什么，如"修复字段分组hover提示文案错误"。

---

## 第四步：确认方案，写 Jira 评论

将第一步和第二步的内容整理后，调用 `mcp__jira__jira_add_comment`：

- issue_key = `$ARGUMENTS`
- 评论内容格式：

```
根因：<一句话描述>
修复：<一句话描述>
```

---

## 第四步：写工作日志

调用 `mcp__jira__jira_log_work`：

- issueKey = `$ARGUMENTS`
- timeSpent = `1h`（默认，若实际耗时不同可调整）
- comment = 用 **3-5 个字** 概括本次工作内容，例如：
  - "修复滚动异常"
  - "定位渲染错误"
  - "分析数据异常"

---

完成所有步骤后，简要告知用户三步均已完成，并输出问题链接：
`https://work.fineres.com/browse/$ARGUMENTS`

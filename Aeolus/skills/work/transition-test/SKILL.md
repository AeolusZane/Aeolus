---
name: transition-test
description: 将 Jira bug 转测试组员，支持设置"改动原因"和"需重点测试功能点（备注）"。当用户说"转测"、"转测一下"、"transition test"时使用。
argument-hint: <bug编号> [改动原因: 改动导致|非改动导致|未知改动] [备注]
allowed-tools: Bash
---

# 转测 Jira Bug

目标 Bug：**$ARGUMENTS**

## 执行步骤

### 第一步：解析参数

从 `$ARGUMENTS` 中提取：
- bug 编号（必填，支持多个，用空格或 & 分隔，如 `BI-188980 BI-195157`）
- 改动原因（可选，默认"非改动导致"）：
  - `非改动导致` → id: `15416`
  - `改动导致` → id: `15415`
  - `未知改动` → id: `15417`
- 备注（可选，用于"需重点测试功能点"字段，默认 `rt`）

若参数中未明确说明，直接用默认值，不要询问用户。

### 第二步：调用 Jira API 转测

凭证：
- JIRA_BASE_URL: `https://work.fineres.com`
- BASIC: `echo -n "Aeolus.Zhang:nsbnIyhsLfqZc03b2liDSFxwgVTTZBMWbCs" | base64`
- 转测 transitionId: `381`

对每个 bug 执行：

```bash
BASIC=$(echo -n "Aeolus.Zhang:nsbnIyhsLfqZc03b2liDSFxwgVTTZBMWbCs" | base64)

curl -s -X POST \
  "https://work.fineres.com/rest/api/2/issue/<bug>/transitions" \
  -H "Authorization: Basic $BASIC" \
  -H "Content-Type: application/json" \
  -d '{
    "transition": {"id": "381"},
    "fields": {
      "customfield_13836": {"id": "<改动原因id>"},
      "customfield_10700": "<备注>"
    },
    "update": {
      "comment": [{"add": {"body": "<备注>"}}]
    }
  }'
```

### 第三步：输出结果

- 响应为空 → 转测成功
- 响应含 errorMessages → 输出错误原因

每个 bug 一行结果，如：
> BI-195157：转测成功
> BI-188980：失败 - 当前状态不支持转测

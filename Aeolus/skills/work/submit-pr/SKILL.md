---
name: submit-pr
description: 提交 Bitbucket PR：从当前分支提到同名目标分支，标题为 bug编号+5字简述，描述含【问题原因】【改动思路】各10字内。当用户说"提交PR"、"提pr"、"分支提交下pr"、"submit pr"时使用。
argument-hint: <bug编号，如 BI-187804>
allowed-tools: mcp__jira__jira_get_issue, Bash
---

# 提交 PR 到 Bitbucket

Bug 编号：**$ARGUMENTS**

按以下步骤执行：

---

## 第一步：获取当前分支和仓库信息

运行以下命令：

```bash
git branch --show-current
git remote get-url origin
git log --oneline -5
```

**Fork 仓库说明**：origin 是个人 fork（URL 含 `~username`），PR 需提交到主仓库。
- fromRef 仓库：个人 fork，project key 为 `~aeolus.zhang`，repo slug 根据 origin URL 判断
- toRef 仓库：主仓库，根据 repo slug 判断 project key：
  - `nuclear-webui` → project key 为 `BUSSINESS`
  - `data-fusion-web` → project key 为 `DATAFUSION`
- 两边分支名相同（同名分支），例如当前是 `release/7.0` 则 toRef 也是 `release/7.0`

---

## 第二步：读取 Jira Bug

调用 `mcp__jira__jira_get_issue`，issue_key = `$ARGUMENTS`，获取问题描述和背景。

---

## 第三步：组织 PR 内容

结合 Jira bug 信息和 `git log` 的最近提交，生成：

- **PR 标题**：
  - 单个 bug：`BI-195110 修复hover文案`（bug号 + 5字内简述）
  - 多个 bug：`BI-195110 & BI-188980 简述`（用 ` & ` 拼接所有 bug 号，后跟整体简述）

- **PR 描述**，格式：
  - 单个 bug：
    ```
    【问题原因】<10字以内>
    【改动思路】<10字以内>
    ```
  - 多个 bug：
    ```
    【问题原因】BI-xxx，<原因简述> & BI-yyy，<原因简述>
    【改动思路】BI-xxx，<思路简述> & BI-yyy，<思路简述>
    ```
    每行按 `BI-xxx，简述 & BI-yyy，简述` 拼接所有 bug，各自简述10字以内

---

## 第四步：通过 Bitbucket REST API 创建 PR

读取凭证（source 后直接使用变量，无需手动赋值）：
```bash
source "$CLAUDE_WORK_DIR/credentials/bitbucket.env"
```

然后用 curl 创建 PR。注意：
- 根据 repo slug 确定主仓库 project key（nuclear-webui → BUSSINESS，data-fusion-web → DATAFUSION）
- 两个仓库的默认 reviewers 相同：`Dailer`、`imp`、`Kobi`、`Oliver.Ke`、`Tomorrow`、`Zoey.Chen`

```bash
source "$CLAUDE_WORK_DIR/credentials/bitbucket.env"
BRANCH="<current-branch>"
REPO_SLUG="<nuclear-webui 或 data-fusion-web>"
PROJECT_KEY="<BUSSINESS 或 DATAFUSION>"

curl -s -X POST \
  "${BITBUCKET_BASE_URL}/rest/api/1.0/projects/${PROJECT_KEY}/repos/${REPO_SLUG}/pull-requests" \
  -H "Authorization: Bearer ${BITBUCKET_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "<PR标题>",
    "description": "<PR描述>",
    "fromRef": {
      "id": "refs/heads/<current-branch>",
      "repository": {
        "slug": "<REPO_SLUG>",
        "project": { "key": "~aeolus.zhang" }
      }
    },
    "toRef": {
      "id": "refs/heads/<current-branch>",
      "repository": {
        "slug": "<REPO_SLUG>",
        "project": { "key": "<PROJECT_KEY>" }
      }
    },
    "reviewers": [
      {"user": {"name": "Dailer"}},
      {"user": {"name": "imp"}},
      {"user": {"name": "Kobi"}},
      {"user": {"name": "Oliver.Ke"}},
      {"user": {"name": "Tomorrow"}},
      {"user": {"name": "Zoey.Chen"}}
    ]
  }'
```

---

**注意**：若同分支已有 open PR（Bitbucket 不允许重复），改用 PUT 更新该 PR 的标题和描述，并且 **必须同时带上 reviewers 字段**，否则会被清空：

```bash
curl -s -X PUT \
  "${BITBUCKET_BASE_URL}/rest/api/1.0/projects/${PROJECT_KEY}/repos/${REPO_SLUG}/pull-requests/<prId>" \
  -H "Authorization: Bearer ${BITBUCKET_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "version": <当前version>,
    "title": "<新标题>",
    "description": "<新描述>",
    "reviewers": [
      {"user": {"name": "Dailer"}},
      {"user": {"name": "imp"}},
      {"user": {"name": "Kobi"}},
      {"user": {"name": "Oliver.Ke"}},
      {"user": {"name": "Tomorrow"}},
      {"user": {"name": "Zoey.Chen"}}
    ]
  }'
```

---

## 第五步：输出结果

从 API 响应中提取 PR 链接（`links.self[0].href`），输出一句话告知结果：

> PR 已提交：https://code.fineres.com/projects/.../pull-requests/...

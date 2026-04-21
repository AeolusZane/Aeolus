---
name: create-dev-docs
description: 根据 Jira 任务列表，在指定 KMS 页面下批量创建开发文档。每篇文档标题为"BI-XXXXXX 任务主题"，内容含标题一"一、任务编号"和 Jira 宏链接。当用户说"创建开发文档"、"建开发文档"、"create dev docs"并提供任务编号和 KMS 页面 ID 时使用。
argument-hint: <KMS父页面ID> <任务编号1> <任务编号2> ...
allowed-tools: mcp__jira__jira_get_issue, mcp__confluence__confluence_create_page
---

根据用户提供的 Jira 任务编号列表，在指定 KMS 父页面下批量创建开发文档。

**输入参数（$ARGUMENTS）格式：**
`<KMS父页面ID> <BI-XXXXX> <BI-XXXXX> ...`

例如：`1416248435 BI-195895 BI-195896 BI-195897`

**执行步骤：**

1. 解析 $ARGUMENTS，第一个参数为 KMS 父页面 ID，其余为 Jira 任务编号列表。

2. 并行调用 `mcp__jira__jira_get_issue` 获取每个任务的详情，提取 `summary` 字段作为任务主题。

3. 并行调用 `mcp__confluence__confluence_create_page` 为每个任务创建 KMS 页面：
   - `parentId`：第一步解析出的 KMS 父页面 ID
   - `title`：`BI-XXXXXX 任务主题`（任务编号 + 空格 + summary）
   - `content`：
     ```html
     <h1>一、任务编号</h1>
     <p><ac:structured-macro ac:name="jira" ac:schema-version="1"><ac:parameter ac:name="key">BI-XXXXXX</ac:parameter></ac:structured-macro></p>
     ```
     其中 `BI-XXXXXX` 替换为实际任务编号，h1 内容固定为"一、任务编号"（不替换为真实编号）。

4. 汇总输出所有创建成功的页面标题和 KMS 链接。

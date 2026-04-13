# AI 能力清单

## 工作

| 名字 | 需求 | 实现形式 | 编号 |
|------|------|---------|------|
| 任务记录助手 | 记录任务编号和概述到文件；给关键词能反查编号 | skill | 0 |
| Bug 处理助手 | 给编号处理整个 bug：读详情、浏览器复现、根因分析、写 Jira 评论、记工时 | skill | 1 |
| 当前 Bug 列表 | 查询指定版本 Jira 待处理 bug 清单 | skill | 2 |
| 前端开发评审文档 | 给 Jira 编号 + Figma 链接，自动生成评审文档并创建到 KMS | skill | 3 |
| KMS 页面搬迁 | 把指定 KMS 页面复制/移动到前端2026目录下 | skill | 4 |
| PR 审查助手 | 给 Bitbucket PR 链接，自动评论/通过/打回 | skill | 5 |
| Jira 操作 | 读取 issue 详情、写评论、记工时、查 bug 列表 | mcp | 6 |
| Bitbucket 操作 | 读 PR、通过/打回 PR、添加评论 | mcp | 7 |
| Figma 操作 | 读取设计节点结构、下载设计截图 | mcp | 8 |
| KMS 操作 | 读取/创建/复制/移动/搜索 Confluence 页面 | mcp | 9 |
| setup-work-mcp | 把帆软工作用的 MCP 配置复制到当前项目 | skill | 10 |
| submit-pr | 提交 Bitbucket PR，自动填标题描述带 reviewer | skill | 14 |
| transition-test | 将 Jira bug 转测试组员，支持设置改动原因和备注 | skill | 15 |
| merge-pr | 合并 PR 后完整处理：通过→写 Jira 评论→询问参数→转测 | skill | 16 |

## 个人

| 名字 | 需求 | 实现形式 | 编号 |
|------|------|---------|------|
| finance | 记录和查看个人财务规划 | skill | 11 |
| B站视频处理 | 给 B 站链接，自动抓取音频、转录、生成总结 | mcp | 12 |
| ai-capabilities | 查看或新增 AI 能力列表 | skill | 13 |
| health | 读取体检报告生成健康计划，查看/更新健康计划和饮食计划 | skill | 17 |
| notify | 设置/查看/关闭定时通知，通过 Mac crontab 推送系统通知 | skill | 18 |

#!/usr/bin/env python3
"""
Bug 复现 Agent

用法：
    python bug_agent.py <ISSUE_KEY>
    python bug_agent.py BI-193105
"""

import anyio
import argparse
import json
import os
import re
from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage, AssistantMessage, TextBlock

AEOLUS_DIR = os.environ.get("AEOLUS_DIR", os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

JIRA_MCP = {
    "command": "node",
    "args": [os.path.join(AEOLUS_DIR, "mcp", "jira", "index.js")],
}

PLAYWRIGHT_MCP = {
    "command": "npx",
    "args": [
        "@playwright/mcp@latest",
        "--device", "iPhone 15",
    ],
}

SYSTEM_PROMPT = """你是一个专业的前端 bug 复现助手，负责帮助开发团队自动复现 Jira bug 并补充描述。

工作流程：
1. 通过 jira_get_issue 获取 bug 详情，重点关注：
   - 问题描述中的复现 URL（通常是 http://192.168.16.67:81/... 格式）
   - 复现步骤
   - 错误现象描述

2. URL 规则（重要）：
   - bug 一般是移动端问题，优先打开移动端地址复现
   - 如果 bug 描述中的 URL 是 PC 端格式：.../page/edit/{pageId}/report/{reportId} 或 .../page/view/{pageId}/report/{reportId}
     则转换为移动端地址：.../url/mobile/bi/view?id={reportId}&null#/bi
   - 只有当移动端无法复现或 bug 明确说明是 PC 端问题时，才访问 PC 端地址

3. 使用浏览器复现问题：
   - 浏览器已以 iPhone 15 移动设备模式启动（模拟移动端 viewport 和 User-Agent）
   - 打开移动端 URL，等待页面完全加载
   - 按照 bug 描述的步骤操作
   - 文字记录问题现象
   - 观察：页面显示异常、元素渲染错误等

4. 给出bug复现结论，内容包括：
   - 描述核心现象
   - 补充原 bug 描述没有覆盖但对定位有帮助的信息，例如：
     * 具体是哪个组件/哪个位置出现问题
     * 异常只在某些条件下触发（特定字段类型、特定操作步骤）
     * 页面其他组件是否正常（对比说明）
     * 控制台有无明显报错
     * 复现率（必现 / 偶现）
   - 最后加一行「根因推测」，2 句话以内，基于现象做合理推断，不要展开
   - 简洁，总共不超过 5 条

登录处理（重要）：
- 打开 URL 后，如果页面跳转到登录界面，先检查 bug 描述和评论中是否有提供账号密码
- bug 描述中的账号密码格式通常是 "账号/密码"，例如 "1/1" 表示账号 1、密码 1，"admin/123456" 表示账号 admin、密码 123456
- 如果 bug 中有这种格式的内容，直接提取并填写登录
- 如果 bug 中没有提供，使用默认账号密码：账号 1、密码 1
- 登录成功后导航到目标页面

其他注意事项：
- 描述要清晰反馈问题现象
- 用中文撰写，专业、简洁

完成所有操作后，最后输出一个 JSON 代码块作为结构化分析结果（供程序读取，不用写进 Jira）：
```json
{
  "reproduced": true,
  "phenomena": "核心现象描述（1-2句）",
  "observations": ["补充观察1", "补充观察2"],
  "root_cause_speculation": "根因推测（2句以内）"
}
```
"""


async def reproduce_bug(issue_key: str, verbose: bool = True) -> dict:
    """
    复现 Jira bug，返回结构化分析数据。

    Returns:
        {
            "reproduced": bool,
            "phenomena": str,
            "observations": list[str],
            "root_cause_speculation": str
        }
    """
    prompt = f"""请复现并补充 bug {issue_key} 的描述。

步骤：
1. 用 jira_get_issue 获取 {issue_key} 的详情，找到复现 URL 和问题描述
2. 将 URL 转换为移动端地址，用浏览器打开复现问题
3. 用文字描述问题现象
4. 最后输出结构化 JSON 分析结果
"""

    if verbose:
        print(f"🚀 启动 Bug 复现 Agent，目标：{issue_key}\n")

    result_data = {}

    async for message in query(
        prompt=prompt,
        options=ClaudeAgentOptions(
            system_prompt=SYSTEM_PROMPT,
            mcp_servers={
                "jira": JIRA_MCP,
                "playwright": PLAYWRIGHT_MCP,
            },
            max_turns=40,
            permission_mode="bypassPermissions",
        ),
    ):
        if verbose and isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock) and block.text:
                    print(block.text)
        elif isinstance(message, ResultMessage) and message.result:
            if verbose:
                print("\n" + "=" * 60)
                print("✅ Agent 完成\n")
            # 从输出中提取 JSON 块
            match = re.search(r"```json\s*(.*?)\s*```", message.result, re.DOTALL)
            if match:
                try:
                    result_data = json.loads(match.group(1))
                except json.JSONDecodeError:
                    pass

    return result_data


def main() -> None:
    parser = argparse.ArgumentParser(
        description="自动复现 Jira bug 并补充描述",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="示例：\n  python bug_agent.py BI-193105",
    )
    parser.add_argument("issue_key", help="Jira issue 编号，如 BI-193105")
    args = parser.parse_args()

    result = anyio.run(reproduce_bug, args.issue_key)
    if result:
        print("\n📦 结构化数据：")
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

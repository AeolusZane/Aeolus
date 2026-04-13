#!/usr/bin/env python3
"""
Bug Agent MCP Server

将 bug 复现 agent 封装为 MCP 工具，供其他 agent 调用。

工具：
  reproduce_bug(issue_key) -> { reproduced, phenomena, observations, root_cause_speculation }
"""

import asyncio
import json
import sys
import os

# 确保能 import bug_agent
sys.path.insert(0, os.path.dirname(__file__))

from mcp.server.fastmcp import FastMCP
from bug_agent import reproduce_bug

mcp = FastMCP("bug-agent")


@mcp.tool()
async def reproduce_bug_tool(issue_key: str) -> str:
    """
    自动复现 Jira bug，返回现象分析和根因推测。

    会打开移动端浏览器访问 bug 环境，观察，然后返回结构化分析数据。

    Args:
        issue_key: Jira issue 编号，如 BI-193105

    Returns:
        JSON 字符串，包含：
        - reproduced: 是否复现成功
        - phenomena: 核心现象描述
        - observations: 补充观察列表（原 bug 描述未覆盖的信息）
        - root_cause_speculation: 根因推测
    """
    result = await reproduce_bug(issue_key, verbose=False)
    return json.dumps(result, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    mcp.run()

#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const JIRA_URL = process.env.JIRA_BASE_URL || "https://work.fineres.com";
const USERNAME = process.env.JIRA_USERNAME || "Aeolus.Zhang";
const TOKEN = process.env.JIRA_TOKEN;
if (!TOKEN) {
  console.error("JIRA_TOKEN 环境变量未设置");
  process.exit(1);
}
const BASIC = Buffer.from(`${USERNAME}:${TOKEN}`).toString("base64");

const HEADERS = {
  Authorization: `Basic ${BASIC}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

async function searchIssues(version = "7.0.8", maxResults = 100) {
  const jql = [
    "project = BI",
    "AND issuetype in (一般BUG, 客户BUG, 开发测试任务)",
    "AND status in (研发组员问题解决中, 组长分配, 子模块组长分配, 重复BUG待解决)",
    `AND fixVersion = ${version}`,
    "AND assignee not in (Chenyang, BeckyWang, Mika.Sha, Stephen.King, Joy.Shentu, Marissa.Xu)",
    "AND assignee = Aeolus.Zhang",
    "ORDER BY component ASC",
  ].join(" ");

  const params = new URLSearchParams({
    jql,
    maxResults: String(maxResults),
    fields: "summary,status,priority,updated,components,fixVersions",
  });

  const res = await fetch(`${JIRA_URL}/rest/api/2/search?${params}`, {
    headers: HEADERS,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return { issues: data.issues ?? [], total: data.total ?? 0 };
}

function formatIssues(issues, total, version) {
  if (issues.length === 0) {
    return `版本 ${version} 暂无待处理 Bug ✓`;
  }

  // Group by component
  const groups = {};
  for (const issue of issues) {
    const comps = issue.fields.components?.map((c) => c.name) ?? [];
    const groupKey = comps.length > 0 ? comps.join(", ") : "（无模块）";
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(issue);
  }

  const lines = [`=== 待处理 Bug（${version}）共 ${total} 条 ===\n`];

  for (const [group, groupIssues] of Object.entries(groups)) {
    lines.push(`【${group}】`);
    for (const issue of groupIssues) {
      const f = issue.fields;
      const status = f.status?.name ?? "-";
      const priority = f.priority?.name ?? "-";
      const summary = f.summary ?? "";
      const updated = f.updated ? f.updated.slice(0, 10) : "-";
      lines.push(`  [${issue.key}] (${status}) [${priority}] ${summary}  (${updated})`);
    }
    lines.push("");
  }

  if (total > issues.length) {
    lines.push(`（显示前 ${issues.length} 条，共 ${total} 条）`);
  }

  return lines.join("\n");
}

async function getIssue(issueKey) {
  const params = new URLSearchParams({
    fields: "summary,status,priority,updated,components,fixVersions,description,assignee,reporter,comment",
  });

  const res = await fetch(`${JIRA_URL}/rest/api/2/issue/${issueKey}?${params}`, {
    headers: HEADERS,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira API error ${res.status}: ${text}`);
  }

  return res.json();
}

function formatIssueDetail(data) {
  const f = data.fields;
  const lines = [
    `=== ${data.key}: ${f.summary} ===`,
    `状态: ${f.status?.name ?? "-"}`,
    `优先级: ${f.priority?.name ?? "-"}`,
    `经办人: ${f.assignee?.displayName ?? "-"}`,
    `报告人: ${f.reporter?.displayName ?? "-"}`,
    `模块: ${f.components?.map((c) => c.name).join(", ") || "-"}`,
    `版本: ${f.fixVersions?.map((v) => v.name).join(", ") || "-"}`,
    `更新: ${f.updated ? f.updated.slice(0, 10) : "-"}`,
    "",
    "【描述】",
    f.description ? f.description.slice(0, 1000) : "（无描述）",
  ];

  const comments = f.comment?.comments ?? [];
  if (comments.length > 0) {
    lines.push("", `【评论】（共 ${comments.length} 条，显示最新 3 条）`);
    for (const c of comments.slice(-3)) {
      lines.push(`  [${c.author?.displayName ?? "-"} @ ${c.updated?.slice(0, 10)}] ${c.body?.slice(0, 300)}`);
    }
  }

  return lines.join("\n");
}

const server = new McpServer({
  name: "jira-bugs",
  version: "1.0.0",
});

server.registerTool(
  "jira_get_bugs",
  {
    description: "查询 Jira 当前版本待处理的个人 Bug 列表",
    inputSchema: {
      version: z.string().optional().default("7.0.8").describe("fixVersion，如 7.0.8"),
      maxResults: z.number().optional().default(100).describe("最大返回条数"),
    },
  },
  async ({ version, maxResults }) => {
    const { issues, total } = await searchIssues(version, maxResults);
    const text = formatIssues(issues, total, version);
    return { content: [{ type: "text", text }] };
  }
);

server.registerTool(
  "jira_get_issue",
  {
    description: "按编号查询 Jira 单条 Bug 的详细信息",
    inputSchema: {
      issueKey: z.string().describe("Issue 编号，如 BI-12345"),
    },
  },
  async ({ issueKey }) => {
    const data = await getIssue(issueKey);
    const text = formatIssueDetail(data);
    return { content: [{ type: "text", text }] };
  }
);

server.registerTool(
  "jira_add_comment",
  {
    description: "给 Jira Issue 添加评论",
    inputSchema: {
      issueKey: z.string().describe("Issue 编号，如 BI-12345"),
      comment: z.string().describe("评论内容"),
    },
  },
  async ({ issueKey, comment }) => {
    const res = await fetch(`${JIRA_URL}/rest/api/2/issue/${issueKey}/comment`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ body: comment }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    return {
      content: [
        {
          type: "text",
          text: `评论已添加到 ${issueKey}（评论 ID: ${data.id}）`,
        },
      ],
    };
  }
);

server.registerTool(
  "jira_log_work",
  {
    description: "给 Jira Issue 添加工作日志（记录工时）",
    inputSchema: {
      issueKey: z.string().describe("Issue 编号，如 BI-12345"),
      timeSpent: z.string().describe("花费时间，如 1h 30m、2h、30m"),
      comment: z.string().optional().describe("日志备注"),
      started: z.string().optional().describe("开始时间，ISO 8601 格式，默认为当前时间"),
    },
  },
  async ({ issueKey, timeSpent, comment, started }) => {
    const body = {
      timeSpent,
      ...(comment ? { comment } : {}),
      started: started ?? new Date().toISOString().replace("Z", "+0000"),
    };

    const res = await fetch(`${JIRA_URL}/rest/api/2/issue/${issueKey}/worklog`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    return {
      content: [
        {
          type: "text",
          text: `工作日志已添加到 ${issueKey}（日志 ID: ${data.id}，记录时间: ${timeSpent}）`,
        },
      ],
    };
  }
);

server.registerTool(
  "jira_get_transitions",
  {
    description: "查询 Jira Issue 可用的状态流转列表",
    inputSchema: {
      issueKey: z.string().describe("Issue 编号，如 BI-12345"),
    },
  },
  async ({ issueKey }) => {
    const res = await fetch(`${JIRA_URL}/rest/api/2/issue/${issueKey}/transitions`, {
      headers: HEADERS,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const transitions = data.transitions ?? [];
    const lines = [`=== ${issueKey} 可用流转 ===`];
    for (const t of transitions) {
      lines.push(`  ID: ${t.id}  →  ${t.name}（目标状态: ${t.to?.name ?? "-"}）`);
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.registerTool(
  "jira_transition",
  {
    description: "流转 Jira Issue 的状态（如转给测试、关闭等）",
    inputSchema: {
      issueKey: z.string().describe("Issue 编号，如 BI-12345"),
      transitionId: z.string().describe("流转 ID，可通过 jira_get_transitions 查询"),
    },
  },
  async ({ issueKey, transitionId }) => {
    const res = await fetch(`${JIRA_URL}/rest/api/2/issue/${issueKey}/transitions`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ transition: { id: transitionId } }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira API error ${res.status}: ${text}`);
    }

    return {
      content: [{ type: "text", text: `${issueKey} 状态已流转（transitionId: ${transitionId}）` }],
    };
  }
);

server.registerTool(
  "jira_transition_to_test",
  {
    description: "将 Jira Issue 转测试组员，支持设置改动原因和备注（需重点测试功能点）",
    inputSchema: {
      issueKey: z.string().describe("Issue 编号，如 BI-12345"),
      changeReason: z
        .enum(["非改动导致", "改动导致", "未知改动"])
        .optional()
        .default("非改动导致")
        .describe("改动原因，默认：非改动导致"),
      note: z.string().optional().default("rt").describe("备注（需重点测试功能点），默认：rt"),
    },
  },
  async ({ issueKey, changeReason, note }) => {
    const reasonIdMap = {
      非改动导致: "15416",
      改动导致: "15415",
      未知改动: "15417",
    };
    const reasonId = reasonIdMap[changeReason ?? "非改动导致"];
    const comment = note ?? "rt";

    const body = {
      transition: { id: "381" },
      fields: {
        customfield_13836: { id: reasonId },
        customfield_10700: comment,
      },
      update: {
        comment: [{ add: { body: comment } }],
      },
    };

    const res = await fetch(`${JIRA_URL}/rest/api/2/issue/${issueKey}/transitions`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira API error ${res.status}: ${text}`);
    }

    return {
      content: [{ type: "text", text: `${issueKey} 已转测试组员（改动原因: ${changeReason}，备注: ${comment}）` }],
    };
  }
);

server.registerTool(
  "jira_create_issue",
  {
    description: "快速创建一个 Jira 任务（默认项目：KERNEL，类型：代码任务，经办人：自己）",
    inputSchema: {
      summary: z.string().describe("任务标题"),
      project: z.string().optional().default("KERNEL").describe("项目 key，默认：KERNEL"),
      issuetype: z
        .enum(["代码任务", "快速任务", "开发测试任务", "一般BUG", "客户BUG"])
        .optional()
        .default("代码任务")
        .describe("任务类型，默认：代码任务"),
      description: z.string().optional().describe("任务描述"),
      fixVersion: z.string().optional().describe("修复版本，如 7.0.8"),
      components: z
        .array(z.string())
        .optional()
        .describe("模块名称列表，如 [\"移动端\"]"),
      priority: z
        .enum(["Highest", "High", "Medium", "Low", "Lowest"])
        .optional()
        .describe("优先级，不填则不设置"),
      assignee: z.string().optional().default("Aeolus.Zhang").describe("经办人，默认：Aeolus.Zhang"),
    },
  },
  async ({ summary, project, issuetype, description, fixVersion, components, priority, assignee }) => {
    const issueTypeName = issuetype ?? "代码任务";
    const fields = {
      project: { key: project ?? "KERNEL" },
      summary,
      issuetype: { name: issueTypeName },
      ...(priority ? { priority: { name: priority } } : {}),
      // 快速任务的 screen 不支持设置 assignee 字段
      ...(issueTypeName !== "快速任务" ? { assignee: { name: assignee ?? USERNAME } } : {}),
      ...(description ? { description } : {}),
      ...(fixVersion ? { fixVersions: [{ name: fixVersion }] } : {}),
      ...(components?.length ? { components: components.map((c) => ({ name: c })) } : {}),
    };

    const res = await fetch(`${JIRA_URL}/rest/api/2/issue`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ fields }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    return {
      content: [
        {
          type: "text",
          text: `任务已创建：${data.key} — ${summary}\n链接：${JIRA_URL}/browse/${data.key}`,
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

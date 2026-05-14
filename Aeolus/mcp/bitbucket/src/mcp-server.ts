#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosError } from "axios";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const { BITBUCKET_BASE_URL, BITBUCKET_TOKEN, BITBUCKET_USERNAME } = process.env;

if (!BITBUCKET_BASE_URL || !BITBUCKET_TOKEN) {
  process.stderr.write("Missing required env vars: BITBUCKET_BASE_URL, BITBUCKET_TOKEN\n");
  process.exit(1);
}

const api = axios.create({
  baseURL: `${BITBUCKET_BASE_URL.replace(/\/$/, "")}/rest/api/1.0`,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${BITBUCKET_TOKEN}`,
  },
});

const defaultReviewersApi = axios.create({
  baseURL: `${BITBUCKET_BASE_URL.replace(/\/$/, "")}/rest/default-reviewers/1.0`,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${BITBUCKET_TOKEN}`,
  },
});

function formatError(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data;
    if (data?.errors?.length) {
      return data.errors.map((e: { message: string }) => e.message).join("; ");
    }
    return `HTTP ${err.response?.status}: ${err.message}`;
  }
  return String(err);
}

// ── Tool handlers ──────────────────────────────────────────────────────────────

async function listPRs(args: {
  project: string;
  repo: string;
  state?: string;
  limit?: number;
  start?: number;
}) {
  const { project, repo, state = "OPEN", limit = 25, start = 0 } = args;
  const res = await api.get(`/projects/${project}/repos/${repo}/pull-requests`, {
    params: { state, limit, start },
  });
  const { values, isLastPage, nextPageStart } = res.data;
  return {
    pullRequests: values.map((pr: PullRequest) => ({
      id: pr.id,
      title: pr.title,
      state: pr.state,
      author: pr.author?.user?.displayName ?? pr.author?.user?.name,
      fromBranch: pr.fromRef?.displayId,
      toBranch: pr.toRef?.displayId,
      createdDate: new Date(pr.createdDate).toISOString(),
      updatedDate: new Date(pr.updatedDate).toISOString(),
      link: pr.links?.self?.[0]?.href,
    })),
    isLastPage,
    nextPageStart,
  };
}

async function getPR(args: { project: string; repo: string; prId: number }) {
  const { project, repo, prId } = args;
  const res = await api.get(`/projects/${project}/repos/${repo}/pull-requests/${prId}`);
  const pr: PullRequest = res.data;
  const reviewers = (pr.reviewers ?? []).map((r) => ({
    name: r.user?.displayName ?? r.user?.name,
    slug: r.user?.slug,
    approved: r.approved,
    status: r.status,
  }));
  return {
    id: pr.id,
    title: pr.title,
    description: pr.description,
    state: pr.state,
    author: pr.author?.user?.displayName ?? pr.author?.user?.name,
    fromBranch: pr.fromRef?.displayId,
    toBranch: pr.toRef?.displayId,
    reviewers,
    createdDate: new Date(pr.createdDate).toISOString(),
    updatedDate: new Date(pr.updatedDate).toISOString(),
    link: pr.links?.self?.[0]?.href,
  };
}

async function listPRComments(args: { project: string; repo: string; prId: number; limit?: number }) {
  const { project, repo, prId, limit = 50 } = args;
  const res = await api.get(
    `/projects/${project}/repos/${repo}/pull-requests/${prId}/activities`,
    { params: { limit } }
  );
  const comments = (res.data.values as Activity[])
    .filter((a) => a.action === "COMMENTED")
    .map((a) => ({
      id: a.comment?.id,
      author: a.comment?.author?.displayName ?? a.comment?.author?.name,
      text: a.comment?.text,
      createdDate: a.comment?.createdDate ? new Date(a.comment.createdDate).toISOString() : undefined,
    }));
  return { comments };
}

async function addComment(args: {
  project: string;
  repo: string;
  prId: number;
  text: string;
  parentCommentId?: number;
}) {
  const { project, repo, prId, text, parentCommentId } = args;
  const body: Record<string, unknown> = { text };
  if (parentCommentId) {
    body.parent = { id: parentCommentId };
  }
  const res = await api.post(
    `/projects/${project}/repos/${repo}/pull-requests/${prId}/comments`,
    body
  );
  return {
    id: res.data.id,
    text: res.data.text,
    author: res.data.author?.displayName ?? res.data.author?.name,
    createdDate: new Date(res.data.createdDate).toISOString(),
  };
}

async function createPR(args: {
  project: string;
  repo: string;
  title: string;
  fromBranch: string;
  toBranch: string;
  description?: string;
  reviewers?: string[];
}) {
  const { project, repo, title, fromBranch, toBranch, description, reviewers = [] } = args;

  // 获取 repo ID（default-reviewers 接口需要）
  const repoRes = await api.get(`/projects/${project}/repos/${repo}`);
  const repoId: number = repoRes.data.id;

  // 查询平台配置的默认 reviewer
  let defaultReviewerNames: string[] = [];
  try {
    const drRes = await defaultReviewersApi.get(`/projects/${project}/repos/${repo}/reviewers`, {
      params: {
        sourceRefId: `refs/heads/${fromBranch}`,
        targetRefId: `refs/heads/${toBranch}`,
        sourceRepoId: repoId,
        targetRepoId: repoId,
      },
    });
    defaultReviewerNames = (drRes.data as Array<{ name: string }>).map((u) => u.name);
  } catch {
    // 无默认 reviewer 配置时忽略
  }

  // 合并去重
  const allReviewerNames = [...new Set([...defaultReviewerNames, ...reviewers])];

  const body = {
    title,
    description,
    fromRef: {
      id: `refs/heads/${fromBranch}`,
      repository: { slug: repo, project: { key: project } },
    },
    toRef: {
      id: `refs/heads/${toBranch}`,
      repository: { slug: repo, project: { key: project } },
    },
    reviewers: allReviewerNames.map((name) => ({ user: { name } })),
  };
  const res = await api.post(`/projects/${project}/repos/${repo}/pull-requests`, body);
  const pr: PullRequest = res.data;
  return {
    id: pr.id,
    title: pr.title,
    description: pr.description,
    state: pr.state,
    fromBranch: pr.fromRef?.displayId,
    toBranch: pr.toRef?.displayId,
    reviewers: allReviewerNames,
    link: pr.links?.self?.[0]?.href,
  };
}

async function addInlineComment(args: {
  project: string;
  repo: string;
  prId: number;
  text: string;
  path: string;
  line: number;
  lineType?: "ADDED" | "REMOVED" | "CONTEXT";
  fileType?: "TO" | "FROM";
  parentCommentId?: number;
}) {
  const { project, repo, prId, text, path: filePath, line, lineType = "ADDED", fileType = "TO", parentCommentId } = args;
  const body: Record<string, unknown> = {
    text,
    anchor: {
      line,
      lineType,
      fileType,
      path: filePath,
      srcPath: filePath,
    },
  };
  if (parentCommentId) {
    body.parent = { id: parentCommentId };
  }
  const res = await api.post(
    `/projects/${project}/repos/${repo}/pull-requests/${prId}/comments`,
    body
  );
  return {
    id: res.data.id,
    text: res.data.text,
    author: res.data.author?.displayName ?? res.data.author?.name,
    createdDate: new Date(res.data.createdDate).toISOString(),
    anchor: res.data.anchor,
  };
}

async function getPRDiff(args: { project: string; repo: string; prId: number; path?: string }) {
  const { project, repo, prId, path: filePath } = args;
  const url = filePath
    ? `/projects/${project}/repos/${repo}/pull-requests/${prId}/diff/${filePath}`
    : `/projects/${project}/repos/${repo}/pull-requests/${prId}/diff`;
  const res = await api.get(url);
  const diffs = (res.data.diffs ?? []) as Array<{
    source?: { toString?: string };
    destination?: { toString?: string };
    hunks?: Array<{
      sourceLine: number;
      destinationLine: number;
      segments: Array<{
        type: string;
        lines: Array<{ source: number; destination: number; line: string; truncated?: boolean }>;
      }>;
    }>;
  }>;
  return {
    diffs: diffs.map((d) => ({
      sourcePath: d.source?.toString,
      destinationPath: d.destination?.toString,
      hunks: (d.hunks ?? []).map((h) => ({
        sourceLine: h.sourceLine,
        destinationLine: h.destinationLine,
        segments: h.segments.map((s) => ({
          type: s.type,
          lines: s.lines.map((l) => ({
            source: l.source,
            destination: l.destination,
            line: l.line,
          })),
        })),
      })),
    })),
  };
}

async function approvePR(args: { project: string; repo: string; prId: number }) {
  const { project, repo, prId } = args;
  const res = await api.post(
    `/projects/${project}/repos/${repo}/pull-requests/${prId}/approve`
  );
  return {
    status: res.data.status,
    approved: res.data.approved,
    user: res.data.user?.displayName ?? res.data.user?.name,
  };
}

async function unapprovePR(args: { project: string; repo: string; prId: number }) {
  const { project, repo, prId } = args;
  await api.delete(
    `/projects/${project}/repos/${repo}/pull-requests/${prId}/approve`
  );
  return { success: true, message: "Approval removed." };
}

async function needsWorkPR(args: { project: string; repo: string; prId: number }) {
  const { project, repo, prId } = args;
  const username = BITBUCKET_USERNAME;
  if (!username) {
    throw new Error("BITBUCKET_USERNAME env var is required for needs-work operation");
  }
  const res = await api.put(
    `/projects/${project}/repos/${repo}/pull-requests/${prId}/participants/${username}`,
    { status: "NEEDS_WORK" }
  );
  return {
    status: res.data.status,
    approved: res.data.approved,
    user: res.data.user?.displayName ?? res.data.user?.name,
  };
}

// ── Types ──────────────────────────────────────────────────────────────────────

type PullRequest = {
  id: number;
  title: string;
  description?: string;
  state: string;
  author?: { user?: { name?: string; displayName?: string; slug?: string } };
  fromRef?: { displayId?: string };
  toRef?: { displayId?: string };
  reviewers?: Array<{
    user?: { name?: string; displayName?: string; slug?: string };
    approved?: boolean;
    status?: string;
  }>;
  createdDate: number;
  updatedDate: number;
  links?: { self?: Array<{ href?: string }> };
};

type Activity = {
  action: string;
  comment?: {
    id?: number;
    text?: string;
    createdDate?: number;
    author?: { name?: string; displayName?: string };
  };
};

// ── MCP Server ─────────────────────────────────────────────────────────────────

const tools = [
  {
    name: "bitbucket_list_prs",
    description: "列出指定仓库的 Pull Request 列表",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Bitbucket 项目 key（大写，如 MYPROJ）" },
        repo: { type: "string", description: "仓库 slug（如 my-repo）" },
        state: {
          type: "string",
          enum: ["OPEN", "MERGED", "DECLINED", "ALL"],
          description: "PR 状态，默认 OPEN",
        },
        limit: { type: "number", description: "返回条数，默认 25" },
        start: { type: "number", description: "分页起始，默认 0" },
      },
      required: ["project", "repo"],
    },
  },
  {
    name: "bitbucket_get_pr",
    description: "获取指定 PR 的详细信息（包括描述、reviewers、分支等）",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Bitbucket 项目 key" },
        repo: { type: "string", description: "仓库 slug" },
        prId: { type: "number", description: "PR ID" },
      },
      required: ["project", "repo", "prId"],
    },
  },
  {
    name: "bitbucket_list_pr_comments",
    description: "获取指定 PR 的评论列表",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Bitbucket 项目 key" },
        repo: { type: "string", description: "仓库 slug" },
        prId: { type: "number", description: "PR ID" },
        limit: { type: "number", description: "返回条数，默认 50" },
      },
      required: ["project", "repo", "prId"],
    },
  },
  {
    name: "bitbucket_add_comment",
    description: "在 PR 上添加评论（支持回复某条评论）",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Bitbucket 项目 key" },
        repo: { type: "string", description: "仓库 slug" },
        prId: { type: "number", description: "PR ID" },
        text: { type: "string", description: "评论内容" },
        parentCommentId: { type: "number", description: "回复的父评论 ID（可选）" },
      },
      required: ["project", "repo", "prId", "text"],
    },
  },
  {
    name: "bitbucket_create_pr",
    description: "在指定仓库创建一个新的 Pull Request",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Bitbucket 项目 key（大写，如 MYPROJ）" },
        repo: { type: "string", description: "仓库 slug" },
        title: { type: "string", description: "PR 标题" },
        fromBranch: { type: "string", description: "源分支名（如 feature/my-feature）" },
        toBranch: { type: "string", description: "目标分支名（如 main）" },
        description: { type: "string", description: "PR 描述（可选）" },
        reviewers: {
          type: "array",
          items: { type: "string" },
          description: "Reviewer 的用户名列表（可选，如 [\"zhangsan\", \"lisi\"]）",
        },
      },
      required: ["project", "repo", "title", "fromBranch", "toBranch"],
    },
  },
  {
    name: "bitbucket_add_inline_comment",
    description: "在 PR 的指定文件行上添加行内批注（inline comment）",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Bitbucket 项目 key" },
        repo: { type: "string", description: "仓库 slug" },
        prId: { type: "number", description: "PR ID" },
        text: { type: "string", description: "批注内容" },
        path: { type: "string", description: "文件路径，如 src/components/Foo.tsx" },
        line: { type: "number", description: "行号" },
        lineType: {
          type: "string",
          enum: ["ADDED", "REMOVED", "CONTEXT"],
          description: "行类型：ADDED（新增行）、REMOVED（删除行）、CONTEXT（上下文行），默认 ADDED",
        },
        fileType: {
          type: "string",
          enum: ["TO", "FROM"],
          description: "文件版本：TO（新版本）、FROM（旧版本），默认 TO",
        },
        parentCommentId: { type: "number", description: "回复的父评论 ID（可选）" },
      },
      required: ["project", "repo", "prId", "text", "path", "line"],
    },
  },
  {
    name: "bitbucket_get_pr_diff",
    description: "获取 PR 的 diff 信息，查看变更文件和行号，用于确定行内批注的位置",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Bitbucket 项目 key" },
        repo: { type: "string", description: "仓库 slug" },
        prId: { type: "number", description: "PR ID" },
        path: { type: "string", description: "只获取指定文件的 diff（可选）" },
      },
      required: ["project", "repo", "prId"],
    },
  },
  {
    name: "bitbucket_approve_pr",
    description: "批准（Approve）一个 PR",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Bitbucket 项目 key" },
        repo: { type: "string", description: "仓库 slug" },
        prId: { type: "number", description: "PR ID" },
      },
      required: ["project", "repo", "prId"],
    },
  },
  {
    name: "bitbucket_unapprove_pr",
    description: "撤销对 PR 的批准",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Bitbucket 项目 key" },
        repo: { type: "string", description: "仓库 slug" },
        prId: { type: "number", description: "PR ID" },
      },
      required: ["project", "repo", "prId"],
    },
  },
  {
    name: "bitbucket_needs_work_pr",
    description: "将 PR 标记为 Needs Work（需要修改），需要 .env 中配置 BITBUCKET_USERNAME",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Bitbucket 项目 key" },
        repo: { type: "string", description: "仓库 slug" },
        prId: { type: "number", description: "PR ID" },
      },
      required: ["project", "repo", "prId"],
    },
  },
];

function createServer_(): Server {
  const server = new Server(
    { name: "bitbucket-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    try {
      let result: unknown;
      if (name === "bitbucket_list_prs") {
        result = await listPRs(args as Parameters<typeof listPRs>[0]);
      } else if (name === "bitbucket_get_pr") {
        result = await getPR(args as Parameters<typeof getPR>[0]);
      } else if (name === "bitbucket_list_pr_comments") {
        result = await listPRComments(args as Parameters<typeof listPRComments>[0]);
      } else if (name === "bitbucket_add_comment") {
        result = await addComment(args as Parameters<typeof addComment>[0]);
      } else if (name === "bitbucket_approve_pr") {
        result = await approvePR(args as Parameters<typeof approvePR>[0]);
      } else if (name === "bitbucket_unapprove_pr") {
        result = await unapprovePR(args as Parameters<typeof unapprovePR>[0]);
      } else if (name === "bitbucket_needs_work_pr") {
        result = await needsWorkPR(args as Parameters<typeof needsWorkPR>[0]);
      } else if (name === "bitbucket_create_pr") {
        result = await createPR(args as Parameters<typeof createPR>[0]);
      } else if (name === "bitbucket_add_inline_comment") {
        result = await addInlineComment(args as Parameters<typeof addInlineComment>[0]);
      } else if (name === "bitbucket_get_pr_diff") {
        result = await getPRDiff(args as Parameters<typeof getPRDiff>[0]);
      } else {
        throw new Error(`Unknown tool: ${name}`);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${formatError(err)}` }],
        isError: true,
      };
    }
  });

  return server;
}

// ── Transport ──────────────────────────────────────────────────────────────────

const useHttp = process.argv.includes("--http");
const portArg = process.argv.find((a) => a.startsWith("--port="));
const httpPort = portArg ? parseInt(portArg.split("=")[1], 10) : 3001;

if (useHttp) {
  const app = express();
  app.use(express.json());

  const sessions = new Map<string, StreamableHTTPServerTransport>();

  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && sessions.has(sessionId)) {
      transport = sessions.get(sessionId)!;
    } else {
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
      const srv = createServer_();
      await srv.connect(transport);
      if (transport.sessionId) sessions.set(transport.sessionId, transport);
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };
    }
    await transport.handleRequest(req, res, req.body);
  });

  const handler = async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({ error: "Invalid session" });
      return;
    }
    await sessions.get(sessionId)!.handleRequest(req, res);
  };
  app.get("/mcp", handler);
  app.delete("/mcp", handler);

  app.listen(httpPort, () => {
    process.stderr.write(`Bitbucket MCP HTTP server listening on port ${httpPort}\n`);
  });
} else {
  const server = createServer_();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("Bitbucket MCP server running (stdio)\n");
}

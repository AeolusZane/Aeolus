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

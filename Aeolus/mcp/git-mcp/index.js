#!/usr/bin/env node
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dotenv = await import("dotenv");
dotenv.config({ path: path.join(__dirname, ".env") });

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Octokit } from "@octokit/rest";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  console.error("Error: GITHUB_TOKEN environment variable is required");
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

const server = new Server(
  { name: "git-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_repo",
      description: "在 GitHub 上创建一个新仓库",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "仓库名称" },
          description: { type: "string", description: "仓库描述（可选）" },
          private: {
            type: "boolean",
            description: "是否私有仓库，默认 false（公开）",
            default: false,
          },
          auto_init: {
            type: "boolean",
            description: "是否自动初始化（添加 README），默认 true",
            default: true,
          },
          gitignore_template: {
            type: "string",
            description: "gitignore 模板（如 Node、Python），可选",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "list_repos",
      description: "列出当前 GitHub 用户的仓库",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["all", "public", "private"],
            description: "仓库类型，默认 all",
            default: "all",
          },
          per_page: {
            type: "number",
            description: "每页数量，默认 20，最大 100",
            default: 20,
          },
        },
      },
    },
    {
      name: "delete_repo",
      description: "删除 GitHub 仓库（不可逆，谨慎使用）",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "仓库所有者（用户名或组织名）" },
          repo: { type: "string", description: "仓库名称" },
        },
        required: ["owner", "repo"],
      },
    },
    {
      name: "get_repo",
      description: "获取 GitHub 仓库详情",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "仓库所有者" },
          repo: { type: "string", description: "仓库名称" },
        },
        required: ["owner", "repo"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "create_repo") {
      const { data } = await octokit.repos.createForAuthenticatedUser({
        name: args.name,
        description: args.description,
        private: args.private ?? false,
        auto_init: args.auto_init ?? true,
        gitignore_template: args.gitignore_template,
      });

      return {
        content: [
          {
            type: "text",
            text: `仓库创建成功！\n名称：${data.full_name}\n地址：${data.html_url}\n克隆地址：${data.clone_url}\n可见性：${data.private ? "私有" : "公开"}`,
          },
        ],
      };
    }

    if (name === "list_repos") {
      const { data } = await octokit.repos.listForAuthenticatedUser({
        type: args.type ?? "all",
        per_page: args.per_page ?? 20,
        sort: "updated",
      });

      const list = data
        .map(
          (r) =>
            `- ${r.full_name}（${r.private ? "私有" : "公开"}）${r.description ? " — " + r.description : ""}`
        )
        .join("\n");

      return {
        content: [{ type: "text", text: `共 ${data.length} 个仓库：\n${list}` }],
      };
    }

    if (name === "delete_repo") {
      await octokit.repos.delete({ owner: args.owner, repo: args.repo });
      return {
        content: [
          { type: "text", text: `仓库 ${args.owner}/${args.repo} 已删除。` },
        ],
      };
    }

    if (name === "get_repo") {
      const { data } = await octokit.repos.get({
        owner: args.owner,
        repo: args.repo,
      });

      return {
        content: [
          {
            type: "text",
            text: [
              `名称：${data.full_name}`,
              `描述：${data.description ?? "无"}`,
              `可见性：${data.private ? "私有" : "公开"}`,
              `Star：${data.stargazers_count}  Fork：${data.forks_count}`,
              `默认分支：${data.default_branch}`,
              `地址：${data.html_url}`,
              `克隆：${data.clone_url}`,
            ].join("\n"),
          },
        ],
      };
    }

    return {
      content: [{ type: "text", text: `未知工具：${name}` }],
      isError: true,
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `错误：${err.message ?? String(err)}`,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

# Confluence (KMS) MCP Server

一个 Confluence MCP（Model Context Protocol）服务器：让 AI 在 **Cursor** 里通过自然语言创建、更新、删除、搜索 Confluence（公司内部也称 **KMS**）页面。

## ✨ 特性

- **页面管理**：创建、更新、删除、获取页面（支持 title / pageId）
- **搜索能力**：按关键词搜索、获取子页面、查看页面历史
- **Space 管理**：列出当前账号可访问的 Spaces
- **宏辅助**：生成 Confluence Code Macro（storage format），安全插入代码块（规避 `InvalidValueException`）

## ⚠️ 注意事项（必读）

- **必须使用 Cursor 的 Agent 模式**，才能调用 `confluence_*` 这组 MCP 工具
- **Cursor `mcp.json` 里的路径必须是绝对路径**

## 📦 项目结构（以仓库现状为准）

```
confluence-node/
├── src/
│   └── mcp-server.ts              # MCP Server 源码（TypeScript）
├── dist/
│   ├── mcp-server.js              # 编译产物（Cursor 实际运行的入口）
│   └── mcp-server.js.map
├── dev/
│   ├── index.js                   # 开发/演示脚本（非 MCP）
│   └── test-connection.js         # 连通性测试脚本
├── templates/                     # 模板文件（如有）
├── env-example.txt                # 环境变量示例
├── mcp-config-example.json        # Cursor MCP 配置示例
├── package.json
├── tsconfig.json
└── README.md
```

## 🚀 快速开始

### 1) 安装依赖

```bash
npm install
```

### 2) 配置环境变量

复制 `env-example.txt` 为 `.env`，并填入你的配置：

```env
CONF_BASE_URL=https://your-confluence-instance.atlassian.net
CONF_TOKEN=your-personal-access-token
CONF_SPACE=YOUR_SPACE_KEY
```

> 说明：本项目通过 Confluence REST API + Bearer Token（PAT）访问，`CONF_TOKEN` 为 Personal Access Token。

### 3) 构建（生成 `dist/`）

```bash
npm run build
```

### 4) 配置 Cursor MCP

编辑 `~/.cursor/mcp.json`（可参考 `mcp-config-example.json`），将 `args` 指向 **本仓库的 `dist/mcp-server.js` 绝对路径**：

```json
{
  "mcpServers": {
    "confluence": {
      "command": "node",
      "args": ["/绝对路径/到/confluence-node/dist/mcp-server.js"],
      "env": {
        "CONF_BASE_URL": "你的 Confluence/KMS 地址（不要以 / 结尾）",
        "CONF_TOKEN": "你的 Personal Access Token",
        "CONF_SPACE": "默认 Space Key（可选）"
      }
    }
  }
}
```

### 5) 重启 Cursor 并在 Agent 模式使用

- 完全退出并重启 Cursor
- 切换到 **Agent 模式**后再使用（否则 MCP 工具可能不可用）

### 6) 验证（在 Cursor 里直接问）

```
列出我可以访问的所有 KMS Spaces
```

## 🛠️ 可用工具

| 类别 | 工具 | 说明 |
|------|------|------|
| **Space** | `confluence_list_spaces` | 列出可访问的 Spaces |
| **页面操作** | `confluence_create_page` | 创建页面 |
|  | `confluence_update_page` | 更新页面（支持 `pageId` 或 `space+title`） |
|  | `confluence_upsert_page` | 创建或更新（存在则更新，否则创建） |
|  | `confluence_get_page` | 获取页面详情（含 storage HTML） |
|  | `confluence_delete_page` | 删除页面 |
| **搜索** | `confluence_search_pages` | 搜索页面 |
|  | `confluence_get_child_pages` | 获取子页面 |
|  | `confluence_get_page_history` | 查看页面历史 |
| **附件** | `confluence_upload_attachment` | 上传附件到指定页面（filePath 或 base64） |
| **宏** | `confluence_build_code_macro` | 生成 Code Macro（storage format HTML） |

## 🔧 开发与调试

### 运行 MCP Server（本地）

```bash
npm run mcp
```

### 测试连通性（推荐先跑）

```bash
npm test
```

### 使用 MCP Inspector 调试

```bash
npx @modelcontextprotocol/inspector node dist/mcp-server.js
```

### Cursor MCP 日志位置

- macOS：`~/Library/Logs/Cursor/`
- Windows：`%APPDATA%\\Cursor\\logs\\`

## 🐛 故障排查

### Cursor 里看不到 `confluence_*` 工具

1. 确认在 **Agent 模式**下使用
2. 检查 `~/.cursor/mcp.json` 的 `args` 是否为 **绝对路径**，并指向 `dist/mcp-server.js`
3. 运行 `npm run mcp` 看是否能正常启动（无语法/依赖错误）
4. 完全重启 Cursor，并查看日志

### 认证失败（401/403）

- 检查 `CONF_TOKEN` 是否正确
- 确认账号对目标 Space 有权限，可用 `confluence_list_spaces` 验证

### Space Key 不确定

先执行：

```
列出我可以访问的所有 Confluence Spaces
```

## 📚 相关文档

- **KMS 别名说明**：`./KMS_ALIAS_README.md`
- **Confluence REST API**：`https://developer.atlassian.com/cloud/confluence/rest/v1/intro/`
- **MCP 协议**：`https://modelcontextprotocol.io`

## 📄 许可证

MIT

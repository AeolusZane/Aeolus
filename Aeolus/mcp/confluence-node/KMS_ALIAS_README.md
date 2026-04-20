# KMS = Confluence

## 别名说明

在本 MCP Server 中，**KMS (Knowledge Management System)** 是公司内部对 **Confluence** 的别名。两者指的是同一个系统。

## AI 理解能力

MCP Server 已经配置为让 AI 能够理解以下表达方式：

### ✅ 这些说法 AI 都能理解

- "在 KMS 中创建一个页面"
- "在 Confluence 创建一个页面"
- "帮我在知识库创建文档"
- "在 KMS 搜索技术文档"
- "更新 Confluence 的页面"
- "查看 KMS Space 列表"

### 工作原理

每个工具的描述中都明确说明了 KMS 是 Confluence 的别名，例如：

```
"在指定的 Space 中创建新的 Confluence (KMS) 页面。KMS 是公司内部 Confluence 系统的别名。"
```

这样，当你使用任何包含 "KMS" 的表达时，AI 都能正确理解并调用相应的 Confluence 工具。

## 使用示例

### 示例 1：使用 KMS 创建页面

**你的提问：**
```
在 KMS 创建一个技术设计文档，标题是"微服务架构设计"
```

**AI 理解为：**
```
在 Confluence 创建一个技术设计文档，标题是"微服务架构设计"
```

### 示例 2：在 KMS 中搜索

**你的提问：**
```
在 KMS 搜索所有关于 API 的文档
```

**AI 理解为：**
```
在 Confluence 搜索所有关于 API 的文档
```

### 示例 3：更新 KMS 页面

**你的提问：**
```
更新 KMS 上的"数据库设计文档"，添加新的表结构
```

**AI 理解为：**
```
更新 Confluence 上的"数据库设计文档"，添加新的表结构
```

### 示例 4：查看 KMS Spaces

**你的提问：**
```
列出我能访问的所有 KMS Spaces
```

**AI 理解为：**
```
列出我能访问的所有 Confluence Spaces
```

## 技术实现

在 `mcp-server.js` 中，所有工具描述都包含了以下信息：

1. **Server 名称**: `confluence-kms-mcp-server`
2. **工具描述**: 每个工具都明确说明 "Confluence (KMS)"
3. **别名解释**: "KMS 是公司内部 Confluence 系统的别名"

## 其他可能的说法

AI 也能理解这些相关表达：

- "知识库" → Confluence/KMS
- "文档系统" → Confluence/KMS
- "Wiki" → Confluence/KMS
- "协作平台" → Confluence/KMS

## 注意事项

- 工具名称保持为 `confluence_*`，因为这是标准的 API 命名
- 只在描述中强调 KMS 别名，确保 AI 能理解
- 用户可以混用 "KMS" 和 "Confluence"，AI 都能正确理解

## 验证

重启 Cursor 后，你可以尝试：

```
帮我在 KMS 创建一个测试页面
```

AI 应该能够：
1. 理解 KMS = Confluence
2. 调用 `confluence_create_page` 工具
3. 成功创建页面

---

**最后更新**: 2024-12-20

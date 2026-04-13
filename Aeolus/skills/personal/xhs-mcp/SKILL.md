---
name: xhs-mcp
description: 启动或管理小红书 MCP 服务。当用户说"启动小红书 MCP"、"开启小红书"、"小红书 MCP 起一下"、"xhs mcp"等时使用。
---

# 启动小红书 MCP 服务

## 脚本目录

```
$XHS_MCP_DIR/scripts/
```

## 执行流程

### 第 1 步：检查依赖

```bash
$XHS_MCP_DIR/scripts/install-check.sh
```

如果依赖缺失（`xiaohongshu-mcp` 或 `xiaohongshu-login` 未找到），**停止执行**，告知用户需要先从 GitHub Releases 下载二进制文件：
- 下载地址：`https://github.com/xpzouying/xiaohongshu-mcp/releases`
- 安装到 `~/.local/bin/xiaohongshu-mcp` 和 `~/.local/bin/xiaohongshu-login`
- 执行 `chmod +x ~/.local/bin/xiaohongshu-*`

### 第 2 步：检查是否已在运行

```bash
PID_FILE="$HOME/.xiaohongshu/mcp.pid"
if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
    echo "已在运行"
fi
```

如果已在运行，直接告知用户服务正在运行，端点为 `http://localhost:18060/mcp`，无需重复启动。

### 第 3 步：启动服务

```bash
$XHS_MCP_DIR/scripts/start-mcp.sh
```

启动后验证输出中包含 `✓ MCP 服务已启动`，并告知用户：
- 服务端点：`http://localhost:18060/mcp`
- 日志路径：`~/.xiaohongshu/mcp.log`

### 第 4 步：验证登录状态（可选）

如果用户想确认账号已登录，运行：

```bash
$XHS_MCP_DIR/scripts/status.sh
```

## 错误处理

| 情况 | 处理方式 |
|------|------|
| 二进制不存在 | 提示下载地址，停止执行 |
| cookies 不存在 | 提示运行 `login.sh` 扫码登录，或手动复制 cookies.json 到 `~/cookies.json` |
| 启动失败 | 展示 `~/.xiaohongshu/mcp.log` 最后 20 行日志 |
| 端口被占用 | 提示用户先运行 `stop-mcp.sh` 停止服务 |

## 停止服务

如果用户要停止，运行：

```bash
$XHS_MCP_DIR/scripts/stop-mcp.sh
```

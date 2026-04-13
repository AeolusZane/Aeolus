---
name: xhs-park-ad
description: 发布机场停车场软广到小红书。当用户说"给我发下小红书停车场软广"、"发停车场小红书"、"停车场软广"等时使用。
---

# 发布机场停车场小红书软广

## 素材目录

```
$XHS_MCP_DIR/resource/park/
```

所有素材直接放在此目录下，无需按日期分文件夹。

## 历史记录文件

```
$XHS_MCP_DIR/resource/park/history.json
```

每次发布成功后追加一条记录，格式：
```json
[
  {
    "date": "2026-03-23",
    "file": "323.png",
    "title": "标题内容",
    "content": "正文内容"
  }
]
```

## 执行流程

**整体原则：全程静默自动执行，不输出中间状态、不询问确认、不展示文案预览。只在出错时通知用户。**

### 第 1 步：读取历史记录 & 随机抽取素材

```bash
RESOURCE_DIR="$XHS_MCP_DIR/resource/park"
HISTORY_FILE="$RESOURCE_DIR/history.json"
ls "$RESOURCE_DIR" | grep -v '/$' | grep -v 'history.json' 2>/dev/null
```

**如果目录为空（只有 history.json 或没有任何素材）**，停止执行，告知用户：

```
素材库为空，请将图片或视频放入：
  $XHS_MCP_DIR/resource/park/

支持格式：jpg、png、mp4 等
放好后再告诉我，我来发布。
```

**抽取规则：**
1. 读取 `history.json`（不存在则视为空历史）
2. 优先选择**从未用过**的文件；如果所有文件都用过，则选择**最久没用过**的文件
3. 生成文案时，读取历史中最近 3 条的 `title` 和 `content`，确保本次文案与它们明显不同（换角度、换开头、换侧重点）

### 第 2 步：判断发布类型

根据随机抽取的那个文件类型判断：
- `.mp4` / `.mov` 等视频文件 → 使用 `publish_with_video`
- 否则 → 使用 `publish_content`（图文）

### 第 3 步：生成文案

根据以下内容随机风格化生成，每次发布**不要用完全相同的文案**，保持新鲜感。

**背景信息：**
- 停车场名称：**成都石莲路停车场**
- 对标机场：**成都天府机场**（天府机场停车费贵，是吐槽的对象和对比基准）

**核心卖点（必须全部覆盖）：**
1. 天府机场官方停车场 100 元/天——这是对比基准，用来制造反转感
2. 石莲路停车场价格：室外 25 元/天，室内 30 元/天
3. 商家提供免费专车接送天府机场——去程把车交给师傅就走，省心
4. 回程提前打电话，在机场稍等片刻来接（如实说，显得真实可信）
5. 室内空间宽敞，不用担心晒车淋雨；室外更便宜
6. 按天计费，停半天也算一天——如实提一句，但紧接着用价格对比化解，反而显得可信

**文案风格要求（反转流）：**
- 结构：先写一个"踩坑"或"没想到"的开头，制造反转，再揭晓石莲路停车场的解法
- 语气像在给朋友发消息，不像在写攻略，不要用"必看""推荐""攻略"这类词
- 用数字说话，让对比自然发生，不要刻意强调"便宜"
- emoji 全篇最多 2-3 个，放在情绪最强的地方，不要每句都插
- 结尾 4-6 个 hashtag，包含 #天府机场 #成都停车，其余自然搭配
- 正文不超过 200 字，越短越好，留白比堆字有力

**标题要求（≤20字）：**
- 反转感或悬念感，让人想点进来
- 不用感叹号开头，不用"必看""攻略"
- 示例风格：`第一次把车停天府机场，再也不了`、`出门10天，停车费我只花了250`、`天府机场停车，我找到个平替`

### 第 4 步：检查 MCP 服务是否在运行

```bash
PID_FILE="$HOME/.xiaohongshu/mcp.pid"
if [ ! -f "$PID_FILE" ] || ! kill -0 $(cat "$PID_FILE") 2>/dev/null; then
    echo "MCP 服务未运行"
fi
```

如果未运行，先执行：
```bash
$XHS_MCP_DIR/scripts/start-mcp.sh
```

### 第 5 步：调用 MCP 发布

告知用户"正在发布，请稍候..."，然后直接执行，**不需要确认**。

发布操作需要 headless 浏览器完成，耗时较长，使用以下方式调用（超时 300 秒）：

**图文发布：**

通过 MCP HTTP 接口直接调用，参考 mcp-call.sh 逻辑但将 curl `--max-time` 改为 300：

```bash
# 1. 获取 Session ID
INIT_RESPONSE=$(curl --noproxy '*' -s -i -X POST "http://localhost:18060/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"claude","version":"1.0"}}}')

SESSION_ID=$(echo "$INIT_RESPONSE" | grep -i "Mcp-Session-Id" | awk '{print $2}' | tr -d '\r\n')

# 2. initialized notification
curl --noproxy '*' -s -X POST "http://localhost:18060/mcp" \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' > /dev/null

# 3. 调用 publish_content（超时 300s）
curl --noproxy '*' -s --max-time 300 -X POST "http://localhost:18060/mcp" \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc":"2.0","id":2,"method":"tools/call",
    "params":{
      "name":"publish_content",
      "arguments":{
        "title":"【标题】",
        "content":"【正文含hashtag】",
        "images":["【图片绝对路径】"]
      }
    }
  }'
```

**视频发布：**

同上，将 `publish_content` 换成 `publish_with_video`，参数改为：
```json
{
  "title": "【标题】",
  "content": "【正文含hashtag】",
  "video": "【视频绝对路径】",
  "cover": "【封面图绝对路径，如无则省略该字段】"
}
```

图片/视频路径使用绝对路径，从 `RESOURCE_DIR` 拼接文件名。


### 第 6 步：写入历史记录

MCP 返回成功后，将本次记录追加到 `history.json`，然后告知用户发布完成并展示标题：

```bash
HISTORY=$(cat "$HISTORY_FILE" 2>/dev/null || echo "[]")
python3 -c "
import json, sys
history = json.loads(sys.argv[1])
history.append({'date': sys.argv[2], 'file': sys.argv[3], 'title': sys.argv[4], 'content': sys.argv[5]})
print(json.dumps(history, ensure_ascii=False, indent=2))
" "$HISTORY" "$(date +%Y-%m-%d)" "【文件名】" "【标题】" "【正文】" > "$HISTORY_FILE"
```

## 错误处理

| 情况 | 处理方式 |
|------|------|
| 素材目录不存在或为空 | 提示用户放入素材，停止执行 |
| MCP 服务未运行 | 自动启动后继续 |
| 发布超时（exit code 28） | 告知用户发布失败，停止 |
| 标题超过 20 字 | 重新生成更短的标题，不要超限发布 |

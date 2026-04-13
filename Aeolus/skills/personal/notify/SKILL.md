---
name: notify
description: 定时通知管理：设置、查看、关闭定时提醒。当用户说"定时通知"、"提醒我"、"设置提醒"、"查看提醒"、"关闭提醒"、"取消通知"等时使用。
argument-hint: <设置 <内容> <时间描述> | 查看 | 关闭 <名称>>
allowed-tools: Read, Write, Glob, Bash, CronCreate, CronDelete, CronList
---

# 定时通知管理

参数：**$ARGUMENTS**

**第一步：** 运行 `echo $AEOLUS_DIR` 获取 Aeolus 路径，记为 `<AEOLUS_DIR>`。

通知数据文件：`<AEOLUS_DIR>/skills/personal/notify/data/notifications.md`

---

## 判断模式

分析 `$ARGUMENTS`：

- 包含"查看"、"列表"、"有哪些"、"当前" 或参数为空 → **查看模式**
- 包含"关闭"、"取消"、"停止"、"删除" → **关闭模式**
- 其他（描述通知内容和时间） → **设置模式**

---

## 设置模式

1. 理解用户描述的通知内容和时间规律
2. 将时间描述转换为 5 字段 cron 表达式（用户本地时区）
   - 避免整点 :00 或 :30，错开几分钟
   - 单次提醒：pinned 具体日期时间，recurring: false
   - 重复提醒：recurring: true

3. **向用户确认以下信息，等待用户回复后再执行：**
   ```
   准备创建以下通知，确认吗？

   名称：xxx
   时间：每天 HH:MM / 具体日期 YYYY-MM-DD HH:MM
   Cron：* * * * *
   内容：xxx
   类型：重复 / 单次
   ```

4. 判断是否需要手机推送：
   - 用户说了"手机"、"iPhone"、"推送到手机"、"bark" → **同时推送手机**
   - 否则 → 仅 Mac 系统通知

5. 用户确认后，执行以下操作：
   a. 运行 `crontab -l 2>/dev/null` 读取当前 crontab
   b. 读取 `$AEOLUS_DIR/credentials/bark.env` 获取 BARK_SERVER 和 BARK_KEY
   c. 在末尾追加（写回 crontab）：
      - 仅 Mac：
        ```
        # <名称>
        <cron> osascript -e 'display notification "<通知内容>" with title "<名称>" sound name "Glass"'
        ```
      - Mac + 手机：
        ```
        # <名称>
        <cron> osascript -e 'display notification "<通知内容>" with title "<名称>" sound name "Glass"' && curl -s "$BARK_SERVER/$BARK_KEY/<名称>/<通知内容>" > /dev/null
        ```
   d. 将通知信息追加写入 notifications.md（格式见下，渠道列注明 Mac / Mac+手机）
   e. 回复：已创建，显示 cron 表达式、首次触发时间、推送渠道

## notifications.md 格式

```markdown
# 定时通知列表

| 名称 | Cron | 说明 | 类型 | 渠道 | 创建日期 |
| --- | --- | --- | --- | --- | --- |
| 早餐前吃药 | 58 6 * * * | 雷贝拉唑×2 + 铋剂×4 | 重复 | Mac | 2026-04-08 |
```

---

## 查看模式

1. 读取 notifications.md 展示所有通知
2. 运行 `crontab -l` 确认 crontab 中对应条目存在
3. 展示：名称、时间、内容、类型

---

## 关闭模式

1. 读取 notifications.md，找到匹配的通知（按名称模糊匹配）
2. **向用户确认要删除的通知名称，等待用户回复**
3. 用户确认后：
   a. 运行 `crontab -l` 读取当前 crontab
   b. 删除对应的注释行和命令行，写回 crontab
   c. 从 notifications.md 中删除该行
4. 回复：已关闭通知

---

完成后简洁回复，不要啰嗦。

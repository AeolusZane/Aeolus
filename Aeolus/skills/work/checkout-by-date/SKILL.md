---
name: checkout-by-date
description: 根据提供的日期，在当前分支上找到该日期前的最后一次 commit，以此为基点新建分支，再执行 quickzip 打包移动端 JS。用于给客户定制 JS 包。
---

# 按日期切出分支并打包移动端 JS

## 触发场景

- 用户提供一个日期（年月日），需要找到该日期前的最后一次 commit 并切出分支
- 用户提到"定制包""客户包""按时间切分支""打包移动端"等

## 执行流程

### 第 1 步：收集参数

从用户输入中提取：

| 参数 | 说明 | 示例 |
|------|------|------|
| 目标日期 | 年月日，格式 YYYY-MM-DD | `2024-06-30` |
| 新分支名（可选） | 用户指定的分支名，未指定则自动生成 | `custom/client-xxx` |

如果用户没有提供日期，**必须先询问**，不要自行假设。

### 第 2 步：查找目标 commit

```bash
git log --before="<YYYY-MM-DD> 23:59:59" --format="%H %ai %s" -5
```

展示找到的前 5 条结果，让用户确认使用第一条（最新的那条）。

同时提供仓库 commits 页面链接供用户辅助确认，链接格式：

```
https://code.fineres.com/projects/BUSSINESS/repos/nuclear-webui/commits?until=refs%2Fheads%2F<branch-name-url-encoded>
```

例如当前分支为 `persist/7.0`，链接为：
`https://code.fineres.com/projects/BUSSINESS/repos/nuclear-webui/commits?until=refs%2Fheads%2Fpersist%2F7.0`

将分支名中的 `/` 替换为 `%2F` 即可。

提取目标 commit hash（第一条的完整 hash）：

```bash
TARGET_COMMIT=$(git log --before="<YYYY-MM-DD> 23:59:59" --format="%H" -1)
echo $TARGET_COMMIT
```

### 第 4 步：确认并新建分支

默认分支命名规则：`custom/<YYYY-MM-DD>`，例如 `custom/2024-06-30`。

如果用户指定了分支名则使用用户指定的。

**在执行前，向用户展示以下信息并等待确认：**

```
即将新建分支：
  分支名：custom/<YYYY-MM-DD>
  基于 commit：<hash>
  commit 时间：<commit-date>
  commit 信息：<commit-message>

确认执行？(y/n)
```

用户确认后再执行：

```bash
git checkout -b custom/<YYYY-MM-DD> <TARGET_COMMIT>
```

执行后确认：

```bash
git log --oneline -3
```

告知用户：已在 commit `<hash>` 处新建分支 `custom/<YYYY-MM-DD>`，当前时间节点为 `<commit-date>`。

### 第 5 步：执行 quickzip 打包

分支创建成功后，**直接执行打包命令，无需再次确认**：

```bash
quickzip build
```

打包过程中，显示打包进度，打包完成后，展示输出产物路径。

## 错误处理

| 情况 | 处理方式 |
|------|------|
| 该日期之前没有 commit | 提示用户，展示最早的 commit 日期 |
| 分支名已存在 | 提示用户，建议加后缀或改名，如 `custom/2024-06-30-v2` |
| 当前工作区有未提交改动 | 警告用户，建议先 stash 或提交，询问是否继续 |
| 打包命令执行失败 | 展示完整错误信息，不自动重试 |

## 示例

### 示例 1：完整流程

用户输入：
```
帮我切到 2024-06-30 前的最后一个 commit 打个定制包
```

执行步骤：
1. 确认当前分支，例如 `persist/5.1`
2. 找到 2024-06-30 23:59:59 之前最后一次 commit
3. 新建分支 `custom/2024-06-30`
4. 询问打包命令，执行 quickzip 打包

### 示例 2：用户指定分支名

用户输入：
```
日期 2024-03-15，分支名用 custom/abc-company
```

执行步骤：
1. 找到 2024-03-15 前最后一次 commit
2. 新建分支 `custom/abc-company`
3. 询问打包命令

## 约束

- **不要跳过确认步骤**，切分支前必须让用户看到目标 commit 信息
- **不要强制推送**（不使用 `--force`）
- 如果有未提交改动，必须提醒用户，不能静默处理
- quickzip 命令以用户提供的为准，不要自行猜测脚本路径

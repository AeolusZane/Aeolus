#!/usr/bin/env python3
"""
停车场软广 HTTP 服务
接口:
  POST /publish          - 触发发布（异步，返回 job_id）
  GET  /jobs/{job_id}    - 查询任务状态
  GET  /history          - 查看发布历史
  GET  /health           - 服务健康检查
"""

import asyncio
import json
import os
import random
import subprocess
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

import shutil

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

# ──────────────────────────────────────────────
# 配置
# ──────────────────────────────────────────────
AEOLUS_DIR = os.environ.get("AEOLUS_DIR", str(Path(__file__).resolve().parent.parent.parent))
RESOURCE_DIR = Path(AEOLUS_DIR) / "mcp" / "xiaohongshu" / "resource" / "park"
HISTORY_FILE = RESOURCE_DIR / "history.json"
MCP_URL = "http://127.0.0.1:18060/mcp"
START_MCP_SCRIPT = Path(__file__).parent / "scripts" / "start-mcp.sh"
PID_FILE = Path.home() / ".xiaohongshu" / "mcp.pid"

VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
SKIP_FILES = {"history.json", ".DS_Store"}

# ──────────────────────────────────────────────
# 内存中的任务状态
# ──────────────────────────────────────────────
jobs: dict[str, dict] = {}
tasks: dict[str, asyncio.Task] = {}  # job_id → asyncio Task，用于取消
pinned_file: Optional[str] = None    # 用户指定的素材文件名，None 表示自动选择

app = FastAPI(title="停车场软广服务", version="1.0.0")


@app.on_event("startup")
async def auto_start_mcp():
    if not is_mcp_running():
        print("MCP 服务未运行，正在自动启动...")
        try:
            await asyncio.to_thread(start_mcp)
            print("MCP 服务已启动")
        except Exception as e:
            print(f"MCP 自动启动失败: {e}")


# ──────────────────────────────────────────────
# 工具函数
# ──────────────────────────────────────────────

def read_history() -> list[dict]:
    if not HISTORY_FILE.exists():
        return []
    try:
        return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def write_history(history: list[dict]):
    HISTORY_FILE.write_text(
        json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def list_resources() -> list[Path]:
    if not RESOURCE_DIR.exists():
        return []
    return [f for f in RESOURCE_DIR.iterdir() if f.is_file() and f.name not in SKIP_FILES]


def pick_file(history: list[dict]) -> Optional[Path]:
    """优先选从未用过的文件，否则选最久没用的。"""
    all_files = list_resources()
    if not all_files:
        return None

    used = {item["file"]: item["date"] for item in history}
    unused = [f for f in all_files if f.name not in used]
    if unused:
        return random.choice(unused)

    # 全都用过，选最久没用的
    return min(all_files, key=lambda f: used.get(f.name, "0000-00-00"))


def is_mcp_running() -> bool:
    if not PID_FILE.exists():
        return False
    try:
        pid = int(PID_FILE.read_text().strip())
        os.kill(pid, 0)
        return True
    except (OSError, ValueError):
        return False


def start_mcp():
    subprocess.run(["bash", str(START_MCP_SCRIPT)], check=True, timeout=30)
    time.sleep(2)


NO_PROXY_CLIENT = {"proxy": None}  # 强制绕过系统代理


async def mcp_call(method_name: str, arguments: dict, timeout: int = 300) -> dict:
    """通用 MCP 工具调用（建立 session → initialized → call）。"""
    async with httpx.AsyncClient(timeout=30, proxy=None) as client:
        # 1. initialize
        resp = await client.post(
            MCP_URL,
            json={
                "jsonrpc": "2.0", "id": 1, "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "park-ad-server", "version": "1.0"},
                },
            },
            headers={"Content-Type": "application/json"},
        )
        session_id = resp.headers.get("mcp-session-id") or resp.headers.get("Mcp-Session-Id")
        if not session_id:
            raise RuntimeError("无法获取 MCP Session ID，请确认 MCP 服务正在运行")

        # 2. initialized notification
        await client.post(
            MCP_URL,
            json={"jsonrpc": "2.0", "method": "notifications/initialized"},
            headers={"Content-Type": "application/json", "Mcp-Session-Id": session_id},
        )

    # 3. 实际工具调用（单独 client，超时更长）
    async with httpx.AsyncClient(timeout=timeout, proxy=None) as client:
        resp = await client.post(
            MCP_URL,
            json={
                "jsonrpc": "2.0", "id": 2, "method": "tools/call",
                "params": {"name": method_name, "arguments": arguments},
            },
            headers={"Content-Type": "application/json", "Mcp-Session-Id": session_id},
        )
        return resp.json()


async def generate_copy(history: list[dict]) -> tuple[str, str]:
    """调用本地 claude CLI 生成标题和正文。"""
    recent = history[-3:] if len(history) >= 3 else history
    recent_str = json.dumps(recent, ensure_ascii=False) if recent else "无"

    prompt = f"""你是小红书文案作者。请生成一篇停车场软广，严格遵守以下规则。

背景：
- 停车场名称：成都石莲路停车场
- 对标机场：成都天府机场（官方停车费 100 元/天，是对比基准）
- 石莲路价格：室外 25 元/天，室内 30 元/天
- 提供免费专车接送天府机场（去程交车即走，回程提前打电话稍等片刻）
- 室内宽敞不晒不淋雨，室外更便宜
- 按天计费，停半天也算一天（如实说但用价格对比化解）

文案风格（反转流）：
- 先用"踩坑/没想到"开头，制造反转，再揭晓石莲路的解法
- 语气像给朋友发消息，不用"必看""推荐""攻略"
- 用数字说话，让对比自然发生，不刻意强调"便宜"
- emoji 全篇最多 2-3 个，放情绪最强的地方
- 正文不超过 200 字，越短越好
- 结尾 4-6 个 hashtag，包含 #天府机场 #成都停车

标题要求（≤20字）：
- 反转感或悬念感，让人想点进来
- 不用感叹号开头，不用"必看""攻略"

最近 3 条历史文案（请确保本次明显不同，换角度/换开头/换侧重点）：
{recent_str}

只输出 JSON，格式如下，不要任何额外文字：
{{"title": "标题", "content": "正文含hashtag"}}"""

    result = await asyncio.to_thread(
        subprocess.run,
        ["/usr/local/bin/claude", "-p", prompt],
        capture_output=True, text=True, timeout=60,
    )
    if result.returncode != 0:
        raise RuntimeError(f"claude CLI 失败: {result.stderr.strip()}")

    raw = result.stdout.strip()
    # 去掉可能的 markdown 代码块
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    data = json.loads(raw.strip())
    title = data["title"][:20]
    content = data["content"]
    return title, content


# ──────────────────────────────────────────────
# 核心发布逻辑（后台异步执行）
# ──────────────────────────────────────────────

async def run_publish_job(job_id: str):
    job = jobs[job_id]

    def update(status: str, message: str, **kwargs):
        job.update({"status": status, "message": message, **kwargs})

    try:
        # Step 1: 选素材
        update("running", "正在选取素材...")
        global pinned_file
        history = read_history()
        if pinned_file:
            file_path = RESOURCE_DIR / pinned_file
            if not file_path.exists():
                update("failed", f"指定素材不存在：{pinned_file}")
                return
            pinned_file = None  # 用完即清
        else:
            file_path = pick_file(history)
        if file_path is None:
            update("failed", f"素材库为空，请将图片/视频放入：{RESOURCE_DIR}")
            return

        # 提前写入 file 字段，刷新后也能看到素材预览
        job["file"] = file_path.name
        ext = file_path.suffix.lower()
        job["file_type"] = "video" if ext in VIDEO_EXTS else "image"
        job["file_url"] = f"/resources/{file_path.name}"

        # Step 2: 生成文案
        update("running", "正在生成文案...")
        title, content = await generate_copy(history)

        # Step 3: 确保 MCP 服务运行
        update("running", "检查 MCP 服务...")
        if not is_mcp_running():
            await asyncio.to_thread(start_mcp)
        if not is_mcp_running():
            update("failed", "MCP 服务启动失败，请手动运行 start-mcp.sh")
            return

        # Step 4: 发布（最多重试 3 次）
        is_video = file_path.suffix.lower() in VIDEO_EXTS
        for attempt in range(1, 4):
            update("running", f"正在发布（第 {attempt} 次尝试）... 文件: {file_path.name}")
            try:
                if is_video:
                    result = await mcp_call("publish_with_video", {
                        "title": title,
                        "content": content,
                        "video": str(file_path),
                    }, timeout=300)
                else:
                    result = await mcp_call("publish_content", {
                        "title": title,
                        "content": content,
                        "images": [str(file_path)],
                    }, timeout=300)
            except Exception as e:
                if attempt >= 3:
                    update("failed", f"发布超时/失败，已重试 3 次：{e}")
                    return
                await asyncio.sleep(5)
                continue

            # MCP 返回成功，写历史
            history = read_history()
            history.append({
                "date": datetime.now().strftime("%Y-%m-%d"),
                "file": file_path.name,
                "title": title,
                "content": content,
            })
            write_history(history)
            update("success", f"发布成功：{title}",
                   title=title, content=content, file=file_path.name)
            return

    except asyncio.CancelledError:
        update("cancelled", "发布已停止")
    except Exception as e:
        update("failed", f"发生意外错误：{e}")


# ──────────────────────────────────────────────
# API 路由
# ──────────────────────────────────────────────

@app.post("/publish")
async def publish():
    """触发一次软广发布，立即返回 job_id，后台异步执行。"""
    job_id = str(uuid.uuid4())[:8]
    jobs[job_id] = {"status": "queued", "message": "任务已创建", "created_at": datetime.now().isoformat(), "job_id": job_id}
    task = asyncio.create_task(run_publish_job(job_id))
    tasks[job_id] = task
    return {"job_id": job_id}


@app.post("/jobs/{job_id}/stop")
async def stop_job(job_id: str):
    """取消正在进行的发布任务。"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="任务不存在")
    task = tasks.get(job_id)
    if task and not task.done():
        task.cancel()
    jobs[job_id].update({"status": "cancelled", "message": "发布已停止"})
    return {"ok": True}


@app.get("/jobs/latest")
async def get_latest_job():
    """返回最近一个任务（用于页面刷新后恢复状态）。"""
    if not jobs:
        return {}
    latest = list(jobs.values())[-1]
    return latest


@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    """查询任务状态。"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="任务不存在")
    return jobs[job_id]


@app.get("/jobs")
async def list_jobs():
    """列出所有任务（最近 20 个）。"""
    return list(jobs.values())[-20:]


@app.get("/history")
async def get_history():
    """查看发布历史。"""
    return read_history()


@app.get("/health")
async def health():
    """健康检查。"""
    mcp_ok = is_mcp_running()
    files = list_resources()
    return {
        "server": "ok",
        "mcp_service": "running" if mcp_ok else "stopped",
        "resource_count": len(files),
        "resources": [f.name for f in files],
        "history_count": len(read_history()),
    }


@app.get("/resources")
async def get_resources():
    """列出素材库所有文件及其类型。"""
    history = read_history()
    used_map = {item["file"]: item["date"] for item in history}
    files = list_resources()
    result = []
    for f in sorted(files, key=lambda x: x.name):
        ext = f.suffix.lower()
        result.append({
            "name": f.name,
            "type": "video" if ext in VIDEO_EXTS else "image",
            "url": f"/resources/{f.name}",
            "last_used": used_map.get(f.name),
        })
    return result


@app.post("/resources")
async def upload_resource(file: UploadFile = File(...)):
    """上传素材到素材库。"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名为空")
    safe_name = Path(file.filename).name
    if safe_name in SKIP_FILES:
        raise HTTPException(status_code=400, detail="文件名不合法")
    dest = RESOURCE_DIR / safe_name
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    ext = dest.suffix.lower()
    return {"name": safe_name, "type": "video" if ext in VIDEO_EXTS else "image", "url": f"/resources/{safe_name}"}


@app.delete("/resources/{filename}")
async def delete_resource(filename: str):
    """删除素材文件。"""
    path = RESOURCE_DIR / filename
    if not path.exists() or not path.is_file() or filename in SKIP_FILES:
        raise HTTPException(status_code=404, detail="文件不存在")
    path.unlink()
    return {"ok": True}


@app.post("/resources/{filename}/pin")
async def pin_resource(filename: str):
    """指定下次发布使用该素材。"""
    global pinned_file
    path = RESOURCE_DIR / filename
    if not path.exists() or filename in SKIP_FILES:
        raise HTTPException(status_code=404, detail="文件不存在")
    pinned_file = filename
    return {"pinned": filename}


@app.delete("/resources/pin")
async def unpin_resource():
    """取消指定素材，恢复自动选择。"""
    global pinned_file
    pinned_file = None
    return {"ok": True}


@app.get("/resources/{filename}")
async def serve_resource(filename: str):
    """直接返回素材文件（图片/视频）。"""
    path = RESOURCE_DIR / filename
    if not path.exists() or not path.is_file() or filename in SKIP_FILES:
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(path)


@app.get("/", response_class=HTMLResponse)
async def ui():
    return """<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>停车场软广发布</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
         background: #f5f5f7; color: #1d1d1f; min-height: 100vh; }
  .container { max-width: 960px; margin: 0 auto; padding: 32px 20px; }
  h1 { font-size: 24px; font-weight: 700; margin-bottom: 6px; }
  .subtitle { color: #6e6e73; font-size: 14px; margin-bottom: 28px; }

  .status-bar { display: flex; gap: 12px; margin-bottom: 28px; flex-wrap: wrap; }
  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
           border-radius: 20px; font-size: 13px; font-weight: 500; }
  .badge-ok   { background: #d1fae5; color: #065f46; }
  .badge-warn { background: #fef3c7; color: #92400e; }
  .badge-err  { background: #fee2e2; color: #991b1b; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }

  .main-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px; }
  @media(max-width:640px){ .main-grid { grid-template-columns:1fr; } }

  .card { background: #fff; border-radius: 16px; padding: 20px;
          box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  .card-title { font-size: 13px; font-weight: 600; color: #6e6e73;
                text-transform: uppercase; letter-spacing: .05em; margin-bottom: 14px; }

  /* 上传区 */
  .upload-zone { border: 2px dashed #d1d5db; border-radius: 10px; padding: 14px;
                 text-align: center; cursor: pointer; transition: border-color .15s, background .15s;
                 margin-bottom: 12px; font-size: 13px; color: #6e6e73; }
  .upload-zone:hover, .upload-zone.dragover { border-color: #3b82f6; background: #eff6ff; color:#1d4ed8; }
  .upload-zone input { display:none; }

  .resource-list { display: flex; flex-direction: column; gap: 6px; max-height: 280px; overflow-y: auto; }
  .resource-item { display: flex; align-items: center; gap: 10px; padding: 7px 8px;
                   border-radius: 10px; transition: background .15s; }
  .resource-item:hover { background: #f5f5f7; }
  .resource-item.pinned  { background: #fdf4ff; outline: 2px solid #a855f7; }
  .resource-item.next-pick { background: #eff6ff; outline: 2px solid #3b82f6; }
  .thumb { width: 48px; height: 48px; object-fit: cover; border-radius: 8px; flex-shrink: 0;
           background:#f0f0f0; cursor:pointer; }
  .video-thumb { width: 48px; height: 48px; border-radius: 8px; flex-shrink: 0;
                 background: #1d1d1f; display:flex; align-items:center; justify-content:center;
                 color:#fff; font-size:20px; cursor:pointer; }
  .resource-meta { flex: 1; overflow: hidden; cursor:pointer; }
  .resource-name { font-size: 13px; font-weight: 500; white-space: nowrap;
                   overflow: hidden; text-overflow: ellipsis; }
  .resource-used { font-size: 11px; color: #6e6e73; margin-top: 2px; }
  .tag-new { font-size: 10px; background:#dcfce7; color:#166534;
             padding: 2px 6px; border-radius: 10px; margin-left:6px; }
  .tag-pin { font-size: 10px; background:#f3e8ff; color:#7e22ce;
             padding: 2px 6px; border-radius: 10px; margin-left:6px; }
  .item-actions { display:flex; gap:4px; flex-shrink:0; }
  .btn-pin { background:none; border:1px solid #d8b4fe; border-radius:6px; padding:3px 7px;
             font-size:11px; color:#7e22ce; cursor:pointer; white-space:nowrap; }
  .btn-pin:hover { background:#f3e8ff; }
  .btn-pin.active { background:#a855f7; color:#fff; border-color:#a855f7; }
  .btn-del { background:none; border:1px solid #fca5a5; border-radius:6px; padding:3px 7px;
             font-size:11px; color:#dc2626; cursor:pointer; }
  .btn-del:hover { background:#fee2e2; }

  #preview-box { text-align: center; }
  #big-preview { max-width: 100%; max-height: 260px; border-radius: 10px; object-fit: contain; display:none; }
  #big-video   { max-width: 100%; max-height: 260px; border-radius: 10px; display:none; }
  #preview-placeholder { color: #b0b0b8; font-size: 14px; padding: 60px 0; }

  /* 按钮区 */
  .btn-row { display:flex; justify-content:center; gap:14px; margin-bottom: 28px; }
  #btn-publish { background: #ff2442; color: #fff; border: none; border-radius: 14px;
                 padding: 14px 48px; font-size: 17px; font-weight: 700;
                 cursor: pointer; transition: opacity .15s, transform .1s; letter-spacing:.03em; }
  #btn-publish:hover:not(:disabled) { opacity:.88; transform:scale(1.02); }
  #btn-publish:disabled { opacity:.45; cursor:not-allowed; }
  #btn-stop { background: #e5e7eb; color: #374151; border: none; border-radius: 14px;
              padding: 14px 28px; font-size: 15px; font-weight: 600;
              cursor: pointer; display:none; transition: background .15s; }
  #btn-stop:hover { background: #d1d5db; }

  /* 进度 */
  #job-panel { display:none; margin-bottom: 28px; }
  .progress-steps { display:flex; flex-direction:column; gap:8px; }
  .step { display:flex; align-items:center; gap:10px; font-size:14px; }
  .step-icon { width:22px; height:22px; border-radius:50%; display:flex;
               align-items:center; justify-content:center; font-size:12px; flex-shrink:0; }
  .step-pending  { background:#e5e7eb; color:#9ca3af; }
  .step-active   { background:#fef9c3; color:#854d0e; animation: pulse 1.2s infinite; }
  .step-done     { background:#d1fae5; color:#065f46; }
  .step-fail     { background:#fee2e2; color:#991b1b; }
  .step-cancel   { background:#f3f4f6; color:#6b7280; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.6} }

  /* 结果卡片：左文案右素材 */
  #result-card { display:none; margin-bottom: 28px; }
  .result-grid { display:grid; grid-template-columns:1fr auto; gap:20px; align-items:start; }
  @media(max-width:600px){ .result-grid { grid-template-columns:1fr; } }
  .copy-title { font-size: 17px; font-weight: 700; margin-bottom: 10px; }
  .copy-content { font-size: 14px; line-height: 1.7; white-space: pre-wrap; color:#3a3a3c; }
  .result-media img, .result-media video { width:140px; border-radius:10px; display:block; }

  .empty { color:#b0b0b8; font-size:14px; text-align:center; padding:20px 0; }
</style>
</head>
<body>
<div class="container">
  <h1>停车场软广发布台</h1>
  <p class="subtitle">成都石莲路停车场 · 小红书自动发布</p>

  <div class="status-bar" id="status-bar">
    <span class="badge badge-warn"><span class="dot"></span>加载中...</span>
  </div>

  <div class="main-grid">
    <div class="card">
      <div class="card-title">素材库</div>
      <div class="upload-zone" id="upload-zone" onclick="document.getElementById('file-input').click()"
           ondragover="event.preventDefault();this.classList.add('dragover')"
           ondragleave="this.classList.remove('dragover')"
           ondrop="handleDrop(event)">
        <input type="file" id="file-input" accept="image/*,video/*" multiple onchange="handleFiles(this.files)">
        点击或拖拽上传图片 / 视频
      </div>
      <div class="resource-list" id="resource-list"><div class="empty">加载中...</div></div>
    </div>
    <div class="card" id="preview-box">
      <div class="card-title">预览</div>
      <div id="preview-placeholder">点击左侧素材查看预览</div>
      <img id="big-preview" alt="预览">
      <video id="big-video" controls></video>
    </div>
  </div>

  <div class="btn-row">
    <button id="btn-publish" onclick="startPublish()">发 布</button>
    <button id="btn-stop" onclick="stopPublish()">停止</button>
  </div>

  <div id="job-panel" class="card">
    <div class="card-title">发布进度</div>
    <div class="progress-steps" id="progress-steps"></div>
  </div>

  <div id="result-card" class="card">
    <div class="card-title">本次发布</div>
    <div class="result-grid">
      <div>
        <div class="copy-title" id="result-title"></div>
        <div class="copy-content" id="result-content"></div>
      </div>
      <div class="result-media" id="result-media"></div>
    </div>
  </div>
</div>

<script>
const STEPS = [
  { key:'pick',    label:'选取素材' },
  { key:'copy',    label:'生成文案' },
  { key:'mcp',     label:'检查 MCP 服务' },
  { key:'publish', label:'发布到小红书' },
];
const STEP_MSGS = {
  '正在选取素材': 'pick',
  '正在生成文案': 'copy',
  '检查 MCP 服务': 'mcp',
  '正在发布': 'publish',
  '第 1 次尝试': 'publish',
  '第 2 次尝试': 'publish',
  '第 3 次尝试': 'publish',
};

let pollTimer = null;
let currentJobId = null;
let pinnedFile = null;  // 本地缓存当前 pin 状态

// ── 初始化：恢复上次任务 + 加载素材 ──
async function init() {
  loadStatus();
  loadResources();

  // 恢复上次任务状态
  const savedId = localStorage.getItem('lastJobId');
  if (savedId) {
    try {
      const r = await fetch('/jobs/' + savedId);
      if (r.ok) {
        const job = await r.json();
        showJobPanel(job);
        if (job.status === 'running' || job.status === 'queued') {
          currentJobId = savedId;
          setPublishLock(true);
          pollJob(savedId);
        }
      }
    } catch(e) {}
  }
}

async function loadStatus() {
  try {
    const r = await fetch('/health');
    const d = await r.json();
    document.getElementById('status-bar').innerHTML = `
      <span class="badge ${d.mcp_service==='running'?'badge-ok':'badge-warn'}">
        <span class="dot"></span>MCP ${d.mcp_service==='running'?'运行中':'未运行'}
      </span>
      <span class="badge badge-ok"><span class="dot"></span>素材 ${d.resource_count} 个</span>
      <span class="badge badge-ok"><span class="dot"></span>已发布 ${d.history_count} 次</span>`;
  } catch(e) {
    document.getElementById('status-bar').innerHTML =
      '<span class="badge badge-err"><span class="dot"></span>服务异常</span>';
  }
}

async function loadResources() {
  try {
    const [res, hist] = await Promise.all([fetch('/resources'), fetch('/history')]);
    const files = await res.json();
    const history = await hist.json();
    const usedMap = {};
    history.forEach(h => usedMap[h.file] = h.date);
    const unused = files.filter(f => !usedMap[f.name]);
    let autoNext = unused.length > 0 ? unused[0].name : null;
    if (!autoNext && files.length > 0)
      autoNext = files.slice().sort((a,b) => (usedMap[a.name]||'0') < (usedMap[b.name]||'0') ? -1 : 1)[0].name;

    const list = document.getElementById('resource-list');
    if (!files.length) { list.innerHTML = '<div class="empty">素材库为空</div>'; return; }

    list.innerHTML = files.map(f => {
      const isPinned = f.name === pinnedFile;
      const isNext   = !pinnedFile && f.name === autoNext;
      const cls = isPinned ? 'pinned' : (isNext ? 'next-pick' : '');
      const nameExtra = isPinned
        ? `<span class="tag-pin">已指定</span>`
        : (!usedMap[f.name] ? '<span class="tag-new">未发布</span>' : '');
      const thumb = f.type==='video'
        ? `<div class="video-thumb" onclick="showPreview('${f.url}','${f.type}')">▶</div>`
        : `<img class="thumb" src="${f.url}" loading="lazy" onclick="showPreview('${f.url}','${f.type}')">`;
      return `
      <div class="resource-item ${cls}" data-name="${f.name}">
        ${thumb}
        <div class="resource-meta" onclick="showPreview('${f.url}','${f.type}')">
          <div class="resource-name">${f.name}${nameExtra}</div>
          <div class="resource-used">${f.last_used?'最近发布: '+f.last_used:'从未使用'}</div>
        </div>
        <div class="item-actions">
          <button class="btn-pin ${isPinned?'active':''}" onclick="togglePin('${f.name}',${isPinned})" title="指定此素材">
            ${isPinned?'取消':'指定'}
          </button>
          <button class="btn-del" onclick="deleteFile('${f.name}')" title="删除">✕</button>
        </div>
      </div>`;
    }).join('');

    // 自动预览：pinned 优先，否则 autoNext
    const previewName = pinnedFile || autoNext;
    if (previewName) { const n=files.find(f=>f.name===previewName); if(n) showPreview(n.url,n.type); }
  } catch(e) {
    document.getElementById('resource-list').innerHTML = '<div class="empty">加载失败</div>';
  }
}

// ── 上传 ──
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
}

async function handleFiles(files) {
  for (const file of files) {
    const fd = new FormData();
    fd.append('file', file);
    try {
      await fetch('/resources', { method: 'POST', body: fd });
    } catch(e) { alert('上传失败：' + e); }
  }
  loadResources();
  loadStatus();
}

// ── 指定素材 ──
async function togglePin(name, isCurrentlyPinned) {
  if (isCurrentlyPinned) {
    await fetch('/resources/pin', { method: 'DELETE' });
    pinnedFile = null;
  } else {
    await fetch(`/resources/${encodeURIComponent(name)}/pin`, { method: 'POST' });
    pinnedFile = name;
  }
  loadResources();
}

// ── 删除素材 ──
async function deleteFile(name) {
  if (!confirm(`删除 ${name}？`)) return;
  await fetch(`/resources/${encodeURIComponent(name)}`, { method: 'DELETE' });
  if (pinnedFile === name) pinnedFile = null;
  loadResources();
  loadStatus();
}

function showPreview(url, type) {
  document.getElementById('preview-placeholder').style.display = 'none';
  const img = document.getElementById('big-preview'), vid = document.getElementById('big-video');
  if (type==='video') { img.style.display='none'; vid.src=url; vid.style.display='block'; }
  else { vid.style.display='none'; img.src=url; img.style.display='block'; }
}

function setPublishLock(locked) {
  document.getElementById('btn-publish').disabled = locked;
  document.getElementById('btn-stop').style.display = locked ? 'inline-flex' : 'none';
}

// ── 发布 ──
async function startPublish() {
  setPublishLock(true);
  document.getElementById('result-card').style.display = 'none';
  document.getElementById('job-panel').style.display = 'block';
  renderSteps('pick', null);
  try {
    const r = await fetch('/publish', { method: 'POST' });
    const d = await r.json();
    currentJobId = d.job_id;
    localStorage.setItem('lastJobId', currentJobId);
    pollJob(currentJobId);
  } catch(e) {
    document.getElementById('progress-steps').innerHTML =
      `<div style="color:#991b1b">发布请求失败：${e}</div>`;
    setPublishLock(false);
  }
}

// ── 停止 ──
async function stopPublish() {
  if (!currentJobId) return;
  clearTimeout(pollTimer);
  await fetch('/jobs/' + currentJobId + '/stop', { method: 'POST' }).catch(()=>{});
  renderStepsCancel();
  setPublishLock(false);
}

// ── 进度渲染 ──
function renderSteps(activeKey, failKey) {
  const doneKeys = [];
  for (const s of STEPS) {
    if (s.key === activeKey) break;
    if (activeKey !== null) doneKeys.push(s.key);
  }
  document.getElementById('progress-steps').innerHTML = STEPS.map(s => {
    let cls='step-pending', icon='○';
    if (s.key===failKey)              { cls='step-fail';   icon='✕'; }
    else if (doneKeys.includes(s.key)){ cls='step-done';   icon='✓'; }
    else if (s.key===activeKey)       { cls='step-active'; icon='…'; }
    return `<div class="step"><div class="step-icon ${cls}">${icon}</div><span>${s.label}</span></div>`;
  }).join('');
}

function renderStepsCancel() {
  document.getElementById('progress-steps').innerHTML = STEPS.map(s =>
    `<div class="step"><div class="step-icon step-cancel">—</div><span>${s.label}</span></div>`
  ).join('') + `<div class="step" style="color:#6b7280;margin-top:8px;font-size:13px">已停止</div>`;
}

function renderStepsAllDone() {
  document.getElementById('progress-steps').innerHTML = STEPS.map(s =>
    `<div class="step"><div class="step-icon step-done">✓</div><span>${s.label}</span></div>`
  ).join('');
}

// ── 轮询 ──
async function pollJob(jobId) {
  try {
    const r = await fetch('/jobs/' + jobId);
    const job = await r.json();
    showJobPanel(job);
    if (job.status === 'running' || job.status === 'queued') {
      pollTimer = setTimeout(() => pollJob(jobId), 2000);
    } else {
      setPublishLock(false);
      if (job.status === 'success') { renderStepsAllDone(); loadStatus(); loadResources(); }
    }
  } catch(e) {
    pollTimer = setTimeout(() => pollJob(jobId), 3000);
  }
}

function showJobPanel(job) {
  const msg = job.message || '';
  const status = job.status;

  // 推断当前步骤
  let activeKey = 'pick';
  for (const [kw, key] of Object.entries(STEP_MSGS)) {
    if (msg.includes(kw)) { activeKey = key; break; }
  }

  if (status === 'success') {
    renderStepsAllDone();
    showResult(job);
  } else if (status === 'failed') {
    renderSteps(activeKey, activeKey);
    document.getElementById('progress-steps').innerHTML +=
      `<div class="step" style="color:#991b1b;margin-top:8px;font-size:13px">${msg}</div>`;
  } else if (status === 'cancelled') {
    renderStepsCancel();
  } else {
    renderSteps(activeKey, null);
  }

  document.getElementById('job-panel').style.display = 'block';
}

function showResult(job) {
  document.getElementById('result-card').style.display = 'block';
  document.getElementById('result-title').textContent = job.title || '';
  document.getElementById('result-content').textContent = job.content || '';
  const media = document.getElementById('result-media');
  if (job.file_url) {
    media.innerHTML = job.file_type === 'video'
      ? `<video src="${job.file_url}" controls style="width:140px;border-radius:10px"></video>`
      : `<img src="${job.file_url}" style="width:140px;border-radius:10px">`;
  } else {
    media.innerHTML = '';
  }
}

init();
</script>
</body>
</html>"""


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8765))
    print(f"停车场软广服务启动中... http://0.0.0.0:{port}")
    uvicorn.run("park-ad-server:app", host="0.0.0.0", port=port, reload=False)

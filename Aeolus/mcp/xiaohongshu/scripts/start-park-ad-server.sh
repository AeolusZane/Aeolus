#!/bin/bash
# 启动停车场软广 HTTP 服务 + ngrok 隧道 + 生成二维码

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$HOME/.xiaohongshu/park-ad-server.pid"
NGROK_PID_FILE="$HOME/.xiaohongshu/park-ad-ngrok.pid"
LOG_FILE="$HOME/.xiaohongshu/park-ad-server.log"
NGROK_LOG="$HOME/.xiaohongshu/park-ad-ngrok.log"
QR_FILE="$SCRIPT_DIR/qrcode.png"
PORT="${PORT:-8765}"

mkdir -p "$HOME/.xiaohongshu"

# ── 1. 启动 FastAPI 服务 ──────────────────────────────
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "软广服务已在运行 (PID: $(cat $PID_FILE))"
else
    echo "启动软广 HTTP 服务..."
    nohup python3 "$SCRIPT_DIR/park-ad-server.py" > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    sleep 2
    if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "✗ 服务启动失败，查看日志: $LOG_FILE"
        cat "$LOG_FILE"
        exit 1
    fi
    echo "✓ 软广服务已启动 (PID: $(cat $PID_FILE), 端口: $PORT)"
fi

# ── 2. 启动 ngrok 隧道 ───────────────────────────────
if [ -f "$NGROK_PID_FILE" ] && kill -0 "$(cat "$NGROK_PID_FILE")" 2>/dev/null; then
    echo "ngrok 已在运行，获取当前 URL..."
else
    # 杀掉残留 ngrok 进程
    pkill -f "ngrok http $PORT" 2>/dev/null
    sleep 1
    echo "启动 ngrok 隧道..."
    nohup ngrok http "$PORT" --log=stdout > "$NGROK_LOG" 2>&1 &
    echo $! > "$NGROK_PID_FILE"
    sleep 4
fi

# ── 3. 获取公网 URL（最多等 30 秒）────────────────────
PUBLIC_URL=""
for i in $(seq 1 30); do
    PUBLIC_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
        | python3 -c "import sys,json; t=json.load(sys.stdin).get('tunnels',[]); print(next((x['public_url'] for x in t if x['public_url'].startswith('https')),'')" 2>/dev/null)
    [ -n "$PUBLIC_URL" ] && break
    sleep 1
done

if [ -z "$PUBLIC_URL" ]; then
    echo "✗ 无法获取 ngrok 公网 URL，请检查 ngrok 是否已登录（ngrok config add-authtoken <token>）"
    exit 1
fi

echo "✓ 公网地址: $PUBLIC_URL"

# ── 4. 生成二维码并保存 ──────────────────────────────
python3 - "$PUBLIC_URL" "$QR_FILE" <<'EOF'
import sys, qrcode
url, path = sys.argv[1], sys.argv[2]
img = qrcode.make(url)
img.save(path)
print(f"✓ 二维码已保存: {path}")
EOF

echo ""
echo "  扫码或直接访问: $PUBLIC_URL"
echo "  本地访问:       http://localhost:$PORT"
echo "  日志:           $LOG_FILE"

#!/bin/bash
# 停止停车场软广 HTTP 服务 + ngrok

PID_FILE="$HOME/.xiaohongshu/park-ad-server.pid"
NGROK_PID_FILE="$HOME/.xiaohongshu/park-ad-ngrok.pid"

# 停 FastAPI
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID" && echo "✓ 软广服务已停止 (PID: $PID)"
    fi
    rm -f "$PID_FILE"
fi

# 停 ngrok
if [ -f "$NGROK_PID_FILE" ]; then
    NPID=$(cat "$NGROK_PID_FILE")
    if kill -0 "$NPID" 2>/dev/null; then
        kill "$NPID" && echo "✓ ngrok 已停止 (PID: $NPID)"
    fi
    rm -f "$NGROK_PID_FILE"
fi

#!/bin/zsh
cd "$(dirname "$0")"

echo "日誌アプリを起動中..."
node server.js &
SERVER_PID=$!
sleep 1

echo ""
echo "=== スマホ用URL（以下のURLをスマホで開く）==="
cloudflared tunnel --url http://localhost:3000 2>&1 | grep --line-buffered -E "https://[a-z0-9-]+\.trycloudflare\.com"

#!/bin/zsh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
URL="http://localhost:3000/"
LOG_FILE="$PROJECT_DIR/.next-dev.log"

cd "$PROJECT_DIR"

echo "正在打开个人系统..."
echo "项目目录: $PROJECT_DIR"
echo

if curl -fsS "$URL" >/dev/null 2>&1; then
  echo "服务已经在运行，正在打开浏览器。"
  open "$URL"
  exit 0
fi

if [ ! -d "$PROJECT_DIR/node_modules" ]; then
  echo "第一次运行需要安装依赖，请稍等。"
  npm install
  echo
fi

echo "正在启动本地服务..."
npm run dev > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo
    echo "正在停止本地服务..."
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup INT TERM EXIT

for _ in {1..60}; do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    echo "服务已启动，正在打开浏览器。"
    open "$URL"
    echo
    echo "这个窗口保持打开时，个人系统会继续运行。"
    echo "不用时关闭这个窗口即可停止服务。"
    wait "$SERVER_PID"
    exit 0
  fi

  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo "启动失败，最近的日志如下："
    tail -n 80 "$LOG_FILE"
    exit 1
  fi

  sleep 1
done

echo "等待服务启动超时，最近的日志如下："
tail -n 80 "$LOG_FILE"
exit 1

#!/bin/bash

# ChromaDB Run Script
# Activates the venv and runs the chroma server.

VENV_DIR=".chroma_venv"
DATA_DIR="./chroma_data"

if [ ! -d "$VENV_DIR" ]; then
    echo "❌ Virtual environment not found. Please run 'pnpm run chroma:setup' first."
    exit 1
fi

if [ ! -d "$DATA_DIR" ]; then
    mkdir -p "$DATA_DIR"
fi

# 포트 8000 사용 중인지 확인 및 기존 프로세스 종료
if command -v lsof >/dev/null 2>&1; then
    PORT_PIDS=$(lsof -ti :8000 2>/dev/null || true)
    if [ -n "$PORT_PIDS" ]; then
        echo "⚠️ 포트 8000이 사용 중입니다. 기존 프로세스를 종료합니다..."
        for PID in $PORT_PIDS; do
            # 프로세스가 chroma 관련인지 확인
            if ps -p $PID >/dev/null 2>&1; then
                CMDLINE=$(ps -p $PID -o command= 2>/dev/null || echo "")
                if echo "$CMDLINE" | grep -q -E "(chroma|uvicorn)"; then
                    echo "🛑 기존 ChromaDB 프로세스 종료 중 (PID: $PID)..."
                    kill -TERM $PID 2>/dev/null || true
                    sleep 1
                    # 강제 종료
                    kill -KILL $PID 2>/dev/null || true
                fi
            fi
        done
        echo "⏳ 프로세스 종료 대기 중..."
        sleep 2
    fi
else
    echo "⚠️ lsof 명령어를 사용할 수 없습니다. 포트 충돌을 수동으로 확인하세요."
fi

echo "🚀 Starting ChromaDB server on http://localhost:8000..."
source $VENV_DIR/bin/activate

# Disable telemetry to avoid PostHog version compatibility issues
export ANONYMIZED_TELEMETRY=false

chroma run --path $DATA_DIR

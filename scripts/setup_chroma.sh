#!/bin/bash

# ChromaDB Setup Script
# Finds a compatible Python version (3.9-3.12), creates a venv, and installs chromadb.

set -e

echo "🔎 Searching for compatible Python version (3.9 - 3.12)..."

# Function to check python version
check_version() {
    local cmd=$1
    if command -v $cmd &> /dev/null; then
        local ver=$($cmd -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
        local major=$(echo $ver | cut -d. -f1)
        local minor=$(echo $ver | cut -d. -f2)
        
        if [ "$major" -eq 3 ] && [ "$minor" -ge 9 ] && [ "$minor" -le 12 ]; then
            echo "$cmd ($ver)"
            return 0
        fi
    fi
    return 1
}

PYTHON_CMD=""

# Priority list of python commands to check
for cmd in python3.11 python3.10 python3.9 python3.12 python3 python; do
    if found_ver=$(check_version $cmd); then
        PYTHON_CMD=$cmd
        echo "✅ Found compatible Python: $found_ver"
        break
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    echo "❌ No compatible Python version found (3.9 - 3.12 required for ChromaDB compatibility without complex tweaks)."
    exit 1
fi

VENV_DIR=".chroma_venv"

echo "🛠️  Creating virtual environment in '$VENV_DIR' using $PYTHON_CMD..."
rm -rf $VENV_DIR
$PYTHON_CMD -m venv $VENV_DIR

echo "📦 Installing ChromaDB..."
source $VENV_DIR/bin/activate
pip install --upgrade pip
# chromadb 1.x 서버 + posthog 3.x (호환성 필수)
pip install "chromadb>=1.0.0" "posthog>=3.0.0,<4.0.0"

echo "🎉 ChromaDB setup complete!"
echo "Run 'pnpm run chroma:start' to start the server."

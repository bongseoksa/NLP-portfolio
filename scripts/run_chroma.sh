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

echo "🚀 Starting ChromaDB server on http://localhost:8000..."
source $VENV_DIR/bin/activate
chroma run --path $DATA_DIR

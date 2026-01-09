#!/bin/bash

# Git 커밋 메시지 템플릿 설정 스크립트

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GITMESSAGE_PATH="$PROJECT_ROOT/.gitmessage"

if [ ! -f "$GITMESSAGE_PATH" ]; then
  echo "❌ .gitmessage 파일을 찾을 수 없습니다."
  exit 1
fi

# Git 전역 설정 (현재 프로젝트에만 적용하려면 --local 사용)
git config commit.template "$GITMESSAGE_PATH"

echo "✅ Git 커밋 메시지 템플릿이 설정되었습니다."
echo "📝 템플릿 위치: $GITMESSAGE_PATH"
echo ""
echo "사용법:"
echo "  git commit  # 템플릿이 자동으로 열립니다"
echo ""
echo "전역 설정을 원하시면 다음 명령어를 실행하세요:"
echo "  git config --global commit.template $GITMESSAGE_PATH"

#!/bin/bash

# 질의응답 스크립트
# zsh에서 특수문자(물음표 등)를 포함한 질문도 처리

# 모든 인자를 하나의 문자열로 합치기
# pnpm이 전달한 모든 인자를 받음
QUESTION="$*"

# 질문이 비어있으면 에러
if [ -z "$QUESTION" ]; then
    echo "❌ 질문을 입력해주세요."
    echo "사용법: pnpm ask \"질문 내용\""
    echo "   또는: pnpm ask 질문내용"
    exit 1
fi

# Node.js 스크립트 실행
cd "$(dirname "$0")/.."
exec tsx src/index.ts ask "$QUESTION"


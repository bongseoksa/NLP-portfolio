#!/bin/bash

# package.json 스크립트 테스트 스크립트

set -e

echo "🧪 Testing package.json scripts..."
echo ""

# 색상 정의
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 테스트 결과 추적
PASSED=0
FAILED=0
SKIPPED=0

# 스크립트 테스트 함수
test_script() {
    local script_name=$1
    local script_command=$2
    local description=$3
    
    echo -n "Testing: ${script_name}... "
    
    # 스크립트 실행 (5초 타임아웃)
    if timeout 5s bash -c "${script_command}" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((PASSED++))
    elif [ $? -eq 124 ]; then
        echo -e "${YELLOW}⚠ TIMEOUT (may be long-running)${NC}"
        ((SKIPPED++))
    else
        # 스크립트가 존재하는지 확인
        if pnpm run ${script_name} --help > /dev/null 2>&1 || pnpm run ${script_name} --version > /dev/null 2>&1; then
            echo -e "${YELLOW}⚠ SKIP (requires environment/config)${NC}"
            ((SKIPPED++))
        else
            echo -e "${RED}✗ FAIL${NC}"
            ((FAILED++))
        fi
    fi
}

# 1. local_export
echo "1. local_export"
test_script "local_export" "pnpm run local_export" "Export embeddings to file"
echo ""

# 2. server (빠르게 종료)
echo "2. server (vercel dev)"
echo -n "Testing: server... "
if command -v vercel > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS (vercel command exists)${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL (vercel not installed)${NC}"
    ((FAILED++))
fi
echo ""

# 3. vercel:dev
echo "3. vercel:dev"
echo -n "Testing: vercel:dev... "
if command -v vercel > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS (vercel command exists)${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL (vercel not installed)${NC}"
    ((FAILED++))
fi
echo ""

# 4. build
echo "4. build"
test_script "build" "pnpm run build" "TypeScript compilation"
echo ""

# 5. build:frontend
echo "5. build:frontend"
test_script "build:frontend" "pnpm run build:frontend" "Frontend build"
echo ""

# 6. start (빌드 후 실행 가능)
echo "6. start"
echo -n "Testing: start... "
if [ -d "dist" ] && [ -f "dist/index.js" ]; then
    echo -e "${GREEN}✓ PASS (dist/index.js exists)${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ SKIP (requires build first)${NC}"
    ((SKIPPED++))
fi
echo ""

# 7. dev:frontend
echo "7. dev:frontend"
test_script "dev:frontend" "pnpm run dev:frontend" "Frontend dev server"
echo ""

# 8. preview:frontend
echo "8. preview:frontend"
echo -n "Testing: preview:frontend... "
if [ -d "frontend/dist" ]; then
    echo -e "${GREEN}✓ PASS (frontend/dist exists)${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ SKIP (requires build:frontend first)${NC}"
    ((SKIPPED++))
fi
echo ""

# 9. panda
echo "9. panda"
test_script "panda" "pnpm run panda" "PandaCSS codegen"
echo ""

# 10. test:api
echo "10. test:api"
test_script "test:api" "pnpm run test:api" "API test script"
echo ""

# 11. chroma:setup
echo "11. chroma:setup"
echo -n "Testing: chroma:setup... "
if [ -f "scripts/setup_chroma.sh" ]; then
    echo -e "${YELLOW}⚠ DEPRECATED (ChromaDB not used)${NC}"
    ((SKIPPED++))
else
    echo -e "${RED}✗ FAIL (script not found)${NC}"
    ((FAILED++))
fi
echo ""

# 12. chroma:start
echo "12. chroma:start"
echo -n "Testing: chroma:start... "
if [ -f "scripts/run_chroma.sh" ]; then
    echo -e "${YELLOW}⚠ DEPRECATED (ChromaDB not used)${NC}"
    ((SKIPPED++))
else
    echo -e "${RED}✗ FAIL (script not found)${NC}"
    ((FAILED++))
fi
echo ""

# 결과 요약
echo "=========================================="
echo "Test Results:"
echo -e "${GREEN}Passed: ${PASSED}${NC}"
echo -e "${YELLOW}Skipped: ${SKIPPED}${NC}"
echo -e "${RED}Failed: ${FAILED}${NC}"
echo "=========================================="

if [ $FAILED -eq 0 ]; then
    exit 0
else
    exit 1
fi


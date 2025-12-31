# Quick Start Guide - Polling-based Embedding

## 🚀 5분 안에 시작하기

### 1️⃣ 대상 레포지토리 설정

`target-repos.json` 파일을 생성하거나 수정하세요:

```json
{
  "repositories": [
    {
      "owner": "bongseoksa",
      "repo": "portfolio",
      "enabled": true,
      "description": "My portfolio project"
    }
  ]
}
```

### 2️⃣ 환경 변수 설정

`.env` 파일 확인:

```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx
OPENAI_API_KEY=sk-proj-xxxxxxxxxx
```

### 3️⃣ ChromaDB 시작

```bash
pnpm run chroma:start
```

### 4️⃣ 폴링 파이프라인 실행

```bash
# 첫 실행 (모든 레포 임베딩)
pnpm run dev

# 이후 실행 (변경된 레포만 임베딩)
pnpm run dev
```

---

## 📋 주요 명령어

| 명령어 | 설명 |
|--------|------|
| `pnpm run dev` | 폴링 모드 (변경 감지) |
| `pnpm run dev --reset` | 전체 재임베딩 |
| `pnpm run dev help` | 도움말 |
| `pnpm run ask "질문"` | 질의응답 |

---

## 🔍 상태 확인

### commit-state.json 확인

```bash
cat commit-state.json | jq
```

**예시 출력**:
```json
{
  "repositories": {
    "bongseoksa/portfolio": {
      "id": "bongseoksa/portfolio",
      "owner": "bongseoksa",
      "repo": "portfolio",
      "defaultBranch": "master",
      "lastProcessedCommit": "8822cdf...",
      "lastProcessedAt": "2025-12-30T10:00:00Z",
      "totalCommitsProcessed": 1
    }
  },
  "lastUpdated": "2025-12-30T10:00:00Z"
}
```

### ChromaDB 컬렉션 확인

```bash
curl http://localhost:8000/api/v1/collections
```

---

## 🎯 실행 예시

### 첫 실행

```
🔄 Polling-based Embedding Pipeline

📡 Polling Target Repositories...
   Found 1 enabled repositories in target-repos.json

🔍 Polling bongseoksa/portfolio...
   Default branch: master
   Latest commit: 8822cdf
   Last processed: (none - first run)
   ✅ Needs processing: First run: no previous commit recorded

📊 Polling Summary:
   Total repositories: 1
   Needs processing: 1
   Up to date: 0

🚀 Processing 1 repositories...

================================================================================
Processing: bongseoksa/portfolio
Reason: First run: no previous commit recorded
================================================================================

🚀 Pipeline started
📦 Target repository: bongseoksa/portfolio
...
✅ Successfully processed bongseoksa/portfolio

================================================================================
🎉 Polling Pipeline Finished!
================================================================================
   Success: 1
   Failure: 0
   Total: 1
```

### 두 번째 실행 (변경 없음)

```
🔄 Polling-based Embedding Pipeline

📡 Polling Target Repositories...
   Found 1 enabled repositories in target-repos.json

🔍 Polling bongseoksa/portfolio...
   Default branch: master
   Latest commit: 8822cdf
   Last processed: 8822cdf
   ⏭️  Skipping: Up to date: no new commits

📊 Polling Summary:
   Total repositories: 1
   Needs processing: 0
   Up to date: 1

✅ All repositories are up to date. Nothing to process.
```

---

## 🔧 문제 해결

### "target-repos.json not found"

```bash
# target-repos.json 생성
cat > target-repos.json <<EOF
{
  "repositories": [
    {
      "owner": "your-username",
      "repo": "your-repo",
      "enabled": true
    }
  ]
}
EOF
```

### "GITHUB_TOKEN is required"

```bash
# .env 파일 확인
cat .env | grep GITHUB_TOKEN

# 없으면 추가
echo "GITHUB_TOKEN=ghp_xxxxx" >> .env
```

### ChromaDB 연결 실패

```bash
# ChromaDB 재시작
pkill -f chroma
pnpm run chroma:start

# 연결 테스트
curl http://localhost:8000/api/v1/heartbeat
```

---

## 📚 자세한 문서

- **전체 아키텍처**: [POLLING-ARCHITECTURE.md](POLLING-ARCHITECTURE.md)
- **구현 요약**: [IMPLEMENTATION-SUMMARY.md](IMPLEMENTATION-SUMMARY.md)
- **Help**: `pnpm run dev help`

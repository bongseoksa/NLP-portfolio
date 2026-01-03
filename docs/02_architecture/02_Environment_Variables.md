# 환경 변수 설정 가이드

> **문서 버전**: v1.0
> **최종 업데이트**: 2026-01-03

---

## 목차

1. [환경별 변수 설정](#1-환경별-변수-설정)
2. [GitHub Actions Secrets](#2-github-actions-secrets)
3. [로컬 개발 환경](#3-로컬-개발-환경)
4. [Vercel 프로덕션](#4-vercel-프로덕션)

---

## 1. 환경별 변수 설정

### 1.1 환경 구분

| 환경 | 용도 | 설정 방법 |
|------|------|----------|
| **GitHub Actions** | CI 파이프라인 | GitHub Secrets |
| **로컬 개발** | 개발 및 테스트 | `.env` 파일 |
| **Vercel Production** | 프로덕션 배포 | Vercel Environment Variables |

---

## 2. GitHub Actions Secrets

### 2.1 설정 경로

```
Repository → Settings → Secrets and variables → Actions → New repository secret
```

### 2.2 필수 Secrets

#### 2.2.1 Supabase 연결

```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**용도**:
- 임베딩 벡터 임시 저장 (CI 단계)
- Q&A 히스토리 조회
- Ping 테이블 기록

**권한**:
- `SUPABASE_SERVICE_ROLE_KEY`: 전체 테이블 읽기/쓰기 권한

#### 2.2.2 LLM API Keys

```bash
# Primary (유료)
CLAUDE_API_KEY=sk-ant-api03-xxx

# Fallback 1 (무료)
GEMINI_API_KEY=AIzaSyXXX

# Fallback 2 (무료, 선택 사항)
HUGGINGFACE_API_KEY=hf_xxx
```

**용도**:
- Claude: 고품질 응답 생성
- Gemini: 무료 fallback
- HuggingFace: Mistral-7B 최종 fallback

#### 2.2.3 임베딩 API (현재 사용 중, 향후 제거 예정)

```bash
OPENAI_API_KEY=sk-proj-xxx
```

**상태**: 🔄 제거 예정 (Hugging Face로 마이그레이션)

### 2.3 자동 제공 Variables

```bash
# GitHub Actions가 자동으로 제공 (설정 불필요)
GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }}
GITHUB_REPOSITORY=${{ github.repository }}
GITHUB_REF=${{ github.ref }}
CI=true
GITHUB_ACTIONS=true
```

**주의**: `GITHUB_TOKEN`은 GitHub Secrets에 **추가하지 않습니다**!

---

## 3. 로컬 개발 환경

### 3.1 .env 파일 생성

```bash
# 프로젝트 루트에 .env 파일 생성
touch .env
```

### 3.2 .env 템플릿

```bash
# ============================================================
# GitHub API 인증 (로컬 개발용)
# ============================================================
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx  # Personal Access Token 생성 필요
TARGET_REPO_OWNER=your-username
TARGET_REPO_NAME1=portfolio
TARGET_REPO_NAME2=NLP-portfolio

# ============================================================
# Supabase 연결
# ============================================================
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # Frontend용 (읽기 전용)

# ============================================================
# LLM API Keys
# ============================================================
# Primary (유료)
CLAUDE_API_KEY=sk-ant-api03-xxx

# Fallback 1 (무료)
GEMINI_API_KEY=AIzaSyXXX

# Fallback 2 (무료, 선택 사항)
HUGGINGFACE_API_KEY=hf_xxx

# 현재 사용 중 (향후 제거)
OPENAI_API_KEY=sk-proj-xxx

# ============================================================
# 벡터 파일 경로
# ============================================================
# 로컬 파일 경로 (기본값)
# VECTOR_FILE_URL=output/embeddings.json.gz

# 또는 GitHub Raw URL (프로덕션과 동일하게 테스트)
# VECTOR_FILE_URL=https://raw.githubusercontent.com/username/NLP-portfolio/main/output/embeddings.json.gz

# ============================================================
# 런타임 환경 (선택 사항)
# ============================================================
NODE_ENV=development
PORT=3001  # API 서버 포트
```

### 3.3 Personal Access Token (PAT) 생성

1. GitHub → Settings → Developer settings
2. Personal access tokens → Tokens (classic) → Generate new token
3. 권한 선택:
   - ✅ `repo` (Full control of private repositories)
4. 생성된 토큰을 `.env`에 추가:
   ```bash
   GITHUB_TOKEN=ghp_생성된토큰
   ```

### 3.4 .gitignore 확인

```bash
# .gitignore에 .env 추가 확인
.env
.env.local
.env.*.local
```

---

## 4. Vercel 프로덕션

### 4.1 설정 경로

```
Vercel Dashboard → Project → Settings → Environment Variables
```

### 4.2 Production 환경 변수

```bash
# ============================================================
# Supabase 연결
# ============================================================
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ============================================================
# LLM API Keys
# ============================================================
CLAUDE_API_KEY=sk-ant-api03-xxx
GEMINI_API_KEY=AIzaSyXXX
HUGGINGFACE_API_KEY=hf_xxx  # 선택 사항

# ============================================================
# 벡터 파일 경로 (GitHub Raw URL)
# ============================================================
VECTOR_FILE_URL=https://raw.githubusercontent.com/username/NLP-portfolio/main/output/embeddings.json.gz

# ============================================================
# 프론트엔드 빌드 환경
# ============================================================
VITE_API_URL=https://your-api.vercel.app
NODE_ENV=production
```

**주의사항**:
- `SUPABASE_SERVICE_ROLE_KEY`는 **백엔드에만 설정** (프론트엔드 노출 금지)
- `GITHUB_TOKEN`은 Vercel에 설정하지 않음 (CI 전용)

---

## 5. 환경 변수 체크리스트

### 5.1 GitHub Actions

- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `CLAUDE_API_KEY`
- [ ] `GEMINI_API_KEY`
- [ ] `HUGGINGFACE_API_KEY` (선택)
- [ ] ~~`GITHUB_TOKEN`~~ (자동 제공, 설정 불필요)

### 5.2 로컬 개발

- [ ] `GITHUB_TOKEN` (Personal Access Token)
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `SUPABASE_ANON_KEY`
- [ ] `CLAUDE_API_KEY`
- [ ] `GEMINI_API_KEY`
- [ ] `TARGET_REPO_OWNER`
- [ ] `.env` 파일이 `.gitignore`에 포함되어 있는지 확인

### 5.3 Vercel Production

- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_ANON_KEY` (프론트엔드용)
- [ ] `CLAUDE_API_KEY`
- [ ] `GEMINI_API_KEY`
- [ ] `VECTOR_FILE_URL` (GitHub Raw URL)
- [ ] `VITE_API_URL`

---

## 6. 보안 권장 사항

### 6.1 API 키 관리

✅ **DO**:
- GitHub Secrets 사용 (CI)
- Vercel Environment Variables 사용 (Production)
- `.env` 파일 git ignore

❌ **DON'T**:
- API 키를 코드에 하드코딩
- `.env` 파일을 Git에 커밋
- 프론트엔드에 Service Role Key 노출

### 6.2 Supabase 권한 분리

| 키 | 용도 | 노출 가능 여부 |
|---|------|---------------|
| `SUPABASE_SERVICE_ROLE_KEY` | 백엔드 (CI, API Server) | ❌ 비공개 |
| `SUPABASE_ANON_KEY` | 프론트엔드 (읽기 전용) | ✅ 공개 가능 |

### 6.3 환경 변수 검증

```typescript
// src/config/env.ts
export function validateEnv() {
  const required = [
    'SUPABASE_URL',
    'CLAUDE_API_KEY',
    'GEMINI_API_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}
```

---

## 📚 관련 문서

- [시스템 아키텍처](./01_System_Architecture.md)
- [GitHub Actions 워크플로우](../04_ci-cd/01_Workflows.md)

---

**문서 작성 완료**: 2026-01-03 10:40 KST

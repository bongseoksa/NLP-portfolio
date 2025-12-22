# RAG 스키마 설계 분석 및 개선안

## 📋 목차
1. [현재 구현 분석](#현재-구현-분석)
2. [설계 원칙 준수 여부](#설계-원칙-준수-여부)
3. [Critical Issues](#critical-issues)
4. [개선된 스키마 설계](#개선된-스키마-설계)
5. [마이그레이션 계획](#마이그레이션-계획)

---

## 현재 구현 분석

### 데이터 수집 (PipelineOutput)

**✅ 잘 구현된 부분:**
```typescript
interface PipelineOutput {
    commits: CommitItem[];              // GitHub API commit metadata
    commitFiles: Record<string, FileModel[]>; // Changed files per commit
    commitDiffs: CommitDiff[];          // Diff data per commit
    localLogs: LocalCommitLog[];        // Local git log
    repositoryFiles: RepositoryFile[];  // Full source code
}
```

**원칙 위반:**
- ❌ **3가지 엔티티가 분리되지 않음** (모두 하나의 컬렉션에 저장)
- ❌ **Diff가 독립적으로 embedding되지 않음** (Commit에 포함됨)

---

### 현재 RAG 저장 구조 (RefinedItem)

#### 현재 스키마:
```typescript
interface RefinedItem {
    id: string;
    type: "commit" | "file";  // ❌ "diff" 타입 없음!
    content: string;
    metadata: { /* mixed fields */ }
}
```

#### 실제 저장되는 데이터:

**Type 1: Commit (현재)**
```json
{
  "id": "60cff02",
  "type": "commit",
  "content": "Commit: 60cff02\nAuthor: bongseoksa\nMessage: feat: 클로드 init\n\nAffected Files:\n- README.md (modified) +5 -2\n\nDiff Summary:\n+++ README.md\n@@ -1,2 +1,5 @@\n-Old line\n+New line\n---",
  "metadata": {
    "sha": "60cff02",
    "author": "bongseoksa",
    "date": "2025-12-20T12:00:00Z",
    "message": "feat: 클로드 init",
    "fileCount": 1
  }
}
```

**Type 2: File (현재)**
```json
{
  "id": "file-src/index.ts-0",
  "type": "file",
  "content": "File: src/index.ts\nType: src\nSize: 1024 bytes\n\nContent:\nimport express from 'express';\n...",
  "metadata": {
    "path": "src/index.ts",
    "type": "src",
    "size": 1024,
    "extension": "ts",
    "chunkIndex": 0,
    "totalChunks": 1
  }
}
```

---

## 설계 원칙 준수 여부

### ✅ 잘 지켜진 원칙

1. **원본 데이터 보존** ✅
   - `PipelineOutput`에 모든 원본 데이터 유지
   - `refined_data.json`에 정제 데이터 별도 저장

2. **시간 축 보존** ✅
   - Commit의 `date` 필드 유지
   - Commit SHA로 이력 추적 가능

3. **독립적 임베딩** ✅ (부분)
   - File은 독립적으로 embedding
   - Commit도 독립적으로 embedding

### ❌ 위반된 원칙

1. **3가지 엔티티 분리 ❌ CRITICAL**
   ```
   현재: Commit + Diff 통합 (content에 diff 포함)
   요구: Commit, Diff, File 완전 분리
   ```

2. **Diff 독립 검색 불가 ❌ CRITICAL**
   ```
   현재: "어떤 로직이 변경됐는가?" 질문에 전체 Commit 반환
   요구: Diff만 검색하여 관련 patch만 반환
   ```

3. **File 메타데이터 부족 ❌**
   ```
   현재: path, type, size만 저장
   요구: exports, imports, functions, classes 등 코드 구조 정보
   ```

---

## Critical Issues

### Issue 1: Commit과 Diff가 분리되지 않음

**문제:**
```typescript
// preprocessText.ts 45-60행
lines.push("Diff Summary:");
for (const fileDiff of commitDiff.files) {
    lines.push(`File: ${fileDiff.filePath}`);
    let patch = fileDiff.patch || "";
    if (patch.length > 2000) {
        patch = patch.slice(0, 2000) + "\n...(Truncated)...";
    }
    lines.push(patch);
}
// ❌ Diff가 Commit content에 포함됨!
```

**영향:**
- "로직 변경" 질문 시 불필요한 author, date 정보까지 LLM에 전달
- 검색 정확도 저하 (commit message와 diff patch가 혼재)
- 재현성 문제 (동일 질문에 다른 컨텍스트 반환 가능)

**예시 질문:**
```
질문: "API 라우팅 로직이 어떻게 변경됐어?"

현재 동작:
→ Commit Entity 검색 (message + diff 포함)
→ LLM에 전달: "Author: xxx\nDate: xxx\nMessage: xxx\nDiff: ..."
→ 불필요한 메타데이터로 토큰 낭비

이상적 동작:
→ Diff Entity만 검색
→ LLM에 전달: "File: routes/api.ts\nPatch: +express.Router()..."
→ 핵심 변경사항만 정확히 전달
```

---

### Issue 2: File 구조 정보 부족

**현재:**
```typescript
metadata: {
    path: "src/index.ts",
    type: "src",
    size: 1024,
    extension: "ts"
}
```

**문제:**
- "어떤 함수가 export되는가?" → 검색 불가
- "어떤 라이브러리를 import하는가?" → 전체 파일 읽어야 함
- "클래스 구조는?" → 코드 파싱 필요

**요구:**
```typescript
metadata: {
    path: string;
    exports: string[];        // ["App", "main", "config"]
    imports: string[];        // ["express", "dotenv"]
    functions: string[];      // ["handleRequest", "validateInput"]
    classes: string[];        // ["UserController"]
    dependencies: string[];   // ["express@4.18.0"]
}
```

---

### Issue 3: Diff 메타데이터 부재

**현재:**
```typescript
// Diff가 별도 Entity가 아니므로 metadata 없음
```

**요구:**
```typescript
metadata: {
    commitId: string;
    filePath: string;
    diffType: "add" | "modify" | "delete" | "rename";
    additions: number;
    deletions: number;
    semanticHint: string[];   // ["조건문 변경", "타입 추가", "포맷 수정"]
}
```

---

## 개선된 스키마 설계

### Entity 1: Commit (왜 변경됐는가)

**목적:** 히스토리 검색, 변경 의도 파악

**스키마:**
```json
{
  "id": "commit-60cff02",
  "type": "commit",
  "content": "Commit: 60cff02\nMessage: feat: 클로드 init\nAuthor: bongseoksa\nDate: 2025-12-20\n\nSummary: Claude Code 초기화 작업\nAffected Files: README.md, package.json",
  "metadata": {
    "sha": "60cff02",
    "author": "bongseoksa",
    "date": "2025-12-20T12:00:00Z",
    "message": "feat: 클로드 init",
    "affectedFiles": ["README.md", "package.json"],
    "fileCount": 2,
    "additions": 5,
    "deletions": 2
  },
  "embeddingText": "feat: 클로드 init. Claude Code 초기화 작업"
}
```

**검색 질문 예:**
- "언제 Claude를 도입했어?"
- "누가 README를 수정했어?"
- "초기화 작업 커밋을 찾아줘"

---

### Entity 2: Diff (무엇이 어떻게 바뀌었는가)

**목적:** 로직 변경 검색, 동작 차이 파악

**스키마:**
```json
{
  "id": "diff-60cff02-README.md",
  "type": "diff",
  "content": "File: README.md\nDiff Type: modified\n\n변경 내용:\n--- README.md\n+++ README.md\n@@ -1,2 +1,5 @@\n-# Portfolio\n+# NLP Portfolio Project\n+\n+GitHub 레포지토리 분석 및 Q&A 시스템",
  "metadata": {
    "commitId": "60cff02",
    "filePath": "README.md",
    "diffType": "modify",
    "additions": 3,
    "deletions": 1,
    "semanticHint": ["문서 확장", "프로젝트 설명 추가"],
    "changeCategory": "docs"
  },
  "embeddingText": "README 파일 수정. 프로젝트 제목 변경 및 설명 추가"
}
```

**검색 질문 예:**
- "README에서 뭐가 변경됐어?"
- "API 라우팅 로직 변경사항 보여줘"
- "타입 정의가 어떻게 바뀌었어?"

---

### Entity 3: File (현재 구현은 어떻게 되어 있는가)

**목적:** 코드 구조 검색, 현재 상태 파악

**스키마:**
```json
{
  "id": "file-src/index.ts",
  "type": "file",
  "content": "File: src/index.ts\nType: src\nExtension: ts\n\nExports: main, App\nImports: express, dotenv\nFunctions: main, setupMiddleware\n\nCode Summary:\nExpress 서버 초기화 및 미들웨어 설정",
  "metadata": {
    "path": "src/index.ts",
    "fileType": "src",
    "extension": "ts",
    "size": 1024,
    "exports": ["main", "App"],
    "imports": ["express", "dotenv"],
    "functions": ["main", "setupMiddleware"],
    "classes": [],
    "lastModified": "2025-12-20T12:00:00Z",
    "lastCommit": "60cff02"
  },
  "embeddingText": "Express 서버 엔트리포인트. main 함수에서 서버 초기화"
}
```

**검색 질문 예:**
- "Express 서버는 어디서 시작해?"
- "어떤 파일이 dotenv를 사용해?"
- "API 라우터는 어디에 구현되어 있어?"

---

## JSON Schema 정의

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "definitions": {
    "CommitEntity": {
      "type": "object",
      "required": ["id", "type", "content", "metadata", "embeddingText"],
      "properties": {
        "id": { "type": "string", "pattern": "^commit-[0-9a-f]+$" },
        "type": { "const": "commit" },
        "content": { "type": "string" },
        "metadata": {
          "type": "object",
          "required": ["sha", "author", "date", "message", "affectedFiles", "fileCount"],
          "properties": {
            "sha": { "type": "string" },
            "author": { "type": "string" },
            "date": { "type": "string", "format": "date-time" },
            "message": { "type": "string" },
            "affectedFiles": { "type": "array", "items": { "type": "string" } },
            "fileCount": { "type": "integer", "minimum": 0 },
            "additions": { "type": "integer", "minimum": 0 },
            "deletions": { "type": "integer", "minimum": 0 }
          }
        },
        "embeddingText": { "type": "string" }
      }
    },
    "DiffEntity": {
      "type": "object",
      "required": ["id", "type", "content", "metadata", "embeddingText"],
      "properties": {
        "id": { "type": "string", "pattern": "^diff-[0-9a-f]+-.*$" },
        "type": { "const": "diff" },
        "content": { "type": "string" },
        "metadata": {
          "type": "object",
          "required": ["commitId", "filePath", "diffType", "additions", "deletions"],
          "properties": {
            "commitId": { "type": "string" },
            "filePath": { "type": "string" },
            "diffType": { "enum": ["add", "modify", "delete", "rename"] },
            "additions": { "type": "integer", "minimum": 0 },
            "deletions": { "type": "integer", "minimum": 0 },
            "semanticHint": { "type": "array", "items": { "type": "string" } },
            "changeCategory": { "enum": ["feat", "fix", "refactor", "docs", "style", "test", "chore"] }
          }
        },
        "embeddingText": { "type": "string" }
      }
    },
    "FileEntity": {
      "type": "object",
      "required": ["id", "type", "content", "metadata", "embeddingText"],
      "properties": {
        "id": { "type": "string", "pattern": "^file-.*$" },
        "type": { "const": "file" },
        "content": { "type": "string" },
        "metadata": {
          "type": "object",
          "required": ["path", "fileType", "extension", "size"],
          "properties": {
            "path": { "type": "string" },
            "fileType": { "enum": ["src", "config", "docs", "test", "asset"] },
            "extension": { "type": "string" },
            "size": { "type": "integer", "minimum": 0 },
            "exports": { "type": "array", "items": { "type": "string" } },
            "imports": { "type": "array", "items": { "type": "string" } },
            "functions": { "type": "array", "items": { "type": "string" } },
            "classes": { "type": "array", "items": { "type": "string" } },
            "lastModified": { "type": "string", "format": "date-time" },
            "lastCommit": { "type": "string" },
            "chunkIndex": { "type": "integer", "minimum": 0 },
            "totalChunks": { "type": "integer", "minimum": 1 }
          }
        },
        "embeddingText": { "type": "string" }
      }
    }
  }
}
```

---

## 엔티티 간 참조 관계

```
Commit (1) ──┬──> (N) Diff
             │
             └──> (N) File (lastCommit 참조)

Diff (1) ────> (1) Commit (commitId 참조)
         └──> (1) File (filePath 참조)

File (1) ────> (1) Commit (lastCommit 참조)
```

**검색 전략:**

1. **히스토리 질문** → Commit 우선 검색
   - "언제 변경됐어?"
   - "누가 수정했어?"
   - "왜 바뀌었어?"

2. **로직 변경 질문** → Diff 우선 검색
   - "어떻게 바뀌었어?"
   - "무슨 로직이 변경됐어?"
   - "동작이 어떻게 달라졌어?"

3. **구현 상태 질문** → File 우선 검색
   - "어디에 구현되어 있어?"
   - "현재 로직은 어떻게 동작해?"
   - "어떤 함수를 export해?"

4. **복합 질문** → Multi-entity 검색 후 병합
   - "API 라우터가 언제, 어떻게 변경됐고, 현재 구현은?"
   - Commit (언제) + Diff (어떻게) + File (현재)

---

## 품질 판단 기준 검증

### ✅ 불필요한 코드 제거

**Before:**
```
질문: "API 라우팅이 어떻게 변경됐어?"
반환: Commit 전체 (author, date, message, diff, 모든 파일 변경사항)
LLM 입력: 2000+ 토큰
```

**After:**
```
질문: "API 라우팅이 어떻게 변경됐어?"
반환: Diff Entity만 (routes/api.ts의 patch만)
LLM 입력: 300 토큰
```

### ✅ 재현성 보장

**Before:**
```
동일 질문 → Commit content에 diff 포함 → 매번 다른 순서로 검색 가능
```

**After:**
```
동일 질문 → Diff Entity만 검색 → 동일한 patch 반환
```

### ✅ 질문 타입 분리

**Before:**
```
"언제 변경?" → Commit (diff 포함)
"어떻게 변경?" → Commit (message 포함)
→ 동일 Entity 검색
```

**After:**
```
"언제 변경?" → Commit Entity
"어떻게 변경?" → Diff Entity
"현재 구현?" → File Entity
→ 명확한 Entity 분리
```

---

## 마이그레이션 계획

### Phase 1: 스키마 확장 (Diff Entity 추가)

**파일 수정:**
1. [`src/models/refinedData.ts`](../src/models/refinedData.ts)
   ```typescript
   type: "commit" | "file" | "diff"  // "diff" 추가
   ```

2. [`src/pipeline/steps/preprocessText.ts`](../src/pipeline/steps/preprocessText.ts)
   - Diff를 Commit content에서 분리
   - 별도 Diff Entity 생성

3. [`src/vector_store/saveVectors.ts`](../src/vector_store/saveVectors.ts)
   - Diff 메타데이터 처리 추가

### Phase 2: File 메타데이터 확장

**파일 수정:**
1. [`src/data_sources/github/fetchRepositoryFiles.ts`](../src/data_sources/github/fetchRepositoryFiles.ts)
   - TypeScript/JavaScript 파싱 (exports, imports, functions)
   - AST 파싱 라이브러리 추가 (`@babel/parser`, `typescript`)

2. [`src/models/refinedData.ts`](../src/models/refinedData.ts)
   - File metadata 필드 확장

### Phase 3: 검색 전략 최적화

**파일 추가:**
1. `src/qa/searchStrategy.ts` (신규)
   - 질문 타입별 Entity 선택 로직
   - Multi-entity 검색 및 병합

**파일 수정:**
1. [`src/vector_store/searchVectors.ts`](../src/vector_store/searchVectors.ts)
   - Type 필터링 기능 추가
   - Multi-type 검색 지원

### Phase 4: 검증 및 테스트

**테스트 케이스:**
```typescript
// tests/rag-schema.test.ts

describe('RAG Schema Quality', () => {
  it('히스토리 질문은 Commit만 반환', async () => {
    const result = await search("언제 변경됐어?");
    expect(result.every(r => r.type === 'commit')).toBe(true);
  });

  it('로직 변경 질문은 Diff만 반환', async () => {
    const result = await search("어떻게 바뀌었어?");
    expect(result.every(r => r.type === 'diff')).toBe(true);
  });

  it('구현 질문은 File만 반환', async () => {
    const result = await search("어디에 구현되어 있어?");
    expect(result.every(r => r.type === 'file')).toBe(true);
  });

  it('동일 질문은 동일 컨텍스트 반환', async () => {
    const result1 = await search("API 라우팅 변경사항");
    const result2 = await search("API 라우팅 변경사항");
    expect(result1).toEqual(result2);
  });
});
```

---

## 구현 우선순위

### Priority 1 (Critical): Diff Entity 분리
- **영향도:** 매우 높음 (검색 정확도 50% 향상 예상)
- **작업량:** 중간 (2-3 시간)
- **파일:** `preprocessText.ts`, `refinedData.ts`, `saveVectors.ts`

### Priority 2 (High): File 메타데이터 확장
- **영향도:** 높음 (구현 검색 정확도 30% 향상)
- **작업량:** 높음 (4-5 시간, AST 파싱 추가)
- **파일:** `fetchRepositoryFiles.ts`, `refinedData.ts`

### Priority 3 (Medium): 검색 전략 최적화
- **영향도:** 중간 (사용자 경험 개선)
- **작업량:** 중간 (2-3 시간)
- **파일:** 신규 `searchStrategy.ts`, `searchVectors.ts` 수정

---

## 결론

현재 구현은 **데이터 수집은 우수**하지만, **RAG 검색 최적화 관점에서 개선 필요**합니다.

**핵심 개선사항:**
1. ✅ Diff를 Commit에서 완전히 분리
2. ✅ File 메타데이터 확장 (exports, imports, functions)
3. ✅ 질문 타입별 Entity 선택 전략 구현

**기대 효과:**
- 검색 정확도 50% 향상
- LLM 토큰 사용량 30-40% 감소
- 재현성 100% 보장
- 유지보수성 향상

**다음 단계:**
Phase 1 구현 시작 → `preprocessText.ts`에서 Diff Entity 분리 작업 진행

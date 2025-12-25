# Commit / Diff / File Embedding 전략 설계

## 📋 목차
1. [전체 설계 원칙](#전체-설계-원칙)
2. [Commit Embedding 전략](#1-commit-embedding-전략)
3. [Diff Embedding 전략](#2-diff-embedding-전략)
4. [File Embedding 전략](#3-file-embedding-전략)
5. [질문 → Entity 매핑](#질문--entity-매핑)
6. [구현 가이드](#구현-가이드)
7. [품질 검증](#품질-검증)

---

## 전체 설계 원칙

### ✅ 핵심 원칙

1. **Embedding 단위 = 검색 단위**
   - 하나의 Entity = 하나의 Embedding Vector
   - Commit, Diff, File 각각 독립적으로 embedding

2. **의미 밀도가 다른 데이터는 분리**
   - Commit: 의도/맥락 (낮은 밀도, 추상적)
   - Diff: 구현 변화 (중간 밀도, 구체적)
   - File: 현재 상태 (높은 밀도, 매우 구체적)

3. **코드는 그대로 embedding 하지 않는다**
   - Raw code → 자연어 설명으로 변환
   - Patch → "무엇이 어떻게 바뀌었는지" 설명

4. **사람이 질문할 법한 문장 형태로 변환**
   - ❌ "function formatDate(date: string): string"
   - ✅ "This function formats a date string to yyyy-MM-dd format"

### 🎯 목표

- **검색 정확도**: 질문 의도와 정확히 일치하는 Entity만 검색
- **재현성**: 동일 질문 → 동일 검색 결과
- **일관성**: 질문이 바뀌어도 검색 대상 일관

---

## 1. Commit Embedding 전략

### 🎯 목적
**"의도 / 맥락 / 이유" 중심 검색**

### 📝 Embedding 대상

| 구성 요소 | 포함 여부 | 이유 |
|---------|----------|------|
| Commit Message | ✅ 포함 | 변경 의도 직접 표현 |
| Author | ❌ 제외 | 검색과 무관 (metadata로만 저장) |
| Date | ❌ 제외 | 검색과 무관 (metadata로만 저장) |
| 변경 파일 목록 | ✅ 포함 | 영향 범위 파악 |
| Diff 내용 | ❌ 제외 | Diff Entity에서 별도 처리 |
| 변경 목적 요약 | ✅ 포함 | 자동 생성 또는 규칙 기반 |

### 🔧 Embedding Text 생성 규칙

```typescript
// Template
`
This commit ${purpose} for ${scope}.
Changed files: ${fileList}.
${additionalContext}
`

// 실제 예시
`
This commit adds Claude Code integration to initialize the project setup.
Changed files: README.md, package.json, .gitignore.
This update introduces AI-powered code assistance and documentation generation.
`
```

### 📐 생성 로직

```typescript
function generateCommitEmbeddingText(commit: CommitData): string {
    const message = commit.message;
    const files = commit.affectedFiles.join(', ');

    // 커밋 메시지에서 목적 추출
    const purpose = extractPurpose(message); // "adds", "fixes", "updates"
    const scope = extractScope(message);     // "authentication", "API routing"

    // 변경 범위 요약
    const changeScope = summarizeChangeScope(commit.affectedFiles);

    return `
This commit ${purpose} ${scope}.
Changed files: ${files}.
${changeScope}
    `.trim();
}

// 예시 구현
function extractPurpose(message: string): string {
    const lower = message.toLowerCase();

    if (lower.includes('feat:') || lower.includes('add')) return 'adds';
    if (lower.includes('fix:')) return 'fixes';
    if (lower.includes('update') || lower.includes('modify')) return 'updates';
    if (lower.includes('remove') || lower.includes('delete')) return 'removes';
    if (lower.includes('refactor')) return 'refactors';

    return 'modifies';
}

function summarizeChangeScope(files: string[]): string {
    const fileTypes = categorizeFiles(files);

    if (fileTypes.src > 0 && fileTypes.test > 0) {
        return 'This update affects both source code and tests.';
    }
    if (fileTypes.docs > 0) {
        return 'This update focuses on documentation.';
    }
    if (fileTypes.config > 0) {
        return 'This update modifies project configuration.';
    }

    return '';
}
```

### ✅ 적합한 질문 유형

```
✅ "언제 Claude를 도입했어?"
✅ "누가 README를 수정했어?"
✅ "왜 API 라우팅을 변경했어?"
✅ "어떤 목적으로 이 기능을 추가했어?"
✅ "프로젝트 초기화 작업은 언제 했어?"
```

### ❌ 부적합한 질문 유형

```
❌ "API 라우팅이 어떻게 바뀌었어?" → Diff Entity
❌ "현재 API는 어디에 구현되어 있어?" → File Entity
❌ "어떤 함수가 추가됐어?" → Diff Entity
```

---

## 2. Diff Embedding 전략

### 🎯 목적
**"구현 변화" 중심 검색**

### 📝 Embedding 대상

| 구성 요소 | 포함 여부 | 이유 |
|---------|----------|------|
| 파일 경로 | ✅ 포함 | 변경 위치 명확화 |
| Diff Patch (Raw) | ❌ 제외 | 코드 그대로는 검색 정확도 저하 |
| 변경 요약 | ✅ 포함 | "무엇이 어떻게" 자연어 설명 |
| 변경 전/후 차이 | ✅ 포함 | 동작 차이 명확화 |
| Semantic Hint | ✅ 포함 | "조건문 변경", "의존성 추가" 등 |

### 🔧 Embedding Text 생성 규칙

```typescript
// Template
`
Changed ${fileName}: ${changeType}.
${beforeAfterSummary}
${semanticHints}
`

// 실제 예시
`
Changed routes/api.ts: added new API endpoint.
Before: No API routing existed.
After: Implemented GET /api/data endpoint with Express router.
Semantic changes: Added import statements, defined new functions, added route handlers.
`
```

### 📐 생성 로직

```typescript
function generateDiffEmbeddingText(diff: DiffData): string {
    const fileName = diff.filePath.split('/').pop() || diff.filePath;
    const changeType = describeChangeType(diff);
    const beforeAfter = extractBeforeAfter(diff.patch);
    const hints = diff.semanticHint?.join(', ') || '';

    return `
Changed ${fileName}: ${changeType}.
${beforeAfter}
${hints ? `Semantic changes: ${hints}.` : ''}
    `.trim();
}

function describeChangeType(diff: DiffData): string {
    const { diffType, fileAdditions, fileDeletions } = diff;

    if (diffType === 'add') {
        return 'newly added file';
    }
    if (diffType === 'delete') {
        return 'file deleted';
    }
    if (fileAdditions > fileDeletions * 2) {
        return 'major additions';
    }
    if (fileDeletions > fileAdditions * 2) {
        return 'major deletions';
    }

    return 'modified with balanced changes';
}

function extractBeforeAfter(patch: string): string {
    // Diff patch에서 실제 변경사항 추출
    const lines = patch.split('\n');
    const removed = lines.filter(l => l.startsWith('-') && !l.startsWith('---'));
    const added = lines.filter(l => l.startsWith('+') && !l.startsWith('+++'));

    if (removed.length === 0 && added.length > 0) {
        return `Added: ${summarizeCode(added[0])}.`;
    }
    if (added.length === 0 && removed.length > 0) {
        return `Removed: ${summarizeCode(removed[0])}.`;
    }
    if (removed.length > 0 && added.length > 0) {
        return `Changed from "${summarizeCode(removed[0])}" to "${summarizeCode(added[0])}".`;
    }

    return '';
}

function summarizeCode(codeLine: string): string {
    // 코드 라인을 자연어로 요약
    const clean = codeLine.replace(/^[+-]\s*/, '').trim();

    if (clean.includes('import ')) {
        const match = clean.match(/import\s+.*\s+from\s+['"](.+)['"]/);
        return match ? `imported ${match[1]}` : 'import statement';
    }
    if (clean.includes('export ')) {
        return 'export statement';
    }
    if (clean.includes('function ') || clean.includes('const ') || clean.includes('let ')) {
        const match = clean.match(/(?:function|const|let)\s+(\w+)/);
        return match ? `defined ${match[1]}` : 'function/variable definition';
    }
    if (clean.includes('if (') || clean.includes('if(')) {
        return 'conditional logic';
    }

    // 너무 길면 자르기
    return clean.length > 50 ? clean.substring(0, 50) + '...' : clean;
}
```

### ✅ 적합한 질문 유형

```
✅ "API 라우팅이 어떻게 변경됐어?"
✅ "README에서 무엇이 바뀌었어?"
✅ "날짜 포맷 로직이 어떻게 수정됐어?"
✅ "어떤 함수가 추가됐어?"
✅ "이전 버전과 현재 버전의 차이는?"
```

### ❌ 부적합한 질문 유형

```
❌ "언제 변경했어?" → Commit Entity
❌ "왜 변경했어?" → Commit Entity
❌ "현재 구현은 어떻게 되어 있어?" → File Entity
```

---

## 3. File Embedding 전략

### 🎯 목적
**"현재 구현 상태" 검색**

### 📝 Embedding 대상

| 구성 요소 | 포함 여부 | 이유 |
|---------|----------|------|
| 파일 전체 코드 | ❌ 제외 | 코드 그대로는 검색 정확도 저하 |
| 파일 역할 설명 | ✅ 포함 | "무엇을 하는 파일인지" |
| 주요 함수 요약 | ✅ 포함 | 핵심 기능 설명 |
| Export 목록 | ✅ 포함 | 외부 노출 API |
| Import 목록 | ✅ 포함 | 의존성 파악 |
| 기술 스택 | ✅ 포함 | React, Express 등 |

### 🔧 Embedding Text 생성 규칙

```typescript
// Template
`
This file ${role} located at ${path}.
Exports: ${exports}.
Imports: ${mainImports}.
Key functions: ${functions}.
Uses: ${techStack}.
`

// 실제 예시
`
This file implements the Express API server located at src/server/index.ts.
Exports: app, startServer.
Imports: express, dotenv, cors.
Key functions: startServer initializes the Express app and sets up middleware.
Uses: Express.js, TypeScript, CORS middleware.
`
```

### 📐 생성 로직

```typescript
function generateFileEmbeddingText(file: FileData): string {
    const role = inferFileRole(file.path, file.content);
    const exports = file.exports?.join(', ') || 'none';
    const imports = file.imports?.slice(0, 5).join(', ') || 'none';
    const functions = file.functions?.slice(0, 3).join(', ') || 'none';
    const techStack = detectTechStack(file.imports);

    return `
This file ${role} located at ${file.path}.
Exports: ${exports}.
Imports: ${imports}.
Key functions: ${functions}.
Uses: ${techStack}.
    `.trim();
}

function inferFileRole(path: string, content: string): string {
    const fileName = path.split('/').pop() || '';
    const lower = content.toLowerCase();

    // 파일명 기반 추론
    if (fileName === 'index.ts' || fileName === 'index.tsx') {
        if (path.includes('server')) return 'implements the server entry point';
        if (path.includes('components')) return 'exports React components';
        return 'serves as the main entry point';
    }

    if (fileName.endsWith('.test.ts') || fileName.endsWith('.spec.ts')) {
        return 'contains test cases';
    }

    if (fileName === 'package.json') {
        return 'defines project dependencies and scripts';
    }

    // 내용 기반 추론
    if (lower.includes('router') || lower.includes('route')) {
        return 'defines API routes';
    }

    if (lower.includes('export default') && lower.includes('component')) {
        return 'implements a React component';
    }

    if (lower.includes('interface') || lower.includes('type ')) {
        return 'defines TypeScript types and interfaces';
    }

    return 'contains implementation code';
}

function detectTechStack(imports: string[] = []): string {
    const stack: string[] = [];

    if (imports.includes('react')) stack.push('React');
    if (imports.includes('express')) stack.push('Express.js');
    if (imports.includes('next')) stack.push('Next.js');
    if (imports.some(i => i.includes('@supabase'))) stack.push('Supabase');
    if (imports.some(i => i.includes('chromadb'))) stack.push('ChromaDB');

    return stack.length > 0 ? stack.join(', ') : 'TypeScript';
}
```

### ✅ 적합한 질문 유형

```
✅ "Express 서버는 어디서 시작해?"
✅ "API 라우터는 어디에 구현되어 있어?"
✅ "어떤 파일이 Supabase를 사용해?"
✅ "React 컴포넌트는 어디에 정의되어 있어?"
✅ "현재 날짜 포맷 로직은 어디에 있어?"
```

### ❌ 부적합한 질문 유형

```
❌ "언제 구현했어?" → Commit Entity
❌ "어떻게 바뀌었어?" → Diff Entity
❌ "왜 이렇게 구현했어?" → Commit Entity
```

---

## 질문 → Entity 매핑

### 📊 매핑 테이블

| 질문 유형 | 키워드 | 우선 검색 대상 | 보조 검색 |
|---------|-------|-------------|----------|
| **변경 이유** | 왜, 목적, 이유, why, purpose | Commit | - |
| **언제 바뀜** | 언제, 시기, when, date | Commit | - |
| **어떻게 바뀜** | 어떻게, 무엇, 변경, change, modify | Diff | Commit |
| **현재 로직** | 어디, 현재, 구현, where, implement | File | - |
| **버그 원인** | 버그, 오류, bug, error | Diff | File |
| **기능 위치** | 위치, 어디, location, where | File | - |
| **히스토리** | 이력, 히스토리, history, 과거 | Commit | Diff |
| **구조 파악** | 구조, 아키텍처, structure | File | - |

### 🎯 검색 전략 예시

```typescript
// 질문 분석 → Entity 선택
const questionTypeMap = {
    // Single-entity 질문
    "언제 Claude를 도입했어?": ['commit'],
    "README가 어떻게 바뀌었어?": ['diff'],
    "Express 서버는 어디에 있어?": ['file'],

    // Multi-entity 질문
    "API 라우팅이 언제, 어떻게 변경됐어?": ['commit', 'diff'],
    "날짜 포맷 버그는 어떻게 수정됐고, 현재는?": ['diff', 'file'],
    "클로드 도입 시 어떤 파일이 변경됐고, 현재 구현은?": ['commit', 'diff', 'file']
};
```

---

## 구현 가이드

### 📁 파일 구조

```
src/
├── nlp/
│   └── embedding/
│       ├── embeddingTextGenerator.ts  ← ✅ NEW
│       └── openaiEmbedding.ts
├── pipeline/
│   └── steps/
│       └── preprocessText.ts          ← 수정
└── models/
    └── refinedData.ts                 ← 수정 (embeddingText 필드 추가)
```

### 🔧 구현 단계

#### Step 1: RefinedItem에 embeddingText 필드 추가

```typescript
// src/models/refinedData.ts
export interface RefinedItem {
    id: string;
    type: "commit" | "diff" | "file";
    content: string;           // 원본 텍스트 (저장용)
    embeddingText: string;     // ✅ 최적화된 embedding 텍스트
    metadata: { /* ... */ };
}
```

#### Step 2: Embedding Text Generator 구현

```typescript
// src/nlp/embedding/embeddingTextGenerator.ts
export function generateEmbeddingText(item: RefinedItem): string {
    switch (item.type) {
        case 'commit':
            return generateCommitEmbeddingText(item);
        case 'diff':
            return generateDiffEmbeddingText(item);
        case 'file':
            return generateFileEmbeddingText(item);
        default:
            return item.content; // fallback
    }
}
```

#### Step 3: preprocessText 수정

```typescript
// src/pipeline/steps/preprocessText.ts
import { generateEmbeddingText } from '../../nlp/embedding/embeddingTextGenerator.js';

export function refineData(data: PipelineOutput): RefinedData {
    const items: RefinedItem[] = [];

    // ... Commit, Diff, File Entity 생성 ...

    // ✅ 각 item에 embeddingText 추가
    items.forEach(item => {
        item.embeddingText = generateEmbeddingText(item);
    });

    return { items };
}
```

#### Step 4: Embedding 생성 시 embeddingText 사용

```typescript
// src/nlp/embedding/openaiEmbedding.ts
export async function generateEmbeddings(items: RefinedItem[]): Promise<number[][]> {
    // ❌ Before: item.content 사용
    // const texts = items.map(item => item.content);

    // ✅ After: item.embeddingText 사용
    const texts = items.map(item => item.embeddingText || item.content);

    // OpenAI API 호출
    return await fetchEmbeddings(texts);
}
```

### 🎯 Embedding 생성 시점

**수집 시 (Offline) ✅ 권장**
- 장점: 질의 시 latency 없음
- 장점: embedding 품질 일관성
- 단점: 재처리 필요 시 파이프라인 전체 재실행

**질의 시 (Online) ❌ 비권장**
- 장점: 최신 정보 반영
- 단점: 질의 latency 증가
- 단점: embedding 생성 비용 증가

**→ 결론: 수집 시 (pnpm run dev) embeddingText 생성**

### 📦 Vector DB 컬렉션 구조

**Option 1: 단일 컬렉션 (✅ 권장)**
```
Collection: portfolio-vectors
  - commit entities (metadata.type = 'commit')
  - diff entities (metadata.type = 'diff')
  - file entities (metadata.type = 'file')
```

**장점:**
- 관리 단순
- Multi-entity 검색 용이
- Type 필터링으로 분리 가능

**Option 2: 분리된 컬렉션 (❌ 비권장)**
```
Collection: portfolio-vectors
Collection: portfolio-diffs
Collection: portfolio-files
```

**단점:**
- 관리 복잡
- Multi-entity 검색 시 여러 컬렉션 쿼리 필요
- 데이터 중복 가능성

**→ 결론: 단일 컬렉션 + metadata.type 필터링**

---

## 품질 검증

### ✅ 검증 기준

1. **질문 일관성**
   ```
   질문: "README가 어떻게 바뀌었어?"
   검색 대상: Diff Entity

   질문: "README 변경사항 알려줘"
   검색 대상: Diff Entity  ← 동일!
   ```

2. **사람 질문 형태 유사성**
   ```
   ❌ Bad: "function formatDate(date: string): string { ... }"
   ✅ Good: "This function formats a date string to yyyy-MM-dd format"
   ```

3. **Entity 분리 명확성**
   ```
   Diff 검색 시:
   ✅ diff-60cff02-README.md
   ✅ diff-abc1234-api.ts
   ❌ commit-60cff02 (포함되면 안됨!)
   ❌ file-src/index.ts (포함되면 안됨!)
   ```

### 🧪 테스트 케이스

```typescript
// scripts/test-embedding-quality.ts
const testCases = [
    {
        question: "언제 Claude를 도입했어?",
        expectedType: 'commit',
        expectedKeywords: ['Claude', 'init', 'introduce']
    },
    {
        question: "API 라우팅이 어떻게 변경됐어?",
        expectedType: 'diff',
        expectedKeywords: ['API', 'routing', 'changed']
    },
    {
        question: "Express 서버는 어디에 구현되어 있어?",
        expectedType: 'file',
        expectedKeywords: ['Express', 'server', 'implement']
    }
];

// 각 테스트 케이스에 대해:
// 1. 검색 수행
// 2. 반환된 Entity type 확인
// 3. Embedding text에 예상 키워드 포함 확인
// 4. 재현성 테스트 (동일 질문 10회 → 동일 결과)
```

### 📊 품질 메트릭

```typescript
// Embedding Text 품질 측정
interface EmbeddingQualityMetrics {
    // 1. 사람 질문 형태 유사도
    naturalLanguageScore: number;  // 0-1

    // 2. 키워드 밀도
    keywordDensity: number;        // relevant_keywords / total_words

    // 3. 평균 길이
    averageLength: number;         // words per embedding

    // 4. 재현성
    reproducibility: number;       // 0-1 (동일 질문 → 동일 결과)

    // 5. Entity 분리도
    entitySeparation: number;      // 0-1 (타입별 검색 정확도)
}
```

---

## 🎉 기대 효과

### Before (Raw Content Embedding)
```
Commit content:
"Commit: 60cff02
Author: bongseoksa
Date: 2025-12-20
Message: feat: Claude Code 초기화
Affected Files: README.md, package.json
Diff: +++ README.md @@ -1,2 +1,5 @@ ..."

→ 불필요한 정보 (Author, Date) 포함
→ 코드 그대로 embedding
→ 검색 정확도 낮음
```

### After (Optimized Embedding Text)
```
Commit embeddingText:
"This commit adds Claude Code integration to initialize the project setup.
Changed files: README.md, package.json.
This update introduces AI-powered code assistance."

→ 의도/맥락만 포함
→ 자연어 형태
→ 검색 정확도 높음
```

### 성능 향상

- ✅ **검색 정확도 60-70% 향상** (불필요한 정보 제거)
- ✅ **Embedding 품질 향상** (자연어 형태)
- ✅ **재현성 100%** (동일 질문 → 동일 context)
- ✅ **Entity 분리 명확** (Diff와 File 검색 결과 섞이지 않음)

---

## 🚀 다음 단계

1. ✅ **Embedding Text Generator 구현**
2. ✅ **preprocessText 수정**
3. ✅ **품질 테스트 스크립트 작성**
4. ✅ **파이프라인 재실행 및 검증**
5. ✅ **실제 질문으로 A/B 테스트**

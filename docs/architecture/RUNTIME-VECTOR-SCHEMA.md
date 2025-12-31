# Runtime Vector File Schema (Serverless)

> 서버리스 환경에서 빠른 로딩을 위한 벡터 파일 구조 설계
>
> **목표**: 코드 임베딩 + Q&A 히스토리 임베딩을 단일 파일로 통합, 메모리 효율적 검색

---

## 📋 목차

1. [디렉토리 구조](#디렉토리-구조)
2. [통합 벡터 파일 스키마](#통합-벡터-파일-스키마)
3. [코드 vs 히스토리 구분 방법](#코드-vs-히스토리-구분-방법)
4. [로딩 및 검색 전략](#로딩-및-검색-전략)
5. [파일 생성 파이프라인](#파일-생성-파이프라인)

---

## 디렉토리 구조

### Production (CDN 배포용)

```
embeddings/
├── vectors.json.gz              # 통합 벡터 파일 (코드 + 히스토리)
├── vectors-code-only.json.gz   # 코드만 (선택적)
├── vectors-qa-only.json.gz     # Q&A만 (선택적)
└── metadata.json                # 메타데이터 (버전, 통계)
```

**파일 크기 예상**:
```
코드 임베딩 (1,000 vectors):
- JSON: 6-7MB
- Gzip: 2-2.3MB

Q&A 히스토리 (500 vectors):
- JSON: 3-3.5MB
- Gzip: 1-1.2MB

통합 (1,500 vectors):
- JSON: 9-10.5MB
- Gzip: 3-3.5MB (압축률 ~67%)
```

---

### Development (로컬 빌드용)

```
output/
├── embeddings-code.json         # 코드 임베딩 (소스)
├── embeddings-qa.json           # Q&A 임베딩 (소스)
├── embeddings-merged.json       # 통합 파일 (빌드 결과)
└── embeddings-merged.json.gz    # 압축 파일 (배포용)
```

---

## 통합 벡터 파일 스키마

### vectors.json (통합)

```typescript
interface VectorFile {
  // 메타데이터
  version: string;              // 스키마 버전 (예: "2.0.0")
  createdAt: string;            // ISO 8601
  repository: {
    owner: string;
    name: string;
    url: string;
  };
  embedding: {
    model: string;              // "text-embedding-3-small"
    provider: string;           // "openai"
    dimension: number;          // 1536
  };

  // 통계
  statistics: {
    totalVectors: number;       // 전체 벡터 수
    codeVectors: number;        // 코드 임베딩 수
    qaVectors: number;          // Q&A 임베딩 수
    fileSize: number;           // 압축 전 바이트
    compressedSize: number;     // 압축 후 바이트
  };

  // 인덱스 (빠른 필터링용)
  index: {
    byType: {
      code: number[];           // 코드 벡터 인덱스 [0, 1, 2, ...]
      qa: number[];             // Q&A 벡터 인덱스 [1000, 1001, ...]
    };
    byCategory: {
      [category: string]: number[]; // 카테고리별 인덱스
    };
  };

  // 벡터 데이터
  vectors: Vector[];
}

interface Vector {
  // 기본 정보
  id: string;                   // 고유 ID
  type: "code" | "qa";          // 벡터 타입 (코드 vs Q&A)

  // 임베딩
  embedding: number[];          // 1536차원 벡터

  // 내용
  content: string;              // 원본 텍스트

  // 메타데이터 (타입별 다름)
  metadata: CodeMetadata | QAMetadata;

  // 검색 메타
  createdAt: string;            // 생성 시각
  score?: number;               // 검색 시 계산 (파일에는 없음)
}

// 코드 임베딩 메타데이터
interface CodeMetadata {
  type: "commit" | "diff" | "file"; // 코드 타입

  // Commit 타입
  sha?: string;
  message?: string;
  author?: string;
  date?: string;
  affectedFiles?: string[];

  // Diff 타입
  commitId?: string;
  filePath?: string;
  additions?: number;
  deletions?: number;

  // File 타입
  path?: string;
  fileType?: string;            // "src" | "config" | "docs"
  extension?: string;
  size?: number;
  chunkIndex?: number;

  // 공통
  owner: string;
  repo: string;
  branch?: string;
}

// Q&A 히스토리 메타데이터
interface QAMetadata {
  type: "question" | "answer" | "conversation"; // Q&A 타입

  // Question 타입
  question?: string;
  questionSummary?: string;
  category?: string;            // "tech_stack" | "implementation" | "history"
  categoryConfidence?: number;

  // Answer 타입
  answer?: string;
  answerSummary?: string;

  // Conversation 타입 (질문+답변 쌍)
  conversationId?: string;
  sessionId?: string;
  sources?: string[];           // 참조한 코드 커밋 SHA

  // 공통
  owner: string;
  repo: string;
  timestamp: string;
  responseTimeMs?: number;
  tokenUsage?: number;
}
```

---

### 실제 JSON 예시

```json
{
  "version": "2.0.0",
  "createdAt": "2025-12-31T12:00:00Z",
  "repository": {
    "owner": "username",
    "name": "repo-name",
    "url": "https://github.com/username/repo-name"
  },
  "embedding": {
    "model": "text-embedding-3-small",
    "provider": "openai",
    "dimension": 1536
  },
  "statistics": {
    "totalVectors": 1500,
    "codeVectors": 1000,
    "qaVectors": 500,
    "fileSize": 9500000,
    "compressedSize": 3200000
  },
  "index": {
    "byType": {
      "code": [0, 1, 2, 3, 4, ...],
      "qa": [1000, 1001, 1002, ...]
    },
    "byCategory": {
      "tech_stack": [1000, 1005, 1010],
      "implementation": [1001, 1006, 1011],
      "history": [1002, 1007, 1012]
    }
  },
  "vectors": [
    {
      "id": "commit-abc123",
      "type": "code",
      "embedding": [0.123, -0.456, 0.789, ...],
      "content": "feat: Add user authentication | Files: src/auth.ts, src/user.ts",
      "metadata": {
        "type": "commit",
        "sha": "abc123",
        "message": "feat: Add user authentication",
        "author": "username",
        "date": "2025-12-30T10:00:00Z",
        "affectedFiles": ["src/auth.ts", "src/user.ts"],
        "owner": "username",
        "repo": "repo-name",
        "branch": "main"
      },
      "createdAt": "2025-12-30T11:00:00Z"
    },
    {
      "id": "qa-conversation-uuid-1",
      "type": "qa",
      "embedding": [0.321, -0.654, 0.987, ...],
      "content": "Question: 이 프로젝트의 기술스택은? | Answer: React 19, TypeScript, Vite를 사용합니다.",
      "metadata": {
        "type": "conversation",
        "question": "이 프로젝트의 기술스택은?",
        "questionSummary": "기술스택 질문",
        "answer": "React 19, TypeScript, Vite를 사용합니다.",
        "answerSummary": "React 19, TypeScript, Vite",
        "category": "tech_stack",
        "categoryConfidence": 0.95,
        "conversationId": "uuid-1",
        "sessionId": "session-abc",
        "sources": ["abc123", "def456"],
        "owner": "username",
        "repo": "repo-name",
        "timestamp": "2025-12-31T09:00:00Z",
        "responseTimeMs": 2400,
        "tokenUsage": 1500
      },
      "createdAt": "2025-12-31T09:00:00Z"
    }
  ]
}
```

---

## 코드 vs 히스토리 구분 방법

### 1. Type 필드 (Primary)

```typescript
// 최상위 타입 구분
type: "code" | "qa"

// 서브 타입 구분 (metadata.type)
CodeMetadata.type: "commit" | "diff" | "file"
QAMetadata.type: "question" | "answer" | "conversation"
```

**검색 시 필터링**:
```typescript
// 코드만 검색
const codeVectors = vectors.filter(v => v.type === "code");

// Q&A만 검색
const qaVectors = vectors.filter(v => v.type === "qa");

// 전체 검색 (기본)
const allVectors = vectors;
```

---

### 2. Index 활용 (Fast Filtering)

```typescript
// index.byType 사용
interface VectorFile {
  index: {
    byType: {
      code: number[];  // [0, 1, 2, ..., 999]
      qa: number[];    // [1000, 1001, ..., 1499]
    };
  };
}

// 빠른 필터링 (O(1) 인덱스 접근)
function filterByType(vectors: Vector[], type: "code" | "qa", index: Index): Vector[] {
  const indices = index.byType[type];
  return indices.map(i => vectors[i]);
}

// 사용 예시
const codeVectors = filterByType(allVectors, "code", vectorFile.index);
// → 필터링 없이 인덱스로 직접 접근 (훨씬 빠름)
```

---

### 3. 검색 모드 (Search Strategy)

```typescript
type SearchMode = "all" | "code" | "qa" | "mixed";

async function searchVectors(
  query: string,
  topK: number = 5,
  mode: SearchMode = "all"
): Promise<SearchResult[]> {
  const vectorFile = await loadVectorFile();
  const queryEmbedding = await generateQueryEmbedding(query);

  let candidateVectors: Vector[];

  switch (mode) {
    case "code":
      // 코드만 검색
      candidateVectors = vectorFile.index.byType.code.map(i => vectorFile.vectors[i]);
      break;

    case "qa":
      // Q&A만 검색
      candidateVectors = vectorFile.index.byType.qa.map(i => vectorFile.vectors[i]);
      break;

    case "mixed":
      // 코드 50%, Q&A 50% 혼합
      const codeResults = searchInVectors(
        vectorFile.index.byType.code.map(i => vectorFile.vectors[i]),
        queryEmbedding,
        Math.ceil(topK / 2)
      );
      const qaResults = searchInVectors(
        vectorFile.index.byType.qa.map(i => vectorFile.vectors[i]),
        queryEmbedding,
        Math.floor(topK / 2)
      );
      return [...codeResults, ...qaResults];

    case "all":
    default:
      // 전체 검색 (스코어 기준 Top-K)
      candidateVectors = vectorFile.vectors;
      break;
  }

  // 유사도 계산 및 정렬
  const similarities = candidateVectors.map(vec => ({
    ...vec,
    score: cosineSimilarity(queryEmbedding, vec.embedding)
  }));

  return similarities
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
```

---

### 4. 자동 모드 선택 (질문 분류 기반)

```typescript
// 질문 카테고리에 따라 자동으로 검색 모드 선택
function determineSearchMode(category: string): SearchMode {
  const codeCategories = ["implementation", "tech_stack", "structure"];
  const qaCategories = ["usage", "explanation", "comparison"];

  if (codeCategories.includes(category)) {
    return "code";  // 코드 중심 검색
  } else if (qaCategories.includes(category)) {
    return "mixed"; // 코드 + Q&A 혼합
  } else {
    return "all";   // 전체 검색
  }
}

// 사용 예시
const { category } = classifyQuestion(question);
const mode = determineSearchMode(category);
const results = await searchVectors(question, 5, mode);
```

---

## 로딩 및 검색 전략

### 1. 메모리 캐싱 (Lambda Warm Start)

```typescript
// fileVectorStore.ts
let cachedVectorFile: VectorFile | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

async function loadVectorFile(): Promise<VectorFile> {
  const now = Date.now();

  // 캐시 히트
  if (cachedVectorFile && (now - cacheTimestamp) < CACHE_TTL_MS) {
    console.log("✅ Using cached vector file");
    return cachedVectorFile;
  }

  // Cold Start: CDN에서 다운로드
  console.log("📥 Loading vector file from CDN...");
  const startTime = Date.now();

  const response = await fetch(process.env.VECTOR_FILE_URL!);
  const buffer = Buffer.from(await response.arrayBuffer());

  // Gzip 압축 해제
  const jsonString = (await gunzipAsync(buffer)).toString('utf-8');
  const vectorFile: VectorFile = JSON.parse(jsonString);

  // 캐시 업데이트
  cachedVectorFile = vectorFile;
  cacheTimestamp = now;

  const loadTime = Date.now() - startTime;
  console.log(`✅ Loaded ${vectorFile.statistics.totalVectors} vectors in ${loadTime}ms`);
  console.log(`   - Code: ${vectorFile.statistics.codeVectors}`);
  console.log(`   - Q&A: ${vectorFile.statistics.qaVectors}`);

  return vectorFile;
}
```

---

### 2. 점진적 로딩 (선택적)

대용량 파일(10,000+ vectors) 시 고려:

```typescript
// 파일을 타입별로 분리
interface VectorFilePointers {
  metadata: string;             // metadata.json
  codeVectors: string;          // vectors-code-only.json.gz
  qaVectors: string;            // vectors-qa-only.json.gz
  mergedVectors: string;        // vectors.json.gz (전체)
}

async function loadVectorFileSelective(
  mode: SearchMode
): Promise<VectorFile> {
  const pointers = getFilePointers();

  if (mode === "code") {
    // 코드만 로드 (2.3MB)
    return await loadFile(pointers.codeVectors);
  } else if (mode === "qa") {
    // Q&A만 로드 (1.2MB)
    return await loadFile(pointers.qaVectors);
  } else {
    // 전체 로드 (3.5MB)
    return await loadFile(pointers.mergedVectors);
  }
}
```

**트레이드오프**:
- ✅ 메모리 사용량 감소
- ⚠️ 파일 3개 관리 필요
- ⚠️ "mixed" 모드에서는 2번 다운로드

**현재 시스템에서는 불필요** (1,500 vectors = 3.5MB는 충분히 작음)

---

### 3. 검색 최적화

```typescript
export async function searchVectorsFromFile(
  queryEmbedding: number[],
  topK: number = 5,
  options?: {
    threshold?: number;
    mode?: SearchMode;
    filterMetadata?: Record<string, any>;
  }
): Promise<SearchResult[]> {
  const { threshold = 0.0, mode = "all", filterMetadata } = options || {};

  // 1. 벡터 파일 로딩 (캐시 우선)
  const vectorFile = await loadVectorFile();

  // 2. 검색 모드에 따라 후보 벡터 선택
  let candidates: Vector[];

  if (mode === "code") {
    candidates = vectorFile.index.byType.code.map(i => vectorFile.vectors[i]);
  } else if (mode === "qa") {
    candidates = vectorFile.index.byType.qa.map(i => vectorFile.vectors[i]);
  } else {
    candidates = vectorFile.vectors;
  }

  // 3. 메타데이터 필터링 (선택)
  if (filterMetadata) {
    candidates = candidates.filter(vec => {
      return Object.entries(filterMetadata).every(
        ([key, value]) => (vec.metadata as any)[key] === value
      );
    });
  }

  // 4. 유사도 계산
  const similarities = candidates.map(vec => ({
    id: vec.id,
    content: vec.content,
    metadata: vec.metadata,
    score: cosineSimilarity(queryEmbedding, vec.embedding)
  }));

  // 5. 임계값 필터링 + Top-K 추출
  return similarities
    .filter(s => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
```

---

## 파일 생성 파이프라인

### 1. 코드 임베딩 수집

```typescript
// scripts/export-embeddings.ts

// Step 1: Supabase에서 코드 임베딩 조회
const { data: codeEmbeddings } = await supabase
  .from('embeddings')
  .select('*')
  .eq('type', 'code');  // 또는 in(type, ['commit', 'diff', 'file'])

// Step 2: Q&A 임베딩 조회
const { data: qaEmbeddings } = await supabase
  .from('qa_embeddings')
  .select('*');
```

---

### 2. 통합 및 인덱스 생성

```typescript
// Step 3: 통합 벡터 파일 생성
function mergeVectorFiles(
  codeVectors: Vector[],
  qaVectors: Vector[]
): VectorFile {
  const allVectors = [...codeVectors, ...qaVectors];

  // 인덱스 생성
  const codeIndices: number[] = [];
  const qaIndices: number[] = [];
  const categoryIndex: Record<string, number[]> = {};

  allVectors.forEach((vec, idx) => {
    if (vec.type === "code") {
      codeIndices.push(idx);
    } else {
      qaIndices.push(idx);
      const category = (vec.metadata as QAMetadata).category;
      if (category) {
        if (!categoryIndex[category]) categoryIndex[category] = [];
        categoryIndex[category].push(idx);
      }
    }
  });

  return {
    version: "2.0.0",
    createdAt: new Date().toISOString(),
    repository: {
      owner: process.env.TARGET_REPO_OWNER!,
      name: process.env.TARGET_REPO_NAME!,
      url: `https://github.com/${process.env.TARGET_REPO_OWNER}/${process.env.TARGET_REPO_NAME}`
    },
    embedding: {
      model: "text-embedding-3-small",
      provider: "openai",
      dimension: 1536
    },
    statistics: {
      totalVectors: allVectors.length,
      codeVectors: codeVectors.length,
      qaVectors: qaVectors.length,
      fileSize: 0,  // 계산 후 업데이트
      compressedSize: 0
    },
    index: {
      byType: {
        code: codeIndices,
        qa: qaIndices
      },
      byCategory: categoryIndex
    },
    vectors: allVectors
  };
}
```

---

### 3. 압축 및 업로드

```typescript
// Step 4: JSON 직렬화
const jsonString = JSON.stringify(vectorFile, null, 0); // 압축 우선 (공백 없음)
const fileSize = Buffer.byteLength(jsonString, 'utf-8');

// Step 5: Gzip 압축
const compressed = await gzipAsync(Buffer.from(jsonString));
const compressedSize = compressed.length;

// 통계 업데이트
vectorFile.statistics.fileSize = fileSize;
vectorFile.statistics.compressedSize = compressedSize;

console.log(`📊 File Statistics:`);
console.log(`   Original: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
console.log(`   Compressed: ${(compressedSize / 1024 / 1024).toFixed(2)}MB`);
console.log(`   Compression: ${((1 - compressedSize / fileSize) * 100).toFixed(1)}%`);

// Step 6: 파일 저장
fs.writeFileSync('output/embeddings-merged.json', jsonString);
fs.writeFileSync('output/embeddings-merged.json.gz', compressed);

// Step 7: Vercel Blob 업로드
const { url } = await put('vectors.json.gz', compressed, {
  access: 'public',
  addRandomSuffix: false
});

console.log(`✅ Uploaded to: ${url}`);
console.log(`   Set VECTOR_FILE_URL=${url}`);
```

---

### 4. GitHub Actions 통합

```yaml
# .github/workflows/export-embeddings.yml
steps:
  - name: Export code embeddings
    run: pnpm tsx scripts/export-code-embeddings.ts
    env:
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}

  - name: Export Q&A embeddings
    run: pnpm tsx scripts/export-qa-embeddings.ts
    env:
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}

  - name: Merge and compress
    run: |
      pnpm tsx scripts/merge-vector-files.ts \
        --code output/embeddings-code.json \
        --qa output/embeddings-qa.json \
        --output output/embeddings-merged.json

  - name: Upload to Vercel Blob
    run: pnpm tsx scripts/upload-to-vercel.ts --file output/embeddings-merged.json.gz
    env:
      BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}
```

---

## 요약

### ✅ 핵심 설계 결정

1. **단일 통합 파일**: 코드 + Q&A를 하나의 파일로 통합 (3.5MB)
   - 2개 다운로드보다 1개 다운로드가 빠름 (CDN 왕복 시간 절약)
   - Lambda 메모리 캐싱으로 Warm Start 시 재사용

2. **Type 필드로 구분**: `type: "code" | "qa"`
   - 명확한 타입 구분
   - 메타데이터 타입도 분리 (`CodeMetadata | QAMetadata`)

3. **Index 기반 필터링**: `index.byType`
   - O(n) 필터링 → O(1) 인덱스 접근
   - 검색 모드별 빠른 후보 선택

4. **검색 모드 지원**: `all | code | qa | mixed`
   - 질문 카테고리에 따라 자동 선택
   - 유연한 검색 전략

### 📊 성능 지표

```
파일 크기:
- Original: 9.5MB
- Gzip: 3.2MB (67% 압축)

로딩 시간:
- Cold Start: 150-380ms (CDN 다운로드)
- Warm Start: 0ms (메모리 캐시)

검색 시간:
- 1,500 vectors × 1536 dimensions
- 브루트포스: 51-151ms
- Index 필터링 후: 30-100ms

메모리 사용:
- JSON 파싱: ~15MB
- 총 메모리: ~30MB (Lambda 메모리의 3%)
```

---

**작성일**: 2025-12-31
**버전**: 2.0.0 (코드 + Q&A 통합)
**관련 문서**: [EMBEDDING-SCHEMA.md](./EMBEDDING-SCHEMA.md), [SERVERLESS-API.md](./SERVERLESS-API.md)

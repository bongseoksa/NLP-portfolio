# Serverless 벡터 검색 설계 (JSON 파일 기반)

ChromaDB 없이 JSON 벡터 파일만으로 검색을 수행하는 serverless API 검색 로직 설계 문서입니다.

## 개요

- **목적**: ChromaDB 서버 없이 정적 JSON 파일에서 벡터 검색 수행
- **환경**: Serverless (Vercel, AWS Lambda 등)
- **비용**: 서버 비용 0원 (CDN/Blob Storage만 사용)
- **성능**: Cold Start 100-300ms, Warm Start 10-30ms

## 1. 검색 처리 흐름

### 1.1 전체 흐름도

```
사용자 질문 입력
    ↓
[1] 질문 분류 (선택적)
    → 카테고리 기반 검색 모드 결정
    ↓
[2] 쿼리 임베딩 생성
    → OpenAI API 호출 (text-embedding-3-small)
    ↓
[3] 벡터 파일 로딩
    → CDN/Blob Storage에서 embeddings.json.gz 다운로드
    → gzip 압축 해제
    → JSON 파싱
    → 메모리 캐시 저장 (5분 TTL)
    ↓
[4] 검색 모드 결정
    ├─ "code": 코드 임베딩만 검색
    ├─ "qa": 히스토리(Q&A) 임베딩만 검색
    ├─ "mixed": 코드 50% + 히스토리 50% 동시 검색
    └─ "all": 전체 벡터 검색
    ↓
[5] 후보 벡터 필터링
    → 메타데이터 필터 적용 (owner, repo 등)
    → 타입별 인덱스 활용
    ↓
[6] 코사인 유사도 계산
    → 모든 후보 벡터와 쿼리 벡터 비교
    → 브루트포스 검색 (O(n))
    ↓
[7] Top-K 추출
    → 유사도 점수 내림차순 정렬
    → 상위 K개 결과 선택
    → 임계값(threshold) 필터링
    ↓
[8] 결과 반환
    → SearchResult[] 형식으로 변환
    → 메타데이터 포함
```

### 1.2 단계별 상세 설명

#### [1] 질문 분류 (선택적)

```typescript
// 카테고리 기반 검색 모드 자동 결정
function determineSearchMode(category?: string): SearchMode {
    if (!category) return "all";

    // 코드 중심 질문
    const codeCategories = ["implementation", "tech_stack", "structure", "architecture"];
    if (codeCategories.includes(category)) {
        return "code";
    }

    // 혼합 질문 (코드 + 히스토리)
    const mixedCategories = ["usage", "explanation", "comparison", "history"];
    if (mixedCategories.includes(category)) {
        return "mixed";
    }

    // 기본: 전체 검색
    return "all";
}
```

#### [2] 쿼리 임베딩 생성

```typescript
// OpenAI API로 질문을 벡터로 변환
const queryEmbedding = await generateQueryEmbedding(question);
// 결과: number[] (1536차원)
```

#### [3] 벡터 파일 로딩

```typescript
// CDN에서 embeddings.json.gz 다운로드
const response = await fetch(VECTOR_FILE_URL, {
    headers: { 'Accept-Encoding': 'gzip' }
});

// gzip 압축 해제
const buffer = Buffer.from(await response.arrayBuffer());
const decompressed = await gunzip(buffer);
const jsonString = decompressed.toString('utf-8');

// JSON 파싱
const vectorFile: VectorFile = JSON.parse(jsonString);

// 메모리 캐시 저장 (5분 TTL)
cachedVectorFile = vectorFile;
cacheTimestamp = Date.now();
```

**VectorFile 스키마:**
```typescript
interface VectorFile {
    version: string;
    createdAt: string;
    repository: { owner: string; name: string; url: string };
    embedding: { model: string; provider: string; dimension: number };
    statistics: {
        totalVectors: number;
        codeVectors: number;
        qaVectors: number;
    };
    index: {
        byType: {
            code: number[];  // 코드 벡터 인덱스 배열
            qa: number[];    // Q&A 벡터 인덱스 배열
        };
    };
    vectors: Vector[];  // 전체 벡터 배열
}
```

#### [4] 검색 모드별 처리

**A. "code" 모드 (코드만 검색)**
```typescript
// 인덱스를 활용하여 코드 벡터만 선택
const codeIndices = vectorFile.index.byType.code;
const candidates = codeIndices.map(i => vectorFile.vectors[i]);
```

**B. "qa" 모드 (히스토리만 검색)**
```typescript
// 인덱스를 활용하여 Q&A 벡터만 선택
const qaIndices = vectorFile.index.byType.qa;
const candidates = qaIndices.map(i => vectorFile.vectors[i]);
```

**C. "mixed" 모드 (코드 + 히스토리 동시 검색)**
```typescript
// 코드와 히스토리를 각각 검색 후 병합
const codeVectors = vectorFile.index.byType.code.map(i => vectorFile.vectors[i]);
const qaVectors = vectorFile.index.byType.qa.map(i => vectorFile.vectors[i]);

// 각각에서 Top-K/2 개씩 검색
const codeK = Math.ceil(topK / 2);
const qaK = Math.floor(topK / 2);

const codeResults = searchInVectors(codeVectors, queryEmbedding, codeK, threshold);
const qaResults = searchInVectors(qaVectors, queryEmbedding, qaK, threshold);

// 결과 병합 및 재정렬
const mixedResults = [...codeResults, ...qaResults]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
```

**D. "all" 모드 (전체 검색)**
```typescript
// 모든 벡터를 후보로 사용
const candidates = vectorFile.vectors;
```

#### [5] 메타데이터 필터링

```typescript
// owner, repo 등으로 필터링
if (filterMetadata) {
    candidates = candidates.filter(vec => {
        return Object.entries(filterMetadata).every(
            ([key, value]) => (vec.metadata as any)[key] === value
        );
    });
}
```

#### [6] 코사인 유사도 계산

```typescript
// 모든 후보 벡터에 대해 유사도 계산
for (const vec of candidates) {
    const score = cosineSimilarity(queryEmbedding, vec.embedding);
    if (score >= threshold) {
        similarities.push({ id: vec.id, score, data: vec });
    }
}
```

#### [7] Top-K 추출

```typescript
// 유사도 점수 내림차순 정렬
similarities.sort((a, b) => b.score - a.score);

// 상위 K개 선택
const topResults = similarities.slice(0, topK);
```

#### [8] 결과 반환

```typescript
// SearchResult 형식으로 변환
return topResults.map(result => ({
    id: result.data.id,
    content: result.data.content,
    metadata: result.data.metadata,
    score: result.score
}));
```

## 2. 벡터 유사도 계산 코드 예시

### 2.1 코사인 유사도 함수 (기본 구현)

```typescript
/**
 * 코사인 유사도 계산
 * 
 * 공식: cos(θ) = (A · B) / (||A|| × ||B||)
 * 
 * @param vecA 첫 번째 벡터 (쿼리 임베딩)
 * @param vecB 두 번째 벡터 (저장된 임베딩)
 * @returns 유사도 점수 (0 ~ 1, 1에 가까울수록 유사)
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    // 벡터 차원 검증
    if (vecA.length !== vecB.length) {
        throw new Error(`Vector dimension mismatch: ${vecA.length} vs ${vecB.length}`);
    }

    let dotProduct = 0;  // 내적 (A · B)
    let normA = 0;       // ||A||²
    let normB = 0;       // ||B||²

    // 벡터 연산 (단일 루프로 최적화)
    for (let i = 0; i < vecA.length; i++) {
        const a = vecA[i];
        const b = vecB[i];
        
        if (a !== undefined && b !== undefined) {
            dotProduct += a * b;
            normA += a * a;
            normB += b * b;
        }
    }

    // 분모 계산 (||A|| × ||B||)
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);

    // 0으로 나누기 방지
    if (denominator === 0) {
        return 0;
    }

    // 코사인 유사도 반환
    return dotProduct / denominator;
}
```

### 2.2 최적화된 버전 (SIMD 활용 가능)

```typescript
/**
 * 최적화된 코사인 유사도 계산
 * - 메모리 접근 최소화
 * - NaN/Infinity 체크
 */
function cosineSimilarityOptimized(vecA: number[], vecB: number[]): number {
    const len = vecA.length;
    
    if (len === 0) return 0;
    if (len !== vecB.length) {
        throw new Error(`Dimension mismatch: ${len} vs ${vecB.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    // 벡터화 가능한 루프 (V8 엔진 최적화)
    for (let i = 0; i < len; i++) {
        const a = vecA[i];
        const b = vecB[i];
        
        dotProduct += a * b;
        normA += a * a;
        normB += b * b;
    }

    const denominator = Math.sqrt(normA * normB);
    
    // 안전성 체크
    if (!isFinite(denominator) || denominator === 0) {
        return 0;
    }

    const similarity = dotProduct / denominator;
    
    // 결과 범위 검증 (-1 ~ 1)
    return Math.max(-1, Math.min(1, similarity));
}
```

### 2.3 배치 계산 (여러 벡터 동시 처리)

```typescript
/**
 * 쿼리 벡터와 여러 후보 벡터의 유사도를 한 번에 계산
 * 
 * @param queryEmbedding 쿼리 임베딩
 * @param candidateVectors 후보 벡터 배열
 * @returns 유사도 점수 배열
 */
function batchCosineSimilarity(
    queryEmbedding: number[],
    candidateVectors: number[][]
): number[] {
    const queryNorm = Math.sqrt(
        queryEmbedding.reduce((sum, val) => sum + val * val, 0)
    );

    return candidateVectors.map(candidate => {
        let dotProduct = 0;
        let candidateNorm = 0;

        for (let i = 0; i < queryEmbedding.length; i++) {
            const q = queryEmbedding[i];
            const c = candidate[i];
            dotProduct += q * c;
            candidateNorm += c * c;
        }

        const denominator = queryNorm * Math.sqrt(candidateNorm);
        return denominator === 0 ? 0 : dotProduct / denominator;
    });
}
```

### 2.4 사용 예시

```typescript
// 단일 벡터 비교
const queryEmbedding = [0.1, 0.2, 0.3, ...];  // 1536차원
const storedEmbedding = [0.15, 0.18, 0.32, ...];

const similarity = cosineSimilarity(queryEmbedding, storedEmbedding);
console.log(`Similarity: ${similarity}`);  // 예: 0.85

// 여러 벡터 비교
const candidates = [
    [0.1, 0.2, ...],
    [0.2, 0.3, ...],
    [0.15, 0.18, ...]
];

const similarities = batchCosineSimilarity(queryEmbedding, candidates);
// 결과: [0.85, 0.72, 0.91]
```

## 3. 성능을 위해 고려해야 할 점

### 3.1 메모리 관리

#### ✅ 파일 캐싱 전략

```typescript
// 메모리 캐시 (5분 TTL)
let cachedVectorFile: VectorFile | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;  // 5분

async function loadVectorFile(): Promise<VectorFile> {
    const now = Date.now();
    
    // 캐시 유효성 검사
    if (cachedVectorFile && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return cachedVectorFile;  // 캐시 히트
    }
    
    // 캐시 미스: 파일 다운로드
    const vectorFile = await fetchAndParseVectorFile();
    cachedVectorFile = vectorFile;
    cacheTimestamp = now;
    
    return vectorFile;
}
```

**고려사항:**
- **TTL 조정**: 서버리스 환경의 메모리 제한에 따라 조정 (기본 5분)
- **캐시 무효화**: 파일 업데이트 시 캐시 강제 초기화 필요
- **메모리 사용량**: 대용량 벡터 파일(100MB+)은 메모리 부족 가능

#### ✅ 지연 로딩 (Lazy Loading)

```typescript
// 필요한 벡터만 메모리에 로드
function loadVectorsByType(type: "code" | "qa"): Vector[] {
    const indices = vectorFile.index.byType[type];
    return indices.map(i => vectorFile.vectors[i]);
}
```

### 3.2 검색 성능 최적화

#### ✅ 인덱스 활용

```typescript
// 전체 벡터 순회 대신 인덱스 활용
// Before: O(n) - 모든 벡터 순회
const candidates = vectorFile.vectors.filter(v => v.type === "code");

// After: O(k) - 인덱스로 직접 접근 (k << n)
const codeIndices = vectorFile.index.byType.code;
const candidates = codeIndices.map(i => vectorFile.vectors[i]);
```

**성능 향상:**
- 코드 벡터만 검색 시: 50-70% 시간 단축
- Q&A 벡터만 검색 시: 80-90% 시간 단축

#### ✅ 조기 종료 (Early Termination)

```typescript
// Top-K 검색 시 부분 정렬 활용
function searchWithEarlyTermination(
    vectors: Vector[],
    queryEmbedding: number[],
    topK: number
): SearchResult[] {
    // 힙 기반 부분 정렬 (O(n log k) vs O(n log n))
    const heap = new MinHeap(topK);
    
    for (const vec of vectors) {
        const score = cosineSimilarity(queryEmbedding, vec.embedding);
        
        if (heap.size() < topK) {
            heap.push({ score, data: vec });
        } else if (score > heap.peek().score) {
            heap.replace({ score, data: vec });
        }
    }
    
    return heap.toArray().sort((a, b) => b.score - a.score);
}
```

#### ✅ 병렬 처리 (Web Workers)

```typescript
// 대용량 벡터 검색 시 병렬 처리
async function parallelSearch(
    queryEmbedding: number[],
    vectors: Vector[],
    topK: number,
    numWorkers: number = 4
): Promise<SearchResult[]> {
    const chunkSize = Math.ceil(vectors.length / numWorkers);
    const chunks = [];
    
    for (let i = 0; i < vectors.length; i += chunkSize) {
        chunks.push(vectors.slice(i, i + chunkSize));
    }
    
    // 각 청크를 Worker에서 처리
    const results = await Promise.all(
        chunks.map(chunk => 
            processInWorker(queryEmbedding, chunk, topK)
        )
    );
    
    // 결과 병합 및 Top-K 추출
    return mergeAndSelectTopK(results, topK);
}
```

**주의사항:**
- Serverless 환경에서는 Worker 생성 오버헤드 고려
- 작은 벡터 세트(< 10,000개)는 순차 처리가 더 빠를 수 있음

### 3.3 네트워크 최적화

#### ✅ CDN 활용

```typescript
// CDN에서 파일 다운로드 (지역별 최적화)
const VECTOR_FILE_URL = process.env.VECTOR_FILE_URL;
// 예: https://cdn.example.com/embeddings.json.gz

// HTTP 캐싱 헤더 활용
const response = await fetch(VECTOR_FILE_URL, {
    headers: {
        'Accept-Encoding': 'gzip',
        'If-None-Match': cachedETag  // 조건부 요청
    }
});
```

**최적화:**
- **gzip 압축**: 파일 크기 70-80% 감소
- **CDN 캐싱**: 다운로드 시간 단축
- **HTTP/2**: 멀티플렉싱으로 병렬 다운로드

#### ✅ 스트리밍 파싱

```typescript
// 대용량 파일을 스트리밍으로 파싱 (메모리 절약)
import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import { parse } from 'stream-json';

async function loadVectorFileStreaming(url: string): Promise<VectorFile> {
    const response = await fetch(url);
    const stream = response.body
        .pipe(createGunzip())
        .pipe(parse());
    
    // JSON 스트림 파싱
    // 메모리 사용량: O(1) vs O(n)
}
```

### 3.4 알고리즘 최적화

#### ✅ 근사 최근접 이웃 (ANN) 고려

현재는 브루트포스 검색(O(n))을 사용하지만, 대용량 벡터 세트에서는 ANN 알고리즘 고려:

```typescript
// HNSW (Hierarchical Navigable Small World) 인덱스
// - 검색 시간: O(log n) vs O(n)
// - 메모리: 추가 인덱스 저장 필요
// - 구현 복잡도: 높음

// LSH (Locality Sensitive Hashing)
// - 검색 시간: O(1) ~ O(log n)
// - 정확도: 약간 감소
// - 구현 복잡도: 중간
```

**현재 브루트포스가 적합한 경우:**
- 벡터 수 < 100,000개
- Serverless 환경 (인덱스 저장 불가)
- 단순성 우선

#### ✅ 벡터 정규화 사전 계산

```typescript
// 벡터 파일 생성 시 정규화된 벡터 저장
interface Vector {
    id: string;
    embedding: number[];  // 이미 정규화됨 (||v|| = 1)
    norm?: number;        // 사전 계산된 norm (선택적)
}

// 코사인 유사도 계산 단순화
function cosineSimilarityNormalized(
    queryEmbedding: number[],  // 정규화됨
    storedEmbedding: number[]  // 정규화됨
): number {
    // ||A|| = ||B|| = 1 이므로
    // cos(θ) = A · B
    let dotProduct = 0;
    for (let i = 0; i < queryEmbedding.length; i++) {
        dotProduct += queryEmbedding[i] * storedEmbedding[i];
    }
    return dotProduct;  // sqrt 계산 불필요
}
```

**성능 향상:**
- sqrt 계산 제거: 약 10-15% 속도 향상
- 메모리 접근 감소: norm 계산 불필요

### 3.5 Serverless 환경 특화 최적화

#### ✅ Cold Start 최소화

```typescript
// 초기화 코드를 최소화
// - 벡터 파일 로딩은 첫 요청 시에만 수행
// - 핫 패스 코드 최적화

// 핫 패스 (자주 실행되는 코드)
function searchVectors(queryEmbedding: number[], topK: number) {
    // 캐시된 벡터 파일 사용
    const vectorFile = getCachedVectorFile();
    // 빠른 검색 수행
    return performSearch(vectorFile, queryEmbedding, topK);
}
```

#### ✅ 메모리 제한 대응

```typescript
// Serverless 메모리 제한 (예: 1024MB)
// 대용량 벡터 파일 처리 시:

// 1. 청크 단위 로딩
async function loadVectorsInChunks(
    indices: number[],
    chunkSize: number = 1000
): Promise<Vector[]> {
    const vectors: Vector[] = [];
    
    for (let i = 0; i < indices.length; i += chunkSize) {
        const chunk = indices.slice(i, i + chunkSize);
        const chunkVectors = chunk.map(idx => vectorFile.vectors[idx]);
        vectors.push(...chunkVectors);
        
        // 메모리 압박 시 가비지 컬렉션 힌트
        if (i % (chunkSize * 10) === 0) {
            await new Promise(resolve => setImmediate(resolve));
        }
    }
    
    return vectors;
}
```

#### ✅ 타임아웃 관리

```typescript
// Serverless 타임아웃 (예: 60초)
// 검색 시간 제한 설정

async function searchWithTimeout(
    queryEmbedding: number[],
    topK: number,
    timeoutMs: number = 5000
): Promise<SearchResult[]> {
    return Promise.race([
        searchVectors(queryEmbedding, topK),
        new Promise<SearchResult[]>((_, reject) =>
            setTimeout(() => reject(new Error('Search timeout')), timeoutMs)
        )
    ]);
}
```

### 3.6 모니터링 및 디버깅

#### ✅ 성능 메트릭 수집

```typescript
interface SearchMetrics {
    fileLoadTime: number;      // 파일 로딩 시간
    searchTime: number;         // 검색 시간
    candidatesCount: number;    // 후보 벡터 수
    resultsCount: number;       // 결과 수
    cacheHit: boolean;          // 캐시 히트 여부
    memoryUsage: number;        // 메모리 사용량
}

function collectMetrics(metrics: SearchMetrics): void {
    console.log(JSON.stringify({
        ...metrics,
        timestamp: Date.now()
    }));
}
```

## 4. 실제 구현 예시

### 4.1 통합 검색 함수

```typescript
/**
 * 코드 임베딩 + 히스토리 임베딩 동시 검색
 */
export async function searchVectorsFromFile(
    queryEmbedding: number[],
    topK: number = 5,
    options?: {
        threshold?: number;
        mode?: "code" | "qa" | "mixed" | "all";
        filterMetadata?: Record<string, any>;
    }
): Promise<SearchResult[]> {
    const {
        threshold = 0.0,
        mode = "all",
        filterMetadata
    } = options || {};

    const searchStart = Date.now();

    // 1. 벡터 파일 로딩 (캐시 우선)
    const vectorFile = await loadVectorFile();
    const loadTime = Date.now() - searchStart;

    // 2. 검색 모드별 처리
    let results: SearchResult[];

    if (mode === "mixed") {
        // 코드 + 히스토리 동시 검색
        const codeVectors = vectorFile.index.byType.code
            .map(i => vectorFile.vectors[i]);
        const qaVectors = vectorFile.index.byType.qa
            .map(i => vectorFile.vectors[i]);

        const codeK = Math.ceil(topK / 2);
        const qaK = Math.floor(topK / 2);

        const codeResults = searchInVectors(
            codeVectors, queryEmbedding, codeK, threshold, filterMetadata
        );
        const qaResults = searchInVectors(
            qaVectors, queryEmbedding, qaK, threshold, filterMetadata
        );

        // 결과 병합 및 재정렬
        results = [...codeResults, ...qaResults]
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

    } else {
        // 단일 모드 검색
        let candidates: Vector[];
        
        if (mode === "code") {
            candidates = vectorFile.index.byType.code
                .map(i => vectorFile.vectors[i]);
        } else if (mode === "qa") {
            candidates = vectorFile.index.byType.qa
                .map(i => vectorFile.vectors[i]);
        } else {
            candidates = vectorFile.vectors;
        }

        results = searchInVectors(
            candidates, queryEmbedding, topK, threshold, filterMetadata
        );
    }

    const searchTime = Date.now() - searchStart;
    console.log(`🔍 Search completed: ${results.length} results in ${searchTime}ms`);

    return results;
}
```

## 5. 성능 벤치마크

### 5.1 예상 성능 (벡터 수 기준)

| 벡터 수 | 파일 크기 | 로딩 시간 | 검색 시간 | 총 시간 |
|---------|-----------|-----------|-----------|---------|
| 1,000   | ~5 MB     | 50-100ms  | 5-10ms    | 55-110ms |
| 10,000  | ~50 MB    | 100-200ms | 20-50ms   | 120-250ms |
| 100,000 | ~500 MB   | 200-400ms | 100-300ms | 300-700ms |

**참고:**
- 로딩 시간: Cold Start (캐시 미스)
- 검색 시간: 브루트포스 검색 (O(n))
- 총 시간: Serverless 응답 시간

### 5.2 최적화 효과

| 최적화 기법 | 성능 향상 | 적용 난이도 |
|------------|-----------|-------------|
| 인덱스 활용 | 50-90% | 낮음 |
| 벡터 정규화 | 10-15% | 낮음 |
| 조기 종료 | 20-30% | 중간 |
| 병렬 처리 | 30-50% | 높음 |
| ANN 알고리즘 | 80-95% | 매우 높음 |

## 6. 제약사항 및 한계

### 6.1 Serverless 환경 제약

- **메모리 제한**: 1024MB (Vercel Hobby) ~ 3008MB (Pro)
- **실행 시간**: 60초 (Hobby) ~ 300초 (Pro)
- **Cold Start**: 첫 요청 시 100-500ms 지연
- **상태 저장 불가**: 인덱스 파일 저장 불가

### 6.2 브루트포스 검색 한계

- **확장성**: 벡터 수가 100,000개 이상일 때 성능 저하
- **정확도**: ANN 알고리즘 대비 정확도는 동일하지만 속도 느림
- **메모리**: 모든 벡터를 메모리에 로드해야 함

### 6.3 개선 방향

1. **하이브리드 접근**: 작은 벡터 세트는 브루트포스, 큰 세트는 ANN
2. **계층적 검색**: 먼저 인덱스로 필터링 후 상세 검색
3. **캐싱 전략**: 자주 검색되는 쿼리 결과 캐싱

## 7. 결론

JSON 벡터 파일 기반 serverless 검색은 다음과 같은 특징을 가집니다:

**장점:**
- ✅ 서버 비용 0원
- ✅ 구현 단순성
- ✅ 확장 가능한 CDN 활용
- ✅ 코드 + 히스토리 동시 검색 지원

**최적화 포인트:**
- ✅ 인덱스 활용으로 검색 범위 축소
- ✅ 메모리 캐싱으로 Cold Start 최소화
- ✅ 벡터 정규화로 계산 최적화
- ✅ 조기 종료로 불필요한 계산 제거

**적용 범위:**
- 벡터 수 < 100,000개: 브루트포스 검색 적합
- 벡터 수 > 100,000개: ANN 알고리즘 고려 필요


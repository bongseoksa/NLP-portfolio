# Serverless Q&A 히스토리 벡터 관리 설계

서버리스 환경에서 질의응답 히스토리를 임베딩하여 파일로 저장하고, 다음 질의 시 검색 대상에 포함하는 구조 설계 문서입니다.

## 개요

- **목적**: Q&A 히스토리를 벡터로 변환하여 검색 가능하게 만들기
- **환경**: Serverless (Vercel, AWS Lambda 등)
- **제약사항**: 동시성 문제 회피, 무한 증가 방지
- **비용**: 서버 비용 0원 (정적 파일 저장)

## 1. 히스토리 파일 구조

### 1.1 분리된 히스토리 파일 전략

Q&A 히스토리는 코드 임베딩과 분리된 별도 파일로 관리합니다.

```
embeddings/
├── code-embeddings.json.gz      # 코드 임베딩 (변경 빈도 낮음)
└── qa-history-embeddings.json.gz # Q&A 히스토리 임베딩 (변경 빈도 높음)
```

**장점:**
- 코드 임베딩과 히스토리 임베딩 분리로 업데이트 영향 최소화
- 히스토리만 자주 갱신, 코드는 안정적
- 파일 크기 관리 용이

### 1.2 히스토리 파일 스키마

```typescript
interface QAHistoryVectorFile {
    version: string;              // "1.0"
    createdAt: string;            // ISO 8601
    lastUpdated: string;          // ISO 8601
    repository: {
        owner: string;
        name: string;
    };
    embedding: {
        model: string;            // "text-embedding-3-small"
        provider: string;         // "openai"
        dimension: number;        // 1536
    };
    statistics: {
        totalVectors: number;     // 전체 히스토리 수
        questionVectors: number;  // 질문 임베딩 수
        answerVectors: number;    // 답변 임베딩 수
        maxHistorySize: number;   // 최대 히스토리 크기
        prunedCount: number;      // Pruning으로 제거된 수
    };
    index: {
        bySession: {              // 세션별 인덱스
            [sessionId: string]: number[];
        };
        byCategory: {              // 카테고리별 인덱스
            [category: string]: number[];
        };
        byTimestamp: number[];     // 시간순 인덱스 (오래된 순)
    };
    vectors: QAHistoryVector[];   // 히스토리 벡터 배열
}

interface QAHistoryVector {
    id: string;                    // "qa-{sessionId}-{timestamp}-{type}"
    type: "question" | "answer" | "conversation";
    embedding: number[];           // 1536차원 벡터
    content: string;              // 질문 또는 답변 텍스트
    metadata: {
        sessionId: string;
        questionId?: string;      // 질문 벡터 ID (답변의 경우)
        answerId?: string;        // 답변 벡터 ID (질문의 경우)
        category: string;
        categoryConfidence: number;
        timestamp: string;         // ISO 8601
        responseTimeMs: number;
        tokenUsage: number;
        sources?: string[];        // 참조된 소스 ID
        status: "success" | "partial" | "failed";
    };
    createdAt: string;
}
```

### 1.3 파일 명명 규칙

```
qa-history-embeddings-{timestamp}.json.gz
qa-history-embeddings-latest.json.gz  # 최신 버전 (심볼릭 링크)
```

**예시:**
```
qa-history-embeddings-20240115T103000Z.json.gz
qa-history-embeddings-20240115T110000Z.json.gz
qa-history-embeddings-latest.json.gz  → 20240115T110000Z.json.gz
```

## 2. Append 방식 대신 안전한 갱신 전략

### 2.1 문제점: Append 방식의 동시성 문제

**기존 Append 방식의 문제:**
```typescript
// ❌ 위험한 방식: 동시성 문제 발생 가능
async function appendHistory(newVector: QAHistoryVector) {
    const file = await loadHistoryFile();
    file.vectors.push(newVector);  // 동시 요청 시 데이터 손실 가능
    await saveHistoryFile(file);
}
```

**문제 시나리오:**
1. 요청 A: 파일 로드 → 벡터 추가 → 저장
2. 요청 B: 파일 로드 (요청 A 저장 전) → 벡터 추가 → 저장
3. 결과: 요청 A의 벡터가 손실됨

### 2.2 해결책: Atomic Write 전략

#### 전략 1: Write-Then-Move (권장)

```typescript
/**
 * Atomic Write 전략: 임시 파일 → 원자적 이동
 * 
 * 1. 새 파일을 임시 이름으로 작성
 * 2. 완료 후 원자적으로 최신 파일로 교체
 * 3. 실패 시 롤백 가능
 */
async function updateHistoryFileAtomic(
    newVectors: QAHistoryVector[],
    options: {
        maxHistorySize?: number;
        pruneStrategy?: "count" | "time" | "both";
    } = {}
): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tempFile = `qa-history-embeddings-temp-${timestamp}.json.gz`;
    const newFile = `qa-history-embeddings-${timestamp}.json.gz`;
    const latestFile = `qa-history-embeddings-latest.json.gz`;

    try {
        // 1. 기존 파일 로드
        const existingFile = await loadHistoryFile();
        
        // 2. 새 벡터 추가
        const updatedVectors = [...existingFile.vectors, ...newVectors];
        
        // 3. Pruning 적용
        const prunedVectors = await pruneHistory(updatedVectors, options);
        
        // 4. 새 파일 구조 생성
        const newFileData: QAHistoryVectorFile = {
            ...existingFile,
            lastUpdated: new Date().toISOString(),
            statistics: {
                ...existingFile.statistics,
                totalVectors: prunedVectors.length,
                questionVectors: prunedVectors.filter(v => v.type === "question").length,
                answerVectors: prunedVectors.filter(v => v.type === "answer").length,
                prunedCount: existingFile.statistics.totalVectors + newVectors.length - prunedVectors.length
            },
            index: buildIndex(prunedVectors),
            vectors: prunedVectors
        };

        // 5. 임시 파일로 저장
        await saveToFile(tempFile, newFileData);

        // 6. 원자적 이동 (파일 시스템 레벨)
        await moveFile(tempFile, newFile);

        // 7. latest 심볼릭 링크 업데이트 (선택적)
        await updateSymlink(latestFile, newFile);

        return newFile;

    } catch (error) {
        // 실패 시 임시 파일 정리
        await deleteFile(tempFile).catch(() => {});
        throw error;
    }
}
```

#### 전략 2: Version-based Update

```typescript
/**
 * 버전 기반 업데이트: 낙관적 잠금 (Optimistic Locking)
 * 
 * 1. 파일 버전 확인
 * 2. 업데이트 시 버전 증가
 * 3. 버전 불일치 시 재시도
 */
interface QAHistoryVectorFile {
    version: string;
    fileVersion: number;  // 파일 버전 번호
    // ... 기타 필드
}

async function updateHistoryFileWithVersion(
    newVectors: QAHistoryVector[],
    expectedVersion: number
): Promise<QAHistoryVectorFile> {
    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
        try {
            // 1. 현재 파일 로드
            const currentFile = await loadHistoryFile();

            // 2. 버전 확인
            if (currentFile.fileVersion !== expectedVersion) {
                console.warn(`Version mismatch: expected ${expectedVersion}, got ${currentFile.fileVersion}`);
                retries++;
                await new Promise(resolve => setTimeout(resolve, 100 * retries)); // 지수 백오프
                continue;
            }

            // 3. 업데이트
            const updatedFile = {
                ...currentFile,
                fileVersion: currentFile.fileVersion + 1,
                lastUpdated: new Date().toISOString(),
                vectors: [...currentFile.vectors, ...newVectors],
                // ... 인덱스 업데이트
            };

            // 4. 저장
            await saveHistoryFile(updatedFile);

            return updatedFile;

        } catch (error) {
            retries++;
            if (retries >= maxRetries) {
                throw new Error(`Failed to update after ${maxRetries} retries: ${error}`);
            }
        }
    }

    throw new Error("Max retries exceeded");
}
```

#### 전략 3: Queue-based Update (고급)

```typescript
/**
 * 큐 기반 업데이트: 순차 처리 보장
 * 
 * 1. 업데이트 요청을 큐에 추가
 * 2. 단일 워커가 순차 처리
 * 3. 동시성 문제 완전 회피
 */
class HistoryUpdateQueue {
    private queue: Array<{
        vectors: QAHistoryVector[];
        resolve: (file: QAHistoryVectorFile) => void;
        reject: (error: Error) => void;
    }> = [];
    private processing = false;

    async enqueue(vectors: QAHistoryVector[]): Promise<QAHistoryVectorFile> {
        return new Promise((resolve, reject) => {
            this.queue.push({ vectors, resolve, reject });
            this.processQueue();
        });
    }

    private async processQueue() {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;

        while (this.queue.length > 0) {
            const item = this.queue.shift()!;
            try {
                const result = await updateHistoryFileAtomic(item.vectors);
                item.resolve(result);
            } catch (error) {
                item.reject(error as Error);
            }
        }

        this.processing = false;
    }
}
```

### 2.4 Serverless 환경 특화: Event-driven Update

```typescript
/**
 * 이벤트 기반 업데이트: 비동기 처리
 * 
 * 1. Q&A 완료 시 이벤트 발행
 * 2. 별도 함수가 배치로 처리
 * 3. 메인 API는 빠르게 응답
 */
export async function handleQAComplete(event: {
    sessionId: string;
    question: string;
    answer: string;
    metadata: any;
}) {
    // 1. 즉시 응답 (사용자 경험 우선)
    // 2. 이벤트 큐에 추가 (Vercel Queue, SQS 등)
    await enqueueHistoryUpdate({
        sessionId: event.sessionId,
        vectors: await generateHistoryVectors(event),
        timestamp: new Date().toISOString()
    });

    // 3. 별도 함수에서 배치 처리
    // - 여러 히스토리를 모아서 한 번에 업데이트
    // - 동시성 문제 회피
}
```

## 3. 히스토리 Pruning 전략

### 3.1 개수 기반 Pruning

```typescript
/**
 * 개수 기반 Pruning: 최신 N개만 유지
 * 
 * @param vectors 히스토리 벡터 배열
 * @param maxCount 최대 유지 개수
 * @returns Pruning된 벡터 배열
 */
function pruneByCount(
    vectors: QAHistoryVector[],
    maxCount: number = 1000
): QAHistoryVector[] {
    // 시간순 정렬 (최신순)
    const sorted = [...vectors].sort((a, b) => 
        new Date(b.metadata.timestamp).getTime() - 
        new Date(a.metadata.timestamp).getTime()
    );

    // 최신 N개만 유지
    return sorted.slice(0, maxCount);
}
```

### 3.2 시간 기반 Pruning

```typescript
/**
 * 시간 기반 Pruning: N일 이전 데이터 제거
 * 
 * @param vectors 히스토리 벡터 배열
 * @param maxAgeDays 최대 보관 일수
 * @returns Pruning된 벡터 배열
 */
function pruneByTime(
    vectors: QAHistoryVector[],
    maxAgeDays: number = 30
): QAHistoryVector[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

    return vectors.filter(vec => {
        const vecDate = new Date(vec.metadata.timestamp);
        return vecDate >= cutoffDate;
    });
}
```

### 3.3 중요도 기반 Pruning

```typescript
/**
 * 중요도 기반 Pruning: 점수 기반 선택적 유지
 * 
 * 중요도 점수 계산:
 * - 성공률 높은 질문/답변 우선 유지
 * - 자주 검색되는 항목 우선 유지
 * - 최근 항목에 가중치 부여
 */
interface ImportanceScore {
    vector: QAHistoryVector;
    score: number;
}

function calculateImportanceScore(
    vector: QAHistoryVector,
    searchCount: number = 0
): number {
    const ageDays = (Date.now() - new Date(vector.metadata.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    
    // 기본 점수
    let score = 1.0;

    // 성공률 가중치
    if (vector.metadata.status === "success") {
        score += 2.0;
    } else if (vector.metadata.status === "partial") {
        score += 1.0;
    }

    // 검색 빈도 가중치
    score += Math.log10(searchCount + 1) * 0.5;

    // 시간 가중치 (최근일수록 높음)
    score += Math.exp(-ageDays / 7) * 1.0;  // 7일 기준 지수 감쇠

    // 카테고리 가중치 (중요 카테고리 우선)
    const importantCategories = ["implementation", "structure", "architecture"];
    if (importantCategories.includes(vector.metadata.category)) {
        score += 0.5;
    }

    return score;
}

function pruneByImportance(
    vectors: QAHistoryVector[],
    maxCount: number = 1000,
    searchCounts: Map<string, number> = new Map()
): QAHistoryVector[] {
    // 중요도 점수 계산
    const scored: ImportanceScore[] = vectors.map(vec => ({
        vector: vec,
        score: calculateImportanceScore(vec, searchCounts.get(vec.id) || 0)
    }));

    // 점수 내림차순 정렬
    scored.sort((a, b) => b.score - a.score);

    // 상위 N개만 유지
    return scored.slice(0, maxCount).map(item => item.vector);
}
```

### 3.4 통합 Pruning 전략

```typescript
/**
 * 통합 Pruning: 여러 전략 조합
 */
interface PruningOptions {
    maxCount?: number;           // 최대 개수
    maxAgeDays?: number;         // 최대 보관 일수
    minImportanceScore?: number; // 최소 중요도 점수
    strategy: "count" | "time" | "importance" | "hybrid";
}

async function pruneHistory(
    vectors: QAHistoryVector[],
    options: PruningOptions
): Promise<QAHistoryVector[]> {
    const {
        maxCount = 1000,
        maxAgeDays = 30,
        minImportanceScore = 0.5,
        strategy = "hybrid"
    } = options;

    let pruned = [...vectors];

    switch (strategy) {
        case "count":
            pruned = pruneByCount(pruned, maxCount);
            break;

        case "time":
            pruned = pruneByTime(pruned, maxAgeDays);
            break;

        case "importance":
            // 검색 빈도 데이터 로드 (별도 저장소에서)
            const searchCounts = await loadSearchCounts();
            pruned = pruneByImportance(pruned, maxCount, searchCounts);
            break;

        case "hybrid":
        default:
            // 1. 시간 기반 필터링 (오래된 데이터 제거)
            pruned = pruneByTime(pruned, maxAgeDays);
            
            // 2. 개수 기반 제한 (여전히 많으면)
            if (pruned.length > maxCount) {
                const searchCounts = await loadSearchCounts();
                pruned = pruneByImportance(pruned, maxCount, searchCounts);
            }
            break;
    }

    return pruned;
}
```

### 3.5 세션 기반 Pruning

```typescript
/**
 * 세션 기반 Pruning: 세션 단위로 관리
 * 
 * - 활성 세션의 히스토리는 우선 유지
 * - 비활성 세션은 시간/개수 기반으로 제거
 */
function pruneBySession(
    vectors: QAHistoryVector[],
    activeSessions: Set<string>,
    maxSessions: number = 100
): QAHistoryVector[] {
    // 세션별 그룹화
    const bySession = new Map<string, QAHistoryVector[]>();
    for (const vec of vectors) {
        const sessionId = vec.metadata.sessionId;
        if (!bySession.has(sessionId)) {
            bySession.set(sessionId, []);
        }
        bySession.get(sessionId)!.push(vec);
    }

    // 활성 세션 우선 유지
    const activeVectors: QAHistoryVector[] = [];
    const inactiveSessions: Array<{ sessionId: string; vectors: QAHistoryVector[] }> = [];

    for (const [sessionId, sessionVectors] of bySession.entries()) {
        if (activeSessions.has(sessionId)) {
            activeVectors.push(...sessionVectors);
        } else {
            inactiveSessions.push({ sessionId, vectors: sessionVectors });
        }
    }

    // 비활성 세션 정렬 (최신순)
    inactiveSessions.sort((a, b) => {
        const aLatest = Math.max(...a.vectors.map(v => new Date(v.metadata.timestamp).getTime()));
        const bLatest = Math.max(...b.vectors.map(v => new Date(v.metadata.timestamp).getTime()));
        return bLatest - aLatest;
    });

    // 최신 N개 세션만 유지
    const keptInactive = inactiveSessions.slice(0, maxSessions);
    const inactiveVectors = keptInactive.flatMap(s => s.vectors);

    return [...activeVectors, ...inactiveVectors];
}
```

## 4. 구현 예시

### 4.1 히스토리 추가 함수

```typescript
/**
 * Q&A 히스토리를 벡터 파일에 추가
 */
export async function addQAHistoryToVectors(
    qaRecord: {
        sessionId: string;
        question: string;
        answer: string;
        category: string;
        categoryConfidence: number;
        sources: string[];
        status: "success" | "partial" | "failed";
        responseTimeMs: number;
        tokenUsage: number;
    }
): Promise<void> {
    // 1. 질문/답변 임베딩 생성
    const questionEmbedding = await generateEmbedding(qaRecord.question);
    const answerEmbedding = await generateEmbedding(qaRecord.answer);

    const timestamp = new Date().toISOString();
    const questionId = `qa-${qaRecord.sessionId}-${timestamp}-question`;
    const answerId = `qa-${qaRecord.sessionId}-${timestamp}-answer`;

    // 2. 벡터 생성
    const questionVector: QAHistoryVector = {
        id: questionId,
        type: "question",
        embedding: questionEmbedding,
        content: qaRecord.question,
        metadata: {
            sessionId: qaRecord.sessionId,
            answerId: answerId,
            category: qaRecord.category,
            categoryConfidence: qaRecord.categoryConfidence,
            timestamp,
            responseTimeMs: qaRecord.responseTimeMs,
            tokenUsage: qaRecord.tokenUsage,
            sources: qaRecord.sources,
            status: qaRecord.status
        },
        createdAt: timestamp
    };

    const answerVector: QAHistoryVector = {
        id: answerId,
        type: "answer",
        embedding: answerEmbedding,
        content: qaRecord.answer,
        metadata: {
            sessionId: qaRecord.sessionId,
            questionId: questionId,
            category: qaRecord.category,
            categoryConfidence: qaRecord.categoryConfidence,
            timestamp,
            responseTimeMs: qaRecord.responseTimeMs,
            tokenUsage: qaRecord.tokenUsage,
            sources: qaRecord.sources,
            status: qaRecord.status
        },
        createdAt: timestamp
    };

    // 3. Atomic 업데이트
    await updateHistoryFileAtomic([questionVector, answerVector], {
        maxHistorySize: 1000,
        pruneStrategy: "hybrid"
    });
}
```

### 4.2 검색 시 히스토리 포함

```typescript
/**
 * 벡터 검색 시 히스토리 포함
 */
export async function searchWithHistory(
    queryEmbedding: number[],
    topK: number = 5,
    options?: {
        includeHistory?: boolean;
        historyWeight?: number;  // 히스토리 가중치 (0.0 ~ 1.0)
    }
): Promise<SearchResult[]> {
    const { includeHistory = true, historyWeight = 0.3 } = options || {};

    // 1. 코드 벡터 검색
    const codeResults = await searchCodeVectors(queryEmbedding, Math.ceil(topK * (1 - historyWeight)));

    if (!includeHistory) {
        return codeResults;
    }

    // 2. 히스토리 벡터 검색
    const historyFile = await loadHistoryFile();
    const historyResults = await searchInVectors(
        historyFile.vectors,
        queryEmbedding,
        Math.ceil(topK * historyWeight)
    );

    // 3. 결과 병합 및 재정렬
    const allResults = [...codeResults, ...historyResults]
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

    return allResults;
}
```

## 5. 배포 전략

### 5.1 파일 저장소 선택

**옵션 1: Vercel Blob Storage (권장)**
- Serverless 환경과 통합 용이
- 자동 CDN 배포
- 버전 관리 지원

**옵션 2: AWS S3 + CloudFront**
- 높은 안정성
- 저렴한 비용
- 버전 관리 가능

**옵션 3: GitHub Releases**
- 무료
- 버전 관리 자동
- CDN 없음 (느림)

### 5.2 업데이트 주기

```typescript
/**
 * 배치 업데이트 전략
 * 
 * - 실시간 업데이트: 이벤트 큐에 추가만
 * - 배치 업데이트: 주기적으로 큐 처리 (예: 5분마다)
 * - 파일 업로드: 배치 완료 후
 */
async function processHistoryUpdateQueue() {
    const batchSize = 50;  // 한 번에 처리할 최대 개수
    const queue = await getUpdateQueue();

    if (queue.length === 0) {
        return;
    }

    // 배치로 처리
    const batch = queue.splice(0, batchSize);
    const newVectors = await Promise.all(
        batch.map(item => generateHistoryVector(item))
    );

    // Atomic 업데이트
    await updateHistoryFileAtomic(newVectors, {
        maxHistorySize: 1000,
        pruneStrategy: "hybrid"
    });

    // 파일 업로드
    await uploadHistoryFile();
}
```

## 6. 모니터링 및 메트릭

```typescript
interface HistoryMetrics {
    totalVectors: number;
    questionVectors: number;
    answerVectors: number;
    fileSize: number;
    compressedSize: number;
    lastUpdated: string;
    prunedCount: number;
    updateFrequency: number;  // 업데이트 빈도 (회/일)
    averageUpdateTime: number; // 평균 업데이트 시간 (ms)
}
```

## 7. 결론

**핵심 전략:**
1. ✅ **분리된 파일**: 코드와 히스토리 분리로 업데이트 영향 최소화
2. ✅ **Atomic Write**: Write-Then-Move로 동시성 문제 회피
3. ✅ **Hybrid Pruning**: 시간 + 개수 + 중요도 조합으로 무한 증가 방지
4. ✅ **이벤트 기반**: 비동기 처리로 API 응답 속도 유지

**성능 목표:**
- 히스토리 추가: < 100ms (비동기)
- 파일 업데이트: < 5초 (배치)
- 검색 성능: 기존과 동일 (인덱스 활용)


# Embedding Data Schema Design

임베딩 결과를 서비스에서 재사용하기 위한 데이터 스키마 설계

---

## 1. 디렉토리 구조

```
embeddings/
├── meta.json                           # 전체 메타데이터
├── branches/
│   ├── main/
│   │   ├── manifest.json              # 브랜치별 메타정보
│   │   ├── commits/
│   │   │   ├── index.json             # 커밋 인덱스
│   │   │   ├── abc123.json            # 커밋 단위 임베딩
│   │   │   └── def456.json
│   │   ├── diffs/
│   │   │   ├── index.json             # Diff 인덱스
│   │   │   ├── abc123.json            # 커밋별 Diff 임베딩
│   │   │   └── def456.json
│   │   └── files/
│   │       ├── index.json             # 파일 인덱스
│   │       ├── src_index.json         # 경로별 파일 임베딩
│   │       └── src_utils_helper.json
│   └── dev/
│       └── (same structure)
└── full/
    ├── embeddings.json.gz             # 전체 통합 파일 (서비스용)
    └── embeddings-compact.json.gz     # 압축된 버전 (메타데이터 최소화)
```

---

## 2. 파일 스키마 정의

### 2.1 `meta.json` (전체 메타데이터)

```typescript
{
  "version": "1.0.0",
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
  "lastUpdated": "2025-12-31T12:00:00Z",
  "branches": {
    "main": {
      "lastCommit": "abc123",
      "lastUpdated": "2025-12-31T12:00:00Z",
      "totalCommits": 150,
      "totalFiles": 320,
      "totalDiffs": 150
    },
    "dev": {
      "lastCommit": "xyz789",
      "lastUpdated": "2025-12-30T10:00:00Z",
      "totalCommits": 145,
      "totalFiles": 310,
      "totalDiffs": 145
    }
  },
  "statistics": {
    "totalVectors": 620,
    "totalSize": "7.7MB",
    "compressedSize": "2.3MB"
  }
}
```

### 2.2 `branches/{branch}/manifest.json` (브랜치 메타정보)

```typescript
{
  "branch": "main",
  "lastCommit": {
    "sha": "abc123",
    "author": "username",
    "date": "2025-12-31T12:00:00Z",
    "message": "feat: Add new feature"
  },
  "commitRange": {
    "first": "000001",
    "last": "abc123",
    "total": 150
  },
  "indices": {
    "commits": "commits/index.json",
    "diffs": "diffs/index.json",
    "files": "files/index.json"
  },
  "incremental": {
    "enabled": true,
    "lastProcessed": "abc123",
    "checkpoint": "2025-12-31T12:00:00Z"
  }
}
```

### 2.3 `commits/index.json` (커밋 인덱스)

```typescript
{
  "type": "commits",
  "branch": "main",
  "total": 150,
  "lastUpdated": "2025-12-31T12:00:00Z",
  "items": [
    {
      "sha": "abc123",
      "author": "username",
      "date": "2025-12-31T12:00:00Z",
      "message": "feat: Add new feature",
      "filesChanged": 3,
      "dataFile": "abc123.json",
      "embedding": true,
      "fileSize": "12KB"
    },
    {
      "sha": "def456",
      "author": "username",
      "date": "2025-12-30T10:00:00Z",
      "message": "fix: Bug fix",
      "filesChanged": 1,
      "dataFile": "def456.json",
      "embedding": true,
      "fileSize": "8KB"
    }
  ]
}
```

### 2.4 `commits/{sha}.json` (커밋 임베딩 데이터)

```typescript
{
  "id": "commit-abc123",
  "type": "commit",
  "sha": "abc123",
  "branch": "main",
  "metadata": {
    "author": "username",
    "email": "user@example.com",
    "date": "2025-12-31T12:00:00Z",
    "message": "feat: Add new feature",
    "filesChanged": ["src/index.ts", "src/utils.ts"],
    "fileCount": 2,
    "additions": 50,
    "deletions": 10
  },
  "content": "feat: Add new feature | Files: src/index.ts, src/utils.ts",
  "embedding": {
    "vector": [0.123, -0.456, 0.789, ...],  // 1536 dimensions
    "model": "text-embedding-3-small",
    "createdAt": "2025-12-31T12:00:00Z"
  }
}
```

### 2.5 `diffs/index.json` (Diff 인덱스)

```typescript
{
  "type": "diffs",
  "branch": "main",
  "total": 150,
  "lastUpdated": "2025-12-31T12:00:00Z",
  "items": [
    {
      "commitSha": "abc123",
      "filesChanged": 3,
      "totalChunks": 5,
      "dataFile": "abc123.json",
      "fileSize": "45KB"
    }
  ]
}
```

### 2.6 `diffs/{sha}.json` (Diff 임베딩 데이터)

```typescript
{
  "commitSha": "abc123",
  "type": "diff",
  "branch": "main",
  "metadata": {
    "date": "2025-12-31T12:00:00Z",
    "author": "username",
    "message": "feat: Add new feature"
  },
  "diffs": [
    {
      "id": "diff-abc123-0",
      "filePath": "src/index.ts",
      "changeType": "modified",
      "additions": 30,
      "deletions": 5,
      "content": "@@ -10,5 +10,35 @@ export function main() {...",
      "embedding": {
        "vector": [0.234, -0.567, 0.890, ...],
        "model": "text-embedding-3-small",
        "createdAt": "2025-12-31T12:00:00Z"
      }
    },
    {
      "id": "diff-abc123-1",
      "filePath": "src/utils.ts",
      "changeType": "added",
      "additions": 20,
      "deletions": 0,
      "content": "+export function helper() {...",
      "embedding": {
        "vector": [0.345, -0.678, 0.901, ...],
        "model": "text-embedding-3-small",
        "createdAt": "2025-12-31T12:00:00Z"
      }
    }
  ]
}
```

### 2.7 `files/index.json` (파일 인덱스)

```typescript
{
  "type": "files",
  "branch": "main",
  "total": 320,
  "lastUpdated": "2025-12-31T12:00:00Z",
  "items": [
    {
      "path": "src/index.ts",
      "sha": "file-xyz789",
      "size": 12345,
      "extension": "ts",
      "fileType": "src",
      "chunks": 3,
      "dataFile": "src_index.json",
      "fileSize": "18KB"
    },
    {
      "path": "src/utils/helper.ts",
      "sha": "file-uvw456",
      "size": 5432,
      "extension": "ts",
      "fileType": "src",
      "chunks": 1,
      "dataFile": "src_utils_helper.json",
      "fileSize": "9KB"
    }
  ]
}
```

### 2.8 `files/{path}.json` (파일 임베딩 데이터)

```typescript
{
  "path": "src/index.ts",
  "type": "file",
  "branch": "main",
  "metadata": {
    "sha": "file-xyz789",
    "size": 12345,
    "extension": "ts",
    "fileType": "src",
    "lastModified": "2025-12-31T12:00:00Z",
    "totalChunks": 3
  },
  "chunks": [
    {
      "id": "file-xyz789-0",
      "chunkIndex": 0,
      "lines": "1-50",
      "content": "import { ... }\n\nexport function main() {...",
      "embedding": {
        "vector": [0.456, -0.789, 0.012, ...],
        "model": "text-embedding-3-small",
        "createdAt": "2025-12-31T12:00:00Z"
      }
    },
    {
      "id": "file-xyz789-1",
      "chunkIndex": 1,
      "lines": "51-100",
      "content": "function helper() {...",
      "embedding": {
        "vector": [0.567, -0.890, 0.123, ...],
        "model": "text-embedding-3-small",
        "createdAt": "2025-12-31T12:00:00Z"
      }
    }
  ]
}
```

### 2.9 `full/embeddings.json.gz` (서비스용 통합 파일)

```typescript
{
  "version": "1.0",
  "dimension": 1536,
  "count": 620,
  "createdAt": "2025-12-31T12:00:00Z",
  "metadata": {
    "owner": "username",
    "repo": "repo-name",
    "branch": "main"
  },
  "vectors": [
    {
      "id": "commit-abc123",
      "type": "commit",
      "embedding": [0.123, -0.456, ...],
      "content": "feat: Add new feature | Files: src/index.ts",
      "metadata": {
        "sha": "abc123",
        "author": "username",
        "date": "2025-12-31T12:00:00Z",
        "message": "feat: Add new feature"
      }
    },
    {
      "id": "diff-abc123-0",
      "type": "diff",
      "embedding": [0.234, -0.567, ...],
      "content": "@@ -10,5 +10,35 @@ export function main() {...",
      "metadata": {
        "commitSha": "abc123",
        "filePath": "src/index.ts",
        "changeType": "modified"
      }
    },
    {
      "id": "file-xyz789-0",
      "type": "file",
      "embedding": [0.456, -0.789, ...],
      "content": "src/index.ts: import { ... }",
      "metadata": {
        "path": "src/index.ts",
        "fileType": "src",
        "extension": "ts",
        "chunkIndex": 0
      }
    }
  ]
}
```

---

## 3. 필수 메타 정보

### 3.1 전역 메타 (meta.json)
- ✅ `version` - 스키마 버전
- ✅ `repository` - 레포지토리 정보 (owner, name, url)
- ✅ `embedding` - 임베딩 모델 정보 (model, provider, dimension)
- ✅ `lastUpdated` - 마지막 업데이트 시간
- ✅ `branches` - 브랜치별 메타정보
- ✅ `statistics` - 통계 정보 (총 벡터 수, 크기)

### 3.2 브랜치별 메타 (manifest.json)
- ✅ `branch` - 브랜치 이름
- ✅ `lastCommit` - 마지막 커밋 정보 (sha, author, date, message)
- ✅ `commitRange` - 커밋 범위 (first, last, total)
- ✅ `indices` - 인덱스 파일 경로
- ✅ `incremental` - 증분 업데이트 정보 (enabled, lastProcessed, checkpoint)

### 3.3 인덱스 메타 (index.json)
- ✅ `type` - 데이터 타입 (commits/diffs/files)
- ✅ `branch` - 브랜치 이름
- ✅ `total` - 총 항목 수
- ✅ `lastUpdated` - 마지막 업데이트 시간
- ✅ `items` - 항목 목록 (sha/path, dataFile, fileSize)

### 3.4 임베딩 데이터 메타
- ✅ `id` - 고유 ID (commit-{sha}, diff-{sha}-{index}, file-{sha}-{index})
- ✅ `type` - 타입 (commit/diff/file)
- ✅ `branch` - 브랜치 이름
- ✅ `metadata` - 타입별 메타정보
  - Commit: sha, author, email, date, message, filesChanged, fileCount
  - Diff: commitSha, filePath, changeType, additions, deletions
  - File: path, sha, size, extension, fileType, chunkIndex, totalChunks
- ✅ `content` - 임베딩된 텍스트 내용
- ✅ `embedding` - 임베딩 벡터 정보
  - `vector` - 1536차원 벡터
  - `model` - 임베딩 모델명
  - `createdAt` - 생성 시간

---

## 4. 증분 업데이트 전략

### 4.1 신규 커밋 감지
1. `manifest.json`의 `lastCommit` 확인
2. Git에서 `lastCommit` 이후 신규 커밋 조회
3. 신규 커밋에 대해서만 임베딩 생성

### 4.2 인덱스 업데이트
1. 기존 `index.json` 로드
2. 신규 항목 추가 (중복 체크: sha/path 기준)
3. `total`, `lastUpdated` 갱신

### 4.3 브랜치별 격리
- 각 브랜치는 독립된 디렉토리
- 브랜치 간 데이터 공유 없음
- 브랜치 전환 시 해당 디렉토리만 참조

### 4.4 체크포인트 저장
```typescript
{
  "incremental": {
    "enabled": true,
    "lastProcessed": "abc123",
    "checkpoint": "2025-12-31T12:00:00Z",
    "processedCommits": ["abc123", "def456", "ghi789"]
  }
}
```

---

## 5. 서비스 조회 최적화

### 5.1 인덱스 기반 조회
```typescript
// 1. 인덱스로 빠른 검색
const index = await loadIndex('commits/index.json');
const commit = index.items.find(item => item.sha === 'abc123');

// 2. 필요한 파일만 로드
const data = await loadFile(commit.dataFile);
```

### 5.2 통합 파일 사용
```typescript
// 서비스용 통합 파일 (전체 로드)
const embeddings = await loadGzipJson('full/embeddings.json.gz');
// → 메모리 캐싱 후 빠른 검색
```

### 5.3 필터링 최적화
```typescript
// 타입별 필터링
const commits = embeddings.vectors.filter(v => v.type === 'commit');
const files = embeddings.vectors.filter(v => v.type === 'file');

// 메타데이터 필터링
const recent = embeddings.vectors.filter(v =>
  new Date(v.metadata.date) > new Date('2025-12-01')
);
```

---

## 6. 파일명 규칙

### 6.1 Commit/Diff 파일
- 형식: `{sha}.json`
- 예: `abc123def456.json`

### 6.2 File 파일
- 형식: `{path_with_underscores}.json`
- 예: `src_index.json`, `src_utils_helper.json`
- 경로 변환: `/` → `_`, `.` → `_`

### 6.3 통합 파일
- 형식: `embeddings.json.gz`
- 압축: gzip 압축 필수
- 크기: 7.7MB → 2.3MB (70% 압축)

---

## 7. 버전 관리

### 7.1 스키마 버전
- `meta.json`의 `version` 필드로 관리
- Semantic Versioning (1.0.0)
- Breaking change 시 major 버전 증가

### 7.2 호환성
- v1.x → v2.x 마이그레이션 스크립트 제공
- 구 버전 데이터 자동 변환

---

## 8. 사용 예시

### 8.1 전체 로드 (서비스)
```typescript
const embeddings = await loadGzipJson('full/embeddings.json.gz');
// 메모리 캐싱 → 빠른 검색
```

### 8.2 증분 업데이트
```typescript
const manifest = await loadJson('branches/main/manifest.json');
const newCommits = getCommitsSince(manifest.incremental.lastProcessed);
// 신규 커밋만 처리
```

### 8.3 특정 타입 조회
```typescript
const index = await loadJson('commits/index.json');
const commit = await loadJson(`commits/${index.items[0].dataFile}`);
// 필요한 파일만 로드
```

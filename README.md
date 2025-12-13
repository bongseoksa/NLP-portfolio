# GitHub Analyzer

GitHub repositories를 분석하여 코드와 커밋 히스토리 정보를 추출하는 도구입니다. 특정 레포지토리의 커밋 기록, 변경된 파일 정보, 그리고 diff 내용을 수집하여 분석 리포트를 생성하기 위한 데이터를 전처리합니다.

## Installation

```bash
pnpm install
```

## Usage

```bash
# 파이프라인 실행 (데이터 수집 및 적재)
pnpm run start

# 질의응답 (QA) 모드 실행
pnpm run ask "이 프로젝트의 최근 변경사항은 무엇인가요?"
```

## 프로젝트 구조 (Project Structure)

현재 프로젝트의 주요 디렉토리 및 파일 구성은 다음과 같습니다:

- **`src/`**: 소스 코드 디렉토리
  - **`index.ts`**: 어플리케이션의 진입점(Entry Point)입니다.
  - **`config/`**: 환경 변수 로드 등 설정 관리
  - **`data_sources/`**: 데이터 수집 계층
    - **`github/`**: GitHub API 연동 (`fetchCommit.ts`, `fetchFiles.ts`)
    - **`git/`**: 로컬 Git 및 Diff 분석 (`parseLog.ts`, `extractDiff.ts`)
  - **`models/`**: TypeScript 타입 정의 및 데이터 모델 (`Commit.ts`, `File.ts` 등)
  - **`pipeline/`**: 전체 데이터 처리 파이프라인 워크플로우
    - `runPipeline.ts`: 파이프라인 실행 로직
    - **`steps/`**: 파이프라인의 개별 처리 단계 (예: `preprocessText.ts`)
  - **`utils/`**: 공통 유틸리티
- **`data/`**: 데이터 저장소
  - **`raw/`**: 수집된 원본 데이터
  - **`processed/`**: 정제된 데이터
  - **`vectors/`**: 임베딩 벡터 데이터 (예정)
- **`output/`**: (Legacy) 이전 출력 경로, `data/`로 통합 예정

## OpenAI API 설정 (OpenAI API Setup)

NLP 임베딩 기능을 사용하기 위해서는 OpenAI API 키가 필요합니다.

1. [OpenAI Platform](https://platform.openai.com/)에 접속하여 가입 또는 로그인합니다.
2. [API Keys 페이지](https://platform.openai.com/api-keys)로 이동합니다.
3. **"Create new secret key"** 버튼을 클릭하여 새로운 키를 발급받습니다.
4. 발급된 키를 복사하여 `.env` 파일에 `OPENAI_API_KEY` 변수로 추가합니다.

```env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx
```

> [!WARNING]
> API 키는 외부에 노출되지 않도록 주의하세요. GitHub 등 공개 저장소에 `.env` 파일이 업로드되지 않도록 확인해야 합니다.

## ChromaDB 설정 및 실행 (ChromaDB Setup & Run)

이 프로젝트는 벡터 저장을 위해 [ChromaDB](https://www.trychroma.com/)를 사용합니다. 로컬에서 Chroma 서버를 실행해야 `start` 및 `ask` 명령어가 정상 동작합니다.

### 실행 방법 (Recommended)

프로젝트에 포함된 스크립트를 사용하여 간편하게 설정 및 실행할 수 있습니다.

1. **설정 (최초 1회)**
   시스템에서 호환되는 Python(3.9 ~ 3.12) 버전을 자동으로 찾아 가상환경을 구성하고 ChromaDB를 설치합니다.
   ```bash
   pnpm run chroma:setup
   ```

2. **서버 실행**
   ```bash
   pnpm run chroma:start
   ```
   서버는 `http://localhost:8000`에서 실행됩니다. 터미널을 열어두고 실행 상태를 유지하세요.

### (참고) Docker 실행

Docker를 사용하는 경우 다음과 같이 실행할 수도 있습니다.
```bash
docker run -p 8000:8000 chromadb/chroma
```
*Note: 로컬 스크립트 실행이 동작하지 않는 경우에만 사용하세요.*

## 전처리 과정 프로세스 (Preprocessing Process)

본 프로젝트는 GitHub API와 로컬 Git 명령어를 활용하여 다음과 같은 6단계의 데이터 전처리 파이프라인을 거칩니다:

1. **초기화 및 환경 설정 (Initialization)**
   - `.env` 파일에서 `TARGET_REPO_OWNER`, `TARGET_REPO_NAME`, `LOCAL_REPO_PATH` 등 필수 환경 변수가 설정되어 있는지 확인합니다.

2. **GitHub 커밋 목록 수집 (Fetch Commits)**
   - `src/github/fetchCommit.ts`를 통해 GitHub API로 타겟 레포지토리의 모든 커밋 정보를 가져옵니다.
   - 페이지네이션(Pagination)을 지원하여 누락 없이 전체 히스토리를 수집합니다.
   - 각 커밋의 SHA, 작성자, 날짜, 메시지 등을 추출합니다.

3. **변경 파일 정보 조회 (Fetch Changed Files)**
   - 수집된 각 커밋에 대해 `src/github/fetchFiles.ts`를 실행하여 변경된 파일 목록을 조회합니다.
   - 파일명, 변경 상태(added, modified, removed 등), 추가/삭제된 라인 수(additions, deletions) 정보를 수집합니다.

4. **로컬 Diff 추출 (Extract Local Diffs)**
   - `src/git/parseLog.ts`와 `src/git/extractDiff.ts`를 사용하여 로컬에 클론된 저장소에서 직접 Git 명령어를 실행합니다.
   - `git show {sha} --numstat --patch` 명령어를 통해 상세한 코드 변경 내역(Full Diff)을 추출합니다.
   - 이는 GitHub API의 제한을 보완하고 더 상세한 로컬 분석 데이터를 확보하기 위함입니다.

5. **데이터 집계 및 저장 (Aggregation & Output)**
   - 위 단계에서 수집한 모든 데이터(Commits, Changed Files, Local Diffs)를 하나로 병합합니다.
   - 중간 결과물은 `output/pipeline_output.json` 파일로 저장됩니다.

6. **데이터 정제 (Data Refinement)**
   - NLP 모델 학습 및 임베딩 생성을 위해 수집된 Raw 데이터를 정제합니다.
   - 커밋 메시지, 변경 파일, Diff 내용을 하나의 문맥(Context)으로 결합하고, LLM이 처리하기 적절한 텍스트 청크(Chunk) 형태로 변환합니다.
   - 최종 정제된 데이터는 `output/refined_data.json`으로 저장됩니다.

## 진행 현황 (Progress)

*   [x] 분석 대상 레포지토리 확정: React + Vite 기반 portfolio
*   [x] 분석용 레포지토리 생성 완료: NLP-portfolio
*   [x] TypeScript 기반 프로젝트 환경 구성 완료
*   [x] Github API + 로컬 프로젝트를 통한 전처리 파일 추출 (Pipeline Steps 1~5)
*   [x] NLP 입력용 데이터 정제 (Pipeline Step 6)
*   [ ] NLP 기반 질의응답 시스템 구축 (임베딩 및 검색)
*   [ ] 시각화 및 모니터링 대시보드

## 향후 확장 가능성 (Future Plans)

현재는 프론트엔드 레포지토리에 한정하지만, 추후 다음 데이터까지 추가해 프로젝트 지식 베이스를 강화할 수 있습니다.

*   백엔드 소스
*   DB 스키마
*   REST API/GraphQL 명세
*   디자인/기획 문서
*   Jira/Notion 이슈 기록
*   회의록, 회고록, 업무 로그
*   기능 배포 이력

## 이슈 관리 (Issue Management)

프로젝트 진행 중 발생한 이슈와 해결 방법을 기록합니다.

### 1. `chroma` 명령어를 찾지 못하는 문제

**증상**
```bash
$ chroma run --path ./chroma_data
zsh: command not found: chroma
```

**원인**
- ChromaDB가 Python 가상환경(`.chroma_venv`)에 설치되어 있으나, 가상환경을 활성화하지 않고 직접 명령어를 실행함
- 시스템 PATH에 가상환경의 `bin` 디렉토리가 포함되지 않음

**해결 방법**
```bash
# 방법 1: 제공된 스크립트 사용 (권장)
pnpm run chroma:start

# 방법 2: 가상환경 직접 활성화
source .chroma_venv/bin/activate
chroma run --path ./chroma_data

# 방법 3: 전체 경로로 실행
.chroma_venv/bin/chroma run --path ./chroma_data
```

---

### 2. ChromaDB Telemetry 에러 (PostHog 버전 호환성)

**증상**
```
ERROR: Failed to send telemetry event ServerStartEvent: capture() takes 1 positional argument but 3 were given
```

**원인**
- ChromaDB가 사용하는 PostHog 라이브러리의 버전 호환성 문제
- PostHog 7.x 버전에서 `capture()` 함수의 API가 변경되어 ChromaDB와 호환되지 않음

**해결 방법**
PostHog를 호환되는 3.x 버전으로 다운그레이드:
```bash
source .chroma_venv/bin/activate
pip install "posthog>=3.0.0,<4.0.0"
```

**확인**
```bash
# 버전 확인
pip show posthog
# Version: 3.25.0 (또는 3.x.x)

# 서버 재시작 후 에러 메시지가 사라지는지 확인
pnpm run chroma:start
```

---

### 3. ChromaDB 클라이언트-서버 버전 불일치 (`KeyError('_type')`)

**증상**
```
❌ searchVectors failed: ChromaServerError: KeyError('_type')
    at chromaFetch (...)
    at async ChromaClient.getCollection (...)
```

**원인**
- Node.js chromadb 클라이언트(3.x)와 Python ChromaDB 서버(0.5.x) 간의 **API 버전 불일치**
- chromadb 클라이언트 3.x는 서버 1.x 이상과 호환되도록 설계됨
- 서버 0.5.x의 API 응답 형식이 클라이언트가 기대하는 형식과 다름

| 구분 | 문제 버전 | 호환 버전 |
|------|-----------|-----------|
| Node.js chromadb 클라이언트 | 3.1.6 | 3.1.6 (변경 불필요) |
| Python ChromaDB 서버 | 0.5.23 ❌ | **1.0.0 이상** ✅ |

**해결 방법**
Python ChromaDB 서버를 1.x 버전으로 업그레이드:
```bash
source .chroma_venv/bin/activate
pip install "chromadb>=1.0.0" "posthog>=3.0.0,<4.0.0"
```

**확인**
```bash
# 버전 확인
pip show chromadb
# Version: 1.3.7 (또는 1.x.x)

# 서버 재시작
pnpm run chroma:start

# 질의응답 테스트
pnpm ask "테스트 질문"
# KeyError 없이 정상 동작하면 해결됨
```

**참고**: `setup_chroma.sh` 스크립트가 이미 호환되는 버전을 설치하도록 업데이트되었습니다. 새로 설정하는 경우 `pnpm run chroma:setup`을 실행하면 됩니다.

---

## 비고 (Notes)
- .env 파일은 gitignore에 추가하는 것이 기본이지만, PoC 프로젝트인 경우 편의를 위해 고려될 수 있습니다. (현재 프로젝트 설정 확인 필요)
- GitHub API 호출 시 Rate Limit에 유의해야 합니다.


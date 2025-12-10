# GitHub Analyzer

GitHub repositories를 분석하여 코드와 커밋 히스토리 정보를 추출하는 도구입니다. 특정 레포지토리의 커밋 기록, 변경된 파일 정보, 그리고 diff 내용을 수집하여 분석 리포트를 생성하기 위한 데이터를 전처리합니다.

## Installation

```bash
pnpm install
```

## Usage

```bash
pnpm run start
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

## 비고 (Notes)
- .env 파일은 gitignore에 추가하는 것이 기본이지만, PoC 프로젝트인 경우 편의를 위해 고려될 수 있습니다. (현재 프로젝트 설정 확인 필요)
- GitHub API 호출 시 Rate Limit에 유의해야 합니다.


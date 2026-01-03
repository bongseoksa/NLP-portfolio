# 📚 NLP-Portfolio 프로젝트 문서

> **최종 업데이트**: 2026-01-03
> **문서 버전**: v1.0

---

## 📂 문서 구조

```
docs/
├── 00_Product_Plan.md                        # 최종 기획서 (PRD)
├── README.md                                  # 문서 가이드 (현재 파일)
│
├── 01_planning/                               # 기획 문서
│   └── 99_PROJECT-SPECIFICATION_backup.md     # 이전 기획서 (백업)
│
├── 02_architecture/                           # 아키텍처 설계
│   ├── 01_System_Architecture.md              # 시스템 아키텍처 상세
│   └── 02_Environment_Variables.md            # 환경 변수 설정 가이드
│
├── 03_database/                               # 데이터베이스
│   ├── 01_Schema.sql                          # Supabase 스키마
│   └── 02_Schema_Documentation.md             # 스키마 설명 문서
│
├── 04_ci-cd/                                  # CI/CD
│   └── 01_Workflows.md                        # GitHub Actions 워크플로우
│
└── 05_api/                                    # API 명세 (예정)
    └── 01_API_Specification.md                # API 엔드포인트 문서
```

---

## 🎯 문서 읽기 순서

### 1단계: 프로젝트 이해

**필수**:
1. [00_Product_Plan.md](./00_Product_Plan.md) - 프로젝트 개요, 목표, 기술 스택

**선택**:
- `01_planning/99_PROJECT-SPECIFICATION_backup.md` - 이전 기획서 (참고용)

### 2단계: 시스템 설계 이해

**필수**:
1. [02_architecture/01_System_Architecture.md](./02_architecture/01_System_Architecture.md) - 전체 아키텍처, 데이터 흐름
2. [02_architecture/02_Environment_Variables.md](./02_architecture/02_Environment_Variables.md) - 환경 설정

### 3단계: 데이터베이스 이해

**필수**:
1. [03_database/02_Schema_Documentation.md](./03_database/02_Schema_Documentation.md) - 테이블 구조 설명
2. [03_database/01_Schema.sql](./03_database/01_Schema.sql) - SQL 스키마

### 4단계: CI/CD 이해

**필수**:
1. [04_ci-cd/01_Workflows.md](./04_ci-cd/01_Workflows.md) - GitHub Actions 워크플로우

---

## 🚀 빠른 시작 가이드

### 로컬 개발 환경 설정

1. **환경 변수 설정**
   ```bash
   cp .env.example .env
   # .env 파일 편집 (Personal Access Token 추가)
   ```

   상세: [02_architecture/02_Environment_Variables.md](./02_architecture/02_Environment_Variables.md)

2. **데이터베이스 설정**
   - Supabase 프로젝트 생성
   - [03_database/01_Schema.sql](./03_database/01_Schema.sql) 실행

3. **패키지 설치 및 실행**
   ```bash
   pnpm install
   pnpm run dev
   ```

### GitHub Actions 설정

1. **GitHub Secrets 추가**
   ```
   Repository → Settings → Secrets and variables → Actions
   ```

   필수 Secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CLAUDE_API_KEY`
   - `GEMINI_API_KEY`

   상세: [02_architecture/02_Environment_Variables.md](./02_architecture/02_Environment_Variables.md)

2. **워크플로우 권한 설정**
   ```
   Repository → Settings → Actions → General → Workflow permissions
   → "Read and write permissions" 활성화
   ```

---

## 📖 주요 문서 설명

### [00_Product_Plan.md](./00_Product_Plan.md)
**최종 기획서 (Product Requirements Document)**

- 프로젝트 개요 및 목표
- 기술 스택 상세
- 시스템 아키텍처 요약
- 주요 기능 목록
- 데이터 모델 개요
- 리스크 관리
- 프로젝트 일정

**대상 독자**: 전체 (프로젝트 멤버, 이해관계자)

---

### [02_architecture/01_System_Architecture.md](./02_architecture/01_System_Architecture.md)
**시스템 아키텍처 상세 설계**

- 설계 원칙 (Zero Server Cost, CI-First)
- 컴포넌트 다이어그램
- CI Pipeline 흐름 (Sequence Diagram)
- 런타임 흐름 (Sequence Diagram)
- 환경별 인증 전략
- 벡터 저장 아키텍처
- LLM Fallback 아키텍처

**대상 독자**: 개발자, 시스템 설계자

---

### [02_architecture/02_Environment_Variables.md](./02_architecture/02_Environment_Variables.md)
**환경 변수 설정 가이드**

- 환경별 변수 설정 (GitHub Actions, 로컬, Vercel)
- Personal Access Token 생성 방법
- 보안 권장 사항
- 환경 변수 체크리스트

**대상 독자**: 개발자, DevOps

---

### [03_database/01_Schema.sql](./03_database/01_Schema.sql)
**Supabase 데이터베이스 스키마**

- 테이블 정의 (qa_history, embeddings, ping, commit_state)
- 인덱스 생성
- Row Level Security (RLS) 정책
- 샘플 쿼리

**대상 독자**: 백엔드 개발자, DBA

---

### [03_database/02_Schema_Documentation.md](./03_database/02_Schema_Documentation.md)
**데이터베이스 스키마 설명 문서**

- 테이블별 상세 설명
- 샘플 데이터
- 사용 시나리오
- 벡터 검색 최적화
- 보안 정책 설명

**대상 독자**: 백엔드 개발자, 프론트엔드 개발자

---

### [04_ci-cd/01_Workflows.md](./04_ci-cd/01_Workflows.md)
**GitHub Actions 워크플로우 문서**

- 워크플로우 개요 (3개)
- Polling Pipeline 상세
- Export Embeddings 상세
- Supabase Ping 상세
- 트러블슈팅 가이드

**대상 독자**: DevOps, 백엔드 개발자

---

## 🔄 문서 업데이트 정책

### 절대 규칙

1. **최종 기획서는 항상 `00_Product_Plan.md`로 유지**
   - 다른 이름으로 변경 금지
   - 최신 기획 내용으로 항상 업데이트

2. **카테고리별 디렉토리 분리**
   - `01_planning`: 기획 문서
   - `02_architecture`: 아키텍처 설계
   - `03_database`: 데이터베이스
   - `04_ci-cd`: CI/CD
   - `05_api`: API 명세

3. **파일명 규칙**
   - `01_`, `02_`, ... (두 자리 숫자 + 언더스코어)로 시작
   - 오름차순으로 정렬
   - 예시: `01_System_Architecture.md`, `02_Environment_Variables.md`

### 문서 버전 관리

- 각 문서 상단에 **문서 버전**, **최종 업데이트 날짜** 명시
- 주요 변경 사항은 문서 하단 **변경 이력** 섹션에 기록

### 문서 리뷰 주기

- **월 1회**: 모든 문서 리뷰
- **기능 추가 시**: 관련 문서 즉시 업데이트
- **아키텍처 변경 시**: 영향받는 모든 문서 업데이트

---

## 📞 문서 관련 문의

- **작성자**: bongseok.sa
- **GitHub Issues**: [NLP-Portfolio Issues](https://github.com/username/NLP-portfolio/issues)

---

## 📋 체크리스트

### 새로운 개발자 온보딩

- [ ] `00_Product_Plan.md` 읽기
- [ ] `02_architecture/01_System_Architecture.md` 읽기
- [ ] `02_architecture/02_Environment_Variables.md` 읽고 로컬 환경 설정
- [ ] `03_database/02_Schema_Documentation.md` 읽기
- [ ] `04_ci-cd/01_Workflows.md` 읽기
- [ ] 로컬에서 `pnpm run dev` 실행 성공
- [ ] 질문 사항 정리 및 팀 미팅

### 프로덕션 배포 전

- [ ] 모든 GitHub Secrets 설정 완료
- [ ] Supabase 스키마 적용 완료
- [ ] GitHub Actions 워크플로우 테스트 성공
- [ ] 환경 변수 Vercel에 설정 완료
- [ ] 문서와 실제 구현 일치 확인

---

**문서 작성 완료**: 2026-01-03 10:55 KST

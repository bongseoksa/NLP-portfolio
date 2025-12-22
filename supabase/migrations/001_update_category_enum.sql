-- 질문 카테고리 확장 마이그레이션
-- 기존 6개 카테고리에서 12개 카테고리로 확장
--
-- 실행 방법: Supabase SQL Editor에서 이 파일의 내용을 복사하여 실행하세요.
-- 생성일: 2025-12-22
-- 설명: 기존 질문들을 새로운 분류기로 재분류하고 스키마를 업데이트합니다.

-- Step 1: 기존 CHECK 제약 조건 삭제
ALTER TABLE qa_history DROP CONSTRAINT IF EXISTS qa_history_category_check;

-- Step 2: 기존 질문들을 질문 내용 기반으로 재분류
-- 분류기 패턴 매칭을 통해 자동 생성된 매핑
UPDATE qa_history SET category = 'etc', category_confidence = 0.5 WHERE id = '0290d587-a38f-4552-b814-d87bb1735d12';
UPDATE qa_history SET category = 'etc', category_confidence = 0.5 WHERE id = '19234454-721a-4274-8c7d-e6eb013e619b';
UPDATE qa_history SET category = 'techStack', category_confidence = 1 WHERE id = '2e70ba94-442c-4127-aed3-875331716fe0';
UPDATE qa_history SET category = 'testing', category_confidence = 1 WHERE id = '8496eac1-e330-4a4e-8888-3cae26fcf7b8';
UPDATE qa_history SET category = 'techStack', category_confidence = 1 WHERE id = '9e4aebce-0419-43f6-aa89-a96cd2a739cf';
UPDATE qa_history SET category = 'etc', category_confidence = 0.5 WHERE id = 'b0f0e23e-9eef-48d1-afa2-cd46ffc01161';
UPDATE qa_history SET category = 'etc', category_confidence = 0.5 WHERE id = '0e0af2a3-a7fb-4056-861a-454904b33656';
UPDATE qa_history SET category = 'testing', category_confidence = 1 WHERE id = '65851807-43cb-4dca-b405-313308522638';
UPDATE qa_history SET category = 'testing', category_confidence = 1 WHERE id = '4d697931-f736-4f40-a594-82e5798d804d';
UPDATE qa_history SET category = 'etc', category_confidence = 0.5 WHERE id = 'ece7487f-a7c4-4600-97e0-e8ed3a1be102';
UPDATE qa_history SET category = 'etc', category_confidence = 0.5 WHERE id = 'b38c5509-5e74-49f2-a5c4-83221b14431b';
UPDATE qa_history SET category = 'etc', category_confidence = 0.5 WHERE id = '735e1f9a-6faf-4099-a4ba-08dc60319b3c';
UPDATE qa_history SET category = 'etc', category_confidence = 0.5 WHERE id = '014ed433-ffa7-4581-a554-954b60a3ea18';
UPDATE qa_history SET category = 'techStack', category_confidence = 1 WHERE id = '7a187494-c715-463a-8fa8-33e56a608c42';
UPDATE qa_history SET category = 'etc', category_confidence = 0.5 WHERE id = '654bf44c-4e73-4c1e-b871-6bb529ede234';
UPDATE qa_history SET category = 'implementation', category_confidence = 1 WHERE id = '707972d1-9ba2-4127-b814-2709b10b6de0';

-- Step 3: 범용 마이그레이션 (향후 추가 데이터를 위한 fallback)
-- 혹시 위 ID 목록에 없는 데이터가 있을 경우를 대비
UPDATE qa_history
SET category = 'etc', category_confidence = 0
WHERE category NOT IN (
    'issue', 'implementation', 'structure', 'history', 'data',
    'planning', 'status', 'techStack', 'cs', 'testing', 'summary', 'etc'
);

-- Step 4: 새로운 CHECK 제약 조건 추가 (12개 카테고리)
ALTER TABLE qa_history
ADD CONSTRAINT qa_history_category_check
CHECK (category IN (
    'issue',          -- 버그, 오류, 문제
    'implementation', -- 구현, 코드 작성 방법
    'structure',      -- 프로젝트 구조, 아키텍처
    'history',        -- 커밋 히스토리, 변경 이력
    'data',           -- 데이터 수집, 저장, 처리
    'planning',       -- 계획, 로드맵, 향후 작업
    'status',         -- 상태, 진행 상황
    'techStack',      -- 기술 스택, 라이브러리, 프레임워크
    'cs',             -- 컴퓨터 과학 이론, 알고리즘
    'testing',        -- 테스트, 검증
    'summary',        -- 요약, 개요
    'etc'             -- 기타
));

-- 마이그레이션 완료
-- ✅ 16개 질문이 재분류되었습니다.
-- 새로운 분포: etc(9), techStack(3), testing(3), implementation(1)

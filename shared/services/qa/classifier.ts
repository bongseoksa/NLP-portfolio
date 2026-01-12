/**
 * Question Classifier
 * 질문을 카테고리별로 분류
 */

export type QuestionCategory =
  | 'planning'
  | 'technical'
  | 'history'
  | 'cs'
  | 'status'
  | 'issue'
  | 'implementation'
  | 'structure'
  | 'data'
  | 'techStack'
  | 'testing'
  | 'summary'
  | 'etc';

export interface ClassificationResult {
  category: QuestionCategory;
  confidence: number;
}

// 카테고리별 키워드 패턴
const categoryPatterns: Record<QuestionCategory, RegExp[]> = {
  planning: [
    /기획/i,
    /계획/i,
    /일정/i,
    /로드맵/i,
    /마일스톤/i,
    /스프린트/i,
    /백로그/i,
    /plan/i,
    /schedule/i,
    /roadmap/i,
  ],
  technical: [
    /기술/i,
    /구현.*방법/i,
    /어떻게.*작동/i,
    /원리/i,
    /알고리즘/i,
    /로직/i,
    /패턴/i,
    /아키텍처/i,
    /how.*work/i,
    /technical/i,
  ],
  history: [
    /히스토리/i,
    /변경.*이력/i,
    /커밋/i,
    /언제.*변경/i,
    /수정.*내역/i,
    /history/i,
    /commit/i,
    /change.*log/i,
    /git.*log/i,
  ],
  cs: [
    /고객/i,
    /문의/i,
    /지원/i,
    /서비스/i,
    /사용.*방법/i,
    /help/i,
    /support/i,
    /customer/i,
  ],
  status: [
    /현황/i,
    /상태/i,
    /진행.*상황/i,
    /현재/i,
    /status/i,
    /current/i,
    /progress/i,
  ],
  issue: [
    /이슈/i,
    /버그/i,
    /오류/i,
    /에러/i,
    /문제/i,
    /fix/i,
    /bug/i,
    /error/i,
    /issue/i,
    /problem/i,
  ],
  implementation: [
    /구현/i,
    /개발/i,
    /코딩/i,
    /작성/i,
    /만들/i,
    /implement/i,
    /develop/i,
    /create/i,
    /build/i,
  ],
  structure: [
    /구조/i,
    /폴더/i,
    /디렉토리/i,
    /파일.*구성/i,
    /아키텍처/i,
    /structure/i,
    /folder/i,
    /directory/i,
    /architecture/i,
  ],
  data: [
    /데이터/i,
    /DB/i,
    /데이터베이스/i,
    /스키마/i,
    /테이블/i,
    /모델/i,
    /data/i,
    /database/i,
    /schema/i,
    /model/i,
  ],
  techStack: [
    /기술.*스택/i,
    /스택/i,
    /프레임워크/i,
    /라이브러리/i,
    /사용.*기술/i,
    /tech.*stack/i,
    /framework/i,
    /library/i,
    /dependencies/i,
  ],
  testing: [
    /테스트/i,
    /테스팅/i,
    /단위.*테스트/i,
    /통합.*테스트/i,
    /E2E/i,
    /test/i,
    /testing/i,
    /unit.*test/i,
    /integration/i,
  ],
  summary: [
    /요약/i,
    /정리/i,
    /개요/i,
    /설명/i,
    /뭐/i,
    /무엇/i,
    /summary/i,
    /overview/i,
    /what.*is/i,
  ],
  etc: [],
};

/**
 * 질문 분류
 */
export function classifyQuestion(question: string): ClassificationResult {
  const normalizedQuestion = question.toLowerCase().trim();

  const scores: Record<QuestionCategory, number> = {
    planning: 0,
    technical: 0,
    history: 0,
    cs: 0,
    status: 0,
    issue: 0,
    implementation: 0,
    structure: 0,
    data: 0,
    techStack: 0,
    testing: 0,
    summary: 0,
    etc: 0,
  };

  // 각 카테고리별 매칭 점수 계산
  for (const [category, patterns] of Object.entries(categoryPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedQuestion)) {
        scores[category as QuestionCategory] += 1;
      }
    }
  }

  // 최고 점수 카테고리 찾기
  let maxScore = 0;
  let bestCategory: QuestionCategory = 'etc';

  for (const [category, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestCategory = category as QuestionCategory;
    }
  }

  // 신뢰도 계산 (0~1)
  const totalMatches = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalMatches > 0 ? Math.min(maxScore / totalMatches, 1) : 0.5;

  return {
    category: bestCategory,
    confidence: Math.round(confidence * 100) / 100,
  };
}

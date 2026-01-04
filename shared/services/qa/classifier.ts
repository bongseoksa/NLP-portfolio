/**
 * 질문 카테고리 분류 모듈
 *
 * Rule-based 방식으로 사용자 질문을 사전 정의된 카테고리로 분류합니다.
 * LLM에 의존하지 않으며, 정규식 패턴 매칭을 통해 결정적으로 분류합니다.
 */

/**
 * 질문 카테고리 타입
 */
export type QuestionCategory =
    | 'issue'          // 버그, 오류, 문제
    | 'implementation' // 구현, 코드 작성 방법
    | 'structure'      // 프로젝트 구조, 아키텍처
    | 'history'        // 커밋 히스토리, 변경 이력
    | 'data'           // 데이터 수집, 저장, 처리
    | 'planning'       // 계획, 로드맵, 향후 작업
    | 'status'         // 상태, 진행 상황
    | 'techStack'      // 기술 스택, 라이브러리, 프레임워크
    | 'cs'             // 컴퓨터 과학 이론, 알고리즘
    | 'testing'        // 테스트, 검증
    | 'summary'        // 요약, 개요
    | 'etc';           // 기타

/**
 * 카테고리별 정규식 패턴 정의
 *
 * 우선순위: 배열 순서대로 우선순위가 높음
 * 여러 패턴이 매칭될 경우, 먼저 등록된 카테고리가 선택됨
 */
interface CategoryPattern {
    category: QuestionCategory;
    patterns: RegExp[];
}

const CATEGORY_PATTERNS: CategoryPattern[] = [
    // 1. issue (버그, 오류, 문제)
    {
        category: 'issue',
        patterns: [
            /버그|오류|에러|error|bug|이슈|issue|문제|해결|고치|fix|trouble|crash|fail/i,
            /안\s*돼|안\s*되|작동\s*안|동작\s*안|실행\s*안/i,
            /왜\s*안|왜\s*못|어떻게\s*해결/i,
        ],
    },

    // 2. cs (컴퓨터 과학 이론, 알고리즘) - "자료구조"와 같은 키워드 우선 매칭
    {
        category: 'cs',
        patterns: [
            /자료\s*구조|data\s*structure/i,  // "구조" 키워드보다 우선
            /알고리즘|algorithm/i,
            /시간\s*복잡도|공간\s*복잡도|complexity|big\s*o/i,
            /정렬|탐색|검색\s*알고리즘|트리|그래프/i,
            /이론|원리|개념|concept/i,
        ],
    },

    // 3. implementation (구현, 코드 작성)
    {
        category: 'implementation',
        patterns: [
            /구현|어떻게\s*(만들|작성|코드|개발)|how\s*to\s*(implement|code|develop)/i,
            /작성\s*방법|개발\s*방법|코딩|프로그래밍/i,
            /함수|클래스|메서드|API|엔드포인트/i,
            /로직|알고리즘\s*구현|처리\s*방법/i,
        ],
    },

    // 4. structure (프로젝트 구조, 아키텍처)
    {
        category: 'structure',
        patterns: [
            /프로젝트\s*구조|아키텍처|architecture|디렉토리|폴더\s*구성/i,
            /프로젝트\s*구성|파일\s*구조|모듈\s*구조/i,
            /계층|레이어|컴포넌트\s*구조/i,
            /어떻게\s*구성|어디에\s*위치/i,
        ],
    },

    // 5. history (커밋 히스토리, 변경 이력)
    {
        category: 'history',
        patterns: [
            /커밋|commit|변경\s*이력|히스토리|history/i,
            /언제\s*추가|언제\s*변경|언제\s*수정|언제\s*삭제/i,
            /누가\s*작성|누가\s*수정|작성자|누가.*코드/i,
            /이전\s*버전|과거|변천사/i,
        ],
    },

    // 6. data (데이터 수집, 저장, 처리)
    {
        category: 'data',
        patterns: [
            /데이터|data|수집|저장|처리|가져오|fetch/i,
            /벡터|임베딩|embedding|벡터\s*스토어/i,
            /데이터베이스|DB|Supabase/i,
            /파이프라인|pipeline|ETL/i,
        ],
    },

    // 7. planning (계획, 로드맵, 향후 작업)
    {
        category: 'planning',
        patterns: [
            /계획|plan|로드맵|roadmap|향후|앞으로/i,
            /예정|할\s*예정|할\s*계획/i,
            /개선\s*방향|발전\s*방향|다음\s*단계/i,
            /TODO|할\s*일|남은\s*작업/i,
        ],
    },

    // 8. status (상태, 진행 상황)
    {
        category: 'status',
        patterns: [
            /상태|status|진행|progress|완료|complete/i,
            /어디까지|얼마나|진척|현황/i,
            /실행\s*중|동작\s*중|running/i,
        ],
    },

    // 9. techStack (기술 스택, 라이브러리, 프레임워크)
    {
        category: 'techStack',
        patterns: [
            /기술\s*스택|tech\s*stack|스택|사용.*기술/i,
            /라이브러리|library|프레임워크|framework/i,
            /React|TypeScript|Node\.?js|Express|Vite|Supabase/i,
            /패키지|package|의존성|dependency/i,
            /뭐로\s*만들|무엇으로\s*개발|어떤.*사용/i,
        ],
    },

    // 10. testing (테스트, 검증)
    {
        category: 'testing',
        patterns: [
            /테스트|test|검증|verify|validation/i,
            /단위\s*테스트|통합\s*테스트|E2E/i,
            /테스트\s*케이스|테스트\s*코드/i,
        ],
    },

    // 11. summary (요약, 개요)
    {
        category: 'summary',
        patterns: [
            /요약|summary|개요|overview|소개|설명해.*주|간단히/i,
            /어떤\s*프로젝트|무엇.*프로젝트|뭐.*프로젝트|what.*project/i,
            /전체적|overall|전반적/i,
        ],
    },
];

/**
 * 질문을 분류하여 카테고리를 반환합니다.
 *
 * @param question 사용자 질문 (원문)
 * @returns 분류된 카테고리 (매칭 실패 시 'etc')
 *
 * @example
 * classifyQuestion("이 프로젝트에서 버그가 있어요") // "issue"
 * classifyQuestion("React는 어떻게 사용하나요?") // "techStack"
 * classifyQuestion("날씨가 좋네요") // "etc"
 */
export function classifyQuestion(question: string): QuestionCategory {
    // 입력 검증
    if (!question || typeof question !== 'string') {
        return 'etc';
    }

    // 정규화: 공백 정리
    const normalizedQuestion = question.trim();

    // 빈 문자열 처리
    if (normalizedQuestion.length === 0) {
        return 'etc';
    }

    // 카테고리별 패턴 매칭 (우선순위 순서대로)
    for (const { category, patterns } of CATEGORY_PATTERNS) {
        for (const pattern of patterns) {
            if (pattern.test(normalizedQuestion)) {
                return category;
            }
        }
    }

    // 어떤 패턴에도 매칭되지 않으면 'etc'
    return 'etc';
}

/**
 * 카테고리 분류 결과 (신뢰도 포함)
 */
export interface ClassificationResult {
    category: QuestionCategory;
    confidence: number; // 0-1 사이 값 (rule-based이므로 항상 1.0 또는 0.5)
}

/**
 * 질문을 분류하고 신뢰도를 함께 반환합니다.
 *
 * Rule-based 분류의 특성상:
 * - 패턴에 매칭된 경우: confidence = 1.0
 * - etc로 분류된 경우: confidence = 0.5 (불확실)
 *
 * @param question 사용자 질문
 * @returns 카테고리와 신뢰도
 */
export function classifyQuestionWithConfidence(question: string): ClassificationResult {
    const category = classifyQuestion(question);

    // etc는 "매칭 실패"를 의미하므로 신뢰도 낮음
    const confidence = category === 'etc' ? 0.5 : 1.0;

    return { category, confidence };
}

/**
 * 카테고리 한글 이름 매핑
 */
export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
    issue: '문제/이슈',
    implementation: '구현 방법',
    structure: '프로젝트 구조',
    history: '변경 이력',
    data: '데이터 처리',
    planning: '계획/로드맵',
    status: '진행 상황',
    techStack: '기술 스택',
    cs: 'CS 이론',
    testing: '테스트',
    summary: '요약/개요',
    etc: '기타',
};

/**
 * 카테고리 설명
 */
export const CATEGORY_DESCRIPTIONS: Record<QuestionCategory, string> = {
    issue: '버그, 오류, 문제 해결 관련 질문',
    implementation: '코드 구현, 개발 방법에 관한 질문',
    structure: '프로젝트 구조, 아키텍처에 관한 질문',
    history: '커밋 히스토리, 변경 이력 관련 질문',
    data: '데이터 수집, 저장, 처리에 관한 질문',
    planning: '향후 계획, 로드맵 관련 질문',
    status: '현재 상태, 진행 상황 관련 질문',
    techStack: '사용 기술, 라이브러리, 프레임워크 관련 질문',
    cs: '컴퓨터 과학 이론, 알고리즘 관련 질문',
    testing: '테스트, 검증 관련 질문',
    summary: '프로젝트 요약, 개요 관련 질문',
    etc: '위 카테고리에 속하지 않는 질문',
};

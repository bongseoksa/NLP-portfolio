/**
 * 질문 분류 로직 테스트
 *
 * 실행 방법:
 * tsx src/qa/classifier.test.ts
 */
import { classifyQuestion, classifyQuestionWithConfidence, CATEGORY_LABELS } from './classifier.js';

// 카테고리별 테스트 케이스
const testCases = [
    // issue
    { question: '버그가 있어요', expected: 'issue' },
    { question: '오류가 발생했습니다', expected: 'issue' },
    { question: '왜 안 돼?', expected: 'issue' },
    { question: '이 문제를 어떻게 해결하나요?', expected: 'issue' },

    // implementation
    { question: '이 기능을 어떻게 구현하나요?', expected: 'implementation' },
    { question: 'API 엔드포인트를 만드는 방법', expected: 'implementation' },
    { question: '함수를 어떻게 작성하나요?', expected: 'implementation' },
    { question: '코딩 방법을 알려주세요', expected: 'implementation' },

    // structure
    { question: '프로젝트 구조가 어떻게 되나요?', expected: 'structure' },
    { question: '아키텍처를 설명해주세요', expected: 'structure' },
    { question: '디렉토리 구성은?', expected: 'structure' },
    { question: '파일들이 어디에 위치하나요?', expected: 'structure' },

    // history
    { question: '커밋 히스토리를 보여줘', expected: 'history' },
    { question: '언제 추가되었나요?', expected: 'history' },
    { question: '누가 이 코드를 작성했나요?', expected: 'history' },
    { question: '변경 이력은?', expected: 'history' },

    // data
    { question: '데이터는 어떻게 수집하나요?', expected: 'data' },
    { question: '벡터 스토어에 저장하는 방법', expected: 'data' },
    { question: 'ChromaDB에 어떻게 저장하나요?', expected: 'data' },
    { question: '파이프라인이 어떻게 동작하나요?', expected: 'data' },

    // planning
    { question: '앞으로 계획이 뭐예요?', expected: 'planning' },
    { question: '로드맵을 알려주세요', expected: 'planning' },
    { question: '향후 개선 방향은?', expected: 'planning' },
    { question: 'TODO 목록을 보여줘', expected: 'planning' },

    // status
    { question: '현재 상태는?', expected: 'status' },
    { question: '진행 상황을 알려주세요', expected: 'status' },
    { question: '어디까지 완료되었나요?', expected: 'status' },
    { question: '실행 중인가요?', expected: 'status' },

    // techStack
    { question: '기술 스택이 뭐예요?', expected: 'techStack' },
    { question: 'React를 사용하나요?', expected: 'techStack' },
    { question: '어떤 라이브러리를 사용하나요?', expected: 'techStack' },
    { question: '차트는 뭐로 만들어졌어?', expected: 'techStack' },

    // cs
    { question: '알고리즘이 어떻게 되나요?', expected: 'cs' },
    { question: '시간 복잡도는?', expected: 'cs' },
    { question: '자료구조는 무엇을 사용하나요?', expected: 'cs' },
    { question: '이론적인 원리를 설명해주세요', expected: 'cs' },

    // testing
    { question: '테스트는 어떻게 하나요?', expected: 'testing' },
    { question: '단위 테스트가 있나요?', expected: 'testing' },
    { question: '테스트 케이스를 보여줘', expected: 'testing' },

    // summary
    { question: '프로젝트 요약 좀 해줘', expected: 'summary' },
    { question: '이게 어떤 프로젝트예요?', expected: 'summary' },
    { question: '전체적인 개요를 알려주세요', expected: 'summary' },
    { question: '간단히 설명해주세요', expected: 'summary' },

    // etc (매칭되지 않는 질문들)
    { question: '날씨가 좋네요', expected: 'etc' },
    { question: '점심 뭐 먹을까?', expected: 'etc' },
    { question: '안녕하세요', expected: 'etc' },
    { question: '', expected: 'etc' },
];

console.log('🧪 질문 분류 로직 테스트 시작\n');
console.log('='.repeat(70));

let passCount = 0;
let failCount = 0;

for (const { question, expected } of testCases) {
    const result = classifyQuestion(question);
    const { category, confidence } = classifyQuestionWithConfidence(question);

    const isPassed = result === expected;
    const icon = isPassed ? '✅' : '❌';

    if (isPassed) {
        passCount++;
    } else {
        failCount++;
    }

    // 테스트 결과 출력
    console.log(`${icon} "${question || '(빈 문자열)'}"`);
    console.log(`   예상: ${expected} (${CATEGORY_LABELS[expected as keyof typeof CATEGORY_LABELS]})`);
    console.log(`   결과: ${result} (${CATEGORY_LABELS[result as keyof typeof CATEGORY_LABELS]}) - 신뢰도: ${confidence}`);

    if (!isPassed) {
        console.log(`   ⚠️  불일치! 패턴 보완이 필요합니다.`);
    }
    console.log('');
}

console.log('='.repeat(70));
console.log(`\n📊 테스트 결과: ${passCount}/${testCases.length} 통과 (실패: ${failCount})`);

if (failCount === 0) {
    console.log('🎉 모든 테스트가 통과했습니다!');
} else {
    console.log('⚠️  일부 테스트가 실패했습니다. 정규식 패턴을 조정하세요.');
    process.exit(1);
}

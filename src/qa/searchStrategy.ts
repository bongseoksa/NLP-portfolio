/**
 * 질문 타입별 Entity 검색 전략
 *
 * Commit, Diff, File 엔티티를 질문 의도에 따라 선택적으로 검색
 */

import { searchVectors, type SearchResult } from '../vector_store/searchVectors.js';

/**
 * 질문 의도 분류
 */
export type QueryIntent =
    | 'history'       // 히스토리 질문: 언제, 누가, 왜
    | 'change'        // 변경사항 질문: 어떻게 바뀌었는가, 무엇이 변경됐는가
    | 'implementation' // 구현 질문: 어디에 있는가, 현재 코드는
    | 'multi';        // 복합 질문

/**
 * 질문 의도를 분석하여 검색할 Entity 타입을 결정
 */
export function classifyQueryIntent(question: string): {
    intent: QueryIntent;
    entityTypes: Array<'commit' | 'diff' | 'file'>;
} {
    const q = question.toLowerCase();

    // 1. History 질문 (Commit Entity)
    const historyKeywords = [
        '언제', '누가', '왜', '이유', '목적',
        'when', 'who', 'why',
        '작성자', 'author', '날짜', 'date',
        '커밋', 'commit', '이력', 'history'
    ];

    const isHistory = historyKeywords.some(kw => q.includes(kw));

    // 2. Change 질문 (Diff Entity)
    const changeKeywords = [
        '어떻게', '어떤', '무엇',
        '변경', '수정', '바뀌', '바꾸', '추가', '삭제',
        'change', 'modify', 'update', 'add', 'remove', 'delete',
        'diff', 'patch', '로직', 'logic'
    ];

    const isChange = changeKeywords.some(kw => q.includes(kw));

    // 3. Implementation 질문 (File Entity)
    const implementationKeywords = [
        '어디', 'where', '위치', 'location',
        '구현', 'implement', '코드', 'code',
        '파일', 'file', '소스', 'source',
        '함수', 'function', '클래스', 'class',
        'export', 'import', '사용'
    ];

    const isImplementation = implementationKeywords.some(kw => q.includes(kw));

    // 의도 결정
    const matchCount = [isHistory, isChange, isImplementation].filter(Boolean).length;

    if (matchCount === 0) {
        // 키워드 매칭 안됨 → 전체 검색 (File 우선)
        return {
            intent: 'implementation',
            entityTypes: ['file', 'commit', 'diff']
        };
    }

    if (matchCount === 1) {
        if (isHistory) {
            return {
                intent: 'history',
                entityTypes: ['commit']
            };
        }
        if (isChange) {
            return {
                intent: 'change',
                entityTypes: ['diff']
            };
        }
        return {
            intent: 'implementation',
            entityTypes: ['file']
        };
    }

    // 복합 질문 → 여러 Entity 검색
    const entityTypes: Array<'commit' | 'diff' | 'file'> = [];
    if (isHistory) entityTypes.push('commit');
    if (isChange) entityTypes.push('diff');
    if (isImplementation) entityTypes.push('file');

    return {
        intent: 'multi',
        entityTypes
    };
}

/**
 * 질문 의도에 맞는 Entity만 검색
 */
export async function smartSearch(
    collectionName: string,
    question: string,
    nResults: number = 5
): Promise<SearchResult[]> {
    const { intent, entityTypes } = classifyQueryIntent(question);

    console.log(`🎯 검색 전략: ${intent} (타입: ${entityTypes.join(', ')})`);

    // 전체 검색 후 타입 필터링
    const allResults = await searchVectors(collectionName, question, nResults * 2);

    // Entity 타입별로 필터링
    const filteredResults = allResults.filter(result => {
        const type = result.metadata?.type;
        return entityTypes.includes(type as any);
    });

    // 상위 N개만 반환
    return filteredResults.slice(0, nResults);
}

/**
 * 특정 타입의 Entity만 검색
 */
export async function searchByType(
    collectionName: string,
    question: string,
    entityType: 'commit' | 'diff' | 'file',
    nResults: number = 5
): Promise<SearchResult[]> {
    const allResults = await searchVectors(collectionName, question, nResults * 3);

    return allResults
        .filter(result => result.metadata?.type === entityType)
        .slice(0, nResults);
}

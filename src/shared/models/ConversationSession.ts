/**
 * 대화 세션 모델
 * 연속된 질문-답변을 하나의 세션으로 관리
 */

export interface ConversationMessage {
    /** 메시지 ID */
    id: string;
    /** 역할 (user 또는 assistant) */
    role: 'user' | 'assistant';
    /** 메시지 내용 */
    content: string;
    /** 생성 시각 */
    timestamp: string;
    /** 메타데이터 (답변의 경우) */
    metadata?: {
        sources?: any[];
        category?: string;
        categoryConfidence?: number;
        status?: string;
    };
}

export interface ConversationSession {
    /** 세션 ID */
    sessionId: string;
    /** 세션 생성 시각 */
    createdAt: string;
    /** 마지막 업데이트 시각 */
    updatedAt: string;
    /** 대화 메시지 목록 */
    messages: ConversationMessage[];
    /** 세션 제목 (첫 번째 질문 요약) */
    title?: string;
}

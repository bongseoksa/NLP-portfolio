/**
 * 세션별 대화 히스토리를 localStorage에 저장/복원하는 유틸리티
 */

export interface ConversationItem {
  question: string;
  answer: string;
  sources: any[];
  category?: string;
  categoryConfidence?: number;
  status?: string;
  timestamp: string;
}

export interface SessionData {
  sessionId: string;
  conversations: ConversationItem[];
  firstQuestion: string; // 히스토리 표시용
  lastUpdated: string;
}

const STORAGE_KEY = 'qa_conversation_sessions';
const MAX_SESSIONS = 50; // 최대 저장할 세션 수

/**
 * 모든 세션 데이터 조회
 */
export function getAllSessions(): SessionData[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to load sessions from localStorage:', error);
    return [];
  }
}

/**
 * 특정 세션 데이터 조회
 */
export function getSession(sessionId: string): SessionData | null {
  const sessions = getAllSessions();
  return sessions.find(s => s.sessionId === sessionId) || null;
}

/**
 * 세션 저장 또는 업데이트
 */
export function saveSession(sessionId: string, conversations: ConversationItem[]): void {
  try {
    const sessions = getAllSessions();
    const existingIndex = sessions.findIndex(s => s.sessionId === sessionId);

    const sessionData: SessionData = {
      sessionId,
      conversations,
      firstQuestion: conversations[0]?.question || '',
      lastUpdated: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      // 기존 세션 업데이트
      sessions[existingIndex] = sessionData;
    } else {
      // 새 세션 추가
      sessions.unshift(sessionData); // 최신 세션을 앞에
    }

    // 최대 개수 제한
    const limited = sessions.slice(0, MAX_SESSIONS);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
  } catch (error) {
    console.error('Failed to save session to localStorage:', error);
  }
}

/**
 * 세션 삭제
 */
export function deleteSession(sessionId: string): void {
  try {
    const sessions = getAllSessions();
    const filtered = sessions.filter(s => s.sessionId !== sessionId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to delete session from localStorage:', error);
  }
}

/**
 * 모든 세션 삭제
 */
export function clearAllSessions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear sessions from localStorage:', error);
  }
}

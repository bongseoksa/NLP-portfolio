/**
 * UI 상태 관리 (Jotai)
 * - 필터, 선택된 질문, 모달 상태 등
 */
import { atom } from 'jotai';
import type { QARecord, QuestionCategory } from '../types';

// 현재 선택된 질문 기록
export const selectedRecordAtom = atom<QARecord | null>(null);

// 질문 입력 상태
export const questionInputAtom = atom<string>('');

// 로딩 상태
export const isLoadingAtom = atom<boolean>(false);

// 필터: 질문 유형
export const categoryFilterAtom = atom<QuestionCategory | 'all'>('all');

// 필터: 날짜 범위
export const dateRangeAtom = atom<{
  start: string | null;
  end: string | null;
}>({
  start: null,
  end: null,
});

// 검색어 (질문 이력 검색)
export const searchQueryAtom = atom<string>('');

// 현재 페이지 (Q&A / Dashboard)
export const currentPageAtom = atom<'qa' | 'dashboard'>('qa');

// 사이드바 열림/닫힘
export const sidebarOpenAtom = atom<boolean>(true);

// 최근 응답 (임시 저장)
export const latestResponseAtom = atom<{
  answer: string;
  sources: any[];
  status: string;
} | null>(null);

// 현재 답변 (QA 페이지)
export const currentAnswerAtom = atom<{
  question: string;
  answer: string;
  sources: any[];
  category?: string;
  categoryConfidence?: number;
  status?: string;
} | null>(null);

// 대화 히스토리 (채팅 스타일로 누적)
export const conversationHistoryAtom = atom<Array<{
  question: string;
  answer: string;
  sources: any[];
  category?: string;
  categoryConfidence?: number;
  status?: string;
  timestamp: string;
}>>([]);

// 현재 대화 세션 ID
export const sessionIdAtom = atom<string | null>(null);


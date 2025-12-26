/**
 * Q&A 페이지
 * ChatGPT 스타일의 질의응답 인터페이스
 */
import { useState, useCallback, useEffect } from 'react';
import { useAtom } from 'jotai';
import { css } from '../../styled-system/css';
import { useAskQuestion, useQAHistory } from '../hooks/useQueries';
import {
  questionInputAtom,
  isLoadingAtom,
  selectedRecordAtom,
  searchQueryAtom,
  conversationHistoryAtom,
  sessionIdAtom
} from '../stores/uiStore';
import type { QARecord, QuestionCategory } from '../types';

// 카테고리 한글 매핑
const categoryLabels: Record<QuestionCategory, string> = {
  planning: '기획',
  technical: '기술',
  history: '히스토리',
  cs: 'CS',
  status: '현황',
};

// 상태 배지 스타일
const statusStyles = {
  success: { bg: 'green.100', color: 'green.800', label: '정상' },
  partial: { bg: 'yellow.100', color: 'yellow.800', label: '부분 응답' },
  failed: { bg: 'red.100', color: 'red.800', label: '응답 실패' },
};

export default function QAPage() {
  const [questionInput, setQuestionInput] = useAtom(questionInputAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
  const [selectedRecord, setSelectedRecord] = useAtom(selectedRecordAtom);
  const [searchQuery, setSearchQuery] = useAtom(searchQueryAtom);
  const [conversationHistory, setConversationHistory] = useAtom(conversationHistoryAtom);
  const [sessionId, setSessionId] = useAtom(sessionIdAtom);

  // 입력 영역 높이 조절
  const [inputAreaHeight, setInputAreaHeight] = useState(180);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback(() => {
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // 화면 하단에서 마우스 위치까지의 거리 계산 (네비게이션 56px 고려)
      const newHeight = window.innerHeight - e.clientY;
      // 최소 80px, 최대 화면의 60%
      const clampedHeight = Math.min(Math.max(newHeight, 80), window.innerHeight * 0.6);
      setInputAreaHeight(clampedHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const askMutation = useAskQuestion();
  const { data: history = [], isLoading: historyLoading } = useQAHistory({
    search: searchQuery,
    limit: 50,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionInput.trim() || isLoading) return;

    const currentQuestion = questionInput;
    setIsLoading(true);
    setQuestionInput(''); // 입력창 즉시 초기화

    try {
      const response = await askMutation.mutateAsync({
        question: currentQuestion,
        sessionId: sessionId || undefined, // 기존 세션 ID 전달 (연속 대화)
      });

      // 서버에서 받은 세션 ID 저장 (첫 질문이거나 새로운 세션)
      if (response.sessionId) {
        setSessionId(response.sessionId);
      }

      const newQA = {
        question: currentQuestion,
        answer: response.answer,
        sources: response.sources,
        category: response.category,
        categoryConfidence: response.categoryConfidence,
        status: response.status,
        timestamp: new Date().toISOString(),
      };

      // 대화 히스토리에 추가 (누적)
      setConversationHistory([...conversationHistory, newQA]);
    } catch (error) {
      console.error('[QAPage] 질문 전송 오류:', error);
      const errorMessage = error instanceof Error
        ? error.message
        : '오류가 발생했습니다. 다시 시도해주세요.';

      const errorQA = {
        question: currentQuestion,
        answer: `오류: ${errorMessage}`,
        sources: [],
        status: 'failed' as const,
        timestamp: new Date().toISOString(),
      };

      setConversationHistory([...conversationHistory, errorQA]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleHistoryClick = (record: QARecord) => {
    setSelectedRecord(record);
    setQuestionInput(record.question);
    // 히스토리 클릭 시 해당 Q&A만 표시하도록 conversationHistory 설정
    setConversationHistory([{
      question: record.question,
      answer: record.answer,
      sources: record.sources,
      category: record.category,
      categoryConfidence: record.categoryConfidence,
      status: record.status,
      timestamp: record.createdAt || new Date().toISOString(),
    }]);
    // 세션 초기화 (새로운 대화 시작)
    setSessionId(null);
  };

  return (
    <div className={css({
      display: 'flex',
      height: '100%',
      bg: 'gray.50',
      overflow: 'hidden',
    })}>
      {/* 사이드바: 질문 이력 */}
      <aside className={css({
        width: '280px',
        h: '100%',
        bg: 'white',
        borderRight: '1px solid',
        borderColor: 'gray.200',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      })}>
        <div className={css({ p: '4', borderBottom: '1px solid', borderColor: 'gray.200' })}>
          <h2 className={css({ fontSize: 'lg', fontWeight: 'bold', mb: '3' })}>
            질문 이력
          </h2>
          <input
            type="text"
            placeholder="검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={css({
              w: 'full',
              px: '3',
              py: '2',
              border: '1px solid',
              borderColor: 'gray.300',
              borderRadius: 'md',
              fontSize: 'sm',
              _focus: { outline: 'none', borderColor: 'blue.500' },
            })}
          />
        </div>
        
        <div className={css({ flex: '1', overflow: 'auto', p: '2' })}>
          {historyLoading ? (
            <p className={css({ p: '4', color: 'gray.500', textAlign: 'center' })}>
              로딩 중...
            </p>
          ) : history.length === 0 ? (
            <p className={css({ p: '4', color: 'gray.500', textAlign: 'center' })}>
              질문 이력이 없습니다.
            </p>
          ) : (
            history.map((record) => (
              <button
                key={record.id}
                onClick={() => handleHistoryClick(record)}
                className={css({
                  w: 'full',
                  p: '3',
                  mb: '2',
                  textAlign: 'left',
                  bg: selectedRecord?.id === record.id ? 'blue.50' : 'white',
                  border: '1px solid',
                  borderColor: selectedRecord?.id === record.id ? 'blue.300' : 'gray.200',
                  borderRadius: 'md',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  _hover: { bg: 'gray.50' },
                })}
              >
                <p className={css({ 
                  fontSize: 'sm', 
                  fontWeight: '500',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                })}>
                  {record.questionSummary}
                </p>
                <p className={css({ fontSize: 'xs', color: 'gray.500', mt: '1' })}>
                  {new Date(record.createdAt).toLocaleDateString()}
                </p>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className={css({
        flex: '1',
        h: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      })}>
        {/* 헤더 */}
        <header className={css({
          p: '4',
          bg: 'white',
          borderBottom: '1px solid',
          borderColor: 'gray.200',
        })}>
          <h1 className={css({ fontSize: 'xl', fontWeight: 'bold' })}>
            🔍 GitHub Repository Q&A
          </h1>
          <p className={css({ fontSize: 'sm', color: 'gray.600', mt: '1' })}>
            프로젝트에 대해 자연어로 질문하세요. 코드와 커밋 히스토리를 분석하여 답변합니다.
          </p>
        </header>

        {/* 응답 영역 */}
        <div className={css({
          flex: '1',
          minH: '0',
          overflow: 'auto',
          p: '6',
        })}>
          {conversationHistory.length > 0 ? (
            <div className={css({
              maxW: '800px',
              mx: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '4',
            })}>
              {conversationHistory.map((qa, index) => (
                <div key={index} className={css({
                  bg: 'white',
                  borderRadius: 'lg',
                  boxShadow: 'md',
                  overflow: 'hidden',
                })}>
                  {/* 질문 */}
                  <div className={css({ p: '4', bg: 'blue.50', borderBottom: '1px solid', borderColor: 'blue.100' })}>
                    <p className={css({ fontWeight: '500' })}>❓ {qa.question}</p>
                  </div>

                  {/* 메타 정보 */}
                  <div className={css({
                    p: '4',
                    bg: 'gray.50',
                    borderBottom: '1px solid',
                    borderColor: 'gray.200',
                    display: 'flex',
                    gap: '3',
                    flexWrap: 'wrap',
                  })}>
                    {qa.category && (
                      <span className={css({
                        px: '2',
                        py: '1',
                        bg: 'purple.100',
                        color: 'purple.800',
                        borderRadius: 'full',
                        fontSize: 'xs',
                        fontWeight: '500',
                      })}>
                        📂 {qa.category && categoryLabels[qa.category as QuestionCategory]}
                        {qa.categoryConfidence &&
                          ` (${Math.round(qa.categoryConfidence * 100)}%)`
                        }
                      </span>
                    )}
                    {qa.status && (
                      <span className={css({
                        px: '2',
                        py: '1',
                        bg: statusStyles[qa.status as keyof typeof statusStyles]?.bg || 'gray.100',
                        color: statusStyles[qa.status as keyof typeof statusStyles]?.color || 'gray.800',
                        borderRadius: 'full',
                        fontSize: 'xs',
                        fontWeight: '500',
                      })}>
                        {statusStyles[qa.status as keyof typeof statusStyles]?.label || qa.status}
                      </span>
                    )}
                  </div>

                  {/* 답변 */}
                  <div className={css({ p: '4' })}>
                    <h3 className={css({ fontWeight: 'bold', mb: '3' })}>🤖 답변</h3>
                    <div className={css({
                      whiteSpace: 'pre-wrap',
                      lineHeight: '1.7',
                      color: 'gray.700',
                    })}>
                      {qa.answer}
                    </div>
                  </div>

                  {/* 근거 정보 */}
                  {qa.sources && qa.sources.length > 0 && (
                    <div className={css({
                      p: '4',
                      bg: 'gray.50',
                      borderTop: '1px solid',
                      borderColor: 'gray.200'
                    })}>
                      <h4 className={css({ fontWeight: '600', fontSize: 'sm', mb: '2' })}>
                        📚 참고 자료
                      </h4>
                      <ul className={css({ fontSize: 'sm', color: 'gray.600' })}>
                        {qa.sources.map((source, idx) => (
                          <li key={idx} className={css({ mb: '1' })}>
                            {source.type === 'commit' && source.commitHash && (
                              <span>
                                🔗 {source.commitHash.slice(0, 7)}: {source.commitMessage}
                              </span>
                            )}
                            {source.type === 'code' && source.filePath && (
                              <span>📄 {source.filePath}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className={css({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: 'full',
              color: 'gray.500',
            })}>
              <p className={css({ fontSize: '4xl', mb: '4' })}>💬</p>
              <p>질문을 입력하여 시작하세요</p>
            </div>
          )}
        </div>

        {/* 질문 입력 영역 */}
        <div 
          className={css({
            bg: 'white',
            borderTop: '1px solid',
            borderColor: 'gray.200',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            flexShrink: '0',
            minH: '80px',
          })}
          style={{ height: `${inputAreaHeight}px` }}
        >
          {/* 리사이즈 핸들 */}
          <div
            onMouseDown={handleMouseDown}
            className={css({
              position: 'absolute',
              top: '0',
              left: '0',
              right: '0',
              height: '8px',
              cursor: 'ns-resize',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: '10',
              _hover: { bg: 'blue.100' },
            })}
            style={{ backgroundColor: isResizing ? 'rgba(59, 130, 246, 0.2)' : 'transparent' }}
          >
            <div className={css({
              width: '40px',
              height: '4px',
              bg: 'gray.300',
              borderRadius: 'full',
            })} />
          </div>

          <form onSubmit={handleSubmit} className={css({
            flex: '1',
            px: '4',
            py: '0',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          })}>
            <div className={css({
              maxW: '800px',
              mx: 'auto',
              w: 'full',
              h: 'full',
              display: 'flex',
              gap: '3',
              py: '15px',
            })}>
              <textarea
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                placeholder="프로젝트에 대해 질문하세요... (여러 줄 입력 가능)&#10;예: 이 프로젝트의 기술스택과 아키텍처에 대해&#10;자세히 설명해주세요."
                disabled={isLoading}
                className={css({
                  flex: '1',
                  h: 'full',
                  px: '4',
                  py: '3',
                  border: '1px solid',
                  borderColor: 'gray.300',
                  borderRadius: 'lg',
                  fontSize: 'md',
                  fontFamily: 'inherit',
                  resize: 'none',
                  lineHeight: '1.5',
                  _focus: { outline: 'none', borderColor: 'blue.500', boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)' },
                  _disabled: { bg: 'gray.100', cursor: 'not-allowed' },
                })}
              />
              <div className={css({
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
              })}>
                <button
                  type="submit"
                  disabled={isLoading || !questionInput.trim()}
                  className={css({
                    px: '6',
                    py: '3',
                    bg: 'blue.600',
                    color: 'white',
                    borderRadius: 'lg',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    _hover: { bg: 'blue.700' },
                    _disabled: { bg: 'gray.400', cursor: 'not-allowed' },
                  })}
                >
                  {isLoading ? '⏳ 분석 중...' : '🚀 질문하기'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}


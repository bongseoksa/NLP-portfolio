/**
 * Q&A 페이지
 * ChatGPT 스타일의 질의응답 인터페이스
 */
import { useAtom } from 'jotai';
import { css } from '../../styled-system/css';
import { useAskQuestion, useQAHistory } from '../hooks/useQueries';
import {
  questionInputAtom,
  isLoadingAtom,
  selectedRecordAtom,
  searchQueryAtom,
  currentAnswerAtom,
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
  const [currentAnswer, setCurrentAnswer] = useAtom(currentAnswerAtom);
  const [sessionId, setSessionId] = useAtom(sessionIdAtom);

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
    setCurrentAnswer(null);
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

      setCurrentAnswer({
        question: currentQuestion,
        answer: response.answer,
        sources: response.sources,
        category: response.category,
        categoryConfidence: response.categoryConfidence,
        status: response.status,
      });
    } catch (error) {
      console.error('[QAPage] 질문 전송 오류:', error);
      const errorMessage = error instanceof Error
        ? error.message
        : '오류가 발생했습니다. 다시 시도해주세요.';
      setCurrentAnswer({
        question: currentQuestion,
        answer: `오류: ${errorMessage}`,
        sources: [],
        status: 'failed',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleHistoryClick = (record: QARecord) => {
    setSelectedRecord(record);
    setQuestionInput(record.question);
    setCurrentAnswer({
      question: record.question,
      answer: record.answer,
      sources: record.sources,
      category: record.category,
      categoryConfidence: record.categoryConfidence,
      status: record.status,
    });
  };

  return (
    <div className={css({
      display: 'flex',
      height: '100vh',
      bg: 'gray.50',
    })}>
      {/* 사이드바: 질문 이력 */}
      <aside className={css({
        width: '280px',
        bg: 'white',
        borderRight: '1px solid',
        borderColor: 'gray.200',
        display: 'flex',
        flexDirection: 'column',
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
          flex: '6.5',
          overflow: 'auto',
          p: '6',
        })}>
          {currentAnswer ? (
            <div className={css({
              maxW: '800px',
              mx: 'auto',
              bg: 'white',
              borderRadius: 'lg',
              boxShadow: 'md',
              overflow: 'hidden',
            })}>
              {/* 질문 */}
              <div className={css({ p: '4', bg: 'blue.50', borderBottom: '1px solid', borderColor: 'blue.100' })}>
                <p className={css({ fontWeight: '500' })}>❓ {currentAnswer.question}</p>
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
                {currentAnswer.category && (
                  <span className={css({
                    px: '2',
                    py: '1',
                    bg: 'purple.100',
                    color: 'purple.800',
                    borderRadius: 'full',
                    fontSize: 'xs',
                    fontWeight: '500',
                  })}>
                    📂 {currentAnswer.category && categoryLabels[currentAnswer.category as QuestionCategory]}
                    {currentAnswer.categoryConfidence &&
                      ` (${Math.round(currentAnswer.categoryConfidence * 100)}%)`
                    }
                  </span>
                )}
                {currentAnswer.status && (
                  <span className={css({
                    px: '2',
                    py: '1',
                    bg: statusStyles[currentAnswer.status as keyof typeof statusStyles]?.bg || 'gray.100',
                    color: statusStyles[currentAnswer.status as keyof typeof statusStyles]?.color || 'gray.800',
                    borderRadius: 'full',
                    fontSize: 'xs',
                    fontWeight: '500',
                  })}>
                    {statusStyles[currentAnswer.status as keyof typeof statusStyles]?.label || currentAnswer.status}
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
                  {currentAnswer.answer}
                </div>
              </div>

              {/* 근거 정보 */}
              {currentAnswer.sources && currentAnswer.sources.length > 0 && (
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
                    {currentAnswer.sources.map((source, idx) => (
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
        <form onSubmit={handleSubmit} className={css({
          p: '4',
          bg: 'white',
          borderTop: '1px solid',
          borderColor: 'gray.200',
          flex: '1'
        })}>
          <div className={css({
            maxW: '800px',
            mx: 'auto',
            display: 'flex',
            gap: '3',
          })}>
            <input
              type="text"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder="프로젝트에 대해 질문하세요... (예: 이 프로젝트의 기술스택은?)"
              disabled={isLoading}
              className={css({
                flex: '1',
                px: '4',
                py: '3',
                border: '1px solid',
                borderColor: 'gray.300',
                borderRadius: 'lg',
                fontSize: 'md',
                _focus: { outline: 'none', borderColor: 'blue.500', boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)' },
                _disabled: { bg: 'gray.100', cursor: 'not-allowed' },
              })}
            />
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
        </form>
      </main>
    </div>
  );
}


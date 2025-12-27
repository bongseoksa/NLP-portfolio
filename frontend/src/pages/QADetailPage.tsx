import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getQARecord } from '../api/client';
import { css } from '../../styled-system/css';

export default function QADetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const { data: record, isLoading, error } = useQuery({
        queryKey: ['qa-detail', id],
        queryFn: () => getQARecord(id!),
        enabled: !!id,
    });

    if (isLoading) {
        return (
            <div className={css({ p: 6, textAlign: 'center' })}>
                <div className={css({ fontSize: 'lg' })}>로딩 중...</div>
            </div>
        );
    }

    if (error || !record) {
        return (
            <div className={css({ p: 6, textAlign: 'center' })}>
                <div className={css({ fontSize: 'lg', color: 'red.600' })}>
                    데이터를 찾을 수 없습니다.
                </div>
                <button
                    onClick={() => navigate('/dashboard')}
                    className={css({
                        mt: 4,
                        px: 4,
                        py: 2,
                        bg: 'gray.600',
                        color: 'white',
                        borderRadius: 'md',
                        cursor: 'pointer',
                        _hover: { bg: 'gray.700' },
                    })}
                >
                    대시보드로 돌아가기
                </button>
            </div>
        );
    }

    // 단계별 시간 계산
    const timings = {
        classification: record.classificationTimeMs || 0,
        vectorSearch: record.vectorSearchTimeMs || 0,
        llmGeneration: record.llmGenerationTimeMs || 0,
        dbSave: record.dbSaveTimeMs || 0,
        total: record.responseTimeMs || 0,
    };

    // 토큰 정보
    const tokens = {
        prompt: record.promptTokens || 0,
        completion: record.completionTokens || 0,
        embedding: record.embeddingTokens || 0,
        total: record.tokenUsage || 0,
    };

    return (
        <div className={css({ p: 6, maxW: '1200px', mx: 'auto', overflowY: 'auto', h: '100%' })}>
            {/* 헤더 */}
            <div className={css({
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 6
            })}>
                <h1 className={css({ fontSize: '2xl', fontWeight: 'bold' })}>
                    Q&A 상세 분석
                </h1>

                {/* 나가기 버튼 (우상단) */}
                <button
                    onClick={() => navigate('/dashboard')}
                    className={css({
                        px: 4,
                        py: 2,
                        bg: 'gray.600',
                        color: 'white',
                        borderRadius: 'md',
                        fontSize: 'sm',
                        fontWeight: '500',
                        cursor: 'pointer',
                        _hover: { bg: 'gray.700' },
                    })}
                >
                    ← 대시보드로 돌아가기
                </button>
            </div>

            {/* 질문 섹션 */}
            <div className={css({ bg: 'white', p: 6, borderRadius: 'lg', boxShadow: 'md', mb: 4 })}>
                <h2 className={css({ fontSize: 'lg', fontWeight: 'bold', mb: 3, color: 'blue.700' })}>
                    질문
                </h2>
                <p className={css({ whiteSpace: 'pre-wrap', lineHeight: 1.7 })}>
                    {record.question}
                </p>
                <div className={css({ mt: 3, fontSize: 'sm', color: 'gray.600' })}>
                    <span>카테고리: {record.category}</span>
                    <span className={css({ ml: 4 })}>
                        신뢰도: {Math.round((record.categoryConfidence || 0) * 100)}%
                    </span>
                    <span className={css({ ml: 4 })}>
                        상태: {record.status === 'success' ? '성공' : record.status === 'partial' ? '부분 성공' : '실패'}
                    </span>
                </div>
            </div>

            {/* 응답 섹션 */}
            <div className={css({ bg: 'white', p: 6, borderRadius: 'lg', boxShadow: 'md', mb: 4 })}>
                <h2 className={css({ fontSize: 'lg', fontWeight: 'bold', mb: 3, color: 'green.700' })}>
                    응답
                </h2>
                <p className={css({ whiteSpace: 'pre-wrap', lineHeight: 1.7 })}>
                    {record.answer}
                </p>
            </div>

            {/* 단계별 처리 시간 */}
            <div className={css({ bg: 'white', p: 6, borderRadius: 'lg', boxShadow: 'md', mb: 4 })}>
                <h2 className={css({ fontSize: 'lg', fontWeight: 'bold', mb: 4, color: 'purple.700' })}>
                    단계별 처리 시간
                </h2>

                {/* 타임라인 시각화 */}
                <div className={css({ mb: 6 })}>
                    {[
                        { label: '질문 분류', time: timings.classification, color: 'blue.500' },
                        { label: '벡터 검색', time: timings.vectorSearch, color: 'green.500' },
                        { label: 'LLM 응답 생성', time: timings.llmGeneration, color: 'orange.500' },
                        { label: 'DB 저장', time: timings.dbSave, color: 'purple.500' },
                    ].map((step, idx) => {
                        const percentage = timings.total > 0 ? (step.time / timings.total) * 100 : 0;
                        return (
                            <div key={idx} className={css({ mb: 3 })}>
                                <div className={css({
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    mb: 1,
                                    fontSize: 'sm'
                                })}>
                                    <span>{step.label}</span>
                                    <span className={css({ fontWeight: 'bold' })}>
                                        {step.time}ms ({percentage.toFixed(1)}%)
                                    </span>
                                </div>
                                <div className={css({
                                    w: '100%',
                                    h: '20px',
                                    bg: 'gray.200',
                                    borderRadius: 'md',
                                    overflow: 'hidden'
                                })}>
                                    <div
                                        className={css({
                                            h: '100%',
                                            bg: step.color,
                                            transition: 'width 0.5s'
                                        })}
                                        style={{ width: `${percentage}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* 총 시간 */}
                <div className={css({
                    pt: 4,
                    borderTop: '2px solid',
                    borderColor: 'gray.300',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 'lg',
                    fontWeight: 'bold'
                })}>
                    <span>총 응답 시간</span>
                    <span className={css({ color: 'purple.700' })}>
                        {timings.total}ms
                    </span>
                </div>
            </div>

            {/* 토큰 사용량 */}
            <div className={css({ bg: 'white', p: 6, borderRadius: 'lg', boxShadow: 'md', mb: 4 })}>
                <h2 className={css({ fontSize: 'lg', fontWeight: 'bold', mb: 4, color: 'orange.700' })}>
                    토큰 사용량
                </h2>

                <div className={css({ display: 'grid', gridTemplateColumns: '2', gap: 4 })}>
                    {[
                        { label: '입력 토큰 (Prompt)', value: tokens.prompt, color: 'blue.600' },
                        { label: '출력 토큰 (Completion)', value: tokens.completion, color: 'green.600' },
                        { label: '임베딩 토큰', value: tokens.embedding, color: 'purple.600' },
                        { label: '총 토큰', value: tokens.total, color: 'orange.600', bold: true },
                    ].map((item, idx) => (
                        <div
                            key={idx}
                            className={css({
                                bg: 'gray.50',
                                p: 4,
                                borderRadius: 'md',
                                borderLeft: '4px solid',
                                borderColor: item.color
                            })}
                        >
                            <div className={css({ fontSize: 'sm', color: 'gray.600', mb: 1 })}>
                                {item.label}
                            </div>
                            <div className={css({
                                fontSize: item.bold ? 'xl' : 'lg',
                                fontWeight: item.bold ? 'bold' : '600',
                                color: item.color
                            })}>
                                {item.value.toLocaleString()}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 소스 정보 */}
            {record.sources && record.sources.length > 0 && (
                <div className={css({ bg: 'white', p: 6, borderRadius: 'lg', boxShadow: 'md' })}>
                    <h2 className={css({ fontSize: 'lg', fontWeight: 'bold', mb: 4, color: 'gray.700' })}>
                        참고 소스 ({record.sources.length}개)
                    </h2>
                    <div className={css({ display: 'flex', flexDirection: 'column', gap: 2 })}>
                        {record.sources.map((source, idx) => (
                            <div
                                key={idx}
                                className={css({
                                    p: 3,
                                    bg: 'gray.50',
                                    borderRadius: 'md',
                                    fontSize: 'sm'
                                })}
                            >
                                <div className={css({ fontWeight: '600', mb: 1 })}>
                                    {source.type === 'code' ? '코드' : source.type === 'commit' ? '커밋' : '히스토리'}
                                    {' - '}
                                    {source.filePath || source.commitHash || 'N/A'}
                                </div>
                                {source.commitMessage && (
                                    <div className={css({ color: 'gray.600', fontSize: 'xs' })}>
                                        {source.commitMessage}
                                    </div>
                                )}
                                <div className={css({ color: 'gray.500', fontSize: 'xs', mt: 1 })}>
                                    관련도: {((source.relevanceScore || 0) * 100).toFixed(1)}%
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

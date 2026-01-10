import { styled } from 'styled-system/jsx';
import { useServerStatus } from '../hooks/useQueries';

const PageContainer = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
});

const Title = styled('h1', {
  base: {
    fontSize: '1.5rem',
    fontWeight: 600,
    lineHeight: 1.3,
    color: 'text.strong',
    margin: 0,
  },
});

const Card = styled('div', {
  base: {
    padding: '1.5rem',
    backgroundColor: 'surface.basic',
    borderRadius: 'lg',
    border: '1px solid',
    borderColor: 'border.normal',
    boxShadow: 'sm',
  },
});

const CardTitle = styled('h2', {
  base: {
    fontSize: '1.25rem',
    fontWeight: 600,
    lineHeight: 1.4,
    color: 'text.strong',
    margin: '0 0 1rem 0',
  },
});

const StatusRow = styled('div', {
  base: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 0',
    borderBottom: '1px solid',
    borderColor: 'border.subtle',
    _last: {
      borderBottom: 'none',
    },
  },
});

const StatusLabel = styled('span', {
  base: {
    fontSize: '0.875rem',
    fontWeight: 400,
    lineHeight: 1.5,
    color: 'text.normal',
  },
});

const StatusValue = styled('span', {
  base: {
    fontSize: '0.875rem',
    fontWeight: 600,
    lineHeight: 1.5,
  },
  variants: {
    status: {
      success: { color: '#22c55e' },
      warning: { color: '#f59e0b' },
      error: { color: '#ef4444' },
      neutral: { color: '#64748b' },
    },
  },
});

type StatusType = 'success' | 'warning' | 'error' | 'neutral';

function SettingsPage() {
  const { data, isLoading, isError } = useServerStatus();

  const getApiStatus = (): StatusType => {
    if (isLoading) return 'neutral';
    if (isError) return 'error';
    if (data?.status === 'healthy') return 'success';
    return 'warning';
  };

  const getApiLabel = (): string => {
    if (isLoading) return '확인 중...';
    if (isError) return '연결 실패';
    if (data?.status === 'healthy') return '정상';
    return '불안정';
  };

  return (
    <PageContainer>
      <Title>Settings</Title>

      <Card>
        <CardTitle>서버 상태</CardTitle>
        <StatusRow>
          <StatusLabel>API 서버</StatusLabel>
          <StatusValue status={getApiStatus()}>{getApiLabel()}</StatusValue>
        </StatusRow>
        {data?.vectorStore && (
          <>
            <StatusRow>
              <StatusLabel>벡터 저장소</StatusLabel>
              <StatusValue status="success">
                {data.vectorStore.type} (
                {data.vectorStore.totalVectors?.toLocaleString()} vectors)
              </StatusValue>
            </StatusRow>
            <StatusRow>
              <StatusLabel>커밋 임베딩</StatusLabel>
              <StatusValue status="neutral">
                {data.vectorStore.commitCount?.toLocaleString() || 0}개
              </StatusValue>
            </StatusRow>
          </>
        )}
      </Card>
    </PageContainer>
  );
}

export default SettingsPage;

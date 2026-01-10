import { styled } from '../../styled-system/jsx';

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

const ComingSoon = styled('p', {
  base: {
    fontSize: '1rem',
    fontWeight: 400,
    lineHeight: 1.5,
    color: 'text.subtle',
    textAlign: 'center',
    margin: 0,
  },
});

function DashboardPage() {
  return (
    <PageContainer>
      <Title>Dashboard</Title>
      <Card>
        <ComingSoon>
          대시보드 기능은 준비 중입니다. Q&A 히스토리, 사용 통계 등이 제공될
          예정입니다.
        </ComingSoon>
      </Card>
    </PageContainer>
  );
}

export default DashboardPage;

/**
 * 대시보드 페이지
 * 시스템 모니터링 및 분석
 */
import { css } from '../../styled-system/css';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import {
  useDashboardSummary,
  useDailyStats,
  useCategoryDistribution,
  useSourceContribution,
  useServerHealth,
  useQAHistory,
} from '../hooks/useQueries';
import type { QuestionCategory } from '../types';

// 카테고리 색상 (기본)
const CATEGORY_COLORS: Record<QuestionCategory, string> = {
  planning: '#8B5CF6',   // 보라
  technical: '#3B82F6',  // 파랑
  history: '#10B981',    // 초록
  cs: '#F59E0B',         // 주황
  status: '#EF4444',     // 빨강
};

// 다양한 색상 팔레트 (동적 카테고리용)
const COLOR_PALETTE = [
  '#8B5CF6', // 보라
  '#3B82F6', // 파랑
  '#10B981', // 초록
  '#F59E0B', // 주황
  '#EF4444', // 빨강
  '#EC4899', // 핑크
  '#06B6D4', // 청록
  '#6366F1', // 인디고
  '#84CC16', // 라임
  '#F97316', // 오렌지
  '#14B8A6', // 틸
  '#A855F7', // 자주
  '#22C55E', // 에메랄드
  '#0EA5E9', // 스카이
  '#F43F5E', // 로즈
];

// 카테고리에 색상 할당하는 헬퍼 함수
const getCategoryColor = (category: string, index: number): string => {
  // 알려진 카테고리는 기본 색상 사용
  if (category in CATEGORY_COLORS) {
    return CATEGORY_COLORS[category as QuestionCategory];
  }
  // 알려지지 않은 카테고리는 팔레트에서 순환적으로 할당
  return COLOR_PALETTE[index % COLOR_PALETTE.length];
};

// 카테고리 한글 매핑 (12개 카테고리 전체)
const categoryLabels: Record<string, string> = {
  // 기존 카테고리
  planning: '기획',
  technical: '기술',
  history: '히스토리',
  cs: 'CS',
  status: '현황',
  // 새로운 카테고리 (12개)
  issue: '이슈/버그',
  implementation: '구현',
  structure: '구조',
  data: '데이터',
  techStack: '기술스택',
  testing: '테스트',
  summary: '요약',
  etc: '기타',
};

// 카테고리 라벨을 안전하게 가져오는 헬퍼 함수
const getCategoryLabel = (category: string): string => {
  return categoryLabels[category] || category || '알 수 없음';
};

// 소스 타입 색상
const SOURCE_COLORS = {
  code: '#3B82F6',
  commit: '#10B981',
  history: '#F59E0B',
};

export default function DashboardPage() {
  const { data: summary } = useDashboardSummary();
  const { data: dailyStats = [] } = useDailyStats();
  const { data: categoryDist = [] } = useCategoryDistribution();
  const { data: sourceDist = [] } = useSourceContribution();
  const { data: serverHealth } = useServerHealth();
  const { data: recentHistory = [] } = useQAHistory({ limit: 10 });

  // Mock 데이터 (API 연동 전)
  const mockSummary = {
    totalQuestions: 156,
    successRate: 87.5,
    failureRate: 12.5,
    averageResponseTimeMs: 2340,
    dailyTokenUsage: 12500,
    totalTokenUsage: 456000,
    serverStatus: 'online' as const,
    lastSuccessfulResponse: new Date().toISOString(),
  };

  const mockDailyStats = [
    { date: '12/07', questionCount: 12, successCount: 10, failureCount: 2, averageResponseTimeMs: 2100 },
    { date: '12/08', questionCount: 18, successCount: 16, failureCount: 2, averageResponseTimeMs: 2300 },
    { date: '12/09', questionCount: 25, successCount: 22, failureCount: 3, averageResponseTimeMs: 2150 },
    { date: '12/10', questionCount: 31, successCount: 28, failureCount: 3, averageResponseTimeMs: 2400 },
    { date: '12/11', questionCount: 28, successCount: 25, failureCount: 3, averageResponseTimeMs: 2200 },
    { date: '12/12', questionCount: 22, successCount: 19, failureCount: 3, averageResponseTimeMs: 2500 },
    { date: '12/13', questionCount: 20, successCount: 17, failureCount: 3, averageResponseTimeMs: 2340 },
  ];

  const mockCategoryDist = [
    { category: 'technical' as QuestionCategory, count: 45, percentage: 28.8 },
    { category: 'planning' as QuestionCategory, count: 38, percentage: 24.4 },
    { category: 'history' as QuestionCategory, count: 32, percentage: 20.5 },
    { category: 'status' as QuestionCategory, count: 25, percentage: 16.0 },
    { category: 'cs' as QuestionCategory, count: 16, percentage: 10.3 },
  ];

  const mockSourceDist = [
    { type: 'code' as const, count: 89, percentage: 45.2 },
    { type: 'commit' as const, count: 72, percentage: 36.5 },
    { type: 'history' as const, count: 36, percentage: 18.3 },
  ];

  const displaySummary = {
    ...mockSummary,
    ...summary,
    // dailyTokenUsage와 totalTokenUsage가 없을 경우 기본값 사용
    dailyTokenUsage: summary?.dailyTokenUsage ?? mockSummary.dailyTokenUsage,
    totalTokenUsage: summary?.totalTokenUsage ?? mockSummary.totalTokenUsage,
  };
  const displayDailyStats = dailyStats.length > 0 ? dailyStats : mockDailyStats;
  const displayCategoryDist = categoryDist.length > 0 ? categoryDist : mockCategoryDist;
  const displaySourceDist = sourceDist.length > 0 ? sourceDist : mockSourceDist;

  return (
    <div className={css({
      minHeight: '100vh',
      bg: 'gray.50',
      p: '6',
    })}>
      {/* 헤더 */}
      <header className={css({ mb: '6' })}>
        <h1 className={css({ fontSize: '2xl', fontWeight: 'bold' })}>
          📊 시스템 대시보드
        </h1>
        <p className={css({ color: 'gray.600', mt: '1' })}>
          NLP 질의응답 시스템의 동작 상태와 성능을 모니터링합니다.
        </p>
      </header>

      {/* 요약 카드 */}
      <div className={css({
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '4',
        mb: '6',
      })}>
        <SummaryCard
          title="전체 질문 수"
          value={displaySummary.totalQuestions.toLocaleString()}
          icon="💬"
        />
        <SummaryCard
          title="성공률"
          value={`${displaySummary.successRate.toFixed(1)}%`}
          icon="✅"
          color="green"
        />
        <SummaryCard
          title="평균 응답 시간"
          value={`${displaySummary.averageResponseTimeMs.toLocaleString()}ms`}
          icon="⚡"
          color="blue"
        />
        <SummaryCard
          title="일일 토큰 사용량"
          value={(displaySummary.dailyTokenUsage ?? 0).toLocaleString()}
          icon="🔤"
          color="purple"
        />
        <SummaryCard
          title="서버 상태"
          value={serverHealth?.status === 'ok' || displaySummary.serverStatus === 'online' ? '정상' : '오프라인'}
          icon={displaySummary.serverStatus === 'online' ? '🟢' : '🔴'}
          color={displaySummary.serverStatus === 'online' ? 'green' : 'red'}
        />
        <SummaryCard
          title="누적 토큰"
          value={(displaySummary.totalTokenUsage ?? 0).toLocaleString()}
          icon="📈"
        />
      </div>

      {/* 차트 그리드 */}
      <div className={css({
        display: 'grid',
        gridTemplateColumns: { base: '1fr', lg: '2fr 1fr' },
        gap: '6',
        mb: '6',
      })}>
        {/* 일별 질의 수 라인 차트 */}
        <div className={css({
          bg: 'white',
          borderRadius: 'lg',
          boxShadow: 'sm',
          p: '4',
        })}>
          <h3 className={css({ fontWeight: 'bold', mb: '4' })}>📈 일별 질의 수</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={displayDailyStats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="questionCount" 
                stroke="#3B82F6" 
                name="전체"
                strokeWidth={2}
              />
              <Line 
                type="monotone" 
                dataKey="successCount" 
                stroke="#10B981" 
                name="성공"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 질문 유형 분포 도넛 차트 */}
        <div className={css({
          bg: 'white',
          borderRadius: 'lg',
          boxShadow: 'sm',
          p: '4',
        })}>
          <h3 className={css({ fontWeight: 'bold', mb: '4' })}>🎯 질문 유형 분포</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                // @ts-expect-error - Recharts type compatibility issue
                data={displayCategoryDist}
                dataKey="count"
                nameKey="category"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={60}
                label={({ name, percent, payload }) => {
                  const category = name || payload?.category || '';
                  const percentage = payload?.percentage ?? (percent ? percent * 100 : 0);
                  return `${getCategoryLabel(category)} ${percentage.toFixed(0)}%`;
                }}
              >
                {displayCategoryDist.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={getCategoryColor(entry.category, index)} 
                  />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value, name) => [value, getCategoryLabel(name as string)]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 하단 그리드 */}
      <div className={css({
        display: 'grid',
        gridTemplateColumns: { base: '1fr', lg: '1fr 1fr' },
        gap: '6',
      })}>
        {/* 데이터 소스 기여도 */}
        <div className={css({
          bg: 'white',
          borderRadius: 'lg',
          boxShadow: 'sm',
          p: '4',
        })}>
          <h3 className={css({ fontWeight: 'bold', mb: '4' })}>📚 데이터 소스 기여도</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={displaySourceDist} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis 
                type="category" 
                dataKey="type" 
                tickFormatter={(value) => {
                  const labels: Record<string, string> = {
                    code: '소스 코드',
                    commit: '커밋 히스토리',
                    history: '기타 히스토리',
                  };
                  return labels[value] || value;
                }}
              />
              <Tooltip 
                formatter={(value, _name, props) => [
                  `${value}건 (${props.payload.percentage}%)`,
                  '응답 수'
                ]}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {displaySourceDist.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={SOURCE_COLORS[entry.type as keyof typeof SOURCE_COLORS]} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 최근 응답 속도 */}
        <div className={css({
          bg: 'white',
          borderRadius: 'lg',
          boxShadow: 'sm',
          p: '4',
        })}>
          <h3 className={css({ fontWeight: 'bold', mb: '4' })}>⚡ 최근 응답 속도</h3>
          <div className={css({ maxHeight: '250px', overflow: 'auto' })}>
            {recentHistory.length > 0 ? (
              recentHistory.map((record, idx) => (
                <div 
                  key={record.id || idx}
                  className={css({
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    py: '2',
                    borderBottom: '1px solid',
                    borderColor: 'gray.100',
                  })}
                >
                  <span className={css({ 
                    fontSize: 'sm', 
                    color: 'gray.700',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxW: '200px',
                  })}>
                    {record.questionSummary || record.question?.slice(0, 20) + '...'}
                  </span>
                  <span className={css({
                    fontSize: 'sm',
                    fontWeight: '500',
                    color: record.responseTimeMs < 2000 ? 'green.600' : 
                           record.responseTimeMs < 5000 ? 'yellow.600' : 'red.600',
                  })}>
                    {record.responseTimeMs?.toLocaleString() || '-'}ms
                  </span>
                </div>
              ))
            ) : (
              // Mock 데이터
              [
                { question: '기술스택 알려줘', time: 2340 },
                { question: '최근 변경사항은?', time: 1890 },
                { question: '프로젝트 구조 설명해줘', time: 3200 },
                { question: 'API 엔드포인트는?', time: 2100 },
                { question: '배포 방법은?', time: 2560 },
              ].map((item, idx) => (
                <div 
                  key={idx}
                  className={css({
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    py: '2',
                    borderBottom: '1px solid',
                    borderColor: 'gray.100',
                  })}
                >
                  <span className={css({ fontSize: 'sm', color: 'gray.700' })}>
                    {item.question}
                  </span>
                  <span className={css({
                    fontSize: 'sm',
                    fontWeight: '500',
                    color: item.time < 2000 ? 'green.600' : 
                           item.time < 3000 ? 'yellow.600' : 'red.600',
                  })}>
                    {item.time.toLocaleString()}ms
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 요약 카드 컴포넌트
function SummaryCard({ 
  title, 
  value, 
  icon, 
  color = 'gray' 
}: { 
  title: string; 
  value: string; 
  icon: string;
  color?: 'gray' | 'green' | 'blue' | 'purple' | 'red';
}) {
  return (
    <div className={css({
      bg: 'white',
      borderRadius: 'lg',
      boxShadow: 'sm',
      p: '4',
      borderLeft: '4px solid',
      borderColor: `${color}.500`,
    })}>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '2', mb: '2' })}>
        <span>{icon}</span>
        <span className={css({ fontSize: 'sm', color: 'gray.600' })}>{title}</span>
      </div>
      <p className={css({ fontSize: '2xl', fontWeight: 'bold' })}>{value}</p>
    </div>
  );
}


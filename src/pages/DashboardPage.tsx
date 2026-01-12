/**
 * Dashboard Page
 * 시스템 모니터링 및 분석
 */
import React from 'react';
import { css } from 'styled-system/css';
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
  useServerStatus,
  useHistory,
} from '../hooks/useQueries';
import type { QuestionCategory } from '../types';

// Category colors (known categories)
const CATEGORY_COLORS: Record<QuestionCategory, string> = {
  planning: '#8B5CF6',
  technical: '#3B82F6',
  history: '#10B981',
  cs: '#F59E0B',
  status: '#EF4444',
  issue: '#EC4899',
  implementation: '#06B6D4',
  structure: '#6366F1',
  data: '#84CC16',
  techStack: '#F97316',
  testing: '#14B8A6',
  summary: '#A855F7',
  etc: '#64748B',
};

// Color palette for dynamic categories
const COLOR_PALETTE = [
  '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#6366F1', '#84CC16', '#F97316',
  '#14B8A6', '#A855F7', '#22C55E', '#0EA5E9', '#F43F5E',
];

const getCategoryColor = (category: string, index: number): string => {
  if (category in CATEGORY_COLORS) {
    return CATEGORY_COLORS[category as QuestionCategory];
  }
  return COLOR_PALETTE[index % COLOR_PALETTE.length];
};

// Korean labels for categories
const categoryLabels: Record<string, string> = {
  planning: '기획',
  technical: '기술',
  history: '히스토리',
  cs: 'CS',
  status: '현황',
  issue: '이슈/버그',
  implementation: '구현',
  structure: '구조',
  data: '데이터',
  techStack: '기술스택',
  testing: '테스트',
  summary: '요약',
  etc: '기타',
};

const getCategoryLabel = (category: string): string => {
  return categoryLabels[category] || category || '알 수 없음';
};

// Source colors
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
  const { data: serverHealth } = useServerStatus();
  const { data: recentHistory = [] } = useHistory({ limit: 10 });

  const isServerOnline = serverHealth?.status === 'healthy' || summary?.serverStatus === 'online';

  return (
    <div className={css({
      minHeight: '100%',
      bg: 'gray.50',
      p: '6',
      pb: '12',
    })}>
      {/* Header */}
      <header className={css({ mb: '2' })}>
        <h1 className={css({ fontSize: '2xl', fontWeight: 'bold' })}>
          System Dashboard
        </h1>
        <p className={css({ color: 'gray.600', mt: '1' })}>
          NLP Q&A 시스템의 동작 상태와 성능을 모니터링합니다.
        </p>
      </header>

      {/* Summary Cards */}
      <div className={css({
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '4',
        mb: '6',
      })}>
        <SummaryCard
          title="전체 질문 수"
          value={summary?.totalQuestions?.toLocaleString() ?? '0'}
          icon="💬"
        />
        <SummaryCard
          title="성공률"
          value={summary?.successRate ? `${summary.successRate.toFixed(1)}%` : '0%'}
          icon="✅"
          color="green"
        />
        <SummaryCard
          title="평균 응답 시간"
          value={summary?.averageResponseTimeMs ? `${summary.averageResponseTimeMs.toLocaleString()}ms` : '0ms'}
          icon="⚡"
          color="blue"
        />
        <SummaryCard
          title="서버 상태"
          value={isServerOnline ? '정상' : '오프라인'}
          icon={isServerOnline ? '🟢' : '🔴'}
          color={isServerOnline ? 'green' : 'red'}
        />
      </div>

      {/* Charts Grid */}
      <div className={css({
        display: 'grid',
        gridTemplateColumns: { base: '1fr', lg: '2fr 1fr' },
        gap: '6',
        mb: '6',
      })}>
        {/* Daily Stats Line Chart */}
        <div className={css({
          bg: 'white',
          borderRadius: 'lg',
          boxShadow: 'sm',
          p: '3',
        })}>
          <h3 className={css({ fontWeight: 'bold', mb: '4' })}>일별 질의 수</h3>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={dailyStats}>
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

        {/* Category Distribution Donut Chart */}
        <div className={css({
          bg: 'white',
          borderRadius: 'lg',
          boxShadow: 'sm',
          p: '3',
          position: 'relative',
        })}>
          <h3 className={css({ fontWeight: 'bold', mb: '4' })}>질문 유형 분포</h3>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie
                data={categoryDist}
                dataKey="count"
                nameKey="category"
                cx="50%"
                cy="50%"
                outerRadius={80}
                innerRadius={50}
                label={({ payload }: { payload?: { category?: string; percentage?: number } }) => {
                  const category = payload?.category || '';
                  const percentage = payload?.percentage ?? 0;
                  return `${getCategoryLabel(category)} ${percentage.toFixed(0)}%`;
                }}
              >
                {categoryDist.map((entry, index) => (
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
          {/* Center Text */}
          <div className={css({
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
            mt: '5',
          })}>
            <div className={css({ fontSize: '2xl', fontWeight: 'bold', color: 'gray.800' })}>
              {categoryDist.reduce((sum, item) => sum + item.count, 0).toLocaleString()}
            </div>
            <div className={css({ fontSize: 'xs', color: 'gray.500', mt: '1' })}>
              질문
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid */}
      <div className={css({
        display: 'grid',
        gridTemplateColumns: { base: '1fr', lg: '1fr 1fr' },
        gap: '6',
      })}>
        {/* Source Contribution Bar Chart */}
        <div className={css({
          bg: 'white',
          borderRadius: 'lg',
          boxShadow: 'sm',
          p: '3',
        })}>
          <h3 className={css({ fontWeight: 'bold', mb: '4' })}>데이터 소스 기여도</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={sourceDist} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis
                type="category"
                dataKey="type"
                tickFormatter={(value) => {
                  const labels: Record<string, string> = {
                    code: '소스 코드',
                    commit: '커밋 히스토리',
                    history: 'Q&A 히스토리',
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
                {sourceDist.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={SOURCE_COLORS[entry.type as keyof typeof SOURCE_COLORS]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent Response Speed */}
        <div className={css({
          bg: 'white',
          borderRadius: 'lg',
          boxShadow: 'sm',
          p: '3',
        })}>
          <h3 className={css({ fontWeight: 'bold', mb: '4' })}>최근 응답 속도</h3>
          <div className={css({ maxHeight: '250px', overflow: 'auto' })}>
            {recentHistory.length > 0 ? (
              recentHistory.map((record, idx) => {
                const responseTime = record.responseTimeMs ?? 0;
                return (
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
                      color: responseTime < 2000 ? 'green.600' :
                             responseTime < 5000 ? 'yellow.600' : 'red.600',
                    })}>
                      {responseTime > 0 ? `${responseTime.toLocaleString()}ms` : '-'}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className={css({
                textAlign: 'center',
                py: '8',
                color: 'gray.500',
                fontSize: 'sm',
              })}>
                데이터가 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Summary Card Component
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
      p: '3',
      borderLeft: '4px solid',
      borderColor: `${color}.500`,
    })}>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '2' })}>
        <span>{icon}</span>
        <span className={css({ fontSize: 'sm', color: 'gray.600' })}>{title}</span>
      </div>
      <p className={css({ fontSize: '2xl', fontWeight: 'bold' })}>{value}</p>
    </div>
  );
}

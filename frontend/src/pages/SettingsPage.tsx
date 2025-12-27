/**
 * 설정 페이지
 * 서버 상태 확인
 */
import { useState, useEffect } from 'react';
import { css } from '../../styled-system/css';
import {
  getServerStatus,
  type ServerStatus,
} from '../api/client';
import { checkSupabaseConnection } from '../api/supabase';
import { checkMigrationStatus, getMigrationSchema } from '../api/client';

type ProcessStatus = 'stopped' | 'starting' | 'running' | 'error';

const statusColors: Record<ProcessStatus, { bg: string; text: string; dot: string }> = {
  stopped: { bg: 'gray.100', text: 'gray.600', dot: '🔴' },
  starting: { bg: 'yellow.100', text: 'yellow.700', dot: '🟡' },
  running: { bg: 'green.100', text: 'green.700', dot: '🟢' },
  error: { bg: 'red.100', text: 'red.700', dot: '🔴' },
};

const statusLabels: Record<ProcessStatus, string> = {
  stopped: '중지됨',
  starting: '시작 중...',
  running: '실행 중',
  error: '오류',
};

export default function SettingsPage() {
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [supabaseConnected, setSupabaseConnected] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<{
    qa_history: boolean;
    server_status_log: boolean;
    allTablesExist: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMigrationSchema, setShowMigrationSchema] = useState(false);
  const [migrationSchema, setMigrationSchema] = useState<string>('');

  // 상태 폴링
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        // 서버 상태 조회
        const status = await getServerStatus();
        setServerStatus(status);

        // API 서버가 실행 중이면 Supabase 및 마이그레이션 상태 확인
        const apiStatus = status?.api?.status || 'stopped';
        const apiServerOnline = apiStatus === 'running';

        if (apiServerOnline) {
          // Supabase 연결 확인 (상태에 이미 포함되어 있음)
          const supabaseStatus = status?.supabase?.status || 'disconnected';
          setSupabaseConnected(supabaseStatus === 'connected');

          // 마이그레이션 상태 확인
          const migration = await checkMigrationStatus();
          if (migration) {
            setMigrationStatus(migration);
          }
        }

        setError(null);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
        console.debug('상태 조회 실패:', errorMessage);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 60000); // 1분마다 갱신

    return () => clearInterval(interval);
  }, []);


  return (
    <div className={css({
      minHeight: '100vh',
      height: '100vh',
      bg: 'gray.50',
      p: '6',
      overflowY: 'auto',
    })}>
      {/* 헤더 */}
      <header className={css({ mb: '10' })}>
        <h1 className={css({ fontSize: '2xl', fontWeight: 'bold' })}>
          ⚙️ 설정
        </h1>
        <p className={css({ color: 'gray.600', mt: '1' })}>
          서버 상태 확인
        </p>
      </header>

      {/* 에러 메시지 */}
      {error && (
        <div className={css({
          bg: 'red.50',
          border: '1px solid',
          borderColor: 'red.200',
          borderRadius: 'lg',
          p: '4',
          mb: '10',
          color: 'red.700',
        })}>
          ❌ {error}
        </div>
      )}

      {/* 서버 상태 카드 */}
      <div className={css({
        display: 'grid',
        gridTemplateColumns: { base: '1fr', md: '1fr 1fr' },
        gap: '6',
        mb: '30',
      })}>
        {/* ChromaDB */}
        <ServerCard
          name="ChromaDB"
          description="벡터 데이터베이스 (포트: 8000)"
          icon="🗄️"
          status={serverStatus?.chromadb.status || 'stopped'}
          startedAt={serverStatus?.chromadb.startedAt ?? null}
          pid={serverStatus?.chromadb.pid ?? null}
        />

        {/* API Server */}
        <ServerCard
          name="API Server"
          description="질의응답 API (포트: 3001)"
          icon="🚀"
          status={serverStatus?.api.status || 'stopped'}
          startedAt={serverStatus?.api.startedAt ?? null}
          pid={serverStatus?.api.pid ?? null}
        />
      </div>

      {/* 외부 서비스 상태 */}
      <div className={css({
        bg: 'white',
        borderRadius: 'lg',
        boxShadow: 'sm',
        p: '4',
        mb: '30',
      })}>
        <h2 className={css({ fontWeight: 'bold', mb: '4' })}>
          외부 서비스
        </h2>
        <div className={css({ display: 'flex', flexDirection: 'column', gap: '3' })}>
          <div className={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between' })}>
            <div className={css({ display: 'flex', alignItems: 'center', gap: '3' })}>
              <span>{supabaseConnected ? '🟢' : '🔴'}</span>
              <div>
                <span className={css({ fontWeight: '500' })}>Supabase</span>
                <span className={css({ 
                  ml: '2',
                  fontSize: 'sm',
                  color: supabaseConnected ? 'green.600' : 'red.600',
                })}>
                  {supabaseConnected ? '연결됨' : '연결 안됨'}
                </span>
              </div>
            </div>
            {migrationStatus && !migrationStatus.allTablesExist && (
              <button
                onClick={async () => {
                  const schema = await getMigrationSchema();
                  if (schema) {
                    setMigrationSchema(schema);
                    setShowMigrationSchema(true);
                  } else {
                    setError('API 서버가 실행되지 않아 스키마를 가져올 수 없습니다.');
                  }
                }}
                className={css({
                  px: '3',
                  py: '1',
                  bg: 'orange.100',
                  color: 'orange.700',
                  borderRadius: 'md',
                  fontSize: 'xs',
                  fontWeight: '500',
                  cursor: 'pointer',
                  _hover: { bg: 'orange.200' },
                })}
              >
                📋 스키마 보기
              </button>
            )}
          </div>
          {migrationStatus && (
            <div className={css({ fontSize: 'sm', color: 'gray.600', ml: '8' })}>
              <div>qa_history: {migrationStatus.qa_history ? '✅' : '❌'}</div>
              <div>server_status_log: {migrationStatus.server_status_log ? '✅' : '❌'}</div>
              {!migrationStatus.allTablesExist && (
                <div className={css({ mt: '2', p: '2', bg: 'yellow.50', borderRadius: 'md', fontSize: 'xs' })}>
                  ⚠️ 테이블이 없습니다. Supabase SQL Editor에서 스키마를 실행하세요.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 마이그레이션 스키마 모달 */}
      {showMigrationSchema && (
        <div className={css({
          position: 'fixed',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          bg: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          p: '4',
        })} onClick={() => setShowMigrationSchema(false)}>
          <div className={css({
            bg: 'white',
            borderRadius: 'lg',
            p: '6',
            maxW: '800px',
            maxH: '80vh',
            overflow: 'auto',
            boxShadow: 'xl',
          })} onClick={(e) => e.stopPropagation()}>
            <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '4' })}>
              <h3 className={css({ fontSize: 'lg', fontWeight: 'bold' })}>
                📋 Supabase 스키마
              </h3>
              <button
                onClick={() => setShowMigrationSchema(false)}
                className={css({
                  px: '3',
                  py: '1',
                  bg: 'gray.200',
                  borderRadius: 'md',
                  cursor: 'pointer',
                  _hover: { bg: 'gray.300' },
                })}
              >
                ✕ 닫기
              </button>
            </div>
            <p className={css({ fontSize: 'sm', color: 'gray.600', mb: '3' })}>
              다음 SQL을 Supabase SQL Editor에서 실행하세요:
            </p>
            <pre className={css({
              bg: 'gray.900',
              color: 'green.400',
              p: '4',
              borderRadius: 'md',
              overflow: 'auto',
              fontSize: 'xs',
              fontFamily: 'mono',
            })}>
              {migrationSchema}
            </pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(migrationSchema);
                alert('스키마가 클립보드에 복사되었습니다!');
              }}
              className={css({
                mt: '3',
                px: '4',
                py: '2',
                bg: 'blue.600',
                color: 'white',
                borderRadius: 'md',
                fontWeight: '500',
                cursor: 'pointer',
                _hover: { bg: 'blue.700' },
              })}
            >
              📋 클립보드에 복사
            </button>
          </div>
        </div>
      )}

      {/* 환경 변수 정보 */}
      <div className={css({
        bg: 'white',
        borderRadius: 'lg',
        boxShadow: 'sm',
        p: '4',
      })}>
        <h2 className={css({ fontWeight: 'bold', mb: '4' })}>
          환경 설정
        </h2>
        <div className={css({ fontSize: 'sm', fontFamily: 'mono' })}>
          <div className={css({ mb: '2' })}>
            <span className={css({ color: 'gray.500' })}>API_URL:</span>{' '}
            <span>{import.meta.env.VITE_API_URL || 'http://localhost:3001'}</span>
          </div>
          <div>
            <span className={css({ color: 'gray.500' })}>SUPABASE_URL:</span>{' '}
            <span>{import.meta.env.VITE_SUPABASE_URL || '(not set)'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// 서버 카드 컴포넌트
function ServerCard({
  name,
  description,
  icon,
  status,
  startedAt,
  pid,
}: {
  name: string;
  description: string;
  icon: string;
  status: ProcessStatus;
  startedAt: string | null;
  pid: number | null;
}) {
  const colors = statusColors[status];
  const isRunning = status === 'running';

  return (
    <div className={css({
      bg: 'white',
      borderRadius: 'lg',
      boxShadow: 'sm',
      p: '4',
      borderLeft: '4px solid',
      borderColor: isRunning ? 'green.500' : 'gray.300',
    })}>
      <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'start' })}>
        <div>
          <div className={css({ display: 'flex', alignItems: 'center', gap: '2', mb: '1' })}>
            <span className={css({ fontSize: 'xl' })}>{icon}</span>
            <h3 className={css({ fontWeight: 'bold', fontSize: 'lg' })}>{name}</h3>
          </div>
          <p className={css({ fontSize: 'sm', color: 'gray.500', mb: '3' })}>
            {description}
          </p>
        </div>
        <div className={css({
          px: '2',
          py: '1',
          borderRadius: 'full',
          fontSize: 'xs',
          fontWeight: '500',
          bg: colors.bg,
          color: colors.text,
        })}>
          {colors.dot} {statusLabels[status]}
        </div>
      </div>

      {/* 상세 정보 */}
      {(startedAt || pid) && (
        <div className={css({
          fontSize: 'xs',
          color: 'gray.500',
          fontFamily: 'mono',
        })}>
          {pid && <span>PID: {pid}</span>}
          {startedAt && (
            <span className={css({ ml: pid ? '3' : '0' })}>
              시작: {new Date(startedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}


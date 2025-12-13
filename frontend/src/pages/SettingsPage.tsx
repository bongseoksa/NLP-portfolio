/**
 * 설정 페이지
 * 서버 상태 확인 및 제어 (로컬 개발 환경)
 */
import { useState, useEffect } from 'react';
import { css } from '../../styled-system/css';
import {
  getServerStatus,
  startChromaDB,
  stopChromaDB,
  startAPIServer,
  stopAPIServer,
  checkControlServerHealth,
  type ServerStatus,
} from '../api/client';
import { checkSupabaseConnection } from '../api/supabase';
import { checkMigrationStatus, getMigrationSchema } from '../api/client';

// 환경 감지
const isLocalDev = import.meta.env.DEV;

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
  const [controlServerOnline, setControlServerOnline] = useState(false);
  const [supabaseConnected, setSupabaseConnected] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<{
    qa_history: boolean;
    server_status_log: boolean;
    allTablesExist: boolean;
  } | null>(null);
  const [loading, setLoading] = useState<{ chromadb: boolean; api: boolean }>({
    chromadb: false,
    api: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [showMigrationSchema, setShowMigrationSchema] = useState(false);
  const [migrationSchema, setMigrationSchema] = useState<string>('');

  // 상태 폴링
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        // Control 서버 연결 확인
        const controlOnline = await checkControlServerHealth();
        setControlServerOnline(controlOnline);

        if (controlOnline) {
          const status = await getServerStatus();
          setServerStatus(status);
        }

        // Supabase 연결 확인
        const supabaseOk = await checkSupabaseConnection();
        setSupabaseConnected(supabaseOk);

        // 마이그레이션 상태 확인
        const migration = await checkMigrationStatus();
        if (migration) {
          setMigrationStatus(migration);
        }

        setError(null);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
        console.debug('상태 조회 실패:', errorMessage);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // 5초마다 갱신

    return () => clearInterval(interval);
  }, []);

  // ChromaDB 시작/종료
  const handleChromaDB = async (action: 'start' | 'stop') => {
    setLoading(prev => ({ ...prev, chromadb: true }));
    setError(null);

    try {
      const result = action === 'start' ? await startChromaDB() : await stopChromaDB();
      if (!result) {
        setError('Control 서버에 연결할 수 없습니다. Control 서버가 실행 중인지 확인하세요.');
        return;
      }
      if (!result.success) {
        setError(result.message);
      }
      // 상태 갱신
      const status = await getServerStatus();
      if (status) {
        setServerStatus(status);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
      setError(errorMessage);
    } finally {
      setLoading(prev => ({ ...prev, chromadb: false }));
    }
  };

  // API 서버 시작/종료
  const handleAPIServer = async (action: 'start' | 'stop') => {
    setLoading(prev => ({ ...prev, api: true }));
    setError(null);

    try {
      const result = action === 'start' ? await startAPIServer() : await stopAPIServer();
      if (!result) {
        setError('Control 서버에 연결할 수 없습니다. Control 서버가 실행 중인지 확인하세요.');
        return;
      }
      if (!result.success) {
        setError(result.message);
      }
      // 상태 갱신
      const status = await getServerStatus();
      if (status) {
        setServerStatus(status);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
      setError(errorMessage);
    } finally {
      setLoading(prev => ({ ...prev, api: false }));
    }
  };

  return (
    <div className={css({
      minHeight: '100vh',
      bg: 'gray.50',
      p: '6',
    })}>
      {/* 헤더 */}
      <header className={css({ mb: '6' })}>
        <h1 className={css({ fontSize: '2xl', fontWeight: 'bold' })}>
          ⚙️ 설정
        </h1>
        <p className={css({ color: 'gray.600', mt: '1' })}>
          서버 상태 확인 및 제어
        </p>
      </header>

      {/* 환경 정보 */}
      <div className={css({
        bg: isLocalDev ? 'blue.50' : 'orange.50',
        border: '1px solid',
        borderColor: isLocalDev ? 'blue.200' : 'orange.200',
        borderRadius: 'lg',
        p: '4',
        mb: '6',
      })}>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '2' })}>
          <span className={css({ fontSize: 'lg' })}>
            {isLocalDev ? '🔧' : '🌐'}
          </span>
          <span className={css({ fontWeight: '600' })}>
            {isLocalDev ? '로컬 개발 환경' : '프로덕션 환경'}
          </span>
        </div>
        <p className={css({ fontSize: 'sm', color: 'gray.600', mt: '1' })}>
          {isLocalDev 
            ? '서버 시작/종료 제어가 가능합니다.' 
            : '프로덕션 환경에서는 서버 상태 확인만 가능합니다.'
          }
        </p>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className={css({
          bg: 'red.50',
          border: '1px solid',
          borderColor: 'red.200',
          borderRadius: 'lg',
          p: '4',
          mb: '6',
          color: 'red.700',
        })}>
          ❌ {error}
        </div>
      )}

      {/* Control 서버 상태 */}
      {isLocalDev && (
        <div className={css({
          bg: 'white',
          borderRadius: 'lg',
          boxShadow: 'sm',
          p: '4',
          mb: '6',
        })}>
          <h2 className={css({ fontWeight: 'bold', mb: '3' })}>
            Control 서버
          </h2>
          <div className={css({ display: 'flex', alignItems: 'center', gap: '2' })}>
            <span>{controlServerOnline ? '🟢' : '🔴'}</span>
            <span className={css({ 
              color: controlServerOnline ? 'green.700' : 'red.700',
              fontWeight: '500',
            })}>
              {controlServerOnline ? '연결됨' : '연결 안됨'}
            </span>
            {!controlServerOnline && (
              <span className={css({ fontSize: 'sm', color: 'gray.500' })}>
                - `pnpm run control` 실행 필요
              </span>
            )}
          </div>
        </div>
      )}

      {/* 서버 상태 카드 */}
      <div className={css({
        display: 'grid',
        gridTemplateColumns: { base: '1fr', md: '1fr 1fr' },
        gap: '6',
        mb: '6',
      })}>
        {/* ChromaDB */}
        <ServerCard
          name="ChromaDB"
          description="벡터 데이터베이스 (포트: 8000)"
          icon="🗄️"
          status={serverStatus?.chromadb.status || 'stopped'}
          startedAt={serverStatus?.chromadb.startedAt ?? null}
          pid={serverStatus?.chromadb.pid ?? null}
          loading={loading.chromadb}
          disabled={!isLocalDev || !controlServerOnline}
          onStart={() => handleChromaDB('start')}
          onStop={() => handleChromaDB('stop')}
        />

        {/* API Server */}
        <ServerCard
          name="API Server"
          description="질의응답 API (포트: 3001)"
          icon="🚀"
          status={serverStatus?.api.status || 'stopped'}
          startedAt={serverStatus?.api.startedAt ?? null}
          pid={serverStatus?.api.pid ?? null}
          loading={loading.api}
          disabled={!isLocalDev || !controlServerOnline}
          onStart={() => handleAPIServer('start')}
          onStop={() => handleAPIServer('stop')}
        />
      </div>

      {/* 외부 서비스 상태 */}
      <div className={css({
        bg: 'white',
        borderRadius: 'lg',
        boxShadow: 'sm',
        p: '4',
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
        mt: '6',
      })}>
        <h2 className={css({ fontWeight: 'bold', mb: '4' })}>
          환경 설정
        </h2>
        <div className={css({ fontSize: 'sm', fontFamily: 'mono' })}>
          <div className={css({ mb: '2' })}>
            <span className={css({ color: 'gray.500' })}>API_URL:</span>{' '}
            <span>{import.meta.env.VITE_API_URL || 'http://localhost:3001'}</span>
          </div>
          <div className={css({ mb: '2' })}>
            <span className={css({ color: 'gray.500' })}>CONTROL_URL:</span>{' '}
            <span>{import.meta.env.VITE_CONTROL_URL || 'http://localhost:3000'}</span>
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
  loading,
  disabled,
  onStart,
  onStop,
}: {
  name: string;
  description: string;
  icon: string;
  status: ProcessStatus;
  startedAt: string | null;
  pid: number | null;
  loading: boolean;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
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
          mb: '3',
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

      {/* 제어 버튼 */}
      <div className={css({ display: 'flex', gap: '2' })}>
        {!isRunning ? (
          <button
            onClick={onStart}
            disabled={disabled || loading}
            className={css({
              flex: '1',
              px: '4',
              py: '2',
              bg: disabled ? 'gray.200' : 'green.600',
              color: 'white',
              borderRadius: 'md',
              fontWeight: '500',
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              _hover: { bg: disabled ? 'gray.200' : 'green.700' },
              _disabled: { opacity: 0.7 },
            })}
          >
            {loading ? '처리 중...' : '▶ 시작'}
          </button>
        ) : (
          <button
            onClick={onStop}
            disabled={disabled || loading}
            className={css({
              flex: '1',
              px: '4',
              py: '2',
              bg: disabled ? 'gray.200' : 'red.600',
              color: 'white',
              borderRadius: 'md',
              fontWeight: '500',
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              _hover: { bg: disabled ? 'gray.200' : 'red.700' },
              _disabled: { opacity: 0.7 },
            })}
          >
            {loading ? '처리 중...' : '■ 종료'}
          </button>
        )}
      </div>

      {disabled && (
        <p className={css({ 
          fontSize: 'xs', 
          color: 'gray.500', 
          mt: '2',
          textAlign: 'center',
        })}>
          {!import.meta.env.DEV 
            ? '프로덕션에서는 제어 불가' 
            : 'Control 서버 연결 필요'
          }
        </p>
      )}
    </div>
  );
}


/**
 * 서버 상태 인디케이터 컴포넌트
 * 헤더에 표시되는 작은 상태 표시기
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../../../styled-system/css';
import { getServerStatus, checkControlServerHealth, checkAPIServerHealth } from '../../api/client';

type Status = 'online' | 'offline' | 'checking';

export default function ServerStatus() {
  const navigate = useNavigate();
  const [apiStatus, setApiStatus] = useState<Status>('checking');
  const [chromaStatus, setChromaStatus] = useState<Status>('checking');

  useEffect(() => {
    const checkStatus = async () => {
      // API 서버 직접 체크
      try {
        const health = await checkAPIServerHealth();
        setApiStatus(health ? 'online' : 'offline');
      } catch {
        setApiStatus('offline');
      }

      // Control 서버를 통해 ChromaDB 상태 체크
      try {
        const controlOnline = await checkControlServerHealth();
        if (controlOnline) {
          const status = await getServerStatus();
          if (status) {
            setChromaStatus(status.chromadb.status === 'running' ? 'online' : 'offline');
          } else {
            setChromaStatus('offline');
          }
        } else {
          // Control 서버가 없으면 ChromaDB 직접 체크
          try {
            const response = await fetch('http://localhost:8000/api/v2/heartbeat');
            setChromaStatus(response.ok ? 'online' : 'offline');
          } catch {
            setChromaStatus('offline');
          }
        }
      } catch {
        setChromaStatus('offline');
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 10000); // 10초마다 체크

    return () => clearInterval(interval);
  }, []);

  const getStatusDot = (status: Status) => {
    switch (status) {
      case 'online':
        return '🟢';
      case 'offline':
        return '🔴';
      case 'checking':
        return '⚪';
    }
  };

  return (
    <button
      onClick={() => navigate('/settings')}
      className={css({
        display: 'flex',
        alignItems: 'center',
        gap: '2',
        px: '3',
        py: '1',
        bg: 'gray.800',
        borderRadius: 'full',
        cursor: 'pointer',
        transition: 'all 0.2s',
        border: 'none',
        _hover: { bg: 'gray.700' },
      })}
      title="서버 상태 - 클릭하여 설정 페이지로 이동"
    >
      <div className={css({ display: 'flex', alignItems: 'center', gap: '1' })}>
        <span className={css({ fontSize: 'xs' })}>{getStatusDot(apiStatus)}</span>
        <span className={css({ fontSize: 'xs', color: 'gray.400' })}>API</span>
      </div>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '1' })}>
        <span className={css({ fontSize: 'xs' })}>{getStatusDot(chromaStatus)}</span>
        <span className={css({ fontSize: 'xs', color: 'gray.400' })}>DB</span>
      </div>
    </button>
  );
}


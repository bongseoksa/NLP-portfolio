import { styled } from '../../../styled-system/jsx';
import { useServerStatus } from '../../hooks/useQueries';

const StatusContainer = styled('div', {
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.375rem 0.75rem',
    borderRadius: 'md',
    fontSize: '0.75rem',
    fontWeight: 500,
  },
  variants: {
    status: {
      healthy: {
        backgroundColor: '#dcfce7',
        color: '#166534',
      },
      degraded: {
        backgroundColor: '#fef3c7',
        color: '#92400e',
      },
      offline: {
        backgroundColor: '#fee2e2',
        color: '#991b1b',
      },
      loading: {
        backgroundColor: '#f1f5f9',
        color: '#64748b',
      },
    },
  },
  defaultVariants: {
    status: 'loading',
  },
});

const StatusDot = styled('span', {
  base: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  variants: {
    status: {
      healthy: { backgroundColor: '#22c55e' },
      degraded: { backgroundColor: '#f59e0b' },
      offline: { backgroundColor: '#ef4444' },
      loading: { backgroundColor: '#94a3b8' },
    },
  },
});

type StatusType = 'healthy' | 'degraded' | 'offline' | 'loading';

function ServerStatus() {
  const { data, isLoading, isError } = useServerStatus();

  const status: StatusType = isLoading
    ? 'loading'
    : isError || !data
      ? 'offline'
      : data.status === 'healthy'
        ? 'healthy'
        : 'degraded';

  const label: Record<StatusType, string> = {
    healthy: 'Online',
    degraded: 'Degraded',
    offline: 'Offline',
    loading: 'Checking...',
  };

  return (
    <StatusContainer status={status}>
      <StatusDot status={status} />
      {label[status]}
    </StatusContainer>
  );
}

export default ServerStatus;

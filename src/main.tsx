import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

// React Query 클라이언트 설정
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1분
      retry: 0, // API 서버가 없을 때 재시도하지 않음
      refetchOnWindowFocus: false,
      // 네트워크 오류를 조용히 처리
      onError: (error) => {
        // 네트워크 오류는 조용히 처리 (콘솔에 표시하지 않음)
        if (error instanceof TypeError && error.message.includes('fetch')) {
          return;
        }
        // 기타 오류만 로그
        console.debug('Query error:', error);
      },
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

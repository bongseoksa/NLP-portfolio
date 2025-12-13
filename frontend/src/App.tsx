import { Routes, Route, NavLink } from 'react-router-dom';
import { css } from '../styled-system/css';
import QAPage from './pages/QAPage';
import DashboardPage from './pages/DashboardPage';

export default function App() {
  return (
    <div className={css({ minHeight: '100vh', display: 'flex', flexDirection: 'column' })}>
      {/* 네비게이션 */}
      <nav className={css({
        bg: 'gray.900',
        color: 'white',
        px: '6',
        py: '3',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      })}>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '6' })}>
          <h1 className={css({ fontWeight: 'bold', fontSize: 'lg' })}>
            🔍 GitHub Analyzer
          </h1>
          <div className={css({ display: 'flex', gap: '4' })}>
            <NavLink
              to="/"
              className={({ isActive }) =>
                css({
                  px: '3',
                  py: '1',
                  borderRadius: 'md',
                  transition: 'all 0.2s',
                  bg: isActive ? 'blue.600' : 'transparent',
                  _hover: { bg: isActive ? 'blue.600' : 'gray.700' },
                })
              }
            >
              💬 Q&A
            </NavLink>
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                css({
                  px: '3',
                  py: '1',
                  borderRadius: 'md',
                  transition: 'all 0.2s',
                  bg: isActive ? 'blue.600' : 'transparent',
                  _hover: { bg: isActive ? 'blue.600' : 'gray.700' },
                })
              }
            >
              📊 Dashboard
            </NavLink>
          </div>
        </div>
        <div className={css({ fontSize: 'sm', color: 'gray.400' })}>
          NLP Portfolio Project
        </div>
      </nav>

      {/* 메인 콘텐츠 */}
      <main className={css({ flex: '1' })}>
        <Routes>
          <Route path="/" element={<QAPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </main>
    </div>
  );
}

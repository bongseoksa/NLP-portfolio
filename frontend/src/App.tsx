import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { css } from '../styled-system/css';
import QAPage from './pages/QAPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import ServerStatus from './components/common/ServerStatus';
import { useSetAtom } from 'jotai';
import {
  questionInputAtom,
  isLoadingAtom,
  selectedRecordAtom,
  searchQueryAtom,
  currentAnswerAtom,
  sessionIdAtom
} from './stores/uiStore';

export default function App() {
  const navigate = useNavigate();
  const setQuestionInput = useSetAtom(questionInputAtom);
  const setIsLoading = useSetAtom(isLoadingAtom);
  const setSelectedRecord = useSetAtom(selectedRecordAtom);
  const setSearchQuery = useSetAtom(searchQueryAtom);
  const setCurrentAnswer = useSetAtom(currentAnswerAtom);
  const setSessionId = useSetAtom(sessionIdAtom);

  const handleLogoClick = () => {
    // Q&A 페이지 상태 초기화
    setQuestionInput('');
    setIsLoading(false);
    setSelectedRecord(null);
    setSearchQuery('');
    setCurrentAnswer(null);
    setSessionId(null); // 세션 초기화 (새 대화 시작)

    // Q&A 페이지로 이동
    navigate('/');
  };

  return (
    <div className={css({ minHeight: '100vh', display: 'flex', flexDirection: 'column' })}>
      {/* 네비게이션 */}
      <nav className={css({
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        bg: 'gray.900',
        color: 'white',
        px: '6',
        py: '3',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 1000,
      })}>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '6' })}>
          <button
            onClick={handleLogoClick}
            className={css({
              fontWeight: 'bold',
              fontSize: 'lg',
              cursor: 'pointer',
              bg: 'transparent',
              border: 'none',
              color: 'white',
              transition: 'opacity 0.2s',
              _hover: { opacity: 0.8 }
            })}
          >
            🔍 GitHub Analyzer
          </button>
          <div className={css({ display: 'flex', gap: '2' })}>
            <NavLink
              to="/"
              className={({ isActive }) =>
                css({
                  px: '3',
                  py: '1',
                  borderRadius: 'md',
                  fontSize: 'sm',
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
                  fontSize: 'sm',
                  transition: 'all 0.2s',
                  bg: isActive ? 'blue.600' : 'transparent',
                  _hover: { bg: isActive ? 'blue.600' : 'gray.700' },
                })
              }
            >
              📊 Dashboard
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                css({
                  px: '3',
                  py: '1',
                  borderRadius: 'md',
                  fontSize: 'sm',
                  transition: 'all 0.2s',
                  bg: isActive ? 'blue.600' : 'transparent',
                  _hover: { bg: isActive ? 'blue.600' : 'gray.700' },
                })
              }
            >
              ⚙️ Settings
            </NavLink>
          </div>
        </div>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '4' })}>
          <ServerStatus />
          <span className={css({ fontSize: 'sm', color: 'gray.400' })}>
            NLP Portfolio
          </span>
        </div>
      </nav>

      {/* 메인 콘텐츠 */}
      <main className={css({ h: 'calc(100vh - 56px)', mt: '56px', overflow: 'hidden' })}>
        <Routes>
          <Route path="/" element={<QAPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

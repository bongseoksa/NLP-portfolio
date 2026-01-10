import { Outlet, NavLink } from 'react-router-dom';
import { styled } from '../../../styled-system/jsx';
import ServerStatus from './ServerStatus';

const Container = styled('div', {
  base: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'surface.secondary',
  },
});

const Header = styled('header', {
  base: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 1.5rem',
    height: '64px',
    backgroundColor: 'surface.basic',
    borderBottom: '1px solid',
    borderColor: 'border.normal',
    boxShadow: 'sm',
  },
});

const Logo = styled('div', {
  base: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.75rem',
  },
});

const LogoTitle = styled('h1', {
  base: {
    margin: 0,
    fontSize: '1.25rem',
    fontWeight: 700,
    color: 'text.strong',
  },
});

const LogoSubtitle = styled('span', {
  base: {
    fontSize: '0.875rem',
    color: 'text.subtle',
  },
});

const Nav = styled('nav', {
  base: {
    display: 'flex',
    gap: '0.5rem',
  },
});

const navLinkStyle = {
  padding: '0.5rem 1rem',
  fontSize: '0.875rem',
  fontWeight: 500,
  textDecoration: 'none',
  borderRadius: '8px',
  transition: 'all 0.15s ease',
};

const Main = styled('main', {
  base: {
    flex: 1,
    padding: '1.5rem',
    maxWidth: '1200px',
    width: '100%',
    margin: '0 auto',
  },
});

function Layout() {
  return (
    <Container>
      <Header>
        <Logo>
          <LogoTitle>NLP Portfolio</LogoTitle>
          <LogoSubtitle>GitHub Repository Analyzer</LogoSubtitle>
        </Logo>
        <Nav>
          <NavLink
            to="/"
            style={({ isActive }) => ({
              ...navLinkStyle,
              color: isActive ? '#2563eb' : '#64748b',
              backgroundColor: isActive ? '#eff6ff' : 'transparent',
            })}
          >
            Q&A
          </NavLink>
          <NavLink
            to="/dashboard"
            style={({ isActive }) => ({
              ...navLinkStyle,
              color: isActive ? '#2563eb' : '#64748b',
              backgroundColor: isActive ? '#eff6ff' : 'transparent',
            })}
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/settings"
            style={({ isActive }) => ({
              ...navLinkStyle,
              color: isActive ? '#2563eb' : '#64748b',
              backgroundColor: isActive ? '#eff6ff' : 'transparent',
            })}
          >
            Settings
          </NavLink>
        </Nav>
        <ServerStatus />
      </Header>
      <Main>
        <Outlet />
      </Main>
    </Container>
  );
}

export default Layout;

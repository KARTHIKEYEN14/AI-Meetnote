import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Mic, Home, LayoutDashboard, PlusCircle, Users, LogOut, ChevronRight
} from 'lucide-react';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const [isAuthenticated, setIsAuthenticated] = useState(
    () => !!localStorage.getItem('token')
  );
  const [userName, setUserName] = useState(
    () => JSON.parse(localStorage.getItem('user') || '{}').name || ''
  );

  useEffect(() => {
    setIsAuthenticated(!!localStorage.getItem('token'));
    setUserName(JSON.parse(localStorage.getItem('user') || '{}').name || '');
  }, [location]);

  useEffect(() => {
    const onStorage = () => {
      setIsAuthenticated(!!localStorage.getItem('token'));
      setUserName(JSON.parse(localStorage.getItem('user') || '{}').name || '');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setUserName('');
    navigate('/');
  };

  const isActive = (path) => location.pathname === path;

  const navLink = (to, icon, label) => (
    <Link
      to={to}
      className={`sidebar-link${isActive(to) ? ' active' : ''}`}
    >
      {icon}
      <span>{label}</span>
      {isActive(to) && (
        <ChevronRight className="ml-auto" style={{ width: 14, height: 14, opacity: 0.6 }} />
      )}
    </Link>
  );

  return (
    <aside className="sidebar">
      {/* Logo */}
      <Link to="/" className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Mic style={{ width: 18, height: 18, color: '#fff' }} />
        </div>
        <span className="sidebar-logo-text">
          AI <span>Minutes</span>
        </span>
      </Link>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {/* Home — when logged in, logs user out first then goes to landing */}
        {isAuthenticated ? (
          <button
            onClick={handleLogout}
            className={`sidebar-link${location.pathname === '/' ? ' active' : ''}`}
          >
            <Home />
            <span>Home</span>
          </button>
        ) : (
          <Link
            to="/"
            className={`sidebar-link${location.pathname === '/' ? ' active' : ''}`}
          >
            <Home />
            <span>Home</span>
            {location.pathname === '/' && (
              <ChevronRight className="ml-auto" style={{ width: 14, height: 14, opacity: 0.6 }} />
            )}
          </Link>
        )}

        {isAuthenticated && (
          <>
            <span className="sidebar-nav-label">Workspace</span>
            {navLink('/dashboard', <LayoutDashboard />, 'Dashboard')}
            {navLink('/meeting/create', <PlusCircle />, 'Create Meeting')}
            {navLink('/meeting/join', <Users />, 'Join Meeting')}
          </>
        )}

        {!isAuthenticated && (
          <>
            <span className="sidebar-nav-label">Account</span>
            {navLink('/login', <LogOut style={{ transform: 'scaleX(-1)' }} />, 'Log In')}
            {navLink('/register', <PlusCircle />, 'Sign Up')}
          </>
        )}
      </nav>

      {/* Footer / user block */}
      {isAuthenticated && (
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {(userName || 'U').charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="sidebar-username" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {userName || 'User'}
              </p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>Signed in</p>
            </div>
          </div>
          <button className="sidebar-logout" onClick={handleLogout}>
            <LogOut style={{ width: 15, height: 15 }} />
            <span>Log out</span>
          </button>
        </div>
      )}
    </aside>
  );
}

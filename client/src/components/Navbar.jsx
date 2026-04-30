import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Mic, Home, LayoutDashboard, PlusCircle, Users, LogOut, ChevronRight, Menu, X
} from 'lucide-react';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

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

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

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

  const sidebarContent = (
    <>
      {/* Logo */}
      <Link to="/" className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Mic style={{ width: 18, height: 18, color: '#fff' }} />
        </div>
        <span className="sidebar-logo-text">
          Meet<span>Note</span>
        </span>
        {/* Close button (mobile only) */}
        <button
          className="sidebar-close-btn"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X style={{ width: 18, height: 18 }} />
        </button>
      </Link>

      {/* Navigation */}
      <nav className="sidebar-nav">
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
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sidebar sidebar-desktop">
        {sidebarContent}
      </aside>

      {/* Mobile top bar */}
      <div className="mobile-topbar">
        <Link to="/" className="mobile-topbar-logo">
          <div className="sidebar-logo-icon" style={{ width: 30, height: 30 }}>
            <Mic style={{ width: 15, height: 15, color: '#fff' }} />
          </div>
          <span className="sidebar-logo-text">Meet<span>Note</span></span>
        </Link>
        <button
          className="mobile-hamburger"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <Menu style={{ width: 22, height: 22 }} />
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <aside className={`sidebar sidebar-mobile${mobileOpen ? ' open' : ''}`}>
        {sidebarContent}
      </aside>
    </>
  );
}

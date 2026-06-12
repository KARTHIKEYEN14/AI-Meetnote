import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import CreateMeetingPage from './pages/CreateMeetingPage';
import JoinMeetingPage from './pages/JoinMeetingPage';
import RecordingPage from './pages/RecordingPage';
import SummaryPage from './pages/SummaryPage';
import ParticipantRecordPage from './pages/ParticipantRecordPage';
import ProtectedRoute from './components/ProtectedRoute';

// Pages that don't need the sidebar (full-screen experience)
const NO_SIDEBAR_PATHS = ['/', '/login', '/register'];

function AppShell() {
  const location = useLocation();
  const hideSidebar = NO_SIDEBAR_PATHS.includes(location.pathname);

  return (
    <div className={hideSidebar ? '' : 'app-shell'}>
      {!hideSidebar && <Navbar />}
      <main className={`flex flex-col flex-1 min-w-0${!hideSidebar ? ' with-sidebar' : ''}`}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected Routes */}
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/meeting/create" element={<ProtectedRoute><CreateMeetingPage /></ProtectedRoute>} />
          <Route path="/meeting/join" element={<ProtectedRoute><JoinMeetingPage /></ProtectedRoute>} />
          <Route path="/meeting/record/:id" element={<ProtectedRoute><RecordingPage /></ProtectedRoute>} />
          <Route path="/meeting/participant-record/:id" element={<ProtectedRoute><ParticipantRecordPage /></ProtectedRoute>} />
          <Route path="/meeting/summary/:id" element={<ProtectedRoute><SummaryPage /></ProtectedRoute>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  );
}

export default App;

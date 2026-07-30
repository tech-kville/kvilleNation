import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import Navbar from './components/navbar.jsx';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/home.jsx';
import History from './pages/history.jsx';
import Policy from './pages/policy.jsx';
import GameDays from './pages/gameDays.jsx';
import Tenting from './pages/tenting.jsx';
import Calendar from './pages/calendar.jsx';
import FAQs from './pages/faqs.jsx';
import Contacts from './pages/contacts.jsx';
import Profile from './pages/profile.jsx';
import Login from './pages/login.jsx';
import TentCheck from './pages/tentCheck.jsx';
import LmDashboard from './pages/lmDashboard.jsx';
import { UserProvider, useUser } from './userContext.js';

// Function to protect routes
function ProtectedRoute({ children }) {
  const { user } = useUser();

  if (!user?.isAuthenticated) {
    // Redirect to login if the user is not authenticated
    return <Navigate to="/login" replace />;
  }

  return children; // Render the protected component
}

// Main App component
function App() {
  return (
    <div>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/history" element={<History />} />
        <Route path="/policy" element={<Policy />} />
        <Route path="/game-days" element={<GameDays />} />
        <Route path="/tenting" element={<Tenting />} />
        <Route path="/faqs" element={<FAQs />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tent-check"
          element={
            <ProtectedRoute>
              <TentCheck />
            </ProtectedRoute>
          }
        />
        <Route
          path="/line-monitor-dashboard"
          element={
            <ProtectedRoute>
              <LmDashboard />
            </ProtectedRoute>
          }
        />
        {/* Catch-all route for undefined paths */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

// Render the App into the root element
const root = createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <UserProvider>
      <App />
    </UserProvider>
  </BrowserRouter>
);
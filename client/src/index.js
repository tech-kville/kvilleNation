import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import Navbar from './components/navbar.jsx';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/home.jsx';
import History from './pages/history.jsx';
import FAQs from './pages/faqs.jsx';
import Contacts from './pages/contacts.jsx';
import Profile from './pages/profile.jsx';
import Login from './pages/login.jsx';
import TentCheck from './pages/tentCheck.jsx';
import LmDashboard from './pages/lmDashboard.jsx';
import { UserProvider, useUser } from './userContext.js';

// Lazy-loaded: both pull in the PDF viewer, which shouldn't be part of
// everyone else's initial bundle.
const Policy = lazy(() => import('./pages/policy.jsx'));
const Calendar = lazy(() => import('./pages/calendar.jsx'));

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
      <Suspense fallback={<p>Loading…</p>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/history" element={<History />} />
          <Route path="/policy" element={<Policy />} />
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
      </Suspense>
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
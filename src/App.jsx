import { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import { supabase } from './lib/supabaseClient';
 
import Login from './pages/Login';
import StaffDashboard from './pages/StaffDashboard';
import IndividualProfile from './pages/IndividualProfile';
import AllSessions from './pages/AllSessions';
import Session from './pages/Session';
import SessionLog from './pages/SessionLog';
import FamilyView from './pages/FamilyView';
 
/**
 * ProtectedRoute
 * Checks Supabase auth state before rendering children.
 * - While the session is being resolved, shows a simple loading state.
 * - If there is no authenticated session, redirects to '/' (Login).
 * - Also subscribes to auth state changes so a logout elsewhere
 *   (e.g. another tab) redirects the user here too.
 */
function ProtectedRoute({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
 
  useEffect(() => {
    let isMounted = true;
 
    // Get the current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) {
        setSession(session);
        setLoading(false);
      }
    });
 
    // Keep session in sync with auth changes (login/logout/token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setSession(session);
      }
    });
 
    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);
 
  if (loading) {
    return <div>Loading...</div>;
  }
 
  if (!session) {
    return <Navigate to="/" replace />;
  }
 
  return children;
}
 
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public route */}
        <Route path="/" element={<Login />} />
 
        {/* Protected routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <StaffDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/individual/:id"
          element={
            <ProtectedRoute>
              <IndividualProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/individual/:id/sessions"
          element={
            <ProtectedRoute>
              <AllSessions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/session/:individualId"
          element={
            <ProtectedRoute>
              <Session />
            </ProtectedRoute>
          }
        />
        <Route
          path="/session/:sessionId/log"
          element={
            <ProtectedRoute>
              <SessionLog />
            </ProtectedRoute>
          }
        />
        <Route
          path="/family"
          element={
            <ProtectedRoute>
              <FamilyView />
            </ProtectedRoute>
          }
        />
 
        {/* Fallback: redirect unknown routes to Login */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
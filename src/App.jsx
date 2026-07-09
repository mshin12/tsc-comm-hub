import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';

import Login from './pages/Login';
import SetPassword from './pages/SetPassword';
import StaffDashboard from './pages/StaffDashboard';
import IndividualProfile from './pages/IndividualProfile';
import AllSessions from './pages/AllSessions';
import Session from './pages/Session';
import SessionLog from './pages/SessionLog';
import FamilyView from './pages/FamilyView';
import FamilySession from './pages/FamilySession';
import ProtectedRoute from './components/ProtectedRoute';

const STAFF_ROLES = ['staff', 'admin'];

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Login />} />
        <Route path="/set-password" element={<SetPassword />} />

        {/* Protected routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={STAFF_ROLES}>
              <StaffDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/individual/:id"
          element={
            <ProtectedRoute allowedRoles={STAFF_ROLES}>
              <IndividualProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/individual/:id/sessions"
          element={
            <ProtectedRoute allowedRoles={STAFF_ROLES}>
              <AllSessions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/session/:individualId"
          element={
            <ProtectedRoute allowedRoles={STAFF_ROLES}>
              <Session />
            </ProtectedRoute>
          }
        />
        <Route
          path="/session/:sessionId/log"
          element={
            <ProtectedRoute allowedRoles={STAFF_ROLES}>
              <SessionLog />
            </ProtectedRoute>
          }
        />
        <Route
          path="/family"
          element={
            <ProtectedRoute allowedRoles={['family']}>
              <FamilyView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/family/session"
          element={
            <ProtectedRoute allowedRoles={['family']}>
              <FamilySession />
            </ProtectedRoute>
          }
        />

        {/* Fallback: redirect unknown routes to Login */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

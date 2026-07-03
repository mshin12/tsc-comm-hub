import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import NavBar from './NavBar';

const ROLE_HOME = {
  staff: '/dashboard',
  admin: '/dashboard',
  family: '/family',
};

/**
 * ProtectedRoute
 *
 * Wraps a route's children and guards it behind Supabase authentication
 * and (optionally) a role check, using the shared useAuth hook.
 * - While the session is being resolved, shows a loading spinner.
 * - If there is no authenticated user, redirects to '/' (Login).
 * - If allowedRoles is given and the user's role isn't in it, redirects
 *   to that role's home route instead of rendering the children.
 * - Otherwise, renders a shared NavBar plus the protected children.
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.spinner} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={ROLE_HOME[role] || '/'} replace />;
  }

  return (
    <>
      <NavBar />
      {children}
    </>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
  },
  spinner: {
    width: 40,
    height: 40,
    border: '4px solid #e0e0e0',
    borderTopColor: '#2563eb',
    borderRadius: '50%',
    animation: 'protected-route-spin 0.8s linear infinite',
  },
};

// Inject the keyframes once for the spinner animation.
// Using a plain <style> tag keeps this component self-contained
// without requiring a separate CSS file or CSS-in-JS library.
if (
  typeof document !== 'undefined' &&
  !document.getElementById('protected-route-spinner-keyframes')
) {
  const styleTag = document.createElement('style');
  styleTag.id = 'protected-route-spinner-keyframes';
  styleTag.innerHTML = `
    @keyframes protected-route-spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(styleTag);
}

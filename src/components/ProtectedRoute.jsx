import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
 
/**
 * ProtectedRoute
 *
 * Wraps a route's children and guards it behind Supabase authentication,
 * using the shared useAuth hook.
 * - While the session is being resolved, shows a loading spinner.
 * - If there is no authenticated user, redirects to '/' (Login).
 * - Otherwise, renders the protected children.
 */
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
 
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
 
  return children;
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
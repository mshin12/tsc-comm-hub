import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const ROLE_HOME = {
  staff: '/dashboard',
  admin: '/dashboard',
  family: '/family',
};

/**
 * Landing page for Supabase invite and password-reset emails. Both link
 * types authenticate the browser via a short-lived token in the URL before
 * this component ever renders (supabase-js parses it automatically), so by
 * the time we check for a session here, the user is already signed in and
 * just needs to choose a password via supabase.auth.updateUser().
 */
export default function SetPassword() {
  const navigate = useNavigate();

  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      setHasSession(!!session);
      setCheckingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setHasSession(!!session);
      setCheckingSession(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async () => {
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setSubmitting(false);
      setError(updateError.message || 'Could not set your password. Please try again.');
      return;
    }

    setSuccess(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let destination = '/';
    if (user) {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();
      destination = ROLE_HOME[profile?.role] || '/';
    }

    setTimeout(() => navigate(destination, { replace: true }), 1200);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !submitting) {
      handleSubmit();
    }
  };

  if (checkingSession) {
    return (
      <div style={styles.container}>
        <div style={styles.spinner} />
        <style>{`
          @keyframes set-password-spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Link expired</h1>
          <p style={styles.text}>
            This invite or reset link is invalid or has already been used. Please request
            a new one or contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Set your password</h1>

        {success ? (
          <div style={styles.success}>Password set! Redirecting...</div>
        ) : (
          <>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="password">
                New password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={submitting}
                style={styles.input}
                autoComplete="new-password"
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label} htmlFor="confirm-password">
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={submitting}
                style={styles.input}
                autoComplete="new-password"
              />
            </div>

            {error && <div style={styles.error}>{error}</div>}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                ...styles.button,
                ...(submitting ? styles.buttonDisabled : {}),
              }}
            >
              {submitting ? 'Saving...' : 'Set Password'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    fontFamily: 'sans-serif',
  },
  spinner: {
    width: 40,
    height: 40,
    border: '4px solid #e0e0e0',
    borderTopColor: '#2563eb',
    borderRadius: '50%',
    animation: 'set-password-spin 0.8s linear infinite',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    padding: 32,
    backgroundColor: '#fff',
    borderRadius: 8,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  title: {
    marginTop: 0,
    marginBottom: 20,
    fontSize: 25,
    textAlign: 'center',
  },
  text: {
    fontSize: 17,
    color: '#374151',
    lineHeight: 1.5,
    margin: 0,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    display: 'block',
    marginBottom: 4,
    fontSize: 17,
    fontWeight: 600,
    color: '#333',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 17,
    border: '1px solid #ccc',
    borderRadius: 4,
    boxSizing: 'border-box',
  },
  error: {
    marginBottom: 16,
    padding: '8px 12px',
    fontSize: 17,
    color: '#a94442',
    backgroundColor: '#f2dede',
    border: '1px solid #ebccd1',
    borderRadius: 4,
  },
  success: {
    padding: '10px 14px',
    fontSize: 17,
    color: '#2d6a4f',
    backgroundColor: '#d8f3dc',
    border: '1px solid #b7e4c7',
    borderRadius: 4,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 18,
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  },
  buttonDisabled: {
    backgroundColor: '#93b4f0',
    cursor: 'not-allowed',
  },
};

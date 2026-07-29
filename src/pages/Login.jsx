import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { logAction } from '../lib/auditLog';

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Invite and password-reset emails link back to the site root with an
  // auth token in the URL (unless a custom redirectTo has been configured
  // in Supabase). Depending on the project's auth flow settings that shows
  // up as a hash fragment (#access_token=...&type=invite) or a query string
  // (?code=...). Either way, if we let it fall through to the normal login
  // form, the user has no password to enter yet and every attempt fails.
  // Catch every variant here — including an expired/already-used link,
  // which Supabase reports as an error in the same hash/query — and either
  // hand off to /set-password or surface a clear message instead of a
  // silent, confusing "wrong password".
  useEffect(() => {
    const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    const queryParams = new URLSearchParams(window.location.search || '');

    const errorDescription =
      hashParams.get('error_description') || queryParams.get('error_description');
    if (errorDescription) {
      setError(decodeURIComponent(errorDescription.replace(/\+/g, ' ')));
      return;
    }

    const type = hashParams.get('type') || queryParams.get('type');
    const isAuthCallback = type === 'invite' || type === 'recovery' || queryParams.has('code');

    if (isAuthCallback) {
      navigate('/set-password', { replace: true });
      return;
    }

    // Returning to "/" with an existing session — most commonly from the
    // installed app's home-screen icon, where start_url is always "/" —
    // should land straight on the role's home page instead of a redundant
    // login form. Supabase persists the session in localStorage across
    // launches, so this is the common case for anyone who's used the app
    // before, not just a rare edge case.
    let isMounted = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted || !session?.user) return;

      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (!isMounted) return;

      if (profile?.role === 'staff' || profile?.role === 'admin') {
        navigate('/dashboard', { replace: true });
      } else if (profile?.role === 'family') {
        navigate('/family', { replace: true });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/set-password', { replace: true });
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleLogin = async () => {
    setError('');
 
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
 
    setLoading(true);
 
    try {
      // 1. Authenticate with Supabase Auth
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });
 
      if (authError) {
        setError(authError.message || 'Invalid email or password.');
        setLoading(false);
        return;
      }
 
      const user = authData?.user;
      if (!user) {
        setError('Login failed. Please try again.');
        setLoading(false);
        return;
      }
 
      // 2. Look up the user's role from public.users
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();
 
      if (profileError || !profile) {
        await supabase.auth.signOut();
        setError('Could not load your account details. Please contact your administrator.');
        setLoading(false);
        return;
      }
 
      // 3. Redirect based on role
      if (profile.role === 'staff' || profile.role === 'admin' || profile.role === 'family') {
        logAction('user_signed_in', {
          tableName: 'users',
          recordId: user.id,
          metadata: { role: profile.role },
        });
      }

      if (profile.role === 'staff' || profile.role === 'admin') {
        navigate('/dashboard');
      } else if (profile.role === 'family') {
        navigate('/family');
      } else {
        await supabase.auth.signOut();
        setError('Your account role is not recognized. Please contact support.');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };
 
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !loading) {
      handleLogin();
    }
  };
 
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Sign In</h1>
 
        <div style={styles.field}>
          <label style={styles.label} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            style={styles.input}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>
 
        <div style={styles.field}>
          <label style={styles.label} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            style={styles.input}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>
 
        {error && <div style={styles.error}>{error}</div>}
 
        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          style={{
            ...styles.button,
            ...(loading ? styles.buttonDisabled : {}),
          }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
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
    marginBottom: 24,
    fontSize: 25,
    textAlign: 'center',
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
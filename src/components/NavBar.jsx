import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { logAction } from '../lib/auditLog';
import { useAuth } from '../hooks/useAuth';

export default function NavBar() {
  const navigate = useNavigate();
  const { role } = useAuth();

  const handleSignOut = async () => {
    // Unlike every other logAction() call in the app, this one is awaited
    // rather than fire-and-forget: logAction() identifies the actor via its
    // own supabase.auth.getUser() call, and signOut() clears that session.
    // Awaiting first guarantees the log captures who signed out before
    // there's any session left to race against.
    await logAction('user_signed_out');
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  };

  return (
    <nav style={styles.nav}>
      <span style={styles.title}>TSC</span>
      <div style={styles.actions}>
        {role === 'admin' && (
          <Link to="/admin/invite" style={styles.inviteLink}>
            Invite User
          </Link>
        )}
        <button
          type="button"
          style={styles.signOutButton}
          onClick={handleSignOut}
        >
          Sign Out
        </button>
      </div>
    </nav>
  );
}

const styles = {
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    backgroundColor: '#111827',
    fontFamily: 'sans-serif',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '0.03em',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  inviteLink: {
    fontSize: 15,
    fontWeight: 600,
    color: '#fff',
    textDecoration: 'underline',
  },
  signOutButton: {
    padding: '6px 14px',
    fontSize: 16,
    fontWeight: 600,
    color: '#111827',
    backgroundColor: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  },
};

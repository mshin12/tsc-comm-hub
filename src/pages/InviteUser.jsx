import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { logAction } from '../lib/auditLog';

const ROLE_OPTIONS = [
  { value: 'staff', label: 'Staff' },
  { value: 'family', label: 'Family' },
  { value: 'admin', label: 'Admin' },
];

/**
 * Admin-only "invite a new account" form. Calls /api/invite (service-role
 * backed) instead of Supabase Studio's own invite button, so the intended
 * role can be set at invite time rather than defaulting to 'staff' and
 * requiring a manual SQL UPDATE afterward (CLAUDE.md Known Issues #1).
 */
export default function InviteUser() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('staff');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    if (!email.trim()) {
      setError('Email is required.');
      return;
    }

    setSubmitting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch('/api/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token
            ? { Authorization: 'Bearer ' + session.access_token }
            : {}),
        },
        body: JSON.stringify({
          email: email.trim(),
          role,
          fullName: fullName.trim() || undefined,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json() : null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Could not send the invitation.');
      }

      logAction('user_invited', {
        tableName: 'users',
        recordId: data.userId,
        metadata: { role, email: email.trim() },
      });

      setSuccess('Invitation sent to ' + email.trim() + ' as ' + role + '.');
      setEmail('');
      setFullName('');
      setRole('staff');
    } catch (err) {
      setError(err.message || 'Could not send the invitation. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !submitting) {
      handleSubmit();
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Invite a New Account</h1>

        <div style={styles.field}>
          <label style={styles.label} htmlFor="invite-email">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={submitting}
            style={styles.input}
            placeholder="person@example.com"
            autoComplete="email"
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label} htmlFor="invite-full-name">
            Full name (optional)
          </label>
          <input
            id="invite-full-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={submitting}
            style={styles.input}
            placeholder="Jane Doe"
            autoComplete="name"
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label} htmlFor="invite-role">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={submitting}
            style={styles.input}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            ...styles.button,
            ...(submitting ? styles.buttonDisabled : {}),
          }}
        >
          {submitting ? 'Sending...' : 'Send Invitation'}
        </button>
      </div>
    </div>
  );
}

const styles = {
  page: {
    padding: 24,
    fontFamily: 'sans-serif',
    display: 'flex',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: 32,
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  title: {
    marginTop: 0,
    marginBottom: 24,
    fontSize: 25,
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
    fontFamily: 'sans-serif',
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
    marginBottom: 16,
    padding: '8px 12px',
    fontSize: 17,
    color: '#2d6a4f',
    backgroundColor: '#d8f3dc',
    border: '1px solid #b7e4c7',
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

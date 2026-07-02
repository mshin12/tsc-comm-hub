import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
 
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
 
export default function AllSessions() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
 
  const [individual, setIndividual] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
 
  useEffect(() => {
    if (authLoading) return;
    if (!user || !id) {
      setLoading(false);
      return;
    }
 
    let isMounted = true;
 
    const fetchData = async () => {
      setLoading(true);
      setError('');
 
      const [individualResult, sessionsResult] = await Promise.all([
        supabase
          .from('individuals')
          .select('full_name')
          .eq('id', id)
          .single(),
        supabase
          .from('sessions')
          .select('*')
          .eq('individual_id', id)
          .order('session_date', { ascending: false }),
      ]);
 
      if (!isMounted) return;
 
      if (individualResult.error) {
        setError('Could not load this individual.');
        setLoading(false);
        return;
      }
 
      setIndividual(individualResult.data);
 
      if (sessionsResult.error) {
        setError('Could not load sessions.');
        setSessions([]);
      } else {
        setSessions(sessionsResult.data || []);
      }
 
      setLoading(false);
    };
 
    fetchData();
 
    return () => {
      isMounted = false;
    };
  }, [authLoading, user, id]);
 
  if (authLoading || loading) {
    return (
      <div style={styles.centered}>
        <div style={styles.spinner} />
      </div>
    );
  }
 
  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <button
            type="button"
            style={styles.backButton}
            onClick={() => navigate('/individual/' + id)}
          >
            ← Back to Profile
          </button>
          <h1 style={styles.heading}>
            All Sessions{individual ? ' — ' + individual.full_name : ''}
          </h1>
        </div>
      </div>
 
      {error && <div style={styles.errorBanner}>{error}</div>}
 
      {sessions.length === 0 ? (
        <p style={styles.text}>No sessions recorded yet.</p>
      ) : (
        <ul style={styles.sessionList}>
          {sessions.map((session) => (
            <li key={session.id} style={styles.sessionItem}>
              <div style={styles.sessionDate}>
                {formatDate(session.session_date)}
              </div>
              <div style={styles.sessionField}>
                <strong>Scenario:</strong> {session.scenario_used || '—'}
              </div>
              <div style={styles.sessionField}>
                <strong>Went well:</strong> {session.went_well || '—'}
              </div>
            </li>
          ))}
        </ul>
      )}
 
      <style>{`
        @keyframes all-sessions-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
 
const styles = {
  page: {
    padding: 24,
    fontFamily: 'sans-serif',
    maxWidth: 720,
    margin: '0 auto',
  },
  centered: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
  },
  spinner: {
    width: 40,
    height: 40,
    border: '4px solid #e0e0e0',
    borderTopColor: '#2563eb',
    borderRadius: '50%',
    animation: 'all-sessions-spin 0.8s linear infinite',
  },
  errorBanner: {
    margin: '16px 0',
    padding: '10px 14px',
    color: '#a94442',
    backgroundColor: '#f2dede',
    border: '1px solid #ebccd1',
    borderRadius: 4,
  },
  header: {
    marginBottom: 20,
  },
  backButton: {
    padding: '4px 0',
    marginBottom: 8,
    fontSize: 13,
    color: '#2563eb',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'block',
  },
  heading: {
    fontSize: 22,
    margin: 0,
  },
  text: {
    fontSize: 14,
    color: '#374151',
  },
  sessionList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  sessionItem: {
    padding: 12,
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
  },
  sessionDate: {
    fontSize: 13,
    fontWeight: 600,
    color: '#6b7280',
    marginBottom: 4,
  },
  sessionField: {
    fontSize: 14,
    color: '#374151',
    marginTop: 2,
  },
};
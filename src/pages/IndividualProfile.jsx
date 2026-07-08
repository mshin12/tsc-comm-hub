import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { parseTierNumber } from '../lib/tier';
 
const TIER_COLORS = {
  1: { backgroundColor: '#dbeafe', color: '#1e40af' },
  2: { backgroundColor: '#fef9c3', color: '#854d0e' },
  3: { backgroundColor: '#dcfce7', color: '#166534' },
};
 
function isUnfinished(session) {
  return (
    !session.went_well &&
    !session.challenge_noted &&
    !session.goal_moment &&
    !session.staff_notes
  );
}

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
 
export default function IndividualProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
 
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
 
      let individualQuery = supabase.from('individuals').select('*').eq('id', id);
      if (role !== 'admin') {
        individualQuery = individualQuery.contains('assigned_staff', [user.id]);
      }

      const [individualResult, sessionsResult] = await Promise.all([
        individualQuery.single(),
        supabase
          .from('sessions')
          .select('*')
          .eq('individual_id', id)
          .order('session_date', { ascending: false })
          .limit(5),
      ]);
 
      if (!isMounted) return;
 
      if (individualResult.error) {
        setError('Could not load this individual\u2019s profile.');
        setLoading(false);
        return;
      }
 
      if (sessionsResult.error) {
        // Profile loaded fine, but sessions failed — show profile with empty session list
        setIndividual(individualResult.data);
        setSessions([]);
        setError('Could not load recent sessions.');
        setLoading(false);
        return;
      }
 
      setIndividual(individualResult.data);
      setSessions(sessionsResult.data || []);
      setLoading(false);
    };
 
    fetchData();
 
    return () => {
      isMounted = false;
    };
  }, [authLoading, user, role, id]);
 
  if (authLoading || loading) {
    return (
      <div style={styles.centered}>
        <div style={styles.spinner} />
      </div>
    );
  }
 
  if (!individual) {
    return (
      <div style={styles.errorBanner}>
        {error || 'Individual not found.'}
      </div>
    );
  }
 
  const tierNumber = parseTierNumber(individual.communication_tier);
  const tierStyle =
    TIER_COLORS[tierNumber] || {
      backgroundColor: '#e5e7eb',
      color: '#374151',
    };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <button
            type="button"
            style={styles.backButton}
            onClick={() => navigate('/dashboard')}
          >
            ← Back to Dashboard
          </button>
          <h1 style={styles.name}>{individual.full_name}</h1>
          <span style={{ ...styles.badge, ...tierStyle }}>
            {tierNumber !== null ? 'Tier ' + tierNumber : 'Tier —'}
          </span>
        </div>
        <div style={styles.headerButtons}>
          <button
            type="button"
            style={styles.primaryButton}
            onClick={() => navigate('/session/' + id)}
          >
            Start Session
          </button>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => navigate('/individual/' + id + '/sessions')}
          >
            View All Sessions
          </button>
        </div>
      </div>
 
      {error && <div style={styles.errorBanner}>{error}</div>}
 
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Goals</h2>
        <p style={styles.text}>{individual.goals || 'No goals recorded.'}</p>
      </div>
 
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Interests</h2>
        <p style={styles.text}>
          {individual.interests || 'No interests recorded.'}
        </p>
      </div>
 
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Vocabulary Notes</h2>
        <p style={styles.text}>
          {individual.vocabulary_notes || 'No vocabulary notes recorded.'}
        </p>
      </div>
 
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Triggers</h2>
        <p style={styles.text}>
          {individual.triggers_notes || 'No triggers recorded.'}
        </p>
      </div>
 
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>AAC System</h2>
        <p style={styles.text}>
          {individual.aac_system || 'No AAC system recorded.'}
        </p>
      </div>
 
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Recent Sessions</h2>
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
                {!isUnfinished(session) && (
                  <div style={styles.sessionField}>
                    <strong>Went well:</strong> {session.went_well || '—'}
                  </div>
                )}
                <button
                  type="button"
                  style={isUnfinished(session) ? styles.finishLogButton : styles.viewLogButton}
                  onClick={() => navigate('/session/' + session.id + '/log')}
                >
                  {isUnfinished(session) ? 'Finish Log →' : 'View / Edit Log →'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
 
      <style>{`
        @keyframes individual-profile-spin {
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
    animation: 'individual-profile-spin 0.8s linear infinite',
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
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
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
  name: {
    fontSize: 24,
    margin: '0 0 8px 0',
  },
  badge: {
    fontSize: 12,
    fontWeight: 600,
    padding: '2px 10px',
    borderRadius: 999,
  },
  headerButtons: {
    display: 'flex',
    gap: 8,
  },
  primaryButton: {
    padding: '8px 16px',
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  },
  secondaryButton: {
    padding: '8px 16px',
    fontSize: 14,
    fontWeight: 600,
    color: '#2563eb',
    backgroundColor: '#fff',
    border: '1px solid #2563eb',
    borderRadius: 4,
    cursor: 'pointer',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 600,
    marginBottom: 6,
    color: '#111827',
  },
  text: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 1.5,
    margin: 0,
    whiteSpace: 'pre-wrap',
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
  finishLogButton: {
    marginTop: 6,
    padding: '4px 10px',
    fontSize: 13,
    fontWeight: 600,
    color: '#a94442',
    backgroundColor: '#fff',
    border: '1px solid #ebccd1',
    borderRadius: 4,
    cursor: 'pointer',
  },
  viewLogButton: {
    marginTop: 6,
    padding: '4px 10px',
    fontSize: 13,
    fontWeight: 600,
    color: '#2563eb',
    backgroundColor: '#fff',
    border: '1px solid #2563eb',
    borderRadius: 4,
    cursor: 'pointer',
  },
};
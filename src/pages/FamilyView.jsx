import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function FamilyView() {
  const { user, loading: authLoading } = useAuth();

  const [individual, setIndividual] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchData = async () => {
      setLoading(true);
      setError('');

      const { data: individualData, error: individualError } = await supabase
        .from('individuals')
        .select('id, full_name, goals, communication_tier')
        .eq('family_user_id', user.id)
        .single();

      if (!isMounted) return;

      if (individualError || !individualData) {
        setError('Could not find a linked individual for your account.');
        setLoading(false);
        return;
      }

      setIndividual(individualData);

      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions_family_view')
        .select('session_date, scenario_used, family_summary')
        .eq('individual_id', individualData.id)
        .order('session_date', { ascending: false })
        .limit(10);

      if (!isMounted) return;

      if (sessionsError) {
        setError('Could not load session history.');
      } else {
        setSessions((sessionsData || []).slice().reverse());
      }

      setLoading(false);
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [authLoading, user]);

  if (authLoading || loading) {
    return (
      <div style={styles.centered}>
        <div style={styles.spinner} />
        <style>{`
          @keyframes family-view-spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (error && !individual) {
    return (
      <div style={styles.page}>
        <div style={styles.errorBanner}>{error}</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <h1 style={styles.heroTitle}>
          {individual.full_name}'s Communication Journey
        </h1>
      </div>

      {error && <div style={styles.errorBanner}>{error}</div>}

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Current Goals</h2>
        <p style={styles.goalsText}>
          {individual.goals || 'Goals will be added by the program team soon.'}
        </p>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Session History</h2>
        {sessions.length === 0 ? (
          !error && (
            <p style={styles.emptyMessage}>
              Sessions will appear here after your first visit.
            </p>
          )
        ) : (
          <div style={styles.sessionList}>
            {sessions.map((session, index) => (
              <div key={index} style={styles.sessionCard}>
                <div style={styles.sessionDate}>
                  {formatDate(session.session_date)}
                </div>
                {session.scenario_used && (
                  <div style={styles.sessionField}>
                    <span style={styles.fieldLabel}>Scenario: </span>
                    {session.scenario_used}
                  </div>
                )}
                <div style={styles.sessionField}>
                  {session.family_summary ||
                    'A summary for this session will be added soon.'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
    borderTopColor: '#d97706',
    borderRadius: '50%',
    animation: 'family-view-spin 0.8s linear infinite',
  },
  errorBanner: {
    margin: '16px 0',
    padding: '10px 14px',
    color: '#a94442',
    backgroundColor: '#f2dede',
    border: '1px solid #ebccd1',
    borderRadius: 4,
  },
  hero: {
    marginBottom: 32,
    paddingBottom: 20,
    borderBottom: '2px solid #fde68a',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: 700,
    color: '#92400e',
    margin: 0,
    lineHeight: 1.3,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#78350f',
    margin: '0 0 10px 0',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  goalsText: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 1.7,
    margin: 0,
    whiteSpace: 'pre-wrap',
  },
  emptyMessage: {
    fontSize: 15,
    color: '#6b7280',
    fontStyle: 'italic',
    margin: 0,
  },
  sessionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  sessionCard: {
    padding: 16,
    backgroundColor: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: 8,
  },
  sessionDate: {
    fontSize: 13,
    fontWeight: 700,
    color: '#92400e',
    marginBottom: 10,
  },
  sessionField: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 1.6,
    marginTop: 6,
  },
  fieldLabel: {
    fontWeight: 600,
    color: '#111827',
  },
};

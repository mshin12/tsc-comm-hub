import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { parseTierNumber } from '../lib/tier';

const TIER_COLORS = {
  1: { backgroundColor: '#dbeafe', color: '#1e40af' }, // blue
  2: { backgroundColor: '#fef9c3', color: '#854d0e' }, // yellow
  3: { backgroundColor: '#dcfce7', color: '#166534' }, // green
};
 
function truncate(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

const OVERDUE_DAYS = 14;

function daysSince(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function formatLastSession(days) {
  if (days === null) return 'No sessions yet';
  if (days <= 0) return 'Last session: today';
  if (days === 1) return 'Last session: yesterday';
  return 'Last session: ' + days + ' days ago';
}

// full_name is stored as a single "First Last" string — pull out just the
// first token to sort by, rather than the whole name, so a case like
// "Alex Zimmer" still sorts before "Blake Adams".
function getFirstName(fullName) {
  return (fullName || '').trim().split(/\s+/)[0] || '';
}
 
export default function StaffDashboard() {
  const { user, role, loading: authLoading } = useAuth();
 
  const [individuals, setIndividuals] = useState([]);
  const [lastSessionByIndividual, setLastSessionByIndividual] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
 
  useEffect(() => {
    // Wait until auth has resolved and we have a user before querying
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
 
    let isMounted = true;
 
    const fetchIndividuals = async () => {
      setLoading(true);
      setError('');
 
      let query = supabase.from('individuals').select('*').eq('is_active', true);
      if (role !== 'admin') {
        query = query.contains('assigned_staff', [user.id]);
      }

      const { data, error: fetchError } = await query;
 
      if (!isMounted) return;
 
      if (fetchError) {
        setError('Could not load your individuals. Please try again.');
        setIndividuals([]);
        setLoading(false);
        return;
      }

      const loadedIndividuals = (data || [])
        .slice()
        .sort((a, b) =>
          getFirstName(a.full_name).localeCompare(getFirstName(b.full_name), undefined, {
            sensitivity: 'base',
          })
        );
      setIndividuals(loadedIndividuals);

      if (loadedIndividuals.length > 0) {
        const ids = loadedIndividuals.map((individual) => individual.id);
        const { data: sessionsData, error: sessionsError } = await supabase
          .from('sessions')
          .select('individual_id, session_date')
          .in('individual_id', ids)
          .order('session_date', { ascending: false });

        if (isMounted && !sessionsError) {
          const map = {};
          for (const session of sessionsData || []) {
            // Rows arrive newest-first, so the first one seen per individual is the most recent.
            if (!(session.individual_id in map)) {
              map[session.individual_id] = session.session_date;
            }
          }
          setLastSessionByIndividual(map);
        }
      } else {
        setLastSessionByIndividual({});
      }

      setLoading(false);
    };
 
    fetchIndividuals();
 
    return () => {
      isMounted = false;
    };
  }, [authLoading, user, role]);
 
  if (authLoading || loading) {
    return (
      <div style={styles.centered}>
        <div style={styles.spinner} />
      </div>
    );
  }
 
  if (error) {
    return <div style={styles.errorBanner}>{error}</div>;
  }
 
  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>
        {role === 'admin' ? 'All Individuals' : 'My Individuals'}
      </h1>
      {individuals.length === 0 ? (
        <div style={styles.emptyState}>
          {role === 'admin' ? 'No active individuals yet' : 'No individuals assigned yet'}
        </div>
      ) : (
        <div style={styles.grid}>
          {individuals.map((individual) => {
            const tierNumber = parseTierNumber(individual.communication_tier);
            const tierStyle =
              TIER_COLORS[tierNumber] || {
                backgroundColor: '#e5e7eb',
                color: '#374151',
              };
            const days = daysSince(lastSessionByIndividual[individual.id]);
            const isOverdue = days === null || days > OVERDUE_DAYS;

            return (
              <Link
                key={individual.id}
                to={'/individual/' + individual.id}
                style={styles.cardLink}
              >
                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <span style={styles.fullName}>
                      {individual.full_name}
                    </span>
                    <span
                      style={{
                        ...styles.badge,
                        ...tierStyle,
                      }}
                    >
                      {tierNumber !== null ? 'Tier ' + tierNumber : 'Tier —'}
                    </span>
                  </div>
                  <p style={styles.goals}>
                    {truncate(individual.goals, 100)}
                  </p>
                  <div
                    style={{
                      ...styles.lastSession,
                      ...(isOverdue ? styles.lastSessionOverdue : {}),
                    }}
                  >
                    {formatLastSession(days)}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
 
      <style>{`
        @keyframes staff-dashboard-spin {
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
  },
  heading: {
    fontSize: 25,
    marginBottom: 20,
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
    animation: 'staff-dashboard-spin 0.8s linear infinite',
  },
  errorBanner: {
    margin: 24,
    padding: '10px 14px',
    color: '#a94442',
    backgroundColor: '#f2dede',
    border: '1px solid #ebccd1',
    borderRadius: 4,
  },
  emptyState: {
    padding: 40,
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 19,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 16,
  },
  cardLink: {
    textDecoration: 'none',
    color: 'inherit',
  },
  card: {
    padding: 16,
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    height: '100%',
    boxSizing: 'border-box',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  fullName: {
    fontSize: 19,
    fontWeight: 600,
  },
  badge: {
    fontSize: 15,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 999,
    whiteSpace: 'nowrap',
  },
  goals: {
    fontSize: 17,
    color: '#4b5563',
    margin: 0,
    lineHeight: 1.4,
  },
  lastSession: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: 600,
    color: '#6b7280',
  },
  lastSessionOverdue: {
    color: '#a94442',
  },
};
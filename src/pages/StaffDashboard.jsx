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
 
export default function StaffDashboard() {
  const { user, role, loading: authLoading } = useAuth();
 
  const [individuals, setIndividuals] = useState([]);
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
      } else {
        setIndividuals(data || []);
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
    fontSize: 22,
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
    fontSize: 16,
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
    marginBottom: 10,
  },
  fullName: {
    fontSize: 16,
    fontWeight: 600,
  },
  badge: {
    fontSize: 12,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 999,
    whiteSpace: 'nowrap',
  },
  goals: {
    fontSize: 14,
    color: '#4b5563',
    margin: 0,
    lineHeight: 1.4,
  },
};
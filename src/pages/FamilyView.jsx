import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { logAction } from '../lib/auditLog';
import { t } from '../lib/familyStrings';

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
  const navigate = useNavigate();
  const { user, preferredLanguage, loading: authLoading } = useAuth();

  const [individual, setIndividual] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // languageOverride is null until the toggle below is clicked once — until
  // then `language` (derived below, not synced via an effect) just reflects
  // useAuth()'s preferredLanguage directly. Clicking the toggle sets an
  // optimistic override immediately, since useAuth() only re-fetches on an
  // actual auth state change, not on this page's own direct UPDATE to its
  // row — without it, the toggle would write to the database correctly but
  // this page wouldn't visibly switch language until a reload. Any OTHER
  // page (e.g. FamilySession.jsx, reached by navigating away from here)
  // gets the fresh value automatically via its own independent useAuth()
  // call on mount, so this override is only needed for this page's own
  // immediate re-render.
  const [languageOverride, setLanguageOverride] = useState(null);
  const [languageSaving, setLanguageSaving] = useState(false);
  const language = languageOverride ?? preferredLanguage;

  const handleLanguageChange = async (newLanguage) => {
    if (newLanguage === language || languageSaving || !user) return;

    setLanguageOverride(newLanguage);
    setLanguageSaving(true);

    const { error: updateError } = await supabase
      .from('users')
      .update({ preferred_language: newLanguage })
      .eq('id', user.id);

    if (updateError) {
      // Falls back to whatever preferredLanguage actually is, not
      // necessarily what it was a moment ago.
      setLanguageOverride(null);
    }

    setLanguageSaving(false);
  };

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
        setError(t(preferredLanguage, 'noLinkedIndividual'));
        setLoading(false);
        return;
      }

      setIndividual(individualData);

      logAction('family_view_accessed', {
        tableName: 'individuals',
        recordId: individualData.id,
      });

      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions_family_view')
        .select('id, session_date, scenario_used, family_summary, family_summary_ko')
        .eq('individual_id', individualData.id)
        .order('session_date', { ascending: false })
        .limit(5);

      if (!isMounted) return;

      if (sessionsError) {
        setError(t(preferredLanguage, 'couldNotLoadHistory'));
      } else {
        setSessions(sessionsData || []);
      }

      setLoading(false);
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [authLoading, user, preferredLanguage]);

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
      <div style={styles.languageRow}>
        <span style={styles.languageLabel}>{t(language, 'languageLabel')}:</span>
        <button
          type="button"
          style={language === 'en' ? styles.languageButtonActive : styles.languageButton}
          onClick={() => handleLanguageChange('en')}
          disabled={languageSaving}
        >
          English
        </button>
        <button
          type="button"
          style={language === 'ko' ? styles.languageButtonActive : styles.languageButton}
          onClick={() => handleLanguageChange('ko')}
          disabled={languageSaving}
        >
          한국어
        </button>
      </div>

      <div style={styles.hero}>
        <h1 style={styles.heroTitle}>
          {t(language, 'journeyTitle', { name: individual.full_name })}
        </h1>
        <button
          type="button"
          style={styles.practiceButton}
          onClick={() => navigate('/family/session')}
        >
          {t(language, 'startPracticing')}
        </button>
      </div>

      {error && <div style={styles.errorBanner}>{error}</div>}

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>{t(language, 'currentGoals')}</h2>
        <p style={styles.goalsText}>
          {individual.goals || t(language, 'goalsPending')}
        </p>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>{t(language, 'sessionHistory')}</h2>
        {sessions.length === 0 ? (
          !error && (
            <p style={styles.emptyMessage}>{t(language, 'noSessionsYet')}</p>
          )
        ) : (
          <div style={styles.sessionList}>
            {sessions.map((session) => (
              <div key={session.id} style={styles.sessionCard}>
                <div style={styles.sessionDate}>
                  {formatDate(session.session_date)}
                </div>
                {session.scenario_used && (
                  <div style={styles.sessionField}>
                    <span style={styles.fieldLabel}>{t(language, 'scenarioLabel')}</span>
                    {session.scenario_used}
                  </div>
                )}
                <div style={styles.sessionField}>
                  {/* Both languages are generated together at debrief time
                      (see api/debrief.js) specifically so switching this
                      toggle can pick between them live, with no extra
                      lookup — instead of only ever reflecting whatever the
                      preference happened to be at generation time. Older
                      sessions from before this existed have no Korean
                      version at all; those fall back to the English one. */}
                  {(language === 'ko' ? session.family_summary_ko : null) ||
                    session.family_summary ||
                    t(language, 'summaryPending')}
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
  languageRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  languageLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: '#92400e',
  },
  languageButton: {
    padding: '6px 12px',
    fontSize: 14,
    fontWeight: 600,
    color: '#92400e',
    backgroundColor: '#fff',
    border: '1px solid #fde68a',
    borderRadius: 999,
    cursor: 'pointer',
  },
  languageButtonActive: {
    padding: '6px 12px',
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#d97706',
    border: '1px solid #d97706',
    borderRadius: 999,
    cursor: 'pointer',
  },
  hero: {
    marginBottom: 32,
    paddingBottom: 20,
    borderBottom: '2px solid #fde68a',
  },
  heroTitle: {
    fontSize: 29,
    fontWeight: 700,
    color: '#92400e',
    margin: '0 0 16px 0',
    lineHeight: 1.3,
  },
  practiceButton: {
    padding: '12px 20px',
    fontSize: 18,
    fontWeight: 700,
    color: '#fff',
    backgroundColor: '#d97706',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#78350f',
    margin: '0 0 10px 0',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  goalsText: {
    fontSize: 18,
    color: '#374151',
    lineHeight: 1.7,
    margin: 0,
    whiteSpace: 'pre-wrap',
  },
  emptyMessage: {
    fontSize: 18,
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
    fontSize: 16,
    fontWeight: 700,
    color: '#92400e',
    marginBottom: 10,
  },
  sessionField: {
    fontSize: 17,
    color: '#374151',
    lineHeight: 1.6,
    marginTop: 6,
  },
  fieldLabel: {
    fontWeight: 600,
    color: '#111827',
  },
};

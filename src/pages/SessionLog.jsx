import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { logAction } from '../lib/auditLog';

export default function SessionLog() {
  const { sessionId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();

  const {
    individual_id: stateIndividualId,
    scenario_used: stateScenarioUsed,
    session_length: stateInitialLength,
  } = state || {};

  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [wentWell, setWentWell] = useState('');
  const [challengeNoted, setChallengeNoted] = useState('');
  const [goalMoment, setGoalMoment] = useState('');
  const [staffNotes, setStaffNotes] = useState('');
  const [familySummary, setFamilySummary] = useState('');
  const [sessionLength, setSessionLength] = useState(
    stateInitialLength != null ? String(stateInitialLength) : ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Load the session directly from the DB so this page works whether it was
  // reached via the normal "Complete Session" handoff (with router state) or
  // via a bare link/refresh (e.g. the "Finish Log" shortcut, or a reload).
  // This also prefills any previously-saved notes instead of risking staff
  // overwriting existing content with blank fields.
  useEffect(() => {
    if (authLoading || !sessionId) return;

    let isMounted = true;

    const fetchSession = async () => {
      setLoadingSession(true);
      setLoadError('');

      const { data, error: fetchError } = await supabase
        .from('sessions')
        .select(
          'individual_id, scenario_used, session_length, transcript, went_well, challenge_noted, goal_moment, staff_notes, family_summary'
        )
        .eq('id', sessionId)
        .single();

      if (!isMounted) return;

      if (fetchError || !data) {
        setLoadError('Could not load this session. It may not exist, or you may not have permission to view it.');
        setLoadingSession(false);
        return;
      }

      setSession(data);
      setWentWell(data.went_well || '');
      setChallengeNoted(data.challenge_noted || '');
      setGoalMoment(data.goal_moment || '');
      setStaffNotes(data.staff_notes || '');
      setFamilySummary(data.family_summary || '');
      setSessionLength(
        data.session_length != null
          ? String(data.session_length)
          : stateInitialLength != null
          ? String(stateInitialLength)
          : ''
      );
      setLoadingSession(false);
    };

    fetchSession();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, sessionId]);

  if (!sessionId) {
    return (
      <div style={styles.page}>
        <div style={styles.errorBanner}>
          No session found. Please start a session first.
        </div>
      </div>
    );
  }

  const scenarioUsed = session?.scenario_used || stateScenarioUsed;
  const transcript = (session?.transcript || []).filter((message) => !message.hidden);
  const backTargetId = session?.individual_id || stateIndividualId;

  const handleSubmit = async () => {
    setError('');

    const hasContent = [wentWell, challengeNoted, goalMoment, staffNotes, familySummary].some(
      (value) => value.trim() !== ''
    );

    if (!hasContent) {
      setError('Please fill in at least one field before saving.');
      return;
    }

    if (!user) {
      setError('You must be signed in to save a session log.');
      return;
    }

    setSubmitting(true);

    let updateQuery = supabase
      .from('sessions')
      .update({
        went_well: wentWell.trim() || null,
        challenge_noted: challengeNoted.trim() || null,
        goal_moment: goalMoment.trim() || null,
        staff_notes: staffNotes.trim() || null,
        family_summary: familySummary.trim() || null,
        session_length: sessionLength !== '' ? parseInt(sessionLength, 10) : null,
      })
      .eq('id', sessionId);

    if (role !== 'admin') {
      updateQuery = updateQuery.eq('staff_id', user.id);
    }

    const { data: updatedRow, error: updateError } = await updateQuery
      .select('individual_id')
      .single();

    setSubmitting(false);

    if (updateError) {
      setError(
        updateError.code === 'PGRST116'
          ? 'This session log could not be found, or you do not have permission to edit it.'
          : updateError.message || 'Could not save the session log. Please try again.'
      );
      return;
    }

    setSuccess(true);
    const redirectId = updatedRow?.individual_id || stateIndividualId;

    logAction('session_logged', {
      tableName: 'sessions',
      recordId: sessionId,
      metadata: { individual_id: redirectId },
    });

    setTimeout(() => navigate('/individual/' + redirectId), 1500);
  };

  const disabled = submitting || success;

  if (loadingSession) {
    return (
      <div style={styles.centered}>
        <div style={styles.spinner} />
        <style>{`
          @keyframes session-log-spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {backTargetId && (
        <button
          type="button"
          style={styles.backButton}
          onClick={() => navigate('/individual/' + backTargetId)}
        >
          ← Back to Profile
        </button>
      )}
      <h1 style={styles.heading}>Session Log</h1>
      {scenarioUsed && (
        <p style={styles.subheading}>Scenario: {scenarioUsed}</p>
      )}

      {loadError && <div style={styles.errorBanner}>{loadError}</div>}
      {error && <div style={styles.errorBanner}>{error}</div>}
      {success && <div style={styles.successBanner}>Session saved! Redirecting...</div>}

      <p style={styles.aiNotice}>
        The sections below are drafted automatically from the session transcript. Review each
        for accuracy and correct anything that's off — then add your own observations under
        Staff Notes.
      </p>

      {transcript && transcript.length > 0 && (
        <details style={styles.transcriptPanel}>
          <summary style={styles.transcriptSummary}>
            View session transcript ({transcript.length} messages)
          </summary>
          <div style={styles.transcriptList}>
            {transcript.map((message, index) => (
              <div key={index} style={styles.transcriptRow}>
                <span style={styles.transcriptRole}>
                  {message.role === 'user' ? 'Individual: ' : 'Assistant: '}
                </span>
                {message.content}
              </div>
            ))}
          </div>
        </details>
      )}

      <div style={styles.field}>
        <label style={styles.label} htmlFor="went-well">
          What went well? <span style={styles.aiTag}>AI-drafted</span>
        </label>
        <textarea
          id="went-well"
          value={wentWell}
          onChange={(e) => setWentWell(e.target.value)}
          style={styles.textarea}
          rows={4}
          disabled={disabled}
          placeholder="Generated after the session ends — or describe what went well yourself..."
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label} htmlFor="challenge-noted">
          Challenges noted <span style={styles.aiTag}>AI-drafted</span>
        </label>
        <textarea
          id="challenge-noted"
          value={challengeNoted}
          onChange={(e) => setChallengeNoted(e.target.value)}
          style={styles.textarea}
          rows={4}
          disabled={disabled}
          placeholder="Generated after the session ends — or describe any challenges yourself..."
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label} htmlFor="goal-moment">
          Goal moment <span style={styles.aiTag}>AI-drafted</span>
        </label>
        <textarea
          id="goal-moment"
          value={goalMoment}
          onChange={(e) => setGoalMoment(e.target.value)}
          style={styles.textarea}
          rows={4}
          disabled={disabled}
          placeholder="Generated after the session ends — or describe a goal-relevant moment yourself..."
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label} htmlFor="family-summary">
          Family-facing summary <span style={styles.aiTag}>AI-drafted</span>
        </label>
        <p style={styles.hint}>
          Shown directly to family members in their view — keep it warm, general, and free of clinical language.
        </p>
        <textarea
          id="family-summary"
          value={familySummary}
          onChange={(e) => setFamilySummary(e.target.value)}
          style={styles.textarea}
          rows={3}
          disabled={disabled}
          placeholder="e.g. Today we practiced ordering at a restaurant and had a great time!"
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label} htmlFor="staff-notes">
          Staff notes
        </label>
        <p style={styles.hint}>
          Your own observations — this is the one section the AI never fills in for you.
        </p>
        <textarea
          id="staff-notes"
          value={staffNotes}
          onChange={(e) => setStaffNotes(e.target.value)}
          style={styles.textarea}
          rows={4}
          disabled={disabled}
          placeholder="Additional clinical notes (staff-only)..."
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label} htmlFor="session-length">
          Session length (minutes)
        </label>
        <input
          id="session-length"
          type="number"
          min="1"
          value={sessionLength}
          onChange={(e) => setSessionLength(e.target.value)}
          style={styles.numberInput}
          disabled={disabled}
          placeholder="e.g. 30"
        />
      </div>

      <button
        type="button"
        style={{
          ...styles.primaryButton,
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        onClick={handleSubmit}
        disabled={disabled}
      >
        {submitting ? 'Saving...' : 'Save Session Log'}
      </button>
    </div>
  );
}

const styles = {
  page: {
    padding: 24,
    fontFamily: 'sans-serif',
    maxWidth: 640,
    margin: '0 auto',
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
    margin: '0 0 4px 0',
  },
  subheading: {
    fontSize: 14,
    color: '#6b7280',
    margin: '0 0 24px 0',
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
    animation: 'session-log-spin 0.8s linear infinite',
  },
  transcriptPanel: {
    margin: '0 0 24px 0',
    padding: '10px 14px',
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 4,
  },
  transcriptSummary: {
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
  },
  transcriptList: {
    marginTop: 12,
    maxHeight: 280,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  transcriptRow: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  },
  transcriptRole: {
    fontWeight: 600,
    color: '#111827',
  },
  errorBanner: {
    margin: '16px 0',
    padding: '10px 14px',
    color: '#a94442',
    backgroundColor: '#f2dede',
    border: '1px solid #ebccd1',
    borderRadius: 4,
  },
  successBanner: {
    margin: '16px 0',
    padding: '10px 14px',
    color: '#2d6a4f',
    backgroundColor: '#d8f3dc',
    border: '1px solid #b7e4c7',
    borderRadius: 4,
  },
  aiNotice: {
    margin: '0 0 24px 0',
    padding: '10px 14px',
    fontSize: 13,
    color: '#374151',
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 4,
    lineHeight: 1.5,
  },
  aiTag: {
    fontSize: 11,
    fontWeight: 600,
    color: '#1e40af',
    backgroundColor: '#dbeafe',
    padding: '2px 6px',
    borderRadius: 999,
    marginLeft: 6,
    verticalAlign: 'middle',
  },
  field: {
    marginBottom: 20,
  },
  hint: {
    fontSize: 12,
    color: '#6b7280',
    margin: '0 0 6px 0',
  },
  label: {
    display: 'block',
    marginBottom: 6,
    fontSize: 14,
    fontWeight: 600,
    color: '#111827',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    border: '1px solid #ccc',
    borderRadius: 4,
    resize: 'vertical',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  numberInput: {
    width: 120,
    padding: '10px 12px',
    fontSize: 14,
    border: '1px solid #ccc',
    borderRadius: 4,
  },
  primaryButton: {
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: 4,
  },
};

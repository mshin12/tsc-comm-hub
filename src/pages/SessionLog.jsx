import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';

export default function SessionLog() {
  const { sessionId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { user, role } = useAuth();

  const {
    individual_id,
    scenario_used,
    session_length: initialLength,
  } = state || {};

  const [wentWell, setWentWell] = useState('');
  const [challengeNoted, setChallengeNoted] = useState('');
  const [goalMoment, setGoalMoment] = useState('');
  const [staffNotes, setStaffNotes] = useState('');
  const [familySummary, setFamilySummary] = useState('');
  const [sessionLength, setSessionLength] = useState(
    initialLength != null ? String(initialLength) : ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!sessionId) {
    return (
      <div style={styles.page}>
        <div style={styles.errorBanner}>
          No session found. Please start a session first.
        </div>
      </div>
    );
  }

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
    const redirectId = updatedRow?.individual_id || individual_id;
    setTimeout(() => navigate('/individual/' + redirectId), 1500);
  };

  const disabled = submitting || success;

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>Session Log</h1>
      {scenario_used && (
        <p style={styles.subheading}>Scenario: {scenario_used}</p>
      )}

      {error && <div style={styles.errorBanner}>{error}</div>}
      {success && <div style={styles.successBanner}>Session saved! Redirecting...</div>}

      <div style={styles.field}>
        <label style={styles.label} htmlFor="went-well">
          What went well?
        </label>
        <textarea
          id="went-well"
          value={wentWell}
          onChange={(e) => setWentWell(e.target.value)}
          style={styles.textarea}
          rows={4}
          disabled={disabled}
          placeholder="Describe what went well during the session..."
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label} htmlFor="challenge-noted">
          Challenges noted
        </label>
        <textarea
          id="challenge-noted"
          value={challengeNoted}
          onChange={(e) => setChallengeNoted(e.target.value)}
          style={styles.textarea}
          rows={4}
          disabled={disabled}
          placeholder="Describe any challenges or unexpected moments..."
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label} htmlFor="goal-moment">
          Goal moment
        </label>
        <textarea
          id="goal-moment"
          value={goalMoment}
          onChange={(e) => setGoalMoment(e.target.value)}
          style={styles.textarea}
          rows={4}
          disabled={disabled}
          placeholder="One specific goal-relevant moment you observed..."
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label} htmlFor="staff-notes">
          Staff notes
        </label>
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
        <label style={styles.label} htmlFor="family-summary">
          Family-facing summary
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
  heading: {
    fontSize: 22,
    margin: '0 0 4px 0',
  },
  subheading: {
    fontSize: 14,
    color: '#6b7280',
    margin: '0 0 24px 0',
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

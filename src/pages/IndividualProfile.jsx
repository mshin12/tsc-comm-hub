import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { parseTierNumber } from '../lib/tier';
import { logAction } from '../lib/auditLog';
 
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

// Personal-info fields admins can edit in place. Kept in one array so the
// read view, edit form, and save payload all stay driven by the same list
// instead of five near-identical blocks each.
const EDITABLE_FIELDS = [
  { key: 'goals', label: 'Goals', placeholder: 'No goals recorded.' },
  { key: 'interests', label: 'Interests', placeholder: 'No interests recorded.' },
  { key: 'vocabulary_notes', label: 'Vocabulary Notes', placeholder: 'No vocabulary notes recorded.' },
  { key: 'triggers_notes', label: 'Triggers', placeholder: 'No triggers recorded.' },
  { key: 'aac_system', label: 'AAC System', placeholder: 'No AAC system recorded.' },
  // Independent of aac_system above (which stays free-text/descriptive):
  // a plain three-state flag (Yes / No / Unspecified) that drives whether
  // assemblePrompt.js injects AAC guidance into a session's system prompt.
  // Unspecified (null) is the default and is NOT the same as "No".
  { key: 'uses_aac', label: 'Uses AAC', placeholder: 'Unspecified', type: 'boolean' },
];

// Boolean fields store true/false/null in the database, but a <select>
// needs string option values — these convert between the two so the rest
// of the form logic (handleStartEdit/handleSaveEdit) can treat every field
// uniformly regardless of type.
function toEditValue(field, individual) {
  if (field.type === 'boolean') {
    const value = individual[field.key];
    return value === true ? 'yes' : value === false ? 'no' : 'unspecified';
  }
  return individual[field.key] || '';
}

function toSavedValue(field, editValue) {
  if (field.type === 'boolean') {
    return editValue === 'yes' ? true : editValue === 'no' ? false : null;
  }
  return editValue.trim() || null;
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

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
 
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

  const handleStartEdit = () => {
    const initialForm = {};
    for (const field of EDITABLE_FIELDS) {
      initialForm[field.key] = toEditValue(field, individual);
    }
    setEditForm(initialForm);
    setSaveError('');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditForm(null);
    setSaveError('');
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    setSaveError('');

    const payload = {};
    for (const field of EDITABLE_FIELDS) {
      payload[field.key] = toSavedValue(field, editForm[field.key]);
    }

    // Field names only — not before/after values. These are PII/PHI-adjacent
    // fields; the audit trail should record who touched what and when
    // without duplicating the sensitive content itself into a second table
    // with its own, separate access controls.
    const changedFields = EDITABLE_FIELDS
      .filter((field) => (individual[field.key] ?? null) !== payload[field.key])
      .map((field) => field.key);

    const { data: updatedRow, error: updateError } = await supabase
      .from('individuals')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    setSaving(false);

    if (updateError) {
      setSaveError(
        updateError.code === 'PGRST116'
          ? 'You do not have permission to edit this profile.'
          : updateError.message || 'Could not save changes. Please try again.'
      );
      return;
    }

    if (changedFields.length > 0) {
      logAction('individual_edited', {
        tableName: 'individuals',
        recordId: id,
        metadata: { fields_changed: changedFields },
      });
    }

    setIndividual(updatedRow);
    setIsEditing(false);
    setEditForm(null);
  };

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
          {role === 'admin' && !isEditing && (
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={handleStartEdit}
            >
              Edit Info
            </button>
          )}
        </div>
      </div>

      {error && <div style={styles.errorBanner}>{error}</div>}
      {saveError && <div style={styles.errorBanner}>{saveError}</div>}

      {EDITABLE_FIELDS.map((field) => (
        <div key={field.key} style={styles.section}>
          <h2 style={styles.sectionTitle}>{field.label}</h2>
          {isEditing ? (
            field.type === 'boolean' ? (
              <select
                value={editForm[field.key]}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                style={styles.select}
                disabled={saving}
              >
                <option value="unspecified">Unspecified</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            ) : (
              <textarea
                value={editForm[field.key]}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                style={styles.textarea}
                rows={3}
                disabled={saving}
              />
            )
          ) : (
            <p style={styles.text}>
              {field.type === 'boolean'
                ? individual[field.key] === true
                  ? 'Yes'
                  : individual[field.key] === false
                  ? 'No'
                  : field.placeholder
                : individual[field.key] || field.placeholder}
            </p>
          )}
        </div>
      ))}

      {isEditing && (
        <div style={styles.editActions}>
          <button
            type="button"
            style={styles.primaryButton}
            onClick={handleSaveEdit}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={handleCancelEdit}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      )}

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
    fontSize: 16,
    color: '#2563eb',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'block',
  },
  name: {
    fontSize: 27,
    margin: '0 0 8px 0',
  },
  badge: {
    fontSize: 15,
    fontWeight: 600,
    padding: '2px 10px',
    borderRadius: 999,
  },
  headerButtons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  primaryButton: {
    padding: '8px 16px',
    fontSize: 17,
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  },
  secondaryButton: {
    padding: '8px 16px',
    fontSize: 17,
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
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 6,
    color: '#111827',
  },
  text: {
    fontSize: 17,
    color: '#374151',
    lineHeight: 1.5,
    margin: 0,
    whiteSpace: 'pre-wrap',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 17,
    border: '1px solid #ccc',
    borderRadius: 4,
    resize: 'vertical',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  select: {
    padding: '10px 12px',
    fontSize: 17,
    border: '1px solid #ccc',
    borderRadius: 4,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  editActions: {
    display: 'flex',
    gap: 8,
    marginBottom: 24,
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
    fontSize: 16,
    fontWeight: 600,
    color: '#6b7280',
    marginBottom: 4,
  },
  sessionField: {
    fontSize: 17,
    color: '#374151',
    marginTop: 2,
  },
  // padding bumped from the original '4px 10px' (~27px effective height) to
  // a real touch target (~40px) — this is the only way to open/finish a
  // session log from this list, so it needs to be reliably tappable.
  finishLogButton: {
    marginTop: 6,
    padding: '9px 14px',
    fontSize: 16,
    fontWeight: 600,
    color: '#a94442',
    backgroundColor: '#fff',
    border: '1px solid #ebccd1',
    borderRadius: 4,
    cursor: 'pointer',
  },
  viewLogButton: {
    marginTop: 6,
    padding: '9px 14px',
    fontSize: 16,
    fontWeight: 600,
    color: '#2563eb',
    backgroundColor: '#fff',
    border: '1px solid #2563eb',
    borderRadius: 4,
    cursor: 'pointer',
  },
};
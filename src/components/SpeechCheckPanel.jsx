import { useSpeechCoach } from '../hooks/useSpeechCoach';

// Opt-in "how did that sound?" affordance — never automatic. Built for
// FamilySession.jsx first (self-practice, where nobody's in the room to
// give live coaching the way staff would during a staff-run session), but
// takes all its copy through the `strings` prop so it's reusable in
// Session.jsx later without hardcoding language — see CLAUDE.md's "Live
// speech coaching" section for why it's scoped to family self-practice for
// now rather than wired into both.
export default function SpeechCheckPanel({ sessionId, lang, strings }) {
  const { supported, checking, result, error, checkSpeech, reset } = useSpeechCoach({ sessionId, lang });

  if (!supported) return null;

  return (
    <div style={styles.wrap}>
      {!checking && !result && !error && (
        <button type="button" style={styles.button} onClick={checkSpeech}>
          {strings.checkMySpeech}
        </button>
      )}

      {checking && <p style={styles.status}>{strings.checkingSpeech}</p>}

      {error && (
        <div style={styles.errorBox}>
          {/* useSpeechCoach's own `error` string is always generic English —
              ignored here in favor of the localized strings prop, so this
              reads correctly in Korean too. */}
          <span>{strings.speechCheckError}</span>
          <button type="button" style={styles.linkButton} onClick={reset}>
            {strings.dismiss}
          </button>
        </div>
      )}

      {result && (
        <div style={styles.resultBox}>
          {result.tips.map((tip) => (
            <p key={tip} style={styles.tipText}>
              {strings.tips[tip]}
            </p>
          ))}
          <button type="button" style={styles.linkButton} onClick={reset}>
            {strings.dismiss}
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: {
    marginTop: 8,
  },
  button: {
    padding: '8px 14px',
    fontSize: 15,
    fontWeight: 600,
    color: '#374151',
    backgroundColor: '#fff',
    border: '1px solid #ccc',
    borderRadius: 4,
    cursor: 'pointer',
  },
  status: {
    fontSize: 15,
    color: '#6b7280',
    fontStyle: 'italic',
    margin: 0,
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 15,
    color: '#a94442',
  },
  resultBox: {
    padding: '10px 14px',
    backgroundColor: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: 6,
  },
  tipText: {
    fontSize: 15,
    color: '#166534',
    margin: '0 0 6px 0',
  },
  linkButton: {
    padding: 0,
    fontSize: 14,
    color: '#2563eb',
    background: 'none',
    border: 'none',
    textDecoration: 'underline',
    cursor: 'pointer',
  },
};

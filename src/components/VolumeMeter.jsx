// A small live meter reflecting mic input level while listening, plus a
// gentle hint after a sustained quiet stretch (see useVoiceInput.js's
// QUIET_VOLUME_THRESHOLD/QUIET_HINT_DELAY_MS). Deliberately calm — no
// flashing colors, no numeric numbers shown — this is meant to help someone
// notice they're speaking quietly, not to grade them.
export default function VolumeMeter({ level, hint, quietHintText }) {
  return (
    <div style={styles.wrap}>
      <div style={styles.track} aria-hidden="true">
        <div style={{ ...styles.fill, width: `${Math.round(Math.max(0, Math.min(level, 1)) * 100)}%` }} />
      </div>
      {hint === 'quiet' && quietHintText && <span style={styles.hintText}>{quietHintText}</span>}
    </div>
  );
}

const styles = {
  wrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 20,
  },
  track: {
    flex: '0 0 80px',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: '#2563eb',
    transition: 'width 100ms linear',
  },
  hintText: {
    fontSize: 14,
    color: '#92400e',
    fontStyle: 'italic',
  },
};

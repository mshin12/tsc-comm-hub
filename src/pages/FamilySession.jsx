import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { assemblePrompt } from '../lib/assemblePrompt';
import { useAuth } from '../hooks/useAuth';
import { parseTierNumber } from '../lib/tier';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { fetchRecentSuggestedFocus } from '../lib/recentFocus';
import { t } from '../lib/familyStrings';

const END_SESSION_KEYWORD = 'END SESSION';

function isEndSessionText(text) {
  return text.trim().replace(/[.!?]+$/, '').toUpperCase() === END_SESSION_KEYWORD;
}

// Sent automatically the moment a session starts, so the AI opens the scene
// in character instead of anyone having to know a magic phrase. Flagged
// `hidden` so it never renders as a chat bubble, but it still counts as a
// real turn for the API and is still saved in the transcript.
const KICKOFF_MESSAGE = {
  role: 'user',
  content: 'The session is starting now. Begin the activity following your instructions.',
  hidden: true,
};

export default function FamilySession() {
  const navigate = useNavigate();
  const { user, preferredLanguage, loading: authLoading } = useAuth();

  const [individual, setIndividual] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startingId, setStartingId] = useState(null);
  // Most recent staff-identified suggested_focus for this individual, if
  // any — carries forward even when the individual's most recent session
  // was a family self-practice one, not just staff-conducted ones.
  const [recentFocus, setRecentFocus] = useState('');

  const [assembledPrompt, setAssembledPrompt] = useState('');
  const [sessionActive, setSessionActive] = useState(false);

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const [sessionEnded, setSessionEnded] = useState(false);
  const [lastFailedTurn, setLastFailedTurn] = useState(null);
  const [analyzingSession, setAnalyzingSession] = useState(false);
  const [analysisError, setAnalysisError] = useState('');

  const [sessionId, setSessionId] = useState(null);
  const [interimTranscript, setInterimTranscript] = useState('');

  const messageListRef = useRef(null);
  const analysisPromiseRef = useRef(null);

  const { isListening, supported: micSupported, toggleListening } = useVoiceInput({
    onFinalResult: (transcript) =>
      setInputText((prev) => (prev ? prev + ' ' : '') + transcript),
    onInterimResult: setInterimTranscript,
    lang: preferredLanguage === 'ko' ? 'ko-KR' : 'en-US',
  });

  // What the textarea actually displays while listening: the already-typed/
  // committed text plus whatever's being recognized live right now. The
  // interim portion is a preview only — it isn't merged into inputText
  // itself until the recognizer settles on a final result for that phrase.
  const displayedInputText = interimTranscript
    ? inputText + (inputText ? ' ' : '') + interimTranscript
    : inputText;

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
        .select('*')
        .eq('family_user_id', user.id)
        .single();

      if (!isMounted) return;

      if (individualError || !individualData) {
        setError(t(preferredLanguage, 'noLinkedIndividual'));
        setLoading(false);
        return;
      }

      setIndividual(individualData);

      const tierNumber = parseTierNumber(individualData.communication_tier);
      // prompts.tier is NOT NULL (see supabase/database_schema.sql), so
      // there's no real row a null tierNumber could ever match — querying
      // .eq('tier', null) anyway would silently return zero rows and show
      // the generic "no activities" empty state, masking that the actual
      // problem is unparseable communication_tier data on this individual.
      // Catch it here instead so the message points at the real cause.
      if (tierNumber === null) {
        setError(t(preferredLanguage, 'couldNotDetermineTier'));
        setActivities([]);
        setRecentFocus('');
        setLoading(false);
        return;
      }

      const [activitiesResult, recentFocusResult] = await Promise.all([
        supabase
          .from('prompts')
          .select('*')
          .eq('tier', tierNumber)
          .eq('is_active', true)
          .eq('audience', 'family'),
        fetchRecentSuggestedFocus(individualData.id),
      ]);
      const { data: activitiesData, error: activitiesError } = activitiesResult;

      if (!isMounted) return;

      if (activitiesError) {
        setError(t(preferredLanguage, 'couldNotLoadActivities'));
        setActivities([]);
      } else {
        const usable = (activitiesData || []).filter(
          (activity) =>
            (activity.scenario_name || '').trim() !== '' &&
            (activity.system_prompt || '').trim() !== ''
        );
        setActivities(usable);
      }

      setRecentFocus(recentFocusResult);

      setLoading(false);
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [authLoading, user, preferredLanguage]);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  const runFamilySummary = async (sessionIdToUse, transcriptMessages) => {
    setAnalyzingSession(true);
    setAnalysisError('');

    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();

      const response = await fetch('/api/debrief', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authSession?.access_token
            ? { Authorization: 'Bearer ' + authSession.access_token }
            : {}),
        },
        body: JSON.stringify({
          sessionId: sessionIdToUse,
          mode: 'family_summary_only',
          transcript: transcriptMessages
            .filter((m) => !m.hidden)
            .map(({ role, content }) => ({ role, content })),
          individual: {
            full_name: individual.full_name,
            goals: individual.goals,
          },
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json() : null;

      if (!response.ok || !data) {
        throw new Error(data?.error || t(preferredLanguage, 'couldNotGenerateSummary'));
      }

      const { error: updateError } = await supabase
        .from('sessions')
        .update({
          family_summary: data.family_summary || null,
          // Generated unconditionally alongside family_summary regardless
          // of current preference — see api/debrief.js for why (so a later
          // language switch doesn't leave this session's summary stale).
          family_summary_ko: data.family_summary_ko || null,
        })
        .eq('id', sessionIdToUse);

      if (updateError) {
        throw new Error(t(preferredLanguage, 'generatedButNotSaved'));
      }
    } catch (err) {
      setAnalysisError(err.message || t(preferredLanguage, 'couldNotGenerateSessionSummary'));
    } finally {
      setAnalyzingSession(false);
    }
  };

  const handleStartActivity = async (activity) => {
    if (!individual || !user) return;

    setError('');
    setStartingId(activity.id);

    const { data: sessionRow, error: insertError } = await supabase
      .from('sessions')
      .insert({
        individual_id: individual.id,
        conducted_by: 'family',
        family_user_id: user.id,
        session_date: new Date().toISOString(),
        tier_used: parseTierNumber(individual.communication_tier),
        scenario_used: activity.scenario_name,
      })
      .select()
      .single();

    setStartingId(null);

    if (insertError || !sessionRow) {
      setError(t(preferredLanguage, 'couldNotStartActivity'));
      return;
    }

    const builtPrompt = assemblePrompt(
      activity.system_prompt,
      individual,
      activity.scenario_name,
      recentFocus,
      preferredLanguage
    );

    setSessionId(sessionRow.id);
    setAssembledPrompt(builtPrompt);
    setSessionActive(true);

    sendConversation([KICKOFF_MESSAGE], false, {
      systemPrompt: builtPrompt,
      sessionId: sessionRow.id,
    });
  };

  const sendConversation = async (updatedMessages, isEndSession, overrides = {}) => {
    const activeSystemPrompt = overrides.systemPrompt ?? assembledPrompt;
    const activeSessionId = overrides.sessionId ?? sessionId;

    setChatError('');
    setIsSending(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token
            ? { Authorization: 'Bearer ' + session.access_token }
            : {}),
        },
        body: JSON.stringify({
          sessionId: activeSessionId,
          messages: updatedMessages.map(({ role, content }) => ({ role, content })),
          systemPrompt: activeSystemPrompt,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json() : null;

      if (!response.ok) {
        throw new Error(data?.error || t(preferredLanguage, 'assistantNoResponse'));
      }

      if (!data) {
        throw new Error(t(preferredLanguage, 'unexpectedResponse'));
      }

      const assistantMessage = {
        role: 'assistant',
        content: data.text,
        truncated: !!data.truncated,
      };
      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      setLastFailedTurn(null);

      if (activeSessionId) {
        const { error: transcriptError } = await supabase
          .from('sessions')
          .update({ transcript: finalMessages })
          .eq('id', activeSessionId);
        if (transcriptError) {
          console.error('Could not save transcript:', transcriptError);
        }
      }

      if (isEndSession) {
        setSessionEnded(true);
        analysisPromiseRef.current = runFamilySummary(activeSessionId, finalMessages);
      }
    } catch (err) {
      setChatError(err.message || t(preferredLanguage, 'somethingWentWrong'));
      setLastFailedTurn({ messages: updatedMessages, isEndSession, overrides });
    } finally {
      setIsSending(false);
    }
  };

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed || isSending) return;

    const isEndSession = isEndSessionText(trimmed);
    const userMessage = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInputText('');
    sendConversation(updatedMessages, isEndSession);
  };

  const handleFinishClick = () => {
    if (isSending) return;

    const userMessage = { role: 'user', content: END_SESSION_KEYWORD };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    sendConversation(updatedMessages, true);
  };

  const handleRetry = () => {
    if (!lastFailedTurn) return;
    sendConversation(lastFailedTurn.messages, lastFailedTurn.isEndSession, lastFailedTurn.overrides);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReturnToOverview = async () => {
    if (analysisPromiseRef.current) {
      await analysisPromiseRef.current;
    }
    navigate('/family');
  };

  if (loading) {
    return (
      <div style={styles.centered}>
        <div style={styles.spinner} />
        <style>{`@keyframes family-session-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!individual) {
    return (
      <div style={styles.page}>
        <div style={styles.errorBanner}>
          {error || t(preferredLanguage, 'noLinkedIndividualFallback')}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <button type="button" style={styles.backButton} onClick={() => navigate('/family')}>
        {t(preferredLanguage, 'backToOverview')}
      </button>

      <h1 style={styles.name}>
        {t(preferredLanguage, 'practiceWith', { name: individual.full_name })}
      </h1>

      {error && <div style={styles.errorBanner}>{error}</div>}

      {!sessionActive && (
        <div style={styles.setupPanel}>
          {activities.length === 0 ? (
            <p style={styles.text}>{t(preferredLanguage, 'noActivitiesYet')}</p>
          ) : (
            <>
              <p style={styles.text}>{t(preferredLanguage, 'chooseActivity')}</p>
              <div style={styles.activityGrid}>
                {activities.map((activity) => (
                  <button
                    key={activity.id}
                    type="button"
                    style={styles.activityCard}
                    onClick={() => handleStartActivity(activity)}
                    disabled={startingId !== null}
                  >
                    {startingId === activity.id ? t(preferredLanguage, 'starting') : activity.scenario_name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {sessionActive && (
        <div style={styles.chatPanel}>
          <div style={styles.messageList} ref={messageListRef}>
            {messages.filter((m) => !m.hidden).length === 0 && !isSending && (
              <div style={styles.emptyChat}>{t(preferredLanguage, 'gettingReady')}</div>
            )}
            {messages
              .filter((m) => !m.hidden)
              .map((message, index) => (
                <div
                  key={index}
                  style={{
                    ...styles.messageRow,
                    justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      ...styles.messageBubble,
                      ...(message.role === 'user' ? styles.userBubble : styles.assistantBubble),
                    }}
                  >
                    {message.content}
                  </div>
                </div>
              ))}

            {isSending && (
              <div style={styles.messageRow}>
                <div style={styles.typingIndicator}>{t(preferredLanguage, 'thinking')}</div>
              </div>
            )}
          </div>

          {chatError && (
            <div style={styles.errorBanner}>
              {chatError}
              {lastFailedTurn && (
                <button
                  type="button"
                  style={styles.retryButton}
                  onClick={handleRetry}
                  disabled={isSending}
                >
                  {t(preferredLanguage, 'retry')}
                </button>
              )}
            </div>
          )}

          {!sessionEnded ? (
            <div style={styles.inputRow}>
              <textarea
                value={displayedInputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                // Disabled while listening — the live interim preview is
                // replacing this value on every recognized word, and letting
                // manual keystrokes land at the same time would fight with
                // that and produce garbled text. Toggle the mic off to
                // resume typing/editing.
                disabled={isSending || isListening}
                placeholder={t(preferredLanguage, 'typeOrMic')}
                style={styles.textInput}
                rows={2}
              />
              {micSupported && (
                <button
                  type="button"
                  style={{
                    ...styles.micButton,
                    ...(isListening ? styles.micButtonActive : {}),
                  }}
                  onClick={toggleListening}
                  disabled={isSending}
                  title={isListening ? t(preferredLanguage, 'stopListening') : t(preferredLanguage, 'speakMessage')}
                >
                  {isListening ? t(preferredLanguage, 'listening') : '🎤'}
                </button>
              )}
              <button
                type="button"
                style={styles.primaryButton}
                onClick={handleSend}
                disabled={isSending || isListening || !inputText.trim()}
              >
                {isSending ? t(preferredLanguage, 'sending') : t(preferredLanguage, 'send')}
              </button>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={handleFinishClick}
                disabled={isSending || isListening}
              >
                {t(preferredLanguage, 'donePracticing')}
              </button>
            </div>
          ) : (
            <div style={styles.debriefPanel}>
              <h2 style={styles.debriefTitle}>{t(preferredLanguage, 'greatJob')}</h2>
              <p style={styles.debriefText}>{messages[messages.length - 1]?.content}</p>
              {analyzingSession && (
                <p style={styles.analysisStatus}>{t(preferredLanguage, 'savingSummary')}</p>
              )}
              {analysisError && <p style={styles.analysisError}>{analysisError}</p>}
              <button
                type="button"
                style={{
                  ...styles.primaryButton,
                  opacity: analyzingSession ? 0.6 : 1,
                  cursor: analyzingSession ? 'not-allowed' : 'pointer',
                }}
                onClick={handleReturnToOverview}
                disabled={analyzingSession}
              >
                {analyzingSession ? t(preferredLanguage, 'finishingUp') : t(preferredLanguage, 'returnToOverview')}
              </button>
            </div>
          )}
        </div>
      )}
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
    animation: 'family-session-spin 0.8s linear infinite',
  },
  backButton: {
    padding: '4px 0',
    marginBottom: 8,
    fontSize: 16,
    color: '#b45309',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'block',
  },
  name: {
    fontSize: 25,
    margin: '0 0 20px 0',
    color: '#78350f',
  },
  errorBanner: {
    margin: '16px 0',
    padding: '10px 14px',
    color: '#a94442',
    backgroundColor: '#f2dede',
    border: '1px solid #ebccd1',
    borderRadius: 4,
  },
  setupPanel: {
    padding: 20,
    backgroundColor: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: 8,
  },
  text: {
    fontSize: 18,
    color: '#374151',
    margin: '0 0 16px 0',
  },
  activityGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  activityCard: {
    padding: '18px 20px',
    fontSize: 19,
    fontWeight: 600,
    color: '#92400e',
    backgroundColor: '#fff',
    border: '2px solid #fbbf24',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'left',
  },
  chatPanel: {
    marginTop: 20,
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  // min(400px, 50dvh) instead of a flat 400px — see Session.jsx's identical
  // comment: a fixed pane this tall can push the input row off-screen once
  // a mobile on-screen keyboard shrinks the visible viewport.
  messageList: {
    height: 'min(400px, 50dvh)',
    overflowY: 'auto',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    backgroundColor: '#f9fafb',
  },
  emptyChat: {
    margin: 'auto',
    color: '#9ca3af',
    fontSize: 17,
  },
  messageRow: {
    display: 'flex',
    width: '100%',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: '12px 16px',
    borderRadius: 14,
    fontSize: 19,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  },
  userBubble: {
    backgroundColor: '#d97706',
    color: '#fff',
    borderBottomRightRadius: 2,
  },
  assistantBubble: {
    backgroundColor: '#e5e7eb',
    color: '#111827',
    borderBottomLeftRadius: 2,
  },
  typingIndicator: {
    fontSize: 16,
    color: '#6b7280',
    fontStyle: 'italic',
    padding: '4px 8px',
  },
  retryButton: {
    padding: '6px 12px',
    fontSize: 16,
    fontWeight: 600,
    color: '#a94442',
    backgroundColor: '#fff',
    border: '1px solid #ebccd1',
    borderRadius: 4,
    cursor: 'pointer',
    marginLeft: 10,
  },
  inputRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    padding: 12,
    borderTop: '1px solid #e5e7eb',
  },
  textInput: {
    flex: '1 1 200px',
    padding: '10px 12px',
    fontSize: 18,
    border: '1px solid #ccc',
    borderRadius: 4,
    resize: 'none',
    fontFamily: 'inherit',
  },
  // padding bumped slightly (10px -> 12px vertical) for a comfortable touch
  // target — this is the sole way to toggle voice input.
  micButton: {
    padding: '12px 14px',
    fontSize: 19,
    fontWeight: 600,
    color: '#374151',
    backgroundColor: '#fff',
    border: '1px solid #ccc',
    borderRadius: 4,
    cursor: 'pointer',
  },
  micButtonActive: {
    color: '#fff',
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
    fontSize: 16,
  },
  primaryButton: {
    padding: '10px 16px',
    fontSize: 17,
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#d97706',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  },
  secondaryButton: {
    padding: '10px 16px',
    fontSize: 17,
    fontWeight: 600,
    color: '#b45309',
    backgroundColor: '#fff',
    border: '1px solid #b45309',
    borderRadius: 4,
    cursor: 'pointer',
  },
  debriefPanel: {
    padding: 20,
    borderTop: '1px solid #e5e7eb',
    backgroundColor: '#fffbeb',
  },
  debriefTitle: {
    fontSize: 21,
    margin: '0 0 8px 0',
    color: '#78350f',
  },
  debriefText: {
    fontSize: 18,
    color: '#374151',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    marginBottom: 16,
  },
  analysisStatus: {
    fontSize: 16,
    color: '#6b7280',
    fontStyle: 'italic',
    margin: '0 0 16px 0',
  },
  analysisError: {
    fontSize: 16,
    color: '#a94442',
    margin: '0 0 16px 0',
  },
};

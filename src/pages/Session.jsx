import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { assemblePrompt } from '../lib/assemblePrompt';
import { useAuth } from '../hooks/useAuth';
import { parseTierNumber } from '../lib/tier';
import { logAction } from '../lib/auditLog';
import { useVoiceInput } from '../hooks/useVoiceInput';
import Mascot from '../components/Mascot';
 
const END_SESSION_KEYWORD = 'END SESSION';

function isEndSessionText(text) {
  return text.trim().replace(/[.!?]+$/, '').toUpperCase() === END_SESSION_KEYWORD;
}

// Sent automatically the moment a session starts, so the AI opens the scene
// in character instead of the staff/individual having to know a magic
// phrase. It's flagged `hidden` so it never renders as a chat bubble, but it
// still counts as a real turn for the API (which requires the conversation
// to start with a "user" message) and is still saved in the transcript.
const KICKOFF_MESSAGE = {
  role: 'user',
  content: 'The session is starting now. Begin the activity following your instructions.',
  hidden: true,
};
 
const TIER_COLORS = {
  1: { backgroundColor: '#dbeafe', color: '#1e40af' },
  2: { backgroundColor: '#fef9c3', color: '#854d0e' },
  3: { backgroundColor: '#dcfce7', color: '#166534' },
};
 
export default function Session() {
  const { individualId } = useParams();
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
 
  const [individual, setIndividual] = useState(null);
  const [prompts, setPrompts] = useState([]);
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [loading, setLoading] = useState(!!individualId);
  const [error, setError] = useState('');
 
  const [assembledPrompt, setAssembledPrompt] = useState('');
  const [sessionActive, setSessionActive] = useState(false);
 
  // Conversation state
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const [sessionEnded, setSessionEnded] = useState(false);
  const [lastFailedTurn, setLastFailedTurn] = useState(null);
  const [analyzingSession, setAnalyzingSession] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [revealingMessageId, setRevealingMessageId] = useState(null);
  const [revealedText, setRevealedText] = useState('');
 
  // Data to hand off to the session log form once the session completes
  const [sessionId, setSessionId] = useState(null);
  const [scenarioUsed, setScenarioUsed] = useState('');
  const [isStarting, setIsStarting] = useState(false);
 
  const messageListRef = useRef(null);
  const sessionStartTimeRef = useRef(null);
  const analysisPromiseRef = useRef(null);
  const mascotRef = useRef(null);
  const messageIdCounterRef = useRef(0);
 
  // Fetch the individual's profile, then the matching prompts for their tier
  useEffect(() => {
    if (authLoading) return;
    if (!individualId) {
      setLoading(false);
      return;
    }
    if (!user) {
      setError('You must be signed in to view this page.');
      setLoading(false);
      return;
    }
 
    let isMounted = true;
 
    const fetchData = async () => {
      setLoading(true);
      setError('');
 
      let individualQuery = supabase
        .from('individuals')
        .select('*')
        .eq('id', individualId);
      if (role !== 'admin') {
        individualQuery = individualQuery.contains('assigned_staff', [user.id]);
      }

      const { data: individualData, error: individualError } = await individualQuery.single();
 
      if (!isMounted) return;
 
      if (individualError || !individualData) {
        setError('Could not load this individual\u2019s profile.');
        setLoading(false);
        return;
      }
 
      setIndividual(individualData);

      const tierNumber = parseTierNumber(individualData.communication_tier);
      const { data: promptsData, error: promptsError } = await supabase
        .from('prompts')
        .select('*')
        .eq('tier', tierNumber)
        .eq('is_active', true);
 
      if (!isMounted) return;
 
      if (promptsError) {
        setError('Could not load scenario prompts for this tier.');
        setPrompts([]);
      } else {
        // Rows missing a scenario_name or system_prompt can't be assembled
        // into a usable session — skip them instead of showing a blank,
        // unselectable option in the dropdown.
        const usablePrompts = (promptsData || []).filter(
          (prompt) =>
            (prompt.scenario_name || '').trim() !== '' &&
            (prompt.system_prompt || '').trim() !== ''
        );
        setPrompts(usablePrompts);
      }
 
      setLoading(false);
    };
 
    fetchData();
 
    return () => {
      isMounted = false;
    };
  }, [authLoading, user, role, individualId]);
 
  // Auto-scroll to the latest message whenever the conversation updates —
  // also fires as revealedText grows, so the view keeps up while a reply
  // streams in.
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages, revealedText]);

  const { isListening, supported: micSupported, toggleListening } = useVoiceInput(
    (transcript) => setInputText((prev) => (prev ? prev + ' ' : '') + transcript)
  );

  const handleStartSession = async () => {
    const selectedPrompt = prompts.find(
      (prompt) => String(prompt.id) === String(selectedPromptId)
    );
 
    if (!selectedPrompt || !individual) {
      setError('Please select a scenario before starting the session.');
      return;
    }
 
    if (!user) {
      setError('You must be signed in to start a session.');
      return;
    }
 
    setError('');
    setIsStarting(true);
 
    const startTime = Date.now();
 
    const { data: sessionRow, error: insertError } = await supabase
      .from('sessions')
      .insert({
        individual_id: individualId,
        staff_id: user.id,
        session_date: new Date(startTime).toISOString(),
        tier_used: parseTierNumber(individual.communication_tier),
        scenario_used: selectedPrompt.scenario_name,
      })
      .select()
      .single();
 
    setIsStarting(false);
 
    if (insertError || !sessionRow) {
      setError('Could not start the session. Please try again.');
      return;
    }
 
    const builtPrompt = assemblePrompt(
      selectedPrompt.system_prompt,
      individual,
      selectedPrompt.scenario_name
    );

    sessionStartTimeRef.current = startTime;
    setSessionId(sessionRow.id);
    setScenarioUsed(selectedPrompt.scenario_name);
    setAssembledPrompt(builtPrompt);
    setSessionActive(true);

    logAction('session_started', {
      tableName: 'sessions',
      recordId: sessionRow.id,
      metadata: { individual_id: individualId, scenario_used: selectedPrompt.scenario_name },
    });

    // setAssembledPrompt/setSessionId above won't be visible to this closure
    // until the next render, so pass the freshly-built values through
    // explicitly rather than letting sendConversation read stale state.
    sendConversation([KICKOFF_MESSAGE], false, {
      systemPrompt: builtPrompt,
      sessionId: sessionRow.id,
    });
  };
 
  // Once the roleplay partner has said goodbye, the transcript is analyzed
  // separately (in character, the roleplay partner should never break scene
  // to produce a clinical write-up). The result is saved straight onto the
  // sessions row so SessionLog opens with these categories already
  // drafted — staff review/correct them and contribute staff_notes, rather
  // than writing every category from scratch.
  const runSessionAnalysis = async (sessionIdToUse, transcriptMessages) => {
    setAnalyzingSession(true);
    setAnalysisError('');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch('/api/debrief', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token
            ? { Authorization: 'Bearer ' + session.access_token }
            : {}),
        },
        body: JSON.stringify({
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
        throw new Error(data?.error || 'Could not generate a session summary.');
      }

      const { error: updateError } = await supabase
        .from('sessions')
        .update({
          went_well: data.went_well || null,
          challenge_noted: data.challenge_noted || null,
          goal_moment: data.goal_moment || null,
          family_summary: data.family_summary || null,
        })
        .eq('id', sessionIdToUse);

      if (updateError) {
        throw new Error('Generated a summary but could not save it. You can fill in the log manually.');
      }
    } catch (err) {
      setAnalysisError(err.message || 'Could not auto-generate a session summary.');
    } finally {
      setAnalyzingSession(false);
    }
  };

  const sendConversation = async (updatedMessages, isEndSession, overrides = {}) => {
    // Callers that just changed assembledPrompt/sessionId in the same tick
    // (i.e. handleStartSession) can't rely on reading them back from state
    // yet, since React hasn't re-rendered — pass the fresh values through
    // explicitly instead.
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
          messages: updatedMessages.map(({ role, content }) => ({ role, content })),
          systemPrompt: activeSystemPrompt,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await response.json()
        : null;

      if (!response.ok) {
        throw new Error(data?.error || 'The assistant could not respond. Please try again.');
      }

      if (!data) {
        throw new Error('Received an unexpected response from the server. Please try again.');
      }

      const assistantMessage = {
        id: messageIdCounterRef.current++,
        role: 'assistant',
        content: data.text,
        truncated: !!data.truncated,
      };
      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      setLastFailedTurn(null);

      // Roleplay turns only — the post-END SESSION debrief line is a
      // clinical wrap-up, not something the character should say aloud.
      // While the mascot is available, reveal the reply progressively in
      // sync with the audio instead of popping the whole message in at
      // once; if there's no mascot to drive the timing, just show it all.
      const sayPromise = !isEndSession
        ? mascotRef.current?.say(assistantMessage.content, { onReveal: setRevealedText })
        : null;

      if (sayPromise) {
        setRevealedText('');
        setRevealingMessageId(assistantMessage.id);
        sayPromise.finally(() => {
          setRevealingMessageId((current) =>
            current === assistantMessage.id ? null : current
          );
        });
      }

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
        analysisPromiseRef.current = runSessionAnalysis(activeSessionId, finalMessages);
      }
    } catch (err) {
      setChatError(err.message || 'Something went wrong. Please try again.');
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

  const handleEndSessionClick = () => {
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
 
  const handleCompleteSession = async () => {
    // The AI analysis is still writing went_well/challenge_noted/goal_moment/
    // family_summary to the sessions row at this point — navigating before it
    // resolves is exactly what left the log looking empty. Wait for it (it's
    // already in flight, this doesn't start a new call) before moving on.
    if (analysisPromiseRef.current) {
      await analysisPromiseRef.current;
    }

    const elapsedMinutes = sessionStartTimeRef.current
      ? Math.round((Date.now() - sessionStartTimeRef.current) / 60000)
      : null;

    navigate('/session/' + sessionId + '/log', {
      state: {
        individual_id: individualId,
        scenario_used: scenarioUsed,
        session_length: elapsedMinutes,
      },
    });
  };
 
  if (loading) {
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
            onClick={() => navigate('/individual/' + individualId)}
          >
            ← Back to Profile
          </button>
          <div style={styles.headerRow}>
            <h1 style={styles.name}>{individual.full_name}</h1>
            <span style={{ ...styles.badge, ...tierStyle }}>
              {tierNumber !== null ? 'Tier ' + tierNumber : 'Tier —'}
            </span>
          </div>
        </div>
      </div>
 
      {error && <div style={styles.errorBanner}>{error}</div>}
 
      {!sessionActive && (
        <div style={styles.setupPanel}>
          {prompts.length === 0 ? (
            <p style={styles.text}>
              No active scenarios are available for this individual's tier yet.
              Please contact your program coordinator.
            </p>
          ) : (
            <>
              <label style={styles.label} htmlFor="scenario-select">
                Choose a scenario
              </label>
              <select
                id="scenario-select"
                value={selectedPromptId}
                onChange={(e) => setSelectedPromptId(e.target.value)}
                style={styles.select}
              >
                <option value="">-- Select a scenario --</option>
                {prompts.map((prompt) => (
                  <option key={prompt.id} value={prompt.id}>
                    {prompt.scenario_name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                style={styles.primaryButton}
                onClick={handleStartSession}
                disabled={!selectedPromptId || isStarting}
              >
                {isStarting ? 'Starting...' : 'Start Session'}
              </button>
            </>
          )}
        </div>
      )}
 
      {/* Conversation section: active once a session has been started */}
      {sessionActive && (
        <div style={styles.chatPanel}>
          <div style={styles.mascotRow}>
            <Mascot ref={mascotRef} />
          </div>
          <div style={styles.messageList} ref={messageListRef}>
            {messages.filter((m) => !m.hidden).length === 0 && !isSending && (
              <div style={styles.emptyChat}>
                Waiting for the session to begin...
              </div>
            )}
            {messages.filter((m) => !m.hidden).map((message, index) => {
              const isRevealing = message.id === revealingMessageId;
              const displayContent = isRevealing ? revealedText : message.content;
              return (
                <div
                  key={message.id ?? index}
                  style={{
                    ...styles.messageRow,
                    justifyContent:
                      message.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      ...styles.messageBubble,
                      ...(message.role === 'user'
                        ? styles.userBubble
                        : styles.assistantBubble),
                    }}
                  >
                    {displayContent}
                    {isRevealing && <span style={styles.streamingCursor} />}
                    {message.truncated && !isRevealing && (
                      <div style={styles.truncatedNote}>
                        This response may have been cut short.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
 
            {isSending && (
              <div style={styles.messageRow}>
                <div style={styles.typingIndicator}>Thinking...</div>
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
                  Retry
                </button>
              )}
            </div>
          )}
 
          {!sessionEnded ? (
            <div style={styles.inputRow}>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSending}
                placeholder="Type a message..."
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
                  title={isListening ? 'Stop listening' : 'Speak your message'}
                >
                  {isListening ? '● Listening…' : '🎤'}
                </button>
              )}
              <button
                type="button"
                style={styles.primaryButton}
                onClick={handleSend}
                disabled={isSending || !inputText.trim()}
              >
                {isSending ? 'Sending...' : 'Send'}
              </button>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={handleEndSessionClick}
                disabled={isSending}
              >
                End Session
              </button>
            </div>
          ) : (
            <div style={styles.debriefPanel}>
              <h2 style={styles.debriefTitle}>Session Debrief</h2>
              <p style={styles.debriefText}>
                {messages[messages.length - 1]?.content}
              </p>
              {analyzingSession && (
                <p style={styles.analysisStatus}>Generating session summary…</p>
              )}
              {analysisError && (
                <p style={styles.analysisError}>
                  {analysisError} You can fill in the log manually on the next screen.
                </p>
              )}
              {!analyzingSession && !analysisError && (
                <p style={styles.analysisStatus}>
                  Session summary generated — review it on the next screen.
                </p>
              )}
              <button
                type="button"
                style={{
                  ...styles.primaryButton,
                  opacity: analyzingSession ? 0.6 : 1,
                  cursor: analyzingSession ? 'not-allowed' : 'pointer',
                }}
                onClick={handleCompleteSession}
                disabled={analyzingSession}
              >
                {analyzingSession ? 'Finishing up…' : 'Complete Session'}
              </button>
            </div>
          )}
        </div>
      )}
 
      <style>{`
        @keyframes session-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes session-cursor-blink {
          50% { opacity: 0; }
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
    animation: 'session-spin 0.8s linear infinite',
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
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  name: {
    fontSize: 27,
    margin: 0,
  },
  badge: {
    fontSize: 15,
    fontWeight: 600,
    padding: '2px 10px',
    borderRadius: 999,
  },
  setupPanel: {
    padding: 20,
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
  },
  text: {
    fontSize: 17,
    color: '#374151',
    margin: 0,
  },
  label: {
    display: 'block',
    marginBottom: 6,
    fontSize: 17,
    fontWeight: 600,
    color: '#333',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 17,
    border: '1px solid #ccc',
    borderRadius: 4,
    marginBottom: 16,
    boxSizing: 'border-box',
  },
  primaryButton: {
    padding: '10px 16px',
    fontSize: 17,
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
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
  mascotRow: {
    display: 'flex',
    justifyContent: 'center',
    padding: '12px 0 0',
    backgroundColor: '#f9fafb',
  },
  messageList: {
    height: 360,
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
  streamingCursor: {
    display: 'inline-block',
    width: 8,
    height: 16,
    marginLeft: 2,
    verticalAlign: 'text-bottom',
    backgroundColor: '#111827',
    animation: 'session-cursor-blink 0.9s step-start infinite',
  },
  messageRow: {
    display: 'flex',
    width: '100%',
  },
  messageBubble: {
    maxWidth: '75%',
    padding: '10px 14px',
    borderRadius: 12,
    fontSize: 17,
    lineHeight: 1.4,
    whiteSpace: 'pre-wrap',
  },
  userBubble: {
    backgroundColor: '#2563eb',
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
  truncatedNote: {
    fontSize: 15,
    fontStyle: 'italic',
    color: '#9ca3af',
    marginTop: 4,
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
  secondaryButton: {
    padding: '10px 16px',
    fontSize: 17,
    fontWeight: 600,
    color: '#2563eb',
    backgroundColor: '#fff',
    border: '1px solid #2563eb',
    borderRadius: 4,
    cursor: 'pointer',
  },
  inputRow: {
    display: 'flex',
    gap: 8,
    padding: 12,
    borderTop: '1px solid #e5e7eb',
  },
  textInput: {
    flex: 1,
    padding: '10px 12px',
    fontSize: 17,
    border: '1px solid #ccc',
    borderRadius: 4,
    resize: 'none',
    fontFamily: 'inherit',
  },
  micButton: {
    padding: '10px 14px',
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
  debriefPanel: {
    padding: 20,
    borderTop: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
  },
  debriefTitle: {
    fontSize: 19,
    margin: '0 0 8px 0',
  },
  debriefText: {
    fontSize: 17,
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
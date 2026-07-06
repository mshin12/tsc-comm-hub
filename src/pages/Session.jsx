import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { assemblePrompt } from '../lib/assemblePrompt';
import { useAuth } from '../hooks/useAuth';
import { parseTierNumber } from '../lib/tier';
 
const END_SESSION_KEYWORD = 'END SESSION';

function isEndSessionText(text) {
  return text.trim().replace(/[.!?]+$/, '').toUpperCase() === END_SESSION_KEYWORD;
}
 
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
 
  // Data to hand off to the session log form once the session completes
  const [sessionId, setSessionId] = useState(null);
  const [scenarioUsed, setScenarioUsed] = useState('');
  const [isStarting, setIsStarting] = useState(false);
 
  const messageListRef = useRef(null);
  const sessionStartTimeRef = useRef(null);
 
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
        setPrompts(promptsData || []);
      }
 
      setLoading(false);
    };
 
    fetchData();
 
    return () => {
      isMounted = false;
    };
  }, [authLoading, user, role, individualId]);
 
  // Auto-scroll to the latest message whenever the conversation updates
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);
 
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
 
    sessionStartTimeRef.current = startTime;
    setSessionId(sessionRow.id);
    setScenarioUsed(selectedPrompt.scenario_name);
    setAssembledPrompt(assemblePrompt(selectedPrompt.system_prompt, individual));
    setSessionActive(true);
  };
 
  const sendConversation = async (updatedMessages, isEndSession) => {
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
          systemPrompt: assembledPrompt,
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
        role: 'assistant',
        content: data.text,
        truncated: !!data.truncated,
      };
      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      setLastFailedTurn(null);

      if (sessionId) {
        const { error: transcriptError } = await supabase
          .from('sessions')
          .update({ transcript: finalMessages })
          .eq('id', sessionId);
        if (transcriptError) {
          console.error('Could not save transcript:', transcriptError);
        }
      }

      if (isEndSession) {
        setSessionEnded(true);
      }
    } catch (err) {
      setChatError(err.message || 'Something went wrong. Please try again.');
      setLastFailedTurn({ messages: updatedMessages, isEndSession });
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
    sendConversation(lastFailedTurn.messages, lastFailedTurn.isEndSession);
  };
 
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
 
  const handleCompleteSession = () => {
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
        <h1 style={styles.name}>{individual.full_name}</h1>
        <span style={{ ...styles.badge, ...tierStyle }}>
          {tierNumber !== null ? 'Tier ' + tierNumber : 'Tier —'}
        </span>
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
          <div style={styles.messageList} ref={messageListRef}>
            {messages.length === 0 && (
              <div style={styles.emptyChat}>
                Send a message to begin the session.
              </div>
            )}
            {messages.map((message, index) => (
              <div
                key={index}
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
                  {message.content}
                  {message.truncated && (
                    <div style={styles.truncatedNote}>
                      This response may have been cut short.
                    </div>
                  )}
                </div>
              </div>
            ))}
 
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
              <button
                type="button"
                style={styles.primaryButton}
                onClick={handleCompleteSession}
              >
                Complete Session
              </button>
            </div>
          )}
        </div>
      )}
 
      <style>{`
        @keyframes session-spin {
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
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  name: {
    fontSize: 24,
    margin: 0,
  },
  badge: {
    fontSize: 12,
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
    fontSize: 14,
    color: '#374151',
    margin: 0,
  },
  label: {
    display: 'block',
    marginBottom: 6,
    fontSize: 14,
    fontWeight: 600,
    color: '#333',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    border: '1px solid #ccc',
    borderRadius: 4,
    marginBottom: 16,
    boxSizing: 'border-box',
  },
  primaryButton: {
    padding: '10px 16px',
    fontSize: 14,
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
    fontSize: 14,
  },
  messageRow: {
    display: 'flex',
    width: '100%',
  },
  messageBubble: {
    maxWidth: '75%',
    padding: '10px 14px',
    borderRadius: 12,
    fontSize: 14,
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
    fontSize: 13,
    color: '#6b7280',
    fontStyle: 'italic',
    padding: '4px 8px',
  },
  truncatedNote: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#9ca3af',
    marginTop: 4,
  },
  retryButton: {
    padding: '6px 12px',
    fontSize: 13,
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
    fontSize: 14,
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
    fontSize: 14,
    border: '1px solid #ccc',
    borderRadius: 4,
    resize: 'none',
    fontFamily: 'inherit',
  },
  debriefPanel: {
    padding: 20,
    borderTop: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
  },
  debriefTitle: {
    fontSize: 16,
    margin: '0 0 8px 0',
  },
  debriefText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    marginBottom: 16,
  },
};
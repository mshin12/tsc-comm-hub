import { useEffect, useRef, useState } from 'react';

// Speech-to-text for a chat text input, backed by the browser's Web Speech
// API. Not every browser implements it, so `supported` lets callers hide the
// mic button entirely rather than show it in a broken/disabled state.
//
// onFinalResult(text) fires once per settled phrase segment — callers should
// permanently append this, same as the old single-shot onResult contract.
// onInterimResult(text) fires repeatedly with the current in-progress guess
// for whatever's being spoken right now, so callers can show it as a live,
// replaceable preview (it isn't final yet and may still change).

// Volume metering thresholds — how quiet, and for how long, before surfacing
// a "speak a little louder" hint. Tuned by ear against a laptop mic during
// development, not against real target-device hardware (phone mics, a
// distant/lapel mic in a session room) — treat as a starting point that may
// need adjustment after a real pilot, same caveat as the mobile/PWA work in
// CLAUDE.md.
const QUIET_VOLUME_THRESHOLD = 0.08;
const QUIET_HINT_DELAY_MS = 1500;

export function useVoiceInput({ onInterimResult, onFinalResult, lang = 'en-US' } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef(null);

  // Live mic-input level (0-1) plus a debounced "it's been quiet for a
  // while" flag, both purely client-side (Web Audio API, no network/API
  // cost) — separate from SpeechRecognition itself, which doesn't expose
  // amplitude data. This opens its own getUserMedia stream in parallel with
  // whatever SpeechRecognition is doing internally; running two independent
  // consumers of the same mic is a standard, supported pattern (this is not
  // two competing speech recognizers, just one recognizer plus a passive
  // amplitude reading), but it hasn't been verified on real phone hardware —
  // see CLAUDE.md's live-speech-coaching section.
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [volumeHint, setVolumeHint] = useState('');
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const meterRafRef = useRef(null);
  const belowThresholdSinceRef = useRef(null);

  const stopVolumeMetering = () => {
    if (meterRafRef.current) cancelAnimationFrame(meterRafRef.current);
    meterRafRef.current = null;
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    belowThresholdSinceRef.current = null;
    setVolumeLevel(0);
    setVolumeHint('');
  };

  const startVolumeMetering = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(data);

        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
          const normalized = (data[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        // Typical conversational speech sits well under a raw RMS of 1 —
        // scaled up so normal speaking volume reads as a mostly-full meter
        // rather than a barely-visible sliver.
        const rms = Math.sqrt(sumSquares / data.length);
        setVolumeLevel(Math.min(rms * 4, 1));

        const now = Date.now();
        if (rms < QUIET_VOLUME_THRESHOLD) {
          if (belowThresholdSinceRef.current === null) belowThresholdSinceRef.current = now;
          if (now - belowThresholdSinceRef.current > QUIET_HINT_DELAY_MS) {
            setVolumeHint('quiet');
          }
        } else {
          belowThresholdSinceRef.current = null;
          setVolumeHint('');
        }

        meterRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      // The meter is a nice-to-have, not required for speech recognition
      // itself (which manages its own mic access independently) — fail
      // silently and just skip the meter rather than blocking voice input.
      console.error('Could not start volume metering:', err);
    }
  };

  // Read once at mount via a ref, same as the callbacks below — this hook
  // creates its SpeechRecognition instance exactly once (mount-only effect),
  // so a caller whose `lang` could change after mount (e.g. FamilySession.jsx
  // right after useAuth() resolves) still gets the right value without
  // needing this whole hook to re-run.
  const langRef = useRef(lang);
  useEffect(() => {
    langRef.current = lang;
    if (recognitionRef.current) recognitionRef.current.lang = lang;
  }, [lang]);

  // Tracks the user's actual INTENT (did they click the mic off?), distinct
  // from the recognition engine's own running state — see onend below for
  // why that distinction is what makes "only stop when the user says so"
  // actually work.
  const isListeningRef = useRef(false);

  // Callbacks are captured via refs and kept fresh after every render
  // (written in an effect, not during render itself — refs must only be
  // read/written outside of render), rather than closed over once inside
  // the mount-only effect below — this way callers can safely pass fresh
  // inline functions each render without the recognition handlers ever
  // seeing a stale version.
  const onInterimResultRef = useRef(onInterimResult);
  const onFinalResultRef = useRef(onFinalResult);
  useEffect(() => {
    onInterimResultRef.current = onInterimResult;
    onFinalResultRef.current = onFinalResult;
  });

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    // continuous: keep listening across pauses instead of auto-stopping
    // after a single utterance — combined with the onend restart below,
    // this is what makes the mic stay on until manually toggled off.
    // interimResults: surface words as they're being recognized, not just
    // the final settled chunk at the end.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = langRef.current;

    recognition.onresult = (event) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          onFinalResultRef.current?.(transcript);
        } else {
          interimTranscript += transcript;
        }
      }
      onInterimResultRef.current?.(interimTranscript);
    };

    // continuous=true keeps the recognition session alive across pauses,
    // but some browsers (Chrome in particular) still end the session on
    // their own internal silence timeout regardless of that flag. If the
    // user hasn't manually turned the mic off (isListeningRef still true),
    // treat this as the browser dropping the session rather than the
    // user's intent, and restart immediately — this is what actually
    // guarantees "only stops when the user clicks the mic again."
    recognition.onend = () => {
      if (isListeningRef.current) {
        try {
          recognition.start();
        } catch {
          // start() throws if a session is already starting/running —
          // safe to ignore, a restart is already in flight.
        }
      } else {
        setIsListening(false);
        stopVolumeMetering();
      }
    };

    recognition.onerror = (event) => {
      // Benign in continuous mode — e.g. a long pause between phrases.
      // onend fires right after either way, and handles restarting if the
      // user still intends to be listening.
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      isListeningRef.current = false;
      setIsListening(false);
      stopVolumeMetering();
    };

    recognitionRef.current = recognition;
    setSupported(true);

    return () => {
      isListeningRef.current = false;
      recognition.stop();
      stopVolumeMetering();
    };
  }, []);

  const toggleListening = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (isListeningRef.current) {
      isListeningRef.current = false;
      setIsListening(false);
      // .stop() (unlike .abort()) lets the recognizer finish processing
      // and finalize whatever phrase is already in progress before ending
      // — the last bit of speech still arrives via onFinalResult.
      recognition.stop();
      stopVolumeMetering();
    } else {
      isListeningRef.current = true;
      setIsListening(true);
      onInterimResultRef.current?.('');
      recognition.start();
      startVolumeMetering();
    }
  };

  return { isListening, supported, toggleListening, volumeLevel, volumeHint };
}

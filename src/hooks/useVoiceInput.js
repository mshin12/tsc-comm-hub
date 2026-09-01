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
//
// Deliberately no silence-based auto-submit: an earlier version of this
// hook auto-sent a message after a few seconds of mic silence, but that's
// the same category of mechanism (a voice-activity-detector-style cutoff)
// that this app's AAC guidance is built to avoid — CLAUDE.md documents at
// length (Known Issues #10/#19) that AAC users need to be able to pause for
// as long as they need while composing a response, and ANY fixed silence
// threshold risks cutting that off. Sending without stopping the mic is
// still supported (see Session.jsx/FamilySession.jsx's Send button, which
// no longer requires isListening to be false) — it's just caller-initiated
// rather than timer-initiated, so it can never fire before the person is
// actually ready.

// Volume metering thresholds — how quiet, and for how long, before surfacing
// a "speak a little louder" hint. Tuned by ear against a laptop mic during
// development, not against real target-device hardware (phone mics, a
// distant/lapel mic in a session room) — treat as a starting point that may
// need adjustment after a real pilot, same caveat as the mobile/PWA work in
// CLAUDE.md.
const QUIET_VOLUME_THRESHOLD = 0.08;
const QUIET_HINT_DELAY_MS = 1500;

// iPadOS Safari (13+) reports itself with a desktop-Safari-style user agent
// and navigator.platform === 'MacIntel', so a plain UA sniff for "iPad"
// misses it — the standard workaround is to also check for touch support,
// which no real Mac has. Used below to skip opening a second independent
// getUserMedia stream for volume metering on iOS/iPadOS: this app previously
// shipped that second stream unconditionally (one mic consumer for
// SpeechRecognition's own internal audio, a second, separate one purely for
// the volume meter), which works fine on desktop Chrome/Firefox but iPad
// sessions reported the mic picking up no speech at all — a known class of
// iOS/WebKit bug where a second concurrent getUserMedia session can starve or
// silently break whatever audio session SpeechRecognition itself is using.
// Speech-to-text actually working is far more important than the volume
// meter nice-to-have, so this trades away the meter on iOS rather than risk
// the same conflict. Not yet verified against a real iPad — see CLAUDE.md's
// recurring "no browser-automation / real-device testing available" caveat.
function isIOSDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iOSLike = /iPad|iPhone|iPod/.test(ua);
  const iPadOSDesktopUA = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return iOSLike || iPadOSDesktopUA;
}

// .start() throws if called while the recognizer hasn't fully finished
// tearing down a previous session yet — a real race, not a hypothetical
// one: it's exactly what happens when the browser silently ends a
// continuous session on its own (see the onend comment below) and this
// fires again immediately after. Silently swallowing that failure (the old
// behavior) left `isListening` stuck true over a recognizer that was
// actually dead, with nothing to ever recover it — a single short retry
// resolves the normal case (teardown just needed a beat to finish) without
// masking a genuinely broken recognizer forever, since onerror/onend still
// fire normally if this second attempt also fails. Module-level (not
// defined inside the hook) since it closes over nothing but its own
// params — keeps it a stable reference so referencing it from inside the
// mount-only effect below doesn't trip react-hooks/exhaustive-deps.
function attemptStart(recognition, retriesLeft = 1) {
  try {
    recognition.start();
  } catch {
    if (retriesLeft > 0) {
      setTimeout(() => attemptStart(recognition, retriesLeft - 1), 300);
    }
  }
}

export function useVoiceInput({ onInterimResult, onFinalResult, lang = 'en-US' } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef(null);

  // Live mic-input level (0-1) plus a debounced "it's been quiet for a
  // while" flag, both purely client-side (Web Audio API, no network/API
  // cost) — separate from SpeechRecognition itself, which doesn't expose
  // amplitude data. This opens its own getUserMedia stream — a second,
  // independent consumer of the same mic alongside whatever SpeechRecognition
  // is doing internally (not two competing speech recognizers, just one
  // recognizer plus a passive amplitude reading). Sequenced to start only
  // once recognition.onstart confirms the primary stream is actually live
  // (see below), not fired at the same time as attemptStart() — two
  // simultaneous getUserMedia requests for the same device is suspected to
  // be why the mic recorded nothing at all on iPad, and separately on
  // Windows Chrome/Edge (see isIOSDevice()'s comment and this file's
  // onstart handler). Still skipped entirely on iOS/iPadOS regardless of
  // sequencing, as a known-good extra safeguard — see isIOSDevice() above.
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
    // See isIOSDevice()'s comment: a second getUserMedia stream alongside
    // SpeechRecognition's own is the suspected cause of iPad sessions
    // recording no speech at all, so skip it there entirely rather than
    // risk starving the recognizer's mic access for a nice-to-have meter.
    if (isIOSDevice()) return;
    // Idempotency guard: recognition.onstart (below) is what actually
    // triggers this now, and that event can fire again after a browser-
    // initiated silent restart (see onend) while a metering stream from
    // before is still perfectly alive — without this, that would open a
    // second, redundant getUserMedia stream on top of the first instead of
    // reusing it, which is exactly the kind of concurrent-stream
    // contention this function exists to avoid causing in the first place.
    if (micStreamRef.current) return;

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

  // Shared by the manual mic-button toggle and anything else that wants to
  // stop listening (there's no more silence-triggered auto-stop path).
  const stopListeningInternal = () => {
    isListeningRef.current = false;
    setIsListening(false);
    recognitionRef.current?.stop();
    stopVolumeMetering();
  };

  // Shared by the manual mic-button toggle and the auto-restart-after-the-
  // AI's-turn path (see Session.jsx/FamilySession.jsx) — a no-op if already
  // listening, so callers don't need to check isListening themselves first.
  const startListeningInternal = () => {
    const recognition = recognitionRef.current;
    if (!recognition || isListeningRef.current) return;
    isListeningRef.current = true;
    setIsListening(true);
    onInterimResultRef.current?.('');
    // startVolumeMetering() is NOT called here — see recognition.onstart
    // below for why it's sequenced after, not fired in the same tick.
    attemptStart(recognition);
  };

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

    // Fires once the recognition service has actually begun listening — a
    // more precise signal than "recognition.start() didn't throw" that the
    // primary mic stream genuinely exists. Volume metering (its own,
    // separate getUserMedia call) waits for this instead of firing in the
    // same tick as attemptStart() above, so the two mic acquisitions are
    // sequenced rather than racing each other for the device. This was a
    // real, reported bug, not just a hypothetical one: opening both at once
    // is suspected to be exactly why the mic recorded nothing at all on
    // iPad (see isIOSDevice()'s comment) — and separately reported doing
    // the same thing on Windows Chrome/Edge from the very first mic press,
    // which the iOS-only exemption never covered. Sequencing them fixes
    // both without having to guess which devices/browsers are affected by
    // name. Deliberately `onstart`, not the more semantically precise
    // `onaudiostart` — `onstart` is the one lifecycle event every
    // implementation of this API has to fire correctly for the API to be
    // usable at all, so it's the safer one to depend on across browsers
    // (this app has no automated way to verify event support on Safari,
    // which this fix must not regress for — see CLAUDE.md).
    recognition.onstart = () => {
      startVolumeMetering();
    };

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
        attemptStart(recognition);
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
    if (!recognitionRef.current) return;
    if (isListeningRef.current) {
      // .stop() (unlike .abort()) lets the recognizer finish processing and
      // finalize whatever phrase is already in progress before ending — the
      // last bit of speech still arrives via onFinalResult.
      stopListeningInternal();
    } else {
      startListeningInternal();
    }
  };

  // Distinct from toggleListening so callers that want to unconditionally
  // (re)start listening — e.g. the moment the AI's reply finishes, so the
  // mic is hot again without anyone having to press it — don't need to
  // track isListening themselves and risk toggling the mic OFF instead.
  const startListening = () => {
    startListeningInternal();
  };

  // Symmetric counterpart to startListening — a no-op if not currently
  // listening. Used to deterministically stop the mic the instant a
  // message is sent (see Session.jsx/FamilySession.jsx's handleSend),
  // rather than leaving the recognizer running unattended for the whole
  // network-round-trip-plus-TTS wait: that idle stretch is exactly when a
  // browser is most likely to silently end the session on its own (see
  // onend above), which previously could leave `isListening` stuck true
  // over a recognizer that had actually gone dead. Stopping on send and
  // freshly starting again once the AI's turn is done (startListening)
  // avoids relying on the recognizer surviving that unattended gap at all.
  const stopListening = () => {
    if (isListeningRef.current) stopListeningInternal();
  };

  return {
    isListening,
    supported,
    meteringSupported: !isIOSDevice(),
    toggleListening,
    startListening,
    stopListening,
    volumeLevel,
    volumeHint,
  };
}

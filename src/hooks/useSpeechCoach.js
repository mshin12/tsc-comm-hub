import { useState } from 'react';
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';
import { supabase } from '../lib/supabaseClient';

// Deliberately a separate, opt-in "speak again for a check" interaction
// rather than scoring the same audio already being dictated into the chat
// box. Running this alongside the continuous Web Speech API recognizer
// used for dictation would mean two independent recognizers competing for
// the mic at once — this keeps the two concerns (composing a message vs.
// getting feedback on how you sound) fully decoupled and easier to reason
// about, at the cost of asking for a second short sample. See CLAUDE.md's
// "Live speech coaching" section.

// Score thresholds below which a specific coaching tip is shown; otherwise
// a generic encouraging line. Coarse on purpose — this is meant to read as
// a supportive nudge, not a graded test, and hasn't been tuned against real
// sessions yet.
const FLUENCY_TIP_THRESHOLD = 60;
const COMPLETENESS_TIP_THRESHOLD = 60;

function tipsForScores(scores) {
  const tips = [];
  if (scores.fluencyScore < FLUENCY_TIP_THRESHOLD) tips.push('slowerPace');
  if (scores.completenessScore < COMPLETENESS_TIP_THRESHOLD) tips.push('finishThoughts');
  if (tips.length === 0) tips.push('soundedGreat');
  return tips;
}

export function useSpeechCoach({ sessionId, lang = 'en-US' } = {}) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const reset = () => {
    setResult(null);
    setError('');
  };

  const checkSpeech = async () => {
    setChecking(true);
    setError('');
    setResult(null);

    let recognizer = null;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const tokenRes = await fetch('/api/speechToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: 'Bearer ' + session.access_token } : {}),
        },
        body: JSON.stringify({ sessionId }),
      });

      const tokenData = await tokenRes.json().catch(() => null);

      if (!tokenRes.ok || !tokenData?.token) {
        throw new Error(tokenData?.error || 'Could not start speech coaching.');
      }

      const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(tokenData.token, tokenData.region);
      speechConfig.speechRecognitionLanguage = lang;

      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
      recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

      // Empty referenceText = Azure's "unscripted" assessment mode: it
      // scores fluency/prosody/completeness for free-form speech instead of
      // grading word-for-word accuracy against a script — the right mode
      // here, since this is spontaneous conversation practice, not reading
      // a passage aloud.
      const pronunciationConfig = new SpeechSDK.PronunciationAssessmentConfig(
        '',
        SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
        SpeechSDK.PronunciationAssessmentGranularity.Word,
        false
      );
      pronunciationConfig.enableProsodyAssessment = true;
      pronunciationConfig.applyTo(recognizer);

      await new Promise((resolve) => {
        recognizer.recognizeOnceAsync(
          (speechResult) => {
            try {
              const assessment = SpeechSDK.PronunciationAssessmentResult.fromResult(speechResult);
              const scores = {
                accuracyScore: assessment.accuracyScore,
                fluencyScore: assessment.fluencyScore,
                completenessScore: assessment.completenessScore,
                prosodyScore: assessment.prosodyScore,
              };
              setResult({ scores, tips: tipsForScores(scores) });
            } catch (parseError) {
              console.error('Could not parse pronunciation assessment result:', parseError);
              setError('Could not read the results of that check. Please try again.');
            }
            resolve();
          },
          (recognizeError) => {
            console.error('Speech coach recognition error:', recognizeError);
            setError('Could not check your speech. Please try again.');
            resolve();
          }
        );
      });
    } catch (err) {
      setError(err.message || 'Could not check your speech. Please try again.');
    } finally {
      recognizer?.close();
      setChecking(false);
    }
  };

  return { supported, checking, result, error, checkSpeech, reset };
}

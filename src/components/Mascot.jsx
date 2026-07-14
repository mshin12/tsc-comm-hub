// components/Mascot.jsx
// Renders the Rive character and exposes a say(text) method via ref, so
// Session.jsx can trigger speech whenever a new AI turn arrives.
//
// Confirmed directly via the Rive editor's state machine inspector
// (State Machine 1's input list), not just binary string extraction:
//
//   State machine: "State Machine 1"
//   Inputs:        Talk (bool), Hear (bool), Check (bool), Look (number),
//                  success (trigger), fail (trigger)
//   Animations:    look_idle, idle, Talk, Look_down_right, Look_down_left,
//                  hands_hear_start/stop, wave
//   No numeric "mouth openness" input exists in this file — mouth movement
//   is baked into the Talk animation's own timeline, so there's nothing to
//   drive with live audio amplitude. That's why the analyser/mouthOpen
//   approach from the original plan is dropped below in favor of a simple
//   on/off toggle.
//
// Talk is a bool, and the idle<->Talk transitions in the state machine are
// both gated on it, confirming the on/off toggle approach below is correct.
//
// Hear / Check / Look / success / fail exist in the file but aren't wired
// up — Hear is a plausible Phase 3 idea (e.g. set true while waiting on
// the individual's response), the rest look like leftovers from whatever
// this character was originally built for and are out of scope here.
 
import { forwardRef, useImperativeHandle } from "react";
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";
import { RuntimeLoader } from "@rive-app/canvas";
import { supabase } from "../lib/supabaseClient";

// @rive-app/canvas defaults to fetching its WASM runtime from unpkg.com,
// with a jsdelivr.net fallback — neither is same-origin, so the app's CSP
// connect-src blocks both and the mascot never loads at all (confirmed via
// a live CSP violation: the runtime fetch was silently blocked, so
// useRive() never got a working instance to render). Point both at the
// same .wasm files this package already ships, copied into public/ once
// (see package.json) so everything stays same-origin and CSP doesn't need
// to trust two extra third-party CDNs.
RuntimeLoader.setWasmUrl("/rive.wasm");
RuntimeLoader.setWasmFallbackUrl("/rive_fallback.wasm");

const STATE_MACHINE = "State Machine 1"; // confirmed present in mascot.riv
const TALK_INPUT = "Talk"; // confirmed bool via the Rive editor's state machine inspector
 
const Mascot = forwardRef(function Mascot(_props, ref) {
  const { rive, RiveComponent } = useRive({
    src: "/mascot.riv",
    stateMachines: STATE_MACHINE,
    autoplay: true,
  });
 
  const talk = useStateMachineInput(rive, STATE_MACHINE, TALK_INPUT);
 
  useImperativeHandle(ref, () => ({
    // Returns a promise that resolves when the audio finishes, so callers
    // can `await mascotRef.current.say(text)` if they want to wait (e.g.
    // disable input while the character is talking).
    //
    // If `onReveal` is passed, it's called repeatedly with a growing prefix
    // of `text` timed to the audio, so a caller can render the reply
    // progressively (like a chat stream) instead of popping in all at once.
    // The TTS API doesn't return word timings, so this estimates progress
    // from audio.currentTime / audio.duration (falling back to an average
    // speech-rate estimate until the browser reports a real duration), and
    // only reveals up through the last fully-elapsed word so the text never
    // gets cut mid-word.
    async say(text, { onReveal, sessionId } = {}) {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ text, sessionId }),
      });
      if (!res.ok) {
        console.error("TTS request failed:", await res.text());
        onReveal?.(text);
        return;
      }

      const buf = await res.arrayBuffer();
      const audio = new Audio(URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" })));

      if (talk) talk.value = true;

      const wordBoundaries = [];
      let consumed = 0;
      for (const token of text.match(/\S+|\s+/g) || []) {
        consumed += token.length;
        wordBoundaries.push(consumed);
      }
      const FALLBACK_CHARS_PER_SECOND = 15; // ~150-180wpm average speech rate

      let rafId = null;
      const revealTick = () => {
        const duration =
          Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration
            : text.length / FALLBACK_CHARS_PER_SECOND;
        const targetChars = Math.min(audio.currentTime / duration, 1) * text.length;

        let shownLength = 0;
        for (const boundary of wordBoundaries) {
          if (boundary > targetChars) break;
          shownLength = boundary;
        }
        onReveal(text.slice(0, shownLength));

        if (!audio.paused && !audio.ended) {
          rafId = requestAnimationFrame(revealTick);
        }
      };

      return new Promise((resolve) => {
        // If the audio never plays for any reason — blocked by browser
        // autoplay policy, a decode/network error, or (previously) a CSP
        // media-src gap on blob: URLs — neither onplay nor onended ever
        // fires. Without a fallback, the caller's promise hangs forever:
        // revealingMessageId stays stuck and the reply's text never
        // appears, even though the chat turn itself succeeded. Treat any
        // playback failure as "show the full text immediately and move on"
        // instead of blocking the conversation on audio that isn't coming.
        const finishWithoutAudio = () => {
          if (talk) talk.value = false;
          if (rafId) cancelAnimationFrame(rafId);
          onReveal?.(text);
          resolve();
        };

        audio.onplay = () => {
          if (onReveal) rafId = requestAnimationFrame(revealTick);
        };
        audio.onended = finishWithoutAudio;
        audio.onerror = () => {
          console.error('Mascot audio playback failed:', audio.error);
          finishWithoutAudio();
        };
        audio.play().catch((playError) => {
          console.error('Mascot audio.play() rejected:', playError);
          finishWithoutAudio();
        });
      });
    },
  }));
 
  return <RiveComponent style={{ width: 240, height: 240 }} />;
});
 
export default Mascot;
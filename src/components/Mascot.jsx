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
import { supabase } from "../lib/supabaseClient";
 
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
    async say(text) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
 
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        console.error("TTS request failed:", await res.text());
        return;
      }
 
      const buf = await res.arrayBuffer();
      const audio = new Audio(URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" })));
 
      if (talk) talk.value = true;
 
      return new Promise((resolve) => {
        audio.onended = () => {
          if (talk) talk.value = false;
          resolve();
        };
        audio.play();
      });
    },
  }));
 
  return <RiveComponent style={{ width: 240, height: 240 }} />;
});
 
export default Mascot;
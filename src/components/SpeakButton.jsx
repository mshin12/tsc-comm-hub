// components/SpeakButton.jsx
// Temporary Phase-0 test component. Delete once you've confirmed /api/tts
// works end to end — this is just to de-risk the TTS call itself, same as
// the plan's "minimal client test" but wired to your real auth session
// instead of an unauthenticated fetch.
 
import { supabase } from "../lib/supabaseClient";
 
export default function SpeakButton() {
  async function speak() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
 
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ text: "Hi! I'm here to help you." }),
    });
 
    if (!res.ok) {
      console.error("TTS request failed:", await res.text());
      return;
    }
 
    const blob = await res.blob();
    new Audio(URL.createObjectURL(blob)).play();
  }
 
  return <button onClick={speak}>Speak</button>;
}
// api/tts.js
// Vercel serverless function. Deliberately mirrors the shape of api/chat.js
// (Bearer-token auth, plain (req, res) handler) rather than the Next.js
// `app/api/tts/route.ts` style from the original plan doc — this repo is
// React + Vite, not Next.js, so there's no App Router.
//
// IMPORTANT: before merging, open api/chat.js and confirm it validates the
// token the same way (same env var names, same supabase-js version). If
// chat.js does something different — e.g. an extra role check — copy that
// logic here too so the two routes can't drift apart on security.
 
import { createClient } from "@supabase/supabase-js";
 
// Reuses whatever Supabase project env vars the client already uses to
// connect (lib/supabaseClient.js). If that file reads different var names
// than these, match them here — don't add a second set of Supabase env vars.
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);
 
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
 
  // --- Auth ---
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid auth token" });
  }
  const token = authHeader.split(" ")[1];
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
 
  // --- Validate input ---
  const { text } = req.body || {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "text required" });
  }
 
  try {
    const openaiRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "alloy", // try alloy / verse / nova / shimmer, pick the warmest
        input: text,
        speed: 0.95, // slightly slower — easier to follow, per the accessibility notes
        response_format: "mp3",
      }),
    });
 
    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("OpenAI TTS error:", errText);
      return res.status(502).json({ error: "tts failed" });
    }
 
    const audioBuffer = Buffer.from(await openaiRes.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(audioBuffer);
  } catch (err) {
    console.error("TTS route error:", err);
    return res.status(500).json({ error: "internal error" });
  }
}
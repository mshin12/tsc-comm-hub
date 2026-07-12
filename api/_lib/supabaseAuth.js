// api/_lib/supabaseAuth.js
// Shared auth helper for the Vercel serverless functions under api/. Files
// under an underscore-prefixed directory are never turned into routes by
// Vercel, so this can be imported freely without becoming its own endpoint.
//
// Every AI-backed endpoint (chat, debrief, tts) needs two things: (1) proof
// the caller is a real logged-in user, and (2) proof they're allowed to act
// on the specific session they're referencing — otherwise any authenticated
// account (including the low-trust `family` role) could hit these routes
// directly with arbitrary content and run up the Anthropic/OpenAI bill with
// no ownership check at all. This file centralizes both checks so all three
// routes enforce them identically.

import { createClient } from '@supabase/supabase-js';

const anonClient = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

/**
 * Validates the bearer token and returns the authenticated user plus a
 * second client that carries the user's own JWT (not the bare anon role),
 * so any query made through it is subject to *that user's* RLS policies —
 * this is what lets assertSessionAccess below delegate to real RLS instead
 * of re-implementing the ownership rules here.
 */
export async function authenticate(token) {
  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data?.user) return null;

  const userClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  return { user: data.user, userClient };
}

/**
 * True only if the caller can actually SELECT this sessions row under RLS
 * (i.e. it's their own session, or one for an individual assigned to them).
 * Relies entirely on the sessions table's existing RLS policies as the
 * single source of truth for authorization.
 */
export async function assertSessionAccess(userClient, sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return false;

  const { data, error } = await userClient
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .maybeSingle();

  return !error && !!data;
}

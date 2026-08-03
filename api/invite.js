// Admin-only endpoint that invites a new account with an explicit role,
// closing CLAUDE.md Known Issues #1 (every invite defaulting to 'staff',
// with no way to set family/admin except a manual SQL UPDATE afterward)
// and, plausibly, #2 (a possible PKCE cross-browser invite issue — see
// note below).
//
// handle_new_user() (supabase/database_schema.sql) already reads
// raw_user_meta_data->>'role' with a fallback of 'staff' — it never needed
// to change. What was actually missing was a way to pass that metadata at
// invite time at all: Supabase Studio's "Invite user" button has no field
// for custom user_metadata, so every invite before this endpoint existed
// went through the trigger's 'staff' fallback, full stop.
//
// On #2: the suspected mechanism was that Studio's own frontend calls the
// Admin API from *its* browser session, potentially storing a PKCE
// code_verifier scoped to that session — stranding it somewhere the
// invited user's browser can never reach. This endpoint calls the same
// Admin API (auth.admin.inviteUserByEmail) but from a server-side Node
// process with no browser/localStorage involved at all, so that specific
// failure mode shouldn't be reachable here. This is a plausible fix based
// on the diagnosed mechanism, not a confirmed one — the PKCE issue was
// never confirmed to begin with (see CLAUDE.md Known Issues #2), so pilot-
// test an actual invite end-to-end before relying on this.
//
// Requires SUPABASE_SERVICE_ROLE_KEY in the environment (Vercel project
// settings — never the VITE_-prefixed anon key, and never exposed to the
// client bundle). Also requires supabase/users_role_check.sql to have been
// run first if the live `users.role` CHECK constraint doesn't already
// permit 'admin' — otherwise an admin invite fails at handle_new_user()'s
// INSERT.

import { createClient } from '@supabase/supabase-js';
import { authenticateAdmin } from './_lib/supabaseAuth.js';

const VALID_ROLES = ['staff', 'family', 'admin'];
const VALID_LANGUAGES = ['en', 'ko'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FULL_NAME_LENGTH = 200;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token.' });
  }

  const admin = await authenticateAdmin(token);
  if (!admin) {
    return res.status(403).json({ error: 'Only admins can invite new accounts.' });
  }

  const { email, role, fullName, preferredLanguage } = req.body || {};

  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: '"role" must be one of: ' + VALID_ROLES.join(', ') });
  }

  if (
    fullName !== undefined &&
    fullName !== null &&
    (typeof fullName !== 'string' || fullName.length > MAX_FULL_NAME_LENGTH)
  ) {
    return res.status(400).json({ error: '"fullName" is invalid.' });
  }

  if (
    preferredLanguage !== undefined &&
    preferredLanguage !== null &&
    !VALID_LANGUAGES.includes(preferredLanguage)
  ) {
    return res.status(400).json({ error: '"preferredLanguage" must be one of: ' + VALID_LANGUAGES.join(', ') });
  }

  // Meaningless for staff/admin (they never get a way to change it, and
  // never see Korean anywhere) — force 'en' regardless of what was sent,
  // rather than trusting the client to only send 'ko' alongside role:
  // 'family'. See CLAUDE.md Known Issues #13.
  const safePreferredLanguage = role === 'family' && preferredLanguage === 'ko' ? 'ko' : 'en';

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
    return res.status(500).json({
      error: 'Invitations are not configured on the server. Please contact an administrator.',
    });
  }

  const serviceClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const trimmedFullName = typeof fullName === 'string' ? fullName.trim() : '';

  try {
    const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(email.trim(), {
      data: {
        role,
        preferred_language: safePreferredLanguage,
        ...(trimmedFullName ? { full_name: trimmedFullName } : {}),
      },
    });

    if (error) {
      const alreadyExists = /already registered|already exists/i.test(error.message || '');
      return res.status(alreadyExists ? 409 : 500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, userId: data.user.id });
  } catch (error) {
    console.error('Invite error:', error);
    return res.status(500).json({ error: 'Failed to send the invitation. Please try again.' });
  }
}

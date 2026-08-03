import { supabase } from './supabaseClient';

/**
 * fetchFamilyLanguage(individualId) — the preferred_language ('en'/'ko') of
 * the family account linked to this individual, if any.
 *
 * Used by staff-side debrief call sites (Session.jsx, SessionLog.jsx's
 * manual "Generate summary" fallback) so a Korean-preferring family's
 * session summary comes out in Korean even for a session staff themselves
 * ran entirely in English — see supabase/family_language_preference.sql
 * for the RLS policy this depends on ("users: staff read linked family").
 * FamilySession.jsx doesn't need this: a family member debriefing their
 * own session already has their own preferred_language via useAuth().
 *
 * Two separate selects (individuals -> users), each covered by its own
 * existing/new RLS policy, rather than a single joined query — matches how
 * a plain supabase-js client naturally works, same shape as
 * lib/recentFocus.js. Selects only the one column each step needs, never
 * select('*'). Never throws — fails open to 'en', same discipline as
 * fetchRecentSuggestedFocus() failing open to ''. Failing open to English
 * (rather than, say, blocking the debrief) is deliberate: a missing/
 * unreadable language preference should never be the reason a session
 * summary doesn't get generated at all.
 */
export async function fetchFamilyLanguage(individualId) {
  if (!individualId) return 'en';

  try {
    const { data: individualRow } = await supabase
      .from('individuals')
      .select('family_user_id')
      .eq('id', individualId)
      .maybeSingle();

    if (!individualRow?.family_user_id) return 'en';

    const { data: familyUserRow } = await supabase
      .from('users')
      .select('preferred_language')
      .eq('id', individualRow.family_user_id)
      .maybeSingle();

    return familyUserRow?.preferred_language === 'ko' ? 'ko' : 'en';
  } catch {
    return 'en';
  }
}

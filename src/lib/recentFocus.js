import { supabase } from './supabaseClient';

/**
 * fetchRecentSuggestedFocus
 *
 * Looks up the most recent non-empty `suggested_focus` for an individual,
 * across ALL their sessions regardless of `conducted_by` — a staff-
 * identified focus area should carry forward even if the individual's most
 * recent session was a family self-practice one. Ordered by `session_date`,
 * matching the ordering already treated as canonical everywhere else in
 * this codebase (StaffDashboard.jsx, IndividualProfile.jsx, AllSessions.jsx).
 *
 * Deliberately selects ONLY `suggested_focus` (plus `session_date` for
 * ordering) rather than `select('*')` or any wider column set. RLS on
 * `sessions` is row-scoped, not column-scoped for SELECT — a family
 * account can already read this row via "sessions: family read own" /
 * "sessions: family read linked individual" (this helper is called from
 * FamilySession.jsx as well as Session.jsx), and that row also holds
 * went_well/challenge_noted/staff_notes. Asking for only the one column
 * this feature actually needs keeps that existing row-level permissiveness
 * from turning into an actual column-level exposure — see
 * supabase/sessions_suggested_focus.sql for the full reasoning.
 *
 * Never throws — a failure to fetch a recommendation shouldn't block
 * starting a new session. Returns '' on any error, missing individualId,
 * or when no session has a suggested_focus yet (e.g. the individual's
 * first session).
 */
export async function fetchRecentSuggestedFocus(individualId) {
  if (!individualId) return '';

  const { data, error } = await supabase
    .from('sessions')
    .select('suggested_focus')
    .eq('individual_id', individualId)
    .not('suggested_focus', 'is', null)
    .neq('suggested_focus', '')
    .order('session_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return '';
  return data.suggested_focus || '';
}

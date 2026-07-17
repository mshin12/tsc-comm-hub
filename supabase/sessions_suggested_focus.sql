-- Adds a next-session recommendation loop: staff debrief already captures
-- went_well/challenge_noted/goal_moment after a session — this extends it
-- to also produce a short forward-looking suggestion (suggested_focus),
-- which future sessions for that individual draw on when assembling the
-- prompt (see lib/assemblePrompt.js's new [RECENT_FOCUS] placeholder).

-- 1. Nullable column, applies to the sessions table regardless of
--    conducted_by — but only staff-mode debrief (api/debrief.js's
--    log_session_analysis tool) ever populates it. Family self-practice
--    debrief (log_family_summary / mode: 'family_summary_only') never
--    references this column at all.
alter table public.sessions
  add column if not exists suggested_focus text;

-- 2. No family-specific RLS/trigger changes needed — verified, not just
--    assumed:
--
--    - enforce_family_session_column_restrictions() (defined in
--      supabase/family_session_column_lock.sql) already raises an
--      exception on any family-role UPDATE that touches a column other
--      than transcript/family_summary. suggested_focus is not on that
--      allow-list, so it's already unreachable via UPDATE for family
--      accounts. That trigger function is NOT modified by this file.
--
--    - sessions_family_view (supabase/sessions_family_view_security_invoker.sql)
--      explicitly selects only (id, individual_id, session_date,
--      scenario_used, family_summary) — a hand-picked column list, not
--      `select *` — so suggested_focus stays excluded from FamilyView.jsx
--      automatically. That view is NOT modified by this file.
--
--    - Existing SELECT RLS policies on sessions are row-scoped only; no
--      column-level SELECT restriction exists for ANY role today (column
--      restriction only ever applies to UPDATE, via the trigger above).
--      This means "sessions: family read own" / "sessions: family read
--      linked individual" already let a family account SELECT
--      suggested_focus directly from the base `sessions` table for their
--      own linked individual — same as they technically already could for
--      went_well/challenge_noted/staff_notes, if a query asked for them.
--      That's not a new gap this file introduces; it's the existing
--      row-vs-column RLS shape in this project (see Known Issues in
--      CLAUDE.md). The mitigation is at the QUERY level, not RLS: the new
--      lib/recentFocus.js helper this feature adds selects only
--      `suggested_focus` (plus session_date for ordering) explicitly —
--      never `select('*')` — so it doesn't hand family a route to
--      went_well/challenge_noted/staff_notes even though the row-level
--      policy would technically permit it. This mirrors how
--      sessions_family_view enforces its own column boundary for
--      FamilyView.jsx's separate read path.

-- ============================================================
-- Verify
-- ============================================================

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'sessions' and column_name = 'suggested_focus';

-- ============================================================
-- Diagnostic — run this FIRST if the reporting query below ever errors
-- with "column audience does not exist". prompts.audience is supposed to
-- already exist (added by supabase/family_sessions.sql, documented in
-- CLAUDE.md as applied) — FamilySession.jsx's own query
-- (.eq('audience', 'family')) depends on it directly and would fail the
-- same way. If this returns no rows in whatever project you're pointed
-- at, that's a bigger problem than this reporting query: the entire
-- family self-practice feature is broken there too, and
-- supabase/family_sessions.sql (still in this repo) needs to be (re-)run
-- before anything else.
-- ============================================================

select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'prompts' and column_name = 'audience';

-- ============================================================
-- Reporting query (read-only, run separately) — per CLAUDE.md's
-- prompt-authoring convention and the precedent set by [AAC_GUIDANCE]
-- (Known Issue #9), this does NOT auto-edit any prompts row.
-- prompts.system_prompt is hand-authored, bespoke prose per
-- (tier, scenario, audience) triple — this only lists which active rows
-- don't yet reference [RECENT_FOCUS], so a human decides where (if
-- anywhere) to hand-insert the token into each one.
--
-- audience is read via to_jsonb(p) ->> 'audience' rather than a plain
-- column reference so this degrades gracefully (audience simply shows as
-- null) instead of hard-failing with "column does not exist" if
-- family_sessions.sql turns out not to be applied here — see the
-- diagnostic above to find out which case you're in.
-- ============================================================

select
  p.tier,
  p.scenario_name,
  to_jsonb(p) ->> 'audience' as audience
from public.prompts p
where p.is_active = true
  and p.system_prompt not ilike '%[RECENT_FOCUS]%'
order by audience, p.tier, p.scenario_name;

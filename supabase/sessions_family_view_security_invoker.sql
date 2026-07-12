-- Fixes a severe gap: sessions_family_view was created in an earlier
-- session directly against the Supabase project, and its definition isn't
-- in this repo. Postgres views run with the VIEW OWNER's privileges by
-- default (not the querying user's) and do NOT automatically enforce RLS
-- from their underlying tables unless `security_invoker = true` is set —
-- this is a well-known Supabase footgun.
--
-- Concretely: FamilyView.jsx queries this view filtered by
-- `.eq('individual_id', individualData.id)`, but that filter is supplied by
-- the client, not enforced by the database. If the view predates
-- security_invoker being set (or was created by a role that bypasses RLS),
-- any family-role account could edit that request client-side (e.g. via the
-- browser network tab) to pass a *different* individual_id and read another
-- family's session summaries — a cross-account data leak.
--
-- Run Step 1 first (read-only) to see today's definition before you
-- overwrite anything. Only run Step 2 after confirming the column list
-- below still matches what Step 1 shows (add any missing columns before
-- running the CREATE).

-- ============================================================
-- STEP 1 — Inspect what exists today. Run this first.
-- ============================================================

select pg_get_viewdef('public.sessions_family_view'::regclass, true) as current_definition;

-- relrowsecurity/relforcerowsecurity (an earlier version of this query
-- checked these) only apply to TABLES — they track whether
-- `ENABLE ROW LEVEL SECURITY` was run. A view always reads false there
-- regardless of security_invoker, so that check was a red herring and
-- tells us nothing about whether this view is currently safe.
--
-- What actually matters is security_invoker, which lives in the view's
-- reloptions. If this returns no rows, security_invoker is NOT set (the
-- default), meaning the view runs with its owner's privileges and does
-- NOT enforce the querying user's RLS policies — i.e. it is currently
-- exposed exactly as described above, regardless of what the RLS check
-- showed.
select
  c.relname,
  o.option_name,
  o.option_value
from pg_class c
cross join lateral pg_options_to_table(c.reloptions) o
where c.relname = 'sessions_family_view';

-- If pg_get_viewdef's output has MORE columns than the CREATE VIEW below
-- (id, individual_id, session_date, scenario_used, family_summary — the
-- only columns FamilyView.jsx actually selects), add the missing ones to
-- Step 2 before running it, so you don't remove functionality other code
-- may depend on.

-- ============================================================
-- STEP 2 — Recreate with security_invoker = true. Run after Step 1.
-- ============================================================

drop view if exists public.sessions_family_view;

create view public.sessions_family_view
with (security_invoker = true)
as
select
  id,
  individual_id,
  session_date,
  scenario_used,
  family_summary
from public.sessions;

-- security_invoker = true makes every query against this view subject to
-- the QUERYING USER's own RLS policies on the underlying sessions table —
-- in particular "sessions: family read own" (family_user_id = auth.uid()),
-- "staff read", etc. — instead of the view owner's privileges. Nothing
-- else needs to change: the view now automatically shows each caller only
-- what they could already see directly from public.sessions.

grant select on public.sessions_family_view to authenticated;

-- ============================================================
-- STEP 3 — Verify. Run these checks after Step 2.
-- ============================================================

-- Should now return one row: option_name = security_invoker, option_value = true.
select
  c.relname,
  o.option_name,
  o.option_value
from pg_class c
cross join lateral pg_options_to_table(c.reloptions) o
where c.relname = 'sessions_family_view';

-- Manual test (do this in the app, not SQL): log in as a family-role test
-- account and confirm /family only ever shows sessions for the individual
-- linked via that account's family_user_id — even if you tamper with the
-- individual_id in a replayed network request from devtools.

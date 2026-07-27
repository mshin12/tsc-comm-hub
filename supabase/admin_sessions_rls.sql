-- Commits the admin-scoped `sessions` RLS policy that currently only exists
-- live in Supabase (CLAUDE.md Known Issues #7) — every other RLS change in
-- this project has a matching supabase/*.sql file for reproducibility
-- (fresh environments, disaster recovery, code review); this was the one
-- exception. Run this in the Supabase SQL editor. Safe to run more than
-- once (idempotent via drop-if-exists).

-- Mirrors admin_individual_edit.sql's admin policies on `individuals`:
-- admin gets SELECT/INSERT/UPDATE only, not ALL — the app's UI doesn't
-- expose session deletion anywhere, so DELETE stays ungranted. Unrestricted
-- to any row (no assigned_staff/family_user_id filter), matching the
-- "All Individuals" admin-bypass behavior already relied on elsewhere in
-- the app (StaffDashboard.jsx, IndividualProfile.jsx).

drop policy if exists "sessions: admin read" on public.sessions;
create policy "sessions: admin read"
on public.sessions
for select
to authenticated
using (get_my_role() = 'admin');

drop policy if exists "sessions: admin insert" on public.sessions;
create policy "sessions: admin insert"
on public.sessions
for insert
to authenticated
with check (get_my_role() = 'admin');

drop policy if exists "sessions: admin update" on public.sessions;
create policy "sessions: admin update"
on public.sessions
for update
to authenticated
using (get_my_role() = 'admin')
with check (get_my_role() = 'admin');

-- ============================================================
-- Verify — replace the UUID with a real admin test account and any
-- session's UUID belonging to a *different* staff member's individual.
-- ============================================================

begin;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<admin-test-account-uuid>', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- Should succeed (admin can read any session, not just their own):
select id, individual_id, staff_id from sessions where id = '<any-session-uuid-not-owned-by-this-admin>';

rollback;

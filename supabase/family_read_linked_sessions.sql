-- Fixes a regression surfaced by correctly enabling security_invoker on
-- sessions_family_view (see sessions_family_view_security_invoker.sql).
--
-- The only family-facing SELECT policy on public.sessions today is
-- "sessions: family read own" (family_sessions.sql), scoped to
-- family_user_id = auth.uid() — i.e. only sessions a family member
-- conducted themselves via the newer "family practice" feature.
-- Staff-conducted sessions (family_user_id is NULL) were never covered by
-- any RLS policy; the family view only ever showed them because the view
-- used to bypass RLS entirely (the bug just fixed). This adds the missing
-- policy so family accounts can once again read ANY session for their own
-- linked individual — staff-conducted or family-conducted — while
-- sessions_family_view's column allowlist (id, individual_id, session_date,
-- scenario_used, family_summary) still keeps went_well/challenge_noted/
-- staff_notes hidden from them either way.
--
-- Additive: Postgres OR's together multiple policies for the same command,
-- so this only expands what family can read — it does not touch or narrow
-- "sessions: family read own".

drop policy if exists "sessions: family read linked individual" on public.sessions;
create policy "sessions: family read linked individual"
on public.sessions
for select
to authenticated
using (
  get_my_role() = 'family'
  and individual_id in (
    select id from public.individuals where family_user_id = auth.uid()
  )
);

-- ============================================================
-- Verify — run as the actual authenticated family user, not as the SQL
-- editor's default postgres/superuser role (which bypasses RLS and would
-- show you a false pass regardless of whether this policy exists).
-- ============================================================

-- Impersonates a specific user's RLS context inside a transaction that gets
-- rolled back, so nothing changes. Replace the two UUIDs below with a real
-- family test account's auth.users id and an individual_id you expect them
-- to see a session for.
begin;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<family-test-account-uuid>', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- Should now return rows for sessions belonging to this family account's
-- own linked individual, including ones with family_user_id IS NULL
-- (staff-conducted):
select * from sessions_family_view;

-- Should return ZERO rows — proves isolation still holds for an individual
-- this family account is NOT linked to:
select * from sessions_family_view where individual_id = '<a-different-individuals-uuid>';

rollback;

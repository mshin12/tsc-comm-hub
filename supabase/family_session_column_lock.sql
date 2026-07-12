-- Closes High-risk item #4 from the security review: the "sessions: family
-- update own" policy (family_sessions.sql) correctly scopes UPDATE to a
-- family account's own session rows (family_user_id = auth.uid()), but
-- places no restriction on which COLUMNS can change. The app only ever
-- writes `transcript` (every chat turn) and `family_summary` (post-session
-- debrief) from FamilySession.jsx — but nothing at the database level stops
-- a family account from using the Supabase client directly (e.g. via
-- devtools) to overwrite staff_notes, went_well, challenge_noted,
-- goal_moment, scenario_used, tier_used, session_date, individual_id,
-- staff_id, conducted_by, or family_user_id on their own row, fabricating
-- clinical-looking content staff might later trust, or reassigning the
-- session to a different individual.
--
-- This mirrors the existing pattern in admin_individual_edit.sql (the
-- personal-info-columns-are-admin-only trigger on `individuals`): RLS scopes
-- WHICH ROWS, this trigger scopes WHICH COLUMNS, for the one role where the
-- gap actually matters (family — the lowest-trust role with write access at
-- all). Staff/admin are unaffected; get_my_role() <> 'family' always
-- short-circuits past every check below.

create or replace function public.enforce_family_session_column_restrictions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if get_my_role() = 'family' then
    if new.id is distinct from old.id
      or new.individual_id is distinct from old.individual_id
      or new.staff_id is distinct from old.staff_id
      or new.family_user_id is distinct from old.family_user_id
      or new.conducted_by is distinct from old.conducted_by
      or new.session_date is distinct from old.session_date
      or new.tier_used is distinct from old.tier_used
      or new.scenario_used is distinct from old.scenario_used
      or new.went_well is distinct from old.went_well
      or new.challenge_noted is distinct from old.challenge_noted
      or new.goal_moment is distinct from old.goal_moment
      or new.staff_notes is distinct from old.staff_notes
      or new.session_length is distinct from old.session_length
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Family accounts may only update transcript and family_summary on their own sessions.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_family_column_restrictions on public.sessions;
create trigger sessions_family_column_restrictions
before update on public.sessions
for each row
execute function public.enforce_family_session_column_restrictions();

-- ============================================================
-- Verify — same impersonation pattern as before. Replace the UUIDs with a
-- real family test account and one of their own family-conducted sessions.
-- ============================================================

begin;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<family-test-account-uuid>', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- Should succeed (allowed columns):
update sessions
set family_summary = 'test update — should succeed'
where id = '<a-family-conducted-session-uuid>';

-- Should raise the exception above (blocked column):
update sessions
set staff_notes = 'test update — should be rejected'
where id = '<a-family-conducted-session-uuid>';

rollback;

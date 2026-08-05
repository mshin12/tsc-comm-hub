-- Fixes a real bug in the first pass of Korean-language support: generating
-- family_summary directly in the family account's language AT DEBRIEF TIME
-- (the old approach, in api/debrief.js) only ever reflects whatever that
-- account's preference was at that exact moment. If a family switches from
-- English to Korean later, or a session predates this feature entirely, the
-- stored text never updates — the toggle visibly changes the rest of the
-- interface but not past summaries, which is exactly the bug report this
-- file fixes.
--
-- New approach: every debrief now generates BOTH languages in the same
-- single tool call (see api/debrief.js) and stores both. The family-facing
-- display (FamilyView.jsx) then picks whichever one matches the CURRENT
-- toggle state, live, with no extra lookups or API calls. Switching the
-- toggle now instantly re-renders existing history correctly.
--
-- Run this in the Supabase SQL editor. Safe to run more than once.

-- 1. The cached Korean translation, alongside the existing English
--    family_summary. Nullable — older sessions (generated before this file
--    existed) simply won't have one; FamilyView.jsx falls back to the
--    English family_summary in that case rather than showing nothing.
alter table public.sessions
  add column if not exists family_summary_ko text;

-- 2. sessions_family_view needs to expose it too, or FamilyView.jsx has no
--    way to read it under RLS. Recreated the same way
--    sessions_family_view_security_invoker.sql already did (security_invoker
--    = true preserved) — just with one more column in the select list.
drop view if exists public.sessions_family_view;

create view public.sessions_family_view
with (security_invoker = true)
as
select
  id,
  individual_id,
  session_date,
  scenario_used,
  family_summary,
  family_summary_ko
from public.sessions;

grant select on public.sessions_family_view to authenticated;

-- 3. enforce_family_session_column_restrictions() (family_session_column_lock.sql)
--    locks family-role UPDATEs to an explicit allowlist of columns
--    (transcript, family_summary). FamilySession.jsx's own debrief write
--    now also needs to set family_summary_ko on a family-conducted
--    session's row — without this, that trigger raises and blocks it.
--    CREATE OR REPLACE, not editing family_session_column_lock.sql
--    directly — same convention individuals_aac_flag.sql established.
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
      raise exception 'Family accounts may only update transcript, family_summary, and family_summary_ko on their own sessions.';
    end if;
  end if;
  return new;
end;
$$;

-- Trigger itself is unchanged (still points at the same function name), but
-- re-run for clarity/idempotency in case this file is ever run standalone.
drop trigger if exists sessions_family_column_restrictions on public.sessions;
create trigger sessions_family_column_restrictions
before update on public.sessions
for each row
execute function public.enforce_family_session_column_restrictions();

-- Staff/admin write access needs no changes — "staff full access" and
-- "sessions: admin update" are already unrestricted by column.

-- ============================================================
-- Verify
-- ============================================================

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'sessions' and column_name = 'family_summary_ko';

-- Impersonation check — replace UUIDs with a real family test account and
-- one of their own family-conducted sessions.
begin;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<family-test-account-uuid>', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- Should succeed (now an allowed column):
update sessions
set family_summary_ko = '테스트 업데이트 — 성공해야 합니다'
where id = '<a-family-conducted-session-uuid>';

-- Should still raise (still a blocked column):
update sessions
set staff_notes = 'test update — should be rejected'
where id = '<a-family-conducted-session-uuid>';

rollback;

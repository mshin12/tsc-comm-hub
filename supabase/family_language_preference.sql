-- Adds Korean-language support for family accounts (CLAUDE.md Known Issues
-- #13). Deliberately scoped to family accounts only, not a general
-- multi-language rollout: staff/admin always work in English, regardless
-- of what any linked family account prefers. Run this in the Supabase SQL
-- editor. Safe to run more than once (idempotent via drop-if-exists /
-- add-if-not-exists).

-- 1. The preference itself. Lives on public.users (not individuals) since
--    this is about which account is logged in and reading the interface —
--    same reasoning CLAUDE.md's Known Issues #13 already gave for the
--    "UI language" axis. A family account with exactly one linked
--    individual (the only shape this app supports today — every family
--    query already assumes .single()) also uses this same flag to decide
--    what language to converse in during self-practice sessions, collapsing
--    the doc's two originally-separate axes into one for the family-only
--    case this feature actually covers.
alter table public.users
  add column if not exists preferred_language text not null default 'en';

alter table public.users drop constraint if exists users_preferred_language_check;
alter table public.users add constraint users_preferred_language_check
  check (preferred_language in ('en', 'ko'));

-- 2. Let an invite set this at invite time too (api/invite.js, family role
--    only), the same way role/full_name already flow through
--    raw_user_meta_data. CREATE OR REPLACE, not editing database_schema.sql
--    directly — same convention individuals_aac_flag.sql already
--    established for enforce_admin_only_personal_info_edits().
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.users (id, full_name, role, preferred_language)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'full_name', ''),
        coalesce(new.raw_user_meta_data->>'role', 'staff'),
        coalesce(new.raw_user_meta_data->>'preferred_language', 'en')
    );
    return new;
end;
$$;

-- 3. No new policy needed for a family account to read/change its OWN
--    preference — "users: read own" / "users: update own"
--    (database_schema.sql) already permit that unrestricted, with no
--    column lock, so the self-service toggle in FamilyView.jsx needs
--    nothing further here.
--
-- Superseded, dropped rather than left in place: an earlier version of this
-- file added "users: staff read linked family" so staff could look up a
-- linked family account's preference at debrief time and generate
-- family_summary directly in that language. That design had a real bug —
-- if the family changed their preference AFTER a summary was already
-- generated (or the summary predated this feature entirely), the stored
-- text never updated, since generation only ever happened once. Replaced
-- by supabase/sessions_family_summary_translation.sql's approach instead:
-- every debrief now generates BOTH languages up front regardless of
-- current preference, and the family-facing display picks whichever one
-- matches the current toggle. Staff no longer need to read anything off a
-- family account's row at all, so this policy is removed rather than left
-- around unused.
drop policy if exists "users: staff read linked family" on public.users;

-- ============================================================
-- Verify
-- ============================================================

select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'users' and column_name = 'preferred_language';

-- Confirms the superseded policy is actually gone — should return zero rows.
select policyname from pg_policies
where schemaname = 'public' and tablename = 'users' and policyname = 'users: staff read linked family';

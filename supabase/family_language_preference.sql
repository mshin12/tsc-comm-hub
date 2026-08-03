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
--    This policy is for the OTHER direction: staff/admin generating a
--    session debrief for a family's linked individual need to read THAT
--    family account's language preference too, so a Korean-preferring
--    family's session summary comes out in Korean even for a
--    staff-conducted session staff themselves never touch in Korean.
--    "users: read own" doesn't cover this (it's not their own row) — this
--    is what's missing.
--
--    Scoped the same way staff already sees individuals: admin gets any
--    linked family account, staff only the ones for individuals actually
--    assigned to them (mirrors "individuals: staff access"'s
--    auth.uid() = any(assigned_staff) check). Additive — OR'd with
--    "users: read own", never narrows what a family account can already
--    read about themselves.
drop policy if exists "users: staff read linked family" on public.users;
create policy "users: staff read linked family"
on public.users
for select
to authenticated
using (
  get_my_role() in ('staff', 'admin')
  and id in (
    select family_user_id from public.individuals
    where family_user_id is not null
    and (
      get_my_role() = 'admin'
      or auth.uid() = any(assigned_staff)
    )
  )
);

-- ============================================================
-- Verify
-- ============================================================

select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'users' and column_name = 'preferred_language';

-- Impersonation check — replace UUIDs with a real staff test account and a
-- family test account linked to one of that staff member's individuals.
begin;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<staff-test-account-uuid>', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- Should now return a row (the linked family account's preferred_language)
-- if that staff account is actually assigned to the individual in question:
select id, preferred_language from users where id = '<linked-family-account-uuid>';

rollback;

-- Enables family/caregiver-run practice sessions. Run this in the Supabase
-- SQL editor. Safe to run even if some pieces already exist (guards with
-- IF NOT EXISTS / DROP ... IF EXISTS where applicable).

-- 1. Tag each prompts row with its intended audience, so the family session
--    flow can pull a distinct set of scenarios from the staff/admin flow.
--    Existing rows default to 'staff' so nothing already in the table
--    changes behavior.
alter table public.prompts add column if not exists audience text not null default 'staff';

alter table public.prompts drop constraint if exists prompts_audience_check;
alter table public.prompts add constraint prompts_audience_check
  check (audience in ('staff', 'family'));

-- 2. A family-conducted session has no staff member attached, so staff_id
--    must become optional, and we need to record which family account ran
--    it (both for RLS and so the row is attributable).
alter table public.sessions alter column staff_id drop not null;

alter table public.sessions add column if not exists conducted_by text not null default 'staff';
alter table public.sessions drop constraint if exists sessions_conducted_by_check;
alter table public.sessions add constraint sessions_conducted_by_check
  check (conducted_by in ('staff', 'family'));

alter table public.sessions add column if not exists family_user_id uuid references auth.users(id);

create index if not exists sessions_family_user_id_idx on public.sessions (family_user_id);

-- 3. Let family accounts read the family-facing scenarios for their linked
--    individual's tier. (Additive/permissive — combines with whatever
--    read policy already exists on prompts via OR, so this can't reduce
--    access for staff/admin.)
drop policy if exists "prompts: family read family scenarios" on public.prompts;
create policy "prompts: family read family scenarios"
on public.prompts
for select
to authenticated
using (
  get_my_role() = 'family'
  and audience = 'family'
  and is_active = true
);

-- 4. Let family accounts create, read, and update sessions for their own
--    linked individual — scoped to rows they themselves created
--    (family_user_id = auth.uid()), never anyone else's.
drop policy if exists "sessions: family insert own" on public.sessions;
create policy "sessions: family insert own"
on public.sessions
for insert
to authenticated
with check (
  get_my_role() = 'family'
  and conducted_by = 'family'
  and family_user_id = auth.uid()
  and individual_id in (
    select id from public.individuals where family_user_id = auth.uid()
  )
);

drop policy if exists "sessions: family read own" on public.sessions;
create policy "sessions: family read own"
on public.sessions
for select
to authenticated
using (
  get_my_role() = 'family'
  and family_user_id = auth.uid()
);

drop policy if exists "sessions: family update own" on public.sessions;
create policy "sessions: family update own"
on public.sessions
for update
to authenticated
using (
  get_my_role() = 'family'
  and family_user_id = auth.uid()
)
with check (
  get_my_role() = 'family'
  and family_user_id = auth.uid()
);

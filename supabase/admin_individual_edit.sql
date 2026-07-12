-- Lets admin accounts view and edit an individual's personal-info fields
-- (goals, interests, vocabulary_notes, triggers_notes, aac_system) from
-- within the app, while keeping that specific editing capability out of
-- staff's and family's hands. Run this in the Supabase SQL editor. Safe to
-- run more than once (idempotent via drop-if-exists / create-or-replace).

-- 1. Admin currently has no RLS policy on individuals at all (see CLAUDE.md
--    "Known Issues" — the app's admin-bypass UI already assumes this exists
--    but it was never applied). Without this, an admin opening any
--    individual not already in their own assigned_staff array — which is
--    the normal case, since admins aren't usually assigned individuals —
--    would fail to load the profile at all, let alone save an edit.
--    Scoped to SELECT/UPDATE only (not ALL), since the app doesn't need
--    admin to insert or delete individuals through this feature.
drop policy if exists "individuals: admin read" on public.individuals;
create policy "individuals: admin read"
on public.individuals
for select
to authenticated
using (get_my_role() = 'admin');

drop policy if exists "individuals: admin update" on public.individuals;
create policy "individuals: admin update"
on public.individuals
for update
to authenticated
using (get_my_role() = 'admin')
with check (get_my_role() = 'admin');

-- 2. Staff already have a pre-existing "staff access" ALL policy on
--    individuals (scoped to their assigned_staff rows), which technically
--    permits them to update any column, including these personal-info
--    fields, if they called the update directly rather than through the
--    app's UI. Hiding the edit form from staff in the UI alone wouldn't
--    stop that. This trigger blocks changes to the personal-info columns
--    from any role but admin, regardless of which RLS policy allowed the
--    underlying row-level update through — the real enforcement boundary
--    the app's "should not be extended to staff and family" requirement
--    needs. Family has no update policy on individuals at all today, so
--    this trigger is a defense-in-depth backstop for them, not a fix for
--    an existing hole.
create or replace function public.enforce_admin_only_personal_info_edits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if get_my_role() <> 'admin' then
    if new.goals is distinct from old.goals
      or new.interests is distinct from old.interests
      or new.vocabulary_notes is distinct from old.vocabulary_notes
      or new.triggers_notes is distinct from old.triggers_notes
      or new.aac_system is distinct from old.aac_system
    then
      raise exception 'Only admins can edit an individual''s personal information.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists individuals_admin_only_personal_info on public.individuals;
create trigger individuals_admin_only_personal_info
before update on public.individuals
for each row
execute function public.enforce_admin_only_personal_info_edits();

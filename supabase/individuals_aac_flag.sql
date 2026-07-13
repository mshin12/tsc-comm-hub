-- Scoped-down AAC support: a single uses_aac flag + a single guidance block
-- injected into prompt assembly (src/lib/assemblePrompt.js). Deliberately
-- NOT the multi-modality version (device_symbol/core_board/
-- partner_assisted_scanning) — that's an explicit later decision.

-- 1. uses_aac is a plain nullable boolean, independent of the existing
--    aac_system text column (which stays exactly as-is: free-text
--    device/system name for staff reference, not touched by this file).
--      true  -> this individual uses AAC; assemblePrompt injects AAC_GUIDANCE
--      false -> explicitly confirmed this individual does NOT use AAC
--      null  -> unspecified / not yet reviewed (the default) — this is
--               NOT the same as false, and nothing in the app should ever
--               treat null as "no."
alter table public.individuals
  add column if not exists uses_aac boolean;

-- 2. Lock uses_aac to admin-only edits, exactly like the other personal-info
--    columns already covered by enforce_admin_only_personal_info_edits()
--    (originally created in supabase/admin_individual_edit.sql, which is
--    already applied). That file is not being edited — CREATE OR REPLACE
--    here updates the function body in place; the existing
--    individuals_admin_only_personal_info trigger already points at this
--    function by name, so it picks up the new check automatically without
--    needing to be recreated itself.
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
      or new.uses_aac is distinct from old.uses_aac
    then
      raise exception 'Only admins can edit an individual''s personal information.';
    end if;
  end if;
  return new;
end;
$$;

-- ============================================================
-- Verify — confirm the column and the trigger's new column list.
-- ============================================================

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'individuals' and column_name = 'uses_aac';

select pg_get_functiondef('public.enforce_admin_only_personal_info_edits'::regproc);

-- ============================================================
-- Reporting query (read-only, run separately) — per CLAUDE.md's
-- prompt-authoring convention (Section 5, #9), prompts.system_prompt is
-- hand-authored prose per (tier, scenario, audience) triple, so this does
-- NOT auto-edit any row. It only lists which active prompts don't yet
-- reference [AAC_GUIDANCE], so a human can decide where — if anywhere —
-- to hand-insert the token into each one.
-- ============================================================

select tier, scenario_name, audience
from public.prompts
where is_active = true
  and system_prompt not ilike '%[AAC_GUIDANCE]%'
order by audience, tier, scenario_name;

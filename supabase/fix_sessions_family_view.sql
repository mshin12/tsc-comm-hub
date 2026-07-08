-- Fixes sessions_family_view, which was missing scenario_used (the column
-- FamilyView.jsx actually queries) and was leaking went_well/goal_moment —
-- staff-only clinical fields that were never supposed to reach the family
-- view. Run this in the Supabase SQL editor.
--
-- CREATE OR REPLACE VIEW can only append columns, not remove/reorder them,
-- so this drops and recreates the view. Dropping a view also drops its
-- grants, so those are re-applied at the end.

drop view if exists public.sessions_family_view;

create view public.sessions_family_view as
select
  s.id,
  s.individual_id,
  s.session_date,
  s.scenario_used,
  s.family_summary
from sessions s
join individuals i on i.id = s.individual_id
where i.family_user_id = auth.uid();

grant select on public.sessions_family_view to authenticated;

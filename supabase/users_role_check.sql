-- Widens public.users.role's CHECK constraint to include 'admin'.
--
-- supabase/database_schema.sql (the original foundational schema, added to
-- this repo later as a historical snapshot) still defines it as
-- `role TEXT NOT NULL CHECK (role IN ('staff', 'family'))` — no committed
-- file in this repo ever adds 'admin' to it, even though admin has been a
-- real, working role throughout this project (get_my_role() checks for it,
-- RLS policies branch on it, StaffDashboard.jsx has an admin bypass). It
-- must have been altered directly in Supabase at some point, the same
-- pattern as the uncommitted admin `sessions` RLS policy (see
-- supabase/admin_sessions_rls.sql) — undocumented, but not necessarily
-- wrong; this file just makes it reproducible.
--
-- This is a hard prerequisite for supabase/../api/invite.js: that endpoint
-- lets an admin invite a new account with role = 'admin' directly, which
-- flows through handle_new_user() (database_schema.sql) into an INSERT on
-- this table — if the live constraint really were still 'staff'/'family'
-- only, every admin invite would fail at that INSERT. Run this in the
-- Supabase SQL editor. Idempotent (drop-if-exists / add).

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('staff', 'family', 'admin'));

-- ============================================================
-- Verify
-- ============================================================

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.users'::regclass and contype = 'c';

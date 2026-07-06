-- Audit trail for sensitive actions (session started, session logged,
-- family view accessed). Run this manually in the Supabase SQL editor —
-- it is not applied automatically by the app.
--
-- This is intentionally a separate, append-only table rather than
-- relying on Postgres statement logging, so staff/admin can query "who
-- looked at what, and when" from within the product later if needed.

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,
  table_name text,
  record_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

-- Any authenticated user may write an audit entry, but only attributed to themselves.
create policy "audit_log_insert_own" on public.audit_log
  for insert
  with check (actor_id = auth.uid());

-- Only admins may read the audit trail. If you already have a SECURITY
-- DEFINER role-check helper (CLAUDE.md mentions one used elsewhere to
-- avoid RLS recursion on public.users), swap the subquery below for it.
create policy "audit_log_select_admin" on public.audit_log
  for select
  using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role = 'admin'
    )
  );

-- No update/delete policies are defined on purpose — the log is append-only.

create index if not exists audit_log_record_idx on public.audit_log (table_name, record_id);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

-- ============================================================
-- TSC Communications App — Database Schema
-- Supabase / PostgreSQL
-- ============================================================
 
-- Enable UUID generation (already enabled in Supabase by default,
-- but included here for completeness)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
 
 
-- ============================================================
-- 1. public.users
--    Extends Supabase Auth (auth.users). One row per auth user.
-- ============================================================
CREATE TABLE public.users (
    id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name   TEXT        NOT NULL,
    role        TEXT        NOT NULL CHECK (role IN ('staff', 'family')),
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
 
-- Automatically create a public.users row when a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, full_name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'role', 'staff')
    );
    RETURN NEW;
END;
$$;
 
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
 
 
-- ============================================================
-- 2. individuals
-- ============================================================
CREATE TABLE public.individuals (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name           TEXT        NOT NULL,
    communication_tier  INTEGER     NOT NULL CHECK (communication_tier IN (1, 2, 3)),
    goals               TEXT,
    interests           TEXT,
    vocabulary_notes    TEXT,
    triggers_notes      TEXT,
    aac_system          TEXT,
    assigned_staff      UUID[]      NOT NULL DEFAULT '{}',
    family_user_id      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
 
-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
 
CREATE TRIGGER individuals_updated_at
    BEFORE UPDATE ON public.individuals
    FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
 
 
-- ============================================================
-- 3. sessions
-- ============================================================
CREATE TABLE public.sessions (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    individual_id    UUID        NOT NULL REFERENCES public.individuals(id) ON DELETE CASCADE,
    staff_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    session_date     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tier_used        INTEGER     NOT NULL CHECK (tier_used IN (1, 2, 3)),
    scenario_used    TEXT,
    went_well        TEXT,
    challenge_noted  TEXT,
    goal_moment      TEXT,
    staff_notes      TEXT,
    family_summary   TEXT,
    session_length   INTEGER     CHECK (session_length > 0), -- minutes
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ALTER TABLE public.sessions
  -- ADD COLUMN transcript JSONB; ran after the other tables
 
-- Indexes for the most common query patterns
CREATE INDEX idx_sessions_individual_id ON public.sessions (individual_id);
CREATE INDEX idx_sessions_staff_id      ON public.sessions (staff_id);
CREATE INDEX idx_sessions_session_date  ON public.sessions (session_date DESC);
 
 
-- ============================================================
-- 4. prompts
-- ============================================================
CREATE TABLE public.prompts (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tier          INTEGER     NOT NULL CHECK (tier IN (1, 2, 3)),
    prompt_type   TEXT        NOT NULL CHECK (prompt_type IN ('base', 'scenario', 'family')),
    scenario_name TEXT,
    system_prompt TEXT        NOT NULL,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.prompts
ADD CONSTRAINT prompts_scenario_name_check
CHECK (
    (prompt_type = 'scenario' AND scenario_name IS NOT NULL)
    OR
    (prompt_type != 'scenario' AND scenario_name IS NULL)
);
 
CREATE TRIGGER prompts_updated_at
    BEFORE UPDATE ON public.prompts
    FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
 
-- Index to quickly fetch active prompts by tier + type
CREATE INDEX idx_prompts_tier_type ON public.prompts (tier, prompt_type) WHERE is_active = TRUE;
 
 
-- ============================================================
-- Row Level Security (RLS) — starter policies
-- Enable RLS on all tables; refine policies to fit your auth rules.
-- ============================================================
 
ALTER TABLE public.users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.individuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompts     ENABLE ROW LEVEL SECURITY;
 
-- public.users: users can read/update their own row
CREATE POLICY "users: read own"   ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users: update own" ON public.users FOR UPDATE USING (auth.uid() = id);
 
-- individuals: staff can see individuals assigned to them;
--              family accounts can see their linked individual
CREATE POLICY "individuals: staff access" ON public.individuals
    FOR ALL
    USING (auth.uid() = ANY(assigned_staff));
 
CREATE POLICY "individuals: family read" ON public.individuals
    FOR SELECT
    USING (
        family_user_id = auth.uid()
    );
 
-- sessions: staff can CRUD their own sessions;
--           family can only read (no staff_notes)
--           (use a view to strip staff_notes for family accounts)
CREATE POLICY "sessions: staff full access" ON public.sessions
    FOR ALL
    USING (staff_id = auth.uid());
 
-- prompts: readable by all authenticated users
CREATE POLICY "prompts: read active" ON public.prompts
    FOR SELECT
    USING (is_active = TRUE AND auth.role() = 'authenticated');
 

 


-- FIX FAMILY VIEW SESSIONS LOG
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
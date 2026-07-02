# Project Handoff: Nonprofit Communication Program App

This document summarizes everything built so far in a chat-based session, so a fresh Claude Code session can pick up the project with full context. Save this as `CLAUDE.md` at your project root (Claude Code reads it automatically at the start of every session), or paste it as your first message in a new Claude Code session.

---

## 1. Project Overview

A staff-facing web application supporting a nonprofit communication program. Staff run AI-assisted communication practice sessions with individuals in the program, log outcomes afterward, and (eventually) family members get a restricted view of session summaries.

**Tech stack:**
- Frontend: React + Vite, `react-router-dom`
- Backend/DB: Supabase (PostgreSQL, Auth, Row Level Security)
- AI: Anthropic API called from a Vercel serverless function using `@anthropic-ai/sdk`
- Hosting: Vercel

---

## 2. Database Schema (as built)

### `individuals`
Fields referenced in the frontend so far: `id`, `full_name`, `communication_tier` (assumed stored as a string like `"Tier 1"` / `"Tier 2"` / `"Tier 3"` — **not confirmed against the live schema**), `goals`, `interests`, `vocabulary_notes`, `triggers_notes`, `aac_system`, `assigned_staff` (assumed Postgres array column of staff UUIDs, queried with `.contains()` — **not confirmed**), `is_active` (boolean).

### `sessions` (confirmed schema, provided directly)
```
sessions
├── id               UUID, primary key, auto-generated
├── individual_id    UUID, foreign key → individuals.id
├── staff_id         UUID, foreign key → auth.users.id
├── session_date     TIMESTAMP, when the session occurred
├── tier_used        INTEGER, the tier prompt used (may differ from default)
├── scenario_used    TEXT, which scenario was selected
├── went_well        TEXT, staff's post-session note: what went well
├── challenge_noted  TEXT, what was difficult or unexpected
├── goal_moment      TEXT, one specific observed goal-relevant moment
├── staff_notes      TEXT, additional clinical notes (staff-only visibility)
├── family_summary   TEXT, auto-generated summary for family view (Phase 5)
├── session_length   INTEGER, approximate duration in minutes
└── created_at       TIMESTAMP, auto-generated
```
Currently empty in production but the table exists and is being written to by `Session.jsx` (see below).

### `prompts`
Fields assumed from usage in `Session.jsx`: `id`, `tier`, `is_active`, `scenario_name`, `system_prompt`. **Not confirmed against the live schema** — verify column names match exactly.

### `public.users`
Synced from `auth.users` via a trigger. Has a `role` field with values `staff`, `family`, `admin`. RLS policies exist per role. A `SECURITY DEFINER` helper function avoids RLS recursion issues. A `sessions_family_view` exists for column-restricted family access to session data (built but not yet consumed by any frontend component — `FamilyView.jsx` is unwritten).

---

## 3. Files Built So Far

| File | Status | Notes |
|---|---|---|
| `App.jsx` | Done | Routes: `/` (Login), `/dashboard` (StaffDashboard), `/individual/:id` (IndividualProfile), `/individual/:id/sessions` (AllSessions), `/session/:individualId` (Session), `/session/:sessionId/log` (SessionLog — **not yet written**), `/family` (FamilyView — **not yet written**). Has a catch-all `*` route redirecting to `/`. |
| `pages/Login.jsx` | Done | Supabase email/password auth, no `<form>` tags. After login, queries `public.users` for `role`; `staff`/`admin` → `/dashboard`, `family` → `/family`. |
| `hooks/useAuth.js` | Done | Tracks Supabase session via `getSession()` + `onAuthStateChange`. Returns `{ user, loading }`. |
| `components/ProtectedRoute.jsx` | Done, **not wired in** | Standalone version using `useAuth`. **`App.jsx` still has its own duplicate inline `ProtectedRoute` logic — these have not been consolidated.** |
| `pages/StaffDashboard.jsx` | Done | Queries `individuals` where `assigned_staff` contains the current user's ID and `is_active = true`. Cards show name, tier badge (color-coded), truncated goals, link to `/individual/:id`. |
| `pages/IndividualProfile.jsx` | Done | Fetches individual + 5 most recent sessions. Displays full profile. "Start Session" → `/session/:id`. "View All Sessions" → `/individual/:id/sessions`. |
| `pages/AllSessions.jsx` | Done | Full session history for one individual, no limit. |
| `pages/Session.jsx` | Done | Fetches individual + matching prompts by tier. Scenario dropdown. On "Start Session," **inserts a real row into `sessions`** (individual_id, staff_id, session_date, tier_used, scenario_used) and gets the DB-generated `id`. Renders a chat UI calling `/api/chat`. Detects the literal string `"END SESSION"` (case-sensitive, exact match after trim) to trigger a debrief message, then "Complete Session" navigates to `/session/:sessionId/log` passing `{ individual_id, staff_id, scenario_used, session_length, messages }` via React Router `state`. |
| `pages/SessionLog.jsx` | **Not written** | Next piece needed. Must **UPDATE** the existing `sessions` row (found via `sessionId` URL param), not insert a new one. Needs a form for `went_well`, `challenge_noted`, `goal_moment`, `staff_notes`. `family_summary` stays untouched (Phase 5). |
| `pages/FamilyView.jsx` | **Not written** | Should likely read from `sessions_family_view` given the column-restricted access already built at the DB layer. |
| `lib/supabaseClient.js` | Done | Named export `supabase`, confirmed working after an earlier export-mismatch bug. |
| `lib/assemblePrompt.js` | Done | Fills template placeholders `[NAME]`, `[INTERESTS]`, `[GOAL]`, `[COMMUNICATION_LEVEL]`, `[AAC_SYSTEM]`, `[TRIGGERS]` from an individual record. **`[COMMUNICATION_LEVEL]` is mapped to `vocabulary_notes` — this was a guess, not confirmed.** Missing/empty values become `"not specified"`. |
| `api/chat.js` | Done, **needs a decision** | Vercel serverless function, calls Anthropic API with `@anthropic-ai/sdk`. Currently hardcoded to `claude-sonnet-4-6`. Sonnet 5 (`claude-sonnet-5`) was discussed as a likely upgrade (cheaper during its launch window, larger/equal context, stronger general performance) but **the swap was never actually made in the file**. |

---

## 4. Known Inconsistencies & Open Questions (fix these first)

1. **Duplicate `ProtectedRoute` logic.** `App.jsx` has its own inline auth-check; a separate, cleaner `components/ProtectedRoute.jsx` + `hooks/useAuth.js` exist but aren't imported anywhere. Consolidate to one source of truth.
2. **`[COMMUNICATION_LEVEL]` → `vocabulary_notes` mapping is unconfirmed.** Double-check this is actually the intended field before this ships into real prompts sent to individuals' sessions.
3. **`communication_tier` type mismatch risk.** `individuals.communication_tier` is assumed to be a string like `"Tier 1"`. `sessions.tier_used` is `INTEGER`. `Session.jsx` includes a `parseTierNumber()` helper that regex-extracts the digit — this will silently produce `null` if the actual stored format differs (e.g. if it's already an integer, or formatted differently like `"tier_1"`). **Verify against the real `individuals` table before trusting any `tier_used` values written so far.**
4. **`assigned_staff` structure unconfirmed.** `StaffDashboard.jsx` uses `.contains('assigned_staff', [user.id])`, which requires a native Postgres array column. If it's actually a join table or JSON structure, this query silently returns nothing rather than erroring clearly.
5. **`prompts` table column names unconfirmed** (`tier`, `is_active`, `scenario_name`, `system_prompt`, `id`). If any differ, the scenario dropdown in `Session.jsx` will silently render empty.
6. **No column stores the full chat transcript.** `Session.jsx` only passes `messages` through React Router `state` to `SessionLog.jsx` — this is lost on a hard page refresh and never persisted to the database. Decide now whether you want a permanent transcript (e.g. a new `transcript JSONB` column on `sessions`) before more work is built on top of the current approach.
7. **RLS insert permissions unverified.** `Session.jsx` now performs a real `INSERT` into `sessions` as the logged-in staff user. This has not been tested against your actual RLS policies — confirm staff have `INSERT` rights on `sessions`, or session creation will fail silently into an error state.
8. **Model version decision pending.** `api/chat.js` still uses `claude-sonnet-4-6`. Confirm whether to upgrade to `claude-sonnet-5` and make the actual code change (it was only discussed, not applied).
9. **HIPAA / Claude Enterprise compliance toggle** — still an open infrastructure decision given the app handles session and individual records. Not addressed in any code written so far; this is an account/org-level setting, not something fixable in the codebase itself.
10. **Login role handling** — `admin` role is currently treated identically to `staff` (redirects to `/dashboard`). Confirm this is actually the desired behavior or if admins need a distinct view.
11. **`ANTHROPIC_API_KEY` environment variable** must be set in Vercel project settings (not just a local `.env`) for `api/chat.js` to work in production.

---

## 5. Suggested Timeline Moving Forward

**Step 1 — Stabilize the foundation (before adding new features)**
- Consolidate the duplicate `ProtectedRoute` implementations into one.
- Pull the actual current schema for `individuals` and `prompts` (column names + types) and reconcile against every assumption listed in Section 4 (tier format, `assigned_staff` structure, prompts columns).
- Get the app running end-to-end through the existing flow (Login → StaffDashboard → IndividualProfile → Session start → chat) with zero console errors. Fix any remaining blank-page/import errors as they surface — each one is usually a single bad export or mismatched field name, not a deeper bug.

**Step 2 — Close the session loop**
- Build `SessionLog.jsx`: fetch the existing `sessions` row by `sessionId` from the URL, prefill from `location.state` where available, and submit an `UPDATE` (not an insert) writing `went_well`, `challenge_noted`, `goal_moment`, `staff_notes`.
- Decide on and implement the transcript-persistence question (item 6 above) before this ships, since it affects the `SessionLog` design.
- Verify RLS actually allows the `sessions` insert from `Session.jsx` and the update from `SessionLog.jsx`.

**Step 3 — Family-facing view**
- Build `FamilyView.jsx` reading from `sessions_family_view` (already built at the DB layer, unused so far).
- Confirm which fields family accounts should and shouldn't see, matching the view's column restrictions.

**Step 4 — Cleanup and decisions**
- Make the `claude-sonnet-4-6` → `claude-sonnet-5` call in `api/chat.js` (or confirm staying on 4.6).
- Resolve the HIPAA/Enterprise compliance toggle question at the account/infrastructure level.
- Revisit `family_summary` auto-generation as a Phase 5 item once the above is stable.

---

## 6. How to Use This With Claude Code

1. Place this file at your project root as `CLAUDE.md`.
2. Run `claude` from the project root.
3. Good first prompt: *"Read CLAUDE.md, then confirm the actual schema for `individuals` and `prompts` tables against what's assumed in Section 4, and flag any mismatches before we touch code."*
4. From there, work through the timeline in Section 5 step by step — each step is intentionally scoped so a session doesn't sprawl across unrelated concerns.

# Audit Prompt for Fable

Copy everything below into Fable as your prompt.

---

## Prompt

You are auditing an existing production codebase. **Do not make any changes, edits, refactors, or fixes to any file unless I explicitly tell you to.** This is a read-only investigation. If you think something needs fixing, describe it in your report — do not touch the code.

**Project context:** A staff-facing React (Vite) web app for a nonprofit communication program. Stack: React + react-router-dom, Supabase (PostgreSQL, Auth, Row Level Security), Anthropic API called via a Vercel serverless function, Vercel hosting. Roles are `staff`, `family`, and `admin`. Core flows: staff log in, view assigned individuals, run AI-assisted communication practice sessions, log session outcomes afterward, and family members get a restricted view of session summaries.

**Your task:** Do a full pass over the codebase and identify every bug, broken edge case, and anything that could fail or misbehave in front of a real user. Be exhaustive rather than conservative — flag anything suspicious even if you're not 100% sure it's a real bug, but note your confidence level.

### Areas to specifically check

1. **Auth & routing**
   - What happens on expired/invalid Supabase sessions, failed logins, direct URL access to protected routes without auth, role mismatches (e.g., a family-role user hitting a staff route), and redirect loops.
   - Duplicate or conflicting logic between `App.jsx` routing guards and `ProtectedRoute.jsx`.

2. **Session lifecycle (`Session.jsx`)**
   - Behavior if the Supabase `INSERT` on session start fails or is slow (does the UI hang, silently fail, or double-create a row on retry?).
   - What happens if the user closes the tab, loses network, or navigates away mid-session — is partial data lost, orphaned, or duplicated?
   - Detection of the `END SESSION` keyword: false positives/negatives, case sensitivity, what happens if it never triggers.
   - Timer/duration tracking accuracy if the tab is backgrounded or the device sleeps.
   - Behavior if the Anthropic API call in `/api/chat` errors, times out, rate-limits, or returns malformed/empty content.

3. **Data layer & Supabase queries**
   - Missing null/undefined checks on fields like `communication_tier`, `assigned_staff`, `vocabulary_notes`, etc.
   - RLS-driven failures — what a user sees when a query is silently blocked by policy vs. genuinely empty.
   - Race conditions in the parallel `Promise.all` queries (e.g., `IndividualProfile.jsx`) if one query fails and others succeed.
   - Handling of individuals with zero sessions, or session lists with only partial fields filled in.

4. **Family view / restricted access**
   - Confirm a family-role user genuinely cannot see staff-only fields (`staff_notes`, `went_well`, `challenge_noted`, `goal_moment`) even via direct API calls, not just hidden UI.
   - What renders if `family_summary` is null/empty for a session.

5. **Forms & user input**
   - Session log form: empty submissions, extremely long text, special characters, unsaved-changes-on-navigate-away.
   - Any place a required field can be bypassed client-side.

6. **UI/rendering edge cases**
   - Loading states: what shows before data arrives (blank screen vs. skeleton vs. stale data).
   - Empty states: zero individuals assigned, zero sessions, zero scenarios available.
   - Error states: what a user actually sees when a fetch fails (console error only vs. visible message).
   - Mobile/narrow viewport breakage, if applicable.

7. **Environment & config**
   - Any place a missing or malformed environment variable would fail silently instead of erroring clearly.
   - Hardcoded values that should be config-driven (model name, API endpoints, tier logic).

### Output format

For every issue found, list it under one of these severity headers, ordered from most to least severe:

- **Critical** — causes data loss, security/privacy exposure (e.g., family seeing staff-only data), or a total crash/blank screen for a normal user flow.
- **High** — a common user action fails or produces wrong/misleading data, but the app doesn't crash.
- **Medium** — an edge case (unusual input, timing, or navigation pattern) breaks something, or an error is handled poorly (e.g., silent failure with no user feedback).
- **Low** — cosmetic issues, minor inconsistencies, or edge cases so rare they're low priority.

For each issue, include:
- **File/location**
- **What happens** (the actual broken behavior)
- **How to trigger it** (repro steps)
- **Why it matters**

End with a short summary count of issues per severity tier.

**Reminder: do not fix, edit, or refactor anything. This is a report-only audit. Wait for my explicit go-ahead before touching any code.**

---


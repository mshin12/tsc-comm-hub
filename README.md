# TSC Communication Hub

A staff-facing web app supporting The Shine Community's communication practice program. Staff run AI-assisted, roleplay-style communication practice sessions with program participants, log outcomes afterward, and family members get a restricted view of session summaries — and can now run their own guided practice sessions too.

## What it does

- **Staff-run sessions** — an AI character (voiced via text-to-speech, with an animated mascot) roleplays a scenario tailored to the individual's communication tier, goals, and AAC needs; staff log notes and an AI-drafted debrief afterward.
- **Family self-practice** — family members run their own lower-stakes practice sessions with the same AI, scoped to a family-appropriate scenario library, with an optional live speech-coaching feature (volume feedback, clarity/diction check).
- **Family portal** — read-only session history and summaries for a family's linked individual, with Korean-language support.
- **Admin tools** — user invitations with role assignment, and admin-only editing of sensitive individual profile fields.

## Tech stack

- **Frontend:** React (Vite), React Router
- **Backend/DB:** Supabase (Postgres, Auth, Row Level Security)
- **AI:** Anthropic API (conversation + session debrief), OpenAI TTS (mascot voice), Azure AI Speech (pronunciation/clarity coaching)
- **Hosting:** Vercel, with serverless functions under `api/`

## Project layout

```
src/pages/        Route-level views (staff dashboard, session runner, family portal, admin)
src/components/    Shared UI (mascot, volume meter, speech check panel, nav)
src/hooks/         Voice input, speech coaching, auth
src/lib/           Prompt assembly, i18n strings, tier parsing, audit logging
api/               Vercel serverless functions (chat, debrief, TTS, invite, speech token)
supabase/          SQL migrations and RLS policies
```

## Getting started

This is a private nonprofit project — reach out to a maintainer for Supabase/Vercel access and the environment variables needed to run it locally (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`).

```bash
npm install
npm run dev      # local dev server
npm run build    # production build
npm run lint
```

## License

© The Shine Community. All rights reserved. This code is made publicly visible for portfolio/reference purposes but is not licensed for reuse, modification, or redistribution without permission.

# Career Match

Career Match is a lightweight browser app that searches public job boards and ranks roles against a user's background across operations, fleet, technician, service, logistics, and autonomy-adjacent work.

## What it does

- pulls live openings from a curated set of public company job boards
- filters for remote, on-site, or SF Bay Area roles
- scores jobs against resume-aligned keywords and experience areas
- autofills the profile from PDF, DOCX, TXT, or MD resumes in the browser
- drafts a tailored pitch, follow-up note, and application checklist
- saves interesting roles locally in the browser
- can AI-rerank roles and generate an AI application kit when an OpenRouter or OpenAI API key is configured

## Local use

You can open the app through a local preview server and visit:

`http://127.0.0.1:4173`

## Deploying on Vercel

This project is static and can be deployed directly from the repo root.

Recommended settings:

- Framework Preset: `Other`
- Root Directory: `.`
- Build Command: leave empty
- Output Directory: `.`

Environment variables for AI features:

- `OPENROUTER_API_KEY` (recommended)
- `OPENROUTER_MODEL` optional, defaults to `openrouter/free`
- `OPENROUTER_SITE_URL` optional, set this to your deployed site URL
- `OPENROUTER_APP_NAME` optional, defaults to `Career Match`
- `OPENAI_API_KEY` optional fallback

## Notes

The app depends on public job board requests from the browser. Some sources may later need a small backend proxy if their public APIs tighten cross-origin restrictions.

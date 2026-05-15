# Bob on Call

Bob on Call is a lightweight hackathon prototype for real-time on-call triage. It turns a raw production alert into a plain-English first-response brief, remembers investigation context across open incidents, and generates an end-of-shift handoff in one click.

## What It Shows

- Alert Translator: raw alert to severity, affected area, likely files, relevant commits, and first checks
- Shift Brain: open incident list, instant re-brief, and investigation notes per incident
- Handoff Generator: select incidents and export a structured Markdown handoff
- Bob action log: visible evidence of Bob translating, mapping repo context, and drafting next steps
- Regression Radar: paste a PR diff and compare it against active incident areas
- Local fallback: useful demo output even when model credentials are not configured

## Local Use

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:4173
```

If that port is already busy, Vite will use the next available port and print the URL.

## Production Build

```bash
npm run build
node server.js
```

## Optional Model Setup

The API can call Qwen through DashScope's OpenAI-compatible endpoint:

```text
QWEN_API_KEY=your_qwen_or_dashscope_key
QWEN_MODEL=qwen-plus
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
```

`DASHSCOPE_API_KEY` also works in place of `QWEN_API_KEY`.

Optional OpenRouter fallback:

```text
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=qwen/qwen3.6-plus
OPENROUTER_SITE_URL=https://your-site.example
OPENROUTER_APP_NAME=Bob on Call
```

## Optional Supabase Setup

Run the SQL in `supabase-schema.sql` in your Supabase SQL editor. The app writes through the server API with a server-side key.

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_server_side_key
```

## Demo Story

1. Start with the checkout latency alert.
2. Run Alert Translator and point to the plain-English summary, affected files, and first three checks.
3. Switch to Shift Brain, add a note, and show Bob re-briefing the incident.
4. Open Handoff Generator, select incidents, and copy or download the Markdown handoff.
5. Use Regression Radar to show Bob comparing a PR diff against active incident history.

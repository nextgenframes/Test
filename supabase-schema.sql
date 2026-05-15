create table if not exists public.av_triage_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source text not null,
  environment text not null,
  severity text not null check (severity in ('Critical', 'High', 'Medium', 'Low')),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  av_data jsonb not null,
  triage jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.av_triage_events enable row level security;

create index if not exists av_triage_events_created_at_idx
  on public.av_triage_events (created_at desc);

create index if not exists av_triage_events_severity_idx
  on public.av_triage_events (severity);

comment on table public.av_triage_events is
  'Bob on Call incident alerts and generated triage briefs.';

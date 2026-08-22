create extension if not exists pgcrypto;

create table if not exists public.cron_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  url text not null,
  method text not null default 'GET' check (method in ('GET','POST','PUT','PATCH','DELETE','HEAD')),
  headers jsonb not null default '{}'::jsonb,
  body text,
  schedule text not null,
  timezone text not null default 'UTC',
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_status text,
  created_at timestamptz not null default now()
);

create table if not exists public.job_executions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.cron_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,
  status_code integer,
  response_time_ms integer,
  error_message text
);

create index if not exists cron_jobs_user_id_idx on public.cron_jobs(user_id);
create index if not exists job_executions_user_id_idx on public.job_executions(user_id);
create index if not exists job_executions_job_id_idx on public.job_executions(job_id);

alter table public.cron_jobs enable row level security;
alter table public.job_executions enable row level security;

drop policy if exists "Users can view own cron jobs" on public.cron_jobs;
drop policy if exists "Users can create own cron jobs" on public.cron_jobs;
drop policy if exists "Users can update own cron jobs" on public.cron_jobs;
drop policy if exists "Users can delete own cron jobs" on public.cron_jobs;
drop policy if exists "Users can view own executions" on public.job_executions;

create policy "Users can view own cron jobs" on public.cron_jobs for select using (auth.uid() = user_id);
create policy "Users can create own cron jobs" on public.cron_jobs for insert with check (auth.uid() = user_id);
create policy "Users can update own cron jobs" on public.cron_jobs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own cron jobs" on public.cron_jobs for delete using (auth.uid() = user_id);
create policy "Users can view own executions" on public.job_executions for select using (auth.uid() = user_id);

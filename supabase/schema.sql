-- CronFlow now uses Neon PostgreSQL.
-- The application creates these tables automatically on first backend startup.
-- This file is kept as a reference schema for manual Neon migrations.

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists cron_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
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

create table if not exists job_executions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references cron_jobs(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,
  status_code integer,
  response_time_ms integer,
  error_message text
);

create index if not exists cron_jobs_user_id_idx on cron_jobs(user_id);
create index if not exists job_executions_user_id_idx on job_executions(user_id);
create index if not exists job_executions_job_id_idx on job_executions(job_id);

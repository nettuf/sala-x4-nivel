-- Sala x4 — schema inicial (projeto Supabase separado)
-- Rodar no SQL Editor ou via migration

create extension if not exists "pgcrypto";

-- Níveis: 1 estagiario | 2 moderador | 3 gerente | 4 chefe
create table if not exists players (
  auth text primary key,
  nick text,
  conn text,
  ip text,
  last_seen_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),
  join_count int not null default 1
);

create table if not exists admins (
  auth text primary key references players(auth) on delete cascade,
  level smallint not null check (level between 1 and 4),
  title text not null,
  granted_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bans (
  id uuid primary key default gen_random_uuid(),
  auth text,
  conn text,
  ip text,
  nick text,
  reason text,
  banned_by text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz, -- null = permanente
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists bans_auth_active_idx on bans (auth) where active;
create index if not exists bans_conn_active_idx on bans (conn) where active;

create table if not exists mutes (
  id uuid primary key default gen_random_uuid(),
  auth text not null,
  nick text,
  reason text,
  muted_by text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists mutes_auth_active_idx on mutes (auth) where active;

-- Códigos single-use para cargos (Edge Function depois)
create table if not exists role_codes (
  code text primary key,
  level smallint not null check (level between 1 and 4),
  title text not null,
  used_by text,
  used_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  constraint role_codes_single_use check (used_by is null or used_at is not null)
);

create index if not exists role_codes_unused_idx on role_codes (level) where used_by is null;

alter table players enable row level security;
alter table admins enable row level security;
alter table bans enable row level security;
alter table mutes enable row level security;
alter table role_codes enable row level security;

-- Sala usa service_role na VM; sem policies públicas de escrita

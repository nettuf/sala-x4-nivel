-- Schema único e idempotente da sala. Pode rodar de novo no SQL Editor.
-- Novas colunas / índices / funções entram AQUI — não crie outro arquivo.

create extension if not exists "pgcrypto";

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
  ends_at timestamptz,
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

create table if not exists player_stats (
  auth text primary key references players(auth) on delete cascade,
  games int not null default 0,
  wins int not null default 0,
  draws int not null default 0,
  losses int not null default 0,
  goals int not null default 0,
  assists int not null default 0,
  own_goals int not null default 0,
  mvps int not null default 0,
  selected_title text,
  cs int not null default 0,
  woms int not null default 0,
  gifted_titles text[] not null default '{}',
  hat_tricks int not null default 0,
  updated_at timestamptz not null default now()
);

alter table player_stats add column if not exists mvps int not null default 0;
alter table player_stats add column if not exists selected_title text;
alter table player_stats add column if not exists cs int not null default 0;
alter table player_stats add column if not exists woms int not null default 0;
alter table player_stats add column if not exists gifted_titles text[] not null default '{}';
alter table player_stats add column if not exists hat_tricks int not null default 0;

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  score_red int not null default 0,
  score_blue int not null default 0,
  winner smallint,
  valid boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists match_players (
  match_id uuid not null references matches(id) on delete cascade,
  auth text not null,
  nick text,
  team smallint not null,
  goals int not null default 0,
  assists int not null default 0,
  own_goals int not null default 0,
  result text,
  mvp boolean not null default false,
  clean_sheet boolean not null default false,
  wom boolean not null default false,
  hat_trick boolean not null default false,
  primary key (match_id, auth)
);

alter table match_players add column if not exists mvp boolean not null default false;
alter table match_players add column if not exists clean_sheet boolean not null default false;
alter table match_players add column if not exists wom boolean not null default false;
alter table match_players add column if not exists hat_trick boolean not null default false;

create table if not exists match_goals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team smallint not null,
  time_sec real,
  scorer_auth text,
  scorer_nick text,
  assist_auth text,
  assist_nick text,
  is_own_goal boolean not null default false
);

create table if not exists room_meta (
  id text primary key,
  best_streak int not null default 0,
  best_streak_holders text[] not null default '{}',
  best_streaks jsonb not null default '[]'::jsonb,
  bets int not null default 0,
  viados int not null default 0,
  games int not null default 0,
  goals int not null default 0,
  updated_at timestamptz not null default now()
);

alter table room_meta add column if not exists best_streak int not null default 0;
alter table room_meta add column if not exists best_streak_holders text[] not null default '{}';
alter table room_meta add column if not exists best_streaks jsonb not null default '[]'::jsonb;
alter table room_meta add column if not exists bets int not null default 0;
alter table room_meta add column if not exists viados int not null default 0;
alter table room_meta add column if not exists games int not null default 0;
alter table room_meta add column if not exists goals int not null default 0;
alter table room_meta add column if not exists hall jsonb not null default '{}'::jsonb;

insert into room_meta (id)
values ('x4')
on conflict (id) do nothing;

update room_meta
set best_streaks = jsonb_build_array(
  jsonb_build_object(
    'n', best_streak,
    'holders', to_jsonb(coalesce(best_streak_holders, '{}'::text[])),
    'live', false
  )
)
where id = 'x4'
  and coalesce(best_streak, 0) >= 3
  and (best_streaks is null or best_streaks = '[]'::jsonb);

create index if not exists player_stats_goals_idx on player_stats (goals desc);
create index if not exists player_stats_assists_idx on player_stats (assists desc);
create index if not exists player_stats_own_goals_idx on player_stats (own_goals desc);
create index if not exists player_stats_mvps_idx on player_stats (mvps desc);
create index if not exists player_stats_cs_idx on player_stats (cs desc);
create index if not exists player_stats_woms_idx on player_stats (woms desc);
create index if not exists player_stats_wins_idx on player_stats (wins desc);
create index if not exists player_stats_hat_tricks_idx on player_stats (hat_tricks desc);
create index if not exists matches_ended_idx on matches (ended_at desc);

alter table players enable row level security;
alter table admins enable row level security;
alter table bans enable row level security;
alter table mutes enable row level security;
alter table role_codes enable row level security;
alter table player_stats enable row level security;
alter table matches enable row level security;
alter table match_players enable row level security;
alter table match_goals enable row level security;
alter table room_meta enable row level security;

-- CS só do goleiro (match_players.clean_sheet). Recalcula sempre:
-- o backfill antigo somava todo mundo do time que não sofreu.
update player_stats ps
set cs = sub.cs
from (
  select
    ps2.auth,
    count(*) filter (where m.valid and mp.clean_sheet)::int as cs
  from player_stats ps2
  left join match_players mp on mp.auth = ps2.auth
  left join matches m on m.id = mp.match_id
  group by ps2.auth
) sub
where ps.auth = sub.auth;

update match_players mp
set hat_trick = true
from matches m
where m.id = mp.match_id
  and m.valid = true
  and coalesce(mp.goals, 0) >= 3
  and coalesce(mp.hat_trick, false) = false;

update player_stats ps
set hat_tricks = totals.total
from (
  select mp.auth, count(*)::int as total
  from match_players mp
  join matches m on m.id = mp.match_id
  where m.valid = true and coalesce(mp.goals, 0) >= 3
  group by mp.auth
) totals
where totals.auth = ps.auth
  and coalesce(ps.hat_tricks, 0) = 0;

with latest_nicks as (
  select distinct on (mp.auth)
    mp.auth,
    btrim(mp.nick) as nick
  from public.match_players mp
  join public.matches m on m.id = mp.match_id
  where nullif(btrim(mp.nick), '') is not null
  order by mp.auth, m.ended_at desc nulls last, mp.match_id desc
)
update public.players p
set nick = latest_nicks.nick
from latest_nicks
where p.auth = latest_nicks.auth
  and nullif(btrim(p.nick), '') is null;

create or replace function public.transfer_player_stats(
  p_target_auth text,
  p_source_auth text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_target public.player_stats%rowtype;
  v_source public.player_stats%rowtype;
  v_after public.player_stats%rowtype;
  v_source_after public.player_stats%rowtype;
begin
  p_target_auth := nullif(btrim(p_target_auth), '');
  p_source_auth := nullif(btrim(p_source_auth), '');
  if p_target_auth is null or p_source_auth is null then
    raise exception 'invalid auth' using errcode = '22023';
  end if;
  if p_target_auth = p_source_auth then
    raise exception 'source and target must differ' using errcode = '22023';
  end if;

  insert into public.player_stats (auth)
  values (p_target_auth), (p_source_auth)
  on conflict (auth) do nothing;

  perform 1
  from public.player_stats
  where auth in (p_target_auth, p_source_auth)
  order by auth
  for update;

  select * into strict v_target
  from public.player_stats
  where auth = p_target_auth;

  select * into strict v_source
  from public.player_stats
  where auth = p_source_auth;

  update public.player_stats
  set
    games = coalesce(v_target.games, 0) + coalesce(v_source.games, 0),
    wins = coalesce(v_target.wins, 0) + coalesce(v_source.wins, 0),
    draws = coalesce(v_target.draws, 0) + coalesce(v_source.draws, 0),
    losses = coalesce(v_target.losses, 0) + coalesce(v_source.losses, 0),
    goals = coalesce(v_target.goals, 0) + coalesce(v_source.goals, 0),
    assists = coalesce(v_target.assists, 0) + coalesce(v_source.assists, 0),
    own_goals = coalesce(v_target.own_goals, 0) + coalesce(v_source.own_goals, 0),
    mvps = coalesce(v_target.mvps, 0) + coalesce(v_source.mvps, 0),
    woms = coalesce(v_target.woms, 0) + coalesce(v_source.woms, 0),
    cs = coalesce(v_target.cs, 0) + coalesce(v_source.cs, 0),
    hat_tricks = coalesce(v_target.hat_tricks, 0) + coalesce(v_source.hat_tricks, 0),
    gifted_titles = array(
      select distinct title_id
      from unnest(
        coalesce(v_target.gifted_titles, '{}'::text[])
        || coalesce(v_source.gifted_titles, '{}'::text[])
      ) as titles(title_id)
    ),
    selected_title = coalesce(v_target.selected_title, v_source.selected_title),
    updated_at = now()
  where auth = p_target_auth
  returning * into v_after;

  update public.player_stats
  set
    games = 0,
    wins = 0,
    draws = 0,
    losses = 0,
    goals = 0,
    assists = 0,
    own_goals = 0,
    mvps = 0,
    woms = 0,
    cs = 0,
    hat_tricks = 0,
    gifted_titles = '{}'::text[],
    selected_title = null,
    updated_at = now()
  where auth = p_source_auth
  returning * into v_source_after;

  return jsonb_build_object(
    'before', jsonb_build_object(
      'target', to_jsonb(v_target),
      'source', to_jsonb(v_source)
    ),
    'after', to_jsonb(v_after),
    'source_after', to_jsonb(v_source_after)
  );
end;
$$;

revoke execute on function public.transfer_player_stats(text, text) from public, anon, authenticated;
grant execute on function public.transfer_player_stats(text, text) to service_role;

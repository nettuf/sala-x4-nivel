-- Stats e partidas (sala x4)

create table if not exists player_stats (
  auth text primary key references players(auth) on delete cascade,
  games int not null default 0,
  wins int not null default 0,
  draws int not null default 0,
  losses int not null default 0,
  goals int not null default 0,
  assists int not null default 0,
  own_goals int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  score_red int not null default 0,
  score_blue int not null default 0,
  winner smallint, -- 1 red, 2 blue, 0 draw, null cancelado
  valid boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists match_players (
  match_id uuid not null references matches(id) on delete cascade,
  auth text not null,
  nick text,
  team smallint not null, -- 1 red 2 blue
  goals int not null default 0,
  assists int not null default 0,
  own_goals int not null default 0,
  result text, -- win | draw | loss
  primary key (match_id, auth)
);

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

create index if not exists player_stats_goals_idx on player_stats (goals desc);
create index if not exists matches_ended_idx on matches (ended_at desc);

alter table player_stats enable row level security;
alter table matches enable row level security;
alter table match_players enable row level security;
alter table match_goals enable row level security;

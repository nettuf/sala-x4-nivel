-- Rankings (top 5) + recorde de streak da sala.

create index if not exists player_stats_assists_idx on player_stats (assists desc);
create index if not exists player_stats_own_goals_idx on player_stats (own_goals desc);

create table if not exists room_meta (
  id text primary key,
  best_streak int not null default 0,
  updated_at timestamptz not null default now()
);

insert into room_meta (id, best_streak)
values ('x4', 0)
on conflict (id) do nothing;

alter table room_meta enable row level security;

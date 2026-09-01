-- Worst Of Match (WoM)

alter table player_stats
  add column if not exists woms int not null default 0;

alter table match_players
  add column if not exists wom boolean not null default false;

create index if not exists player_stats_woms_idx on player_stats (woms desc);

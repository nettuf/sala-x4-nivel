-- Cargos/emblemas + MVP

alter table player_stats
  add column if not exists mvps int not null default 0;

alter table player_stats
  add column if not exists selected_title text;

alter table match_players
  add column if not exists mvp boolean not null default false;

create index if not exists player_stats_mvps_idx on player_stats (mvps desc);

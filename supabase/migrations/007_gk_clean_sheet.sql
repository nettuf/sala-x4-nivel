-- CS só do goleiro da partida, não do time inteiro.

alter table match_players
  add column if not exists clean_sheet boolean not null default false;

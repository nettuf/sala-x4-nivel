alter table player_stats
  add column if not exists hat_tricks int not null default 0;

alter table match_players
  add column if not exists hat_trick boolean not null default false;

update match_players mp
set hat_trick = true
from matches m
where m.id = mp.match_id
  and m.valid = true
  and coalesce(mp.goals, 0) >= 3;

update player_stats ps
set hat_tricks = totals.total
from (
  select mp.auth, count(*)::int as total
  from match_players mp
  join matches m on m.id = mp.match_id
  where m.valid = true and coalesce(mp.goals, 0) >= 3
  group by mp.auth
) totals
where totals.auth = ps.auth;

create index if not exists player_stats_wins_idx
  on player_stats (wins desc);

create index if not exists player_stats_hat_tricks_idx
  on player_stats (hat_tricks desc);

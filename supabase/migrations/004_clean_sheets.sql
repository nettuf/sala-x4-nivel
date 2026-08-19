-- Clean sheets (CS): time não sofreu gol na partida válida.

alter table player_stats
  add column if not exists cs int not null default 0;

create index if not exists player_stats_cs_idx on player_stats (cs desc);

update player_stats ps
set cs = sub.cs
from (
  select
    mp.auth,
    count(*)::int as cs
  from match_players mp
  join matches m on m.id = mp.match_id
  where m.valid
    and (
      (mp.team = 1 and m.score_blue = 0)
      or (mp.team = 2 and m.score_red = 0)
    )
  group by mp.auth
) sub
where ps.auth = sub.auth;

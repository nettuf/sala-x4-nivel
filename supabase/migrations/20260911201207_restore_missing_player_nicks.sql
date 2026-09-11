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

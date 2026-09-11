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

  select * into strict v_target from public.player_stats where auth = p_target_auth;
  select * into strict v_source from public.player_stats where auth = p_source_auth;

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
      from unnest(coalesce(v_target.gifted_titles, '{}'::text[]) || coalesce(v_source.gifted_titles, '{}'::text[])) as titles(title_id)
    ),
    selected_title = coalesce(v_target.selected_title, v_source.selected_title),
    updated_at = now()
  where auth = p_target_auth
  returning * into v_after;

  update public.player_stats
  set
    games = 0, wins = 0, draws = 0, losses = 0, goals = 0, assists = 0,
    own_goals = 0, mvps = 0, woms = 0, cs = 0, hat_tricks = 0,
    gifted_titles = '{}'::text[], selected_title = null, updated_at = now()
  where auth = p_source_auth
  returning * into v_source_after;

  return jsonb_build_object(
    'before', jsonb_build_object('target', to_jsonb(v_target), 'source', to_jsonb(v_source)),
    'after', to_jsonb(v_after),
    'source_after', to_jsonb(v_source_after)
  );
end;
$$;

revoke execute on function public.transfer_player_stats(text, text) from public, anon, authenticated;
grant execute on function public.transfer_player_stats(text, text) to service_role;

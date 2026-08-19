const { getSupabase } = require("./supabase");
const { pickMatchMvps, applyUnlockUpgrade, newlyUnlockedPlayerTitles } = require("../titles");

async function ensurePlayer(auth, nick) {
  const sb = getSupabase();
  if (!sb || !auth) return;
  await sb.from("players").upsert({ auth, nick, last_seen_at: new Date().toISOString() }, { onConflict: "auth" });
}

async function saveMatch({ scoreRed, scoreBlue, winner, valid, players, goals }) {
  const sb = getSupabase();
  if (!sb) return null;

  const mvpList = valid ? pickMatchMvps(players) : [];
  const mvpAuths = new Set(mvpList.map((p) => p.auth).filter(Boolean));

  const { data: match, error } = await sb
    .from("matches")
    .insert({
      ended_at: new Date().toISOString(),
      score_red: scoreRed,
      score_blue: scoreBlue,
      winner,
      valid: !!valid,
    })
    .select()
    .maybeSingle();

  if (error || !match) {
    console.error("[stats] match insert", error?.message);
    return null;
  }

  if (players?.length) {
    for (const p of players) {
      await ensurePlayer(p.auth, p.nick);
    }
    const { error: pe } = await sb.from("match_players").insert(
      players.map((p) => ({
        match_id: match.id,
        auth: p.auth,
        nick: p.nick,
        team: p.team,
        goals: p.goals || 0,
        assists: p.assists || 0,
        own_goals: p.own_goals || 0,
        result: p.result,
        mvp: mvpAuths.has(p.auth),
      }))
    );
    if (pe) console.error("[stats] match_players", pe.message);
  }

  if (goals?.length) {
    const { error: ge } = await sb.from("match_goals").insert(
      goals.map((g) => ({
        match_id: match.id,
        team: g.team,
        time_sec: g.time,
        scorer_auth: g.scorerAuth,
        scorer_nick: g.scorerNick,
        assist_auth: g.assistAuth,
        assist_nick: g.assistNick,
        is_own_goal: !!g.isOwnGoal,
      }))
    );
    if (ge) console.error("[stats] match_goals", ge.message);
  }

  const titleUnlocks = [];
  if (valid && players?.length) {
    for (const p of players) {
      if (!p.auth) continue;
      const bump = await bumpPlayerStats({ ...p, mvp: mvpAuths.has(p.auth) });
      if (bump?.unlockedTitles?.length) {
        titleUnlocks.push({
          auth: p.auth,
          nick: p.nick,
          titles: bump.unlockedTitles,
          selectedTitle: bump.selectedTitle,
          equippedChanged: bump.equippedChanged,
        });
      }
    }
  }

  return { match, mvpAuths: [...mvpAuths], titleUnlocks };
}

async function bumpPlayerStats(p) {
  const sb = getSupabase();
  if (!sb || !p.auth) return;

  const { data: cur } = await sb.from("player_stats").select("*").eq("auth", p.auth).maybeSingle();
  const row = cur || {
    auth: p.auth,
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goals: 0,
    assists: 0,
    own_goals: 0,
    mvps: 0,
    selected_title: null,
  };

  const prev = {
    games: row.games,
    goals: row.goals,
    assists: row.assists,
    mvps: row.mvps || 0,
    selected_title: row.selected_title || null,
  };

  row.games += 1;
  if (p.result === "win") row.wins += 1;
  else if (p.result === "draw") row.draws += 1;
  else if (p.result === "loss") row.losses += 1;
  row.goals += p.goals || 0;
  row.assists += p.assists || 0;
  row.own_goals += p.own_goals || 0;
  if (p.mvp) row.mvps = (row.mvps || 0) + 1;
  row.updated_at = new Date().toISOString();

  const nextSelected = applyUnlockUpgrade(prev.selected_title, prev, row);
  const unlockedTitles = newlyUnlockedPlayerTitles(prev, row);
  row.selected_title = nextSelected;

  const { error } = await sb.from("player_stats").upsert(row);
  if (error) console.error("[stats] bump", error.message);

  return {
    unlockedTitles,
    selectedTitle: row.selected_title,
    equippedChanged: nextSelected !== (prev.selected_title || null),
  };
}

async function getPlayerStats(auth) {
  const sb = getSupabase();
  if (!sb || !auth) return null;
  const { data, error } = await sb.from("player_stats").select("*").eq("auth", auth).maybeSingle();
  if (error) console.error("[stats] get", error.message);
  return data;
}

async function setSelectedTitle(auth, titleId) {
  const sb = getSupabase();
  if (!sb || !auth) return false;
  await ensurePlayer(auth, null);
  const { data: cur } = await sb.from("player_stats").select("*").eq("auth", auth).maybeSingle();
  const row = cur || {
    auth,
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goals: 0,
    assists: 0,
    own_goals: 0,
    mvps: 0,
  };
  row.selected_title = titleId;
  row.updated_at = new Date().toISOString();
  const { error } = await sb.from("player_stats").upsert(row);
  if (error) {
    console.error("[stats] set title", error.message);
    return false;
  }
  return true;
}

module.exports = { saveMatch, getPlayerStats, bumpPlayerStats, setSelectedTitle, pickMatchMvps };

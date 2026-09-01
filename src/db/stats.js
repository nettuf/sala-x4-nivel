const { getSupabase } = require("./supabase");
const { dedupeMatchPlayers } = require("../gameLogic");
const { pickMatchMvps, pickMatchWorst, applyUnlockUpgrade, newlyUnlockedPlayerTitles } = require("../titles");

function emptyPlayerStats() {
  return {
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goals: 0,
    assists: 0,
    own_goals: 0,
    mvps: 0,
    woms: 0,
    cs: 0,
    selected_title: null,
  };
}

function winratePct(stats) {
  const games = Number(stats?.games) || 0;
  const wins = Number(stats?.wins) || 0;
  if (games <= 0) return 0;
  return Math.round((wins / games) * 1000) / 10;
}

function formatStatusCard(name, stats, title) {
  const s = { ...emptyPlayerStats(), ...stats };
  const wr = winratePct(s);
  const wrText = Number.isInteger(wr) ? String(wr) : wr.toFixed(1);
  const emblem = title?.emblem || "🌱";
  const cargo = title?.name || "Novato";
  return [
    `${emblem} ${name}  ·  ${cargo}`,
    `Jogos: ${Number(s.games) || 0}  (${Number(s.wins) || 0}V ${Number(s.draws) || 0}E ${Number(s.losses) || 0}D)  ·  WR ${wrText}%`,
    `Gols: ${Number(s.goals) || 0}  ·  Assist: ${Number(s.assists) || 0}  ·  CS: ${Number(s.cs) || 0}  ·  MVP: ${Number(s.mvps) || 0}  ·  WoM: ${Number(s.woms) || 0}`,
  ].join("\n");
}

async function countCleanSheets(sb, auth) {
  const { data, error } = await sb
    .from("match_players")
    .select("clean_sheet")
    .eq("auth", auth)
    .eq("clean_sheet", true);
  if (error || !Array.isArray(data)) return null;
  return data.length;
}

async function ensurePlayer(auth, nick) {
  const sb = getSupabase();
  if (!sb || !auth) return;
  await sb.from("players").upsert({ auth, nick, last_seen_at: new Date().toISOString() }, { onConflict: "auth" });
}

async function saveMatch({ scoreRed, scoreBlue, winner, valid, players, goals }) {
  const sb = getSupabase();
  if (!sb) return null;

  const roster = dedupeMatchPlayers(players);
  const mvpList = valid ? pickMatchMvps(roster) : [];
  const mvpAuths = new Set(mvpList.map((p) => p.auth).filter(Boolean));
  const worstList = valid ? pickMatchWorst(roster) : [];
  const womAuths = new Set(worstList.map((p) => p.auth).filter(Boolean));

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

  if (roster?.length) {
    for (const p of roster) {
      await ensurePlayer(p.auth, p.nick);
    }
    const rows = roster.map((p) => ({
      match_id: match.id,
      auth: p.auth,
      nick: p.nick,
      team: p.team,
      goals: p.goals || 0,
      assists: p.assists || 0,
      own_goals: p.own_goals || 0,
      result: p.result,
      mvp: mvpAuths.has(p.auth),
      wom: womAuths.has(p.auth),
      clean_sheet: !!p.cleanSheet,
    }));
    const { error: pe } = await sb.from("match_players").insert(rows);
    if (pe) {
      const msg = pe.message || "";
      if (/clean_sheet|wom/i.test(msg)) {
        const retry = await sb.from("match_players").insert(
          rows.map(({ clean_sheet, wom, ...r }) => r)
        );
        if (retry.error) console.error("[stats] match_players", retry.error.message);
      } else if (/duplicate|23505/i.test(msg)) {
        console.warn("[stats] match_players duplicata ignorada após dedupe");
      } else {
        console.error("[stats] match_players", msg);
      }
    }
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
      const bump = await bumpPlayerStats({
        ...p,
        mvp: mvpAuths.has(p.auth),
        wom: womAuths.has(p.auth),
      });
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

  if (valid && players?.length) invalidateLeaderboards();

  return { match, mvpAuths: [...mvpAuths], womAuths: [...womAuths], titleUnlocks };
}

async function bumpPlayerStats(p) {
  const sb = getSupabase();
  if (!sb || !p.auth) return;

  const { data: cur } = await sb.from("player_stats").select("*").eq("auth", p.auth).maybeSingle();
  const row = cur || {
    auth: p.auth,
    ...emptyPlayerStats(),
  };

  const prev = {
    games: row.games,
    wins: row.wins || 0,
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
  if (p.wom) row.woms = (row.woms || 0) + 1;
  if (p.cleanSheet) row.cs = (row.cs || 0) + 1;
  row.updated_at = new Date().toISOString();

  const nextSelected = applyUnlockUpgrade(prev.selected_title, prev, row);
  const unlockedTitles = newlyUnlockedPlayerTitles(prev, row);
  row.selected_title = nextSelected;

  const { error } = await sb.from("player_stats").upsert(row);
  if (error) {
    if (/cs|woms/i.test(error.message || "")) {
      const { cs: _cs, woms: _woms, ...withoutOptional } = row;
      const retry = await sb.from("player_stats").upsert(withoutOptional);
      if (retry.error) console.error("[stats] bump", retry.error.message);
    } else {
      console.error("[stats] bump", error.message);
    }
  }

  return {
    unlockedTitles,
    selectedTitle: row.selected_title,
    equippedChanged: nextSelected !== (prev.selected_title || null),
  };
}

async function aggregateFromMatches(sb, auth) {
  const { data, error } = await sb
    .from("match_players")
    .select("goals, assists, own_goals, result, mvp, wom, team, clean_sheet, matches!inner(valid, score_red, score_blue)")
    .eq("auth", auth)
    .eq("matches.valid", true);
  if (error || !Array.isArray(data) || !data.length) return null;

  const acc = emptyPlayerStats();
  acc.games = data.length;
  for (const row of data) {
    acc.goals += Number(row.goals) || 0;
    acc.assists += Number(row.assists) || 0;
    acc.own_goals += Number(row.own_goals) || 0;
    if (row.result === "win") acc.wins += 1;
    else if (row.result === "draw") acc.draws += 1;
    else if (row.result === "loss") acc.losses += 1;
    if (row.mvp) acc.mvps += 1;
    if (row.wom) acc.woms += 1;
    if (row.clean_sheet) acc.cs += 1;
  }
  return acc;
}

async function getPlayerStats(auth) {
  const sb = getSupabase();
  if (!sb || !auth) return emptyPlayerStats();
  const { data, error } = await sb.from("player_stats").select("*").eq("auth", auth).maybeSingle();
  if (error) console.error("[stats] get", error.message);
  const row = { ...emptyPlayerStats(), ...(data || {}) };
  // A coluna cs é mantida no fim de cada partida. Só recontamos (query pesada)
  // quando a migração 004 ainda não rodou nesse banco.
  if (data && data.cs === undefined) {
    const counted = await countCleanSheets(sb, auth);
    if (counted != null) row.cs = counted;
  }
  const emptyTotals =
    !Number(row.games) && !Number(row.goals) && !Number(row.assists) && !Number(row.mvps);
  // Sem linha em player_stats = jogador novo. Não varrer match_players no join.
  if (data && emptyTotals) {
    const fromMatches = await aggregateFromMatches(sb, auth);
    if (fromMatches) return { ...row, ...fromMatches, selected_title: row.selected_title };
  }
  return row;
}

async function setSelectedTitle(auth, titleId) {
  const sb = getSupabase();
  if (!sb || !auth) return false;
  await ensurePlayer(auth, null);
  const { data: cur } = await sb.from("player_stats").select("*").eq("auth", auth).maybeSingle();
  const row = cur || {
    auth,
    ...emptyPlayerStats(),
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

function emptyBoards() {
  return { goals: [], assists: [], own_goals: [], cs: [], woms: [], games: [] };
}

function mapLeaderboardRows(data, col, nickMap) {
  return (data || [])
    .map((r) => ({
      auth: r.auth,
      nick: (nickMap && nickMap[r.auth]) || "sem nick",
      value: Math.max(0, Math.floor(Number(r[col]) || 0)),
    }))
    .filter((r) => r.auth && r.value > 0);
}

function formatTop5(title, rows) {
  if (!rows?.length) return `${title}\nNinguém no ranking ainda.`;
  const lines = rows.map((r, i) => `${i + 1}. ${r.nick} — ${r.value}`);
  return `${title}\n${lines.join("\n")}`;
}

function createLeaderboardStore({ ttlMs = 60_000, load } = {}) {
  let cache = { at: 0, payload: null };
  let inflight = null;

  function invalidate() {
    cache = { at: 0, payload: null };
    inflight = null;
  }

  function slice(payload, stat) {
    if (!payload || payload.unavailable) return { unavailable: true, rows: [] };
    return { unavailable: false, rows: payload.boards?.[stat] || [] };
  }

  async function get(stat) {
    const now = Date.now();
    if (cache.payload && now - cache.at < ttlMs) return slice(cache.payload, stat);
    if (typeof load !== "function") return { unavailable: true, rows: [] };
    if (!inflight) {
      inflight = Promise.resolve()
        .then(() => load())
        .then((raw) => {
          if (!raw || raw.unavailable) {
            return { unavailable: true, boards: emptyBoards() };
          }
          const payload = { unavailable: false, boards: { ...emptyBoards(), ...raw.boards } };
          cache = { at: Date.now(), payload };
          return payload;
        })
        .catch((err) => {
          console.error("[stats] leaderboard", err?.message || err);
          return cache.payload || { unavailable: true, boards: emptyBoards() };
        })
        .finally(() => {
          inflight = null;
        });
    }
    return slice(await inflight, stat);
  }

  return { get, invalidate };
}

async function queryLeaderboards(sb) {
  const cols = ["games", "goals", "assists", "own_goals", "cs", "woms"];
  const results = await Promise.all(
    cols.map(async (col) => {
      const { data, error } = await sb
        .from("player_stats")
        .select(`auth, ${col}`)
        .order(col, { ascending: false })
        .gt(col, 0)
        .limit(5);
      if (error) {
        console.error("[stats] top", col, error.message);
        return [];
      }
      return data || [];
    })
  );

  const auths = [
    ...new Set(results.flatMap((rows) => rows.map((r) => r.auth).filter(Boolean))),
  ];
  const nickMap = {};
  if (auths.length) {
    const { data: people, error } = await sb.from("players").select("auth, nick").in("auth", auths);
    if (error) console.error("[stats] top nicks", error.message);
    for (const p of people || []) nickMap[p.auth] = p.nick || "sem nick";
  }

  const boards = emptyBoards();
  cols.forEach((col, i) => {
    boards[col] = mapLeaderboardRows(results[i], col, nickMap);
  });
  return boards;
}

const leaderboardStore = createLeaderboardStore({
  ttlMs: 60_000,
  async load() {
    const sb = getSupabase();
    if (!sb) return { unavailable: true };
    return { unavailable: false, boards: await queryLeaderboards(sb) };
  },
});

function invalidateLeaderboards() {
  leaderboardStore.invalidate();
}

function getLeaderboard(stat) {
  return leaderboardStore.get(stat);
}

module.exports = {
  saveMatch,
  getPlayerStats,
  bumpPlayerStats,
  setSelectedTitle,
  pickMatchMvps,
  emptyPlayerStats,
  formatStatusCard,
  winratePct,
  formatTop5,
  mapLeaderboardRows,
  createLeaderboardStore,
  getLeaderboard,
  invalidateLeaderboards,
};

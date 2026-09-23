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
    hat_tricks: 0,
    selected_title: null,
    gifted_titles: [],
  };
}

/** Overlay em memória: testes, sala sem banco, ou coluna ainda não migrada. */
const statsMemory = new Map();

const STAT_SUM_KEYS = ["games", "wins", "draws", "losses", "goals", "assists", "own_goals", "mvps", "woms", "cs", "hat_tricks"];

function normalizeGiftedIds(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((id) => String(id || "").trim()).filter(Boolean))];
}

function readStatsMemory(auth) {
  return statsMemory.get(auth) || {};
}

function patchStatsMemory(auth, patch) {
  const cur = readStatsMemory(auth);
  const next = { ...cur, ...patch };
  if (Object.prototype.hasOwnProperty.call(patch, "gifted_titles")) {
    next.gifted_titles = normalizeGiftedIds(patch.gifted_titles);
  }
  statsMemory.set(auth, next);
  return next;
}

function mergeGiftedTitles(auth, fromDb) {
  const fromMem = normalizeGiftedIds(readStatsMemory(auth).gifted_titles);
  return [...new Set([...normalizeGiftedIds(fromDb), ...fromMem])];
}

function overlayMemory(auth, row) {
  if (!auth) return { ...emptyPlayerStats(), ...row, gifted_titles: normalizeGiftedIds(row?.gifted_titles) };
  const mem = readStatsMemory(auth);
  const gifted_titles = mergeGiftedTitles(auth, row?.gifted_titles);
  const selected_title = Object.prototype.hasOwnProperty.call(mem, "selected_title")
    ? mem.selected_title
    : row?.selected_title;
  const merged = { ...emptyPlayerStats(), ...row, gifted_titles, selected_title };
  const rowEmpty = !Number(row?.games) && !Number(row?.goals) && !Number(row?.wins);
  if (mem._full && rowEmpty) {
    for (const k of STAT_SUM_KEYS) merged[k] = Number(mem[k]) || 0;
  }
  return merged;
}

function resetStatsMemory() {
  statsMemory.clear();
}

function winratePct(stats) {
  const games = Number(stats?.games) || 0;
  const wins = Number(stats?.wins) || 0;
  if (games <= 0) return 0;
  return Math.round((wins / games) * 1000) / 10;
}

function isHatTrick(player) {
  return (Number(player?.goals) || 0) >= 3;
}

function isHatTrickForMatch(valid, player) {
  return !!valid && isHatTrick(player);
}

function formatStatusCard(name, stats, title) {
  const s = { ...emptyPlayerStats(), ...stats };
  const wr = winratePct(s);
  const wrText = Number.isInteger(wr) ? String(wr) : wr.toFixed(1);
  const emblem = title?.emblem || "🌱";
  const cargo = title?.name || "Novato";
  return [
    `${emblem} ${name}  ·  ${cargo}`,
    `Jogos: ${Number(s.games) || 0}  ·  Vitórias: ${Number(s.wins) || 0}  ·  Empates: ${Number(s.draws) || 0}  ·  Derrotas: ${Number(s.losses) || 0}  ·  WR ${wrText}%`,
    `Gols: ${Number(s.goals) || 0}  ·  Assist: ${Number(s.assists) || 0}  ·  Hat-tricks: ${Number(s.hat_tricks) || 0}  ·  CS: ${Number(s.cs) || 0}  ·  MVP: ${Number(s.mvps) || 0}  ·  WoM: ${Number(s.woms) || 0}`,
  ].join("\n");
}

async function countCleanSheets(sb, auth) {
  const { count, error } = await sb
    .from("match_players")
    .select("auth", { count: "exact", head: true })
    .eq("auth", auth)
    .eq("clean_sheet", true);
  if (error || count == null) return null;
  return count;
}

async function ensurePlayer(auth, nick) {
  await ensurePlayers([{ auth, nick }]);
}

async function ensurePlayers(roster) {
  const sb = getSupabase();
  if (!sb || !roster?.length) return;
  const now = new Date().toISOString();
  const withNick = [];
  const withoutNick = [];
  const seen = new Set();
  for (const p of roster) {
    if (!p?.auth || seen.has(p.auth)) continue;
    seen.add(p.auth);
    const cleanNick = typeof p.nick === "string" ? p.nick.trim() : "";
    if (cleanNick) withNick.push({ auth: p.auth, nick: cleanNick, last_seen_at: now });
    else withoutNick.push({ auth: p.auth });
  }
  if (withNick.length) {
    const { error } = await sb.from("players").upsert(withNick, { onConflict: "auth" });
    if (error) console.error("[stats] ensure players", error.message);
  }
  if (withoutNick.length) {
    const { error } = await sb.from("players").upsert(withoutNick, {
      onConflict: "auth",
      ignoreDuplicates: true,
    });
    if (error) console.error("[stats] ensure players", error.message);
  }
}

const MATCH_RETENTION_DAYS = 90;
const LEADERBOARD_TTL_MS = Number(process.env.LEADERBOARD_TTL_MS || 15 * 60 * 1000);
const MATCH_CLEANUP_EVERY_MS = 12 * 60 * 60 * 1000;
let lastMatchCleanupAt = 0;

/** Apaga partidas velhas. Cascata limpa match_players e match_goals. Totais ficam em player_stats / room_meta. */
async function cleanupOldMatches() {
  const sb = getSupabase();
  if (!sb) return;
  const now = Date.now();
  if (now - lastMatchCleanupAt < MATCH_CLEANUP_EVERY_MS) return;
  lastMatchCleanupAt = now;
  const cutoff = new Date(now - MATCH_RETENTION_DAYS * 86400000).toISOString();
  const { error, count } = await sb
    .from("matches")
    .delete({ count: "exact" })
    .lt("ended_at", cutoff);
  if (error) console.warn("[stats] cleanup matches", error.message);
  else if (count) console.log(`[stats] cleanup matches: ${count} partidas >${MATCH_RETENTION_DAYS}d`);
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
    await ensurePlayers(roster);
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
      hat_trick: isHatTrickForMatch(valid, p),
    }));
    const { error: pe } = await sb.from("match_players").insert(rows);
    if (pe) {
      const msg = pe.message || "";
      if (/clean_sheet|wom|hat_trick/i.test(msg)) {
        const retry = await sb.from("match_players").insert(
          rows.map(({ clean_sheet, wom, hat_trick, ...r }) => r)
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
  cleanupOldMatches().catch(() => {});

  return { match, mvpAuths: [...mvpAuths], womAuths: [...womAuths], titleUnlocks };
}

async function bumpPlayerStats(p) {
  const sb = getSupabase();
  if (!sb || !p.auth) return;

  const { data: cur } = await sb.from("player_stats").select("*").eq("auth", p.auth).maybeSingle();
  const row = overlayMemory(p.auth, cur || {
    auth: p.auth,
    ...emptyPlayerStats(),
  });

  const prev = {
    ...row,
    wins: row.wins || 0,
    mvps: row.mvps || 0,
    hat_tricks: row.hat_tricks || 0,
    cs: row.cs || 0,
    woms: row.woms || 0,
    selected_title: row.selected_title || null,
    gifted_titles: row.gifted_titles,
  };

  row.games += 1;
  if (p.result === "win") row.wins += 1;
  else if (p.result === "draw") row.draws += 1;
  else if (p.result === "loss") row.losses += 1;
  row.goals += p.goals || 0;
  if (isHatTrick(p)) row.hat_tricks = (row.hat_tricks || 0) + 1;
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
    if (/cs|woms|gifted_titles|hat_tricks/i.test(error.message || "")) {
      const { cs: _cs, woms: _woms, gifted_titles: _g, hat_tricks: _ht, ...withoutOptional } = row;
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
    if ((Number(row.goals) || 0) >= 3) acc.hat_tricks += 1;
  }
  return acc;
}

async function getPlayerStats(auth) {
  const sb = getSupabase();
  if (!auth) return emptyPlayerStats();
  if (!sb) return overlayMemory(auth, emptyPlayerStats());
  const { data, error } = await sb.from("player_stats").select("*").eq("auth", auth).maybeSingle();
  if (error) console.error("[stats] get", error.message);
  const row = overlayMemory(auth, { ...emptyPlayerStats(), ...(data || {}) });
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
    if (fromMatches) {
      return overlayMemory(auth, {
        ...row,
        ...fromMatches,
        selected_title: row.selected_title,
        gifted_titles: row.gifted_titles,
      });
    }
  }
  return row;
}

async function persistGiftedTitles(auth, ids) {
  const list = normalizeGiftedIds(ids);
  patchStatsMemory(auth, { gifted_titles: list });
  const sb = getSupabase();
  if (!sb || !auth) return true;
  await ensurePlayer(auth, null);
  const { data: cur } = await sb.from("player_stats").select("*").eq("auth", auth).maybeSingle();
  const row = overlayMemory(auth, cur || { auth, ...emptyPlayerStats() });
  row.auth = auth;
  row.gifted_titles = list;
  row.updated_at = new Date().toISOString();
  const { error } = await sb.from("player_stats").upsert(row);
  if (error) {
    if (/gifted_titles/i.test(error.message || "")) return true;
    console.error("[stats] gifted", error.message);
    return false;
  }
  return true;
}

async function grantGiftedTitle(auth, titleId) {
  if (!auth || !titleId) return false;
  const id = String(titleId);
  const current = mergeGiftedTitles(auth, (await getPlayerStats(auth)).gifted_titles);
  if (!current.includes(id)) current.push(id);
  return persistGiftedTitles(auth, current);
}

async function revokeGiftedTitle(auth, titleId) {
  if (!auth || !titleId) return false;
  const id = String(titleId);
  const current = mergeGiftedTitles(auth, (await getPlayerStats(auth)).gifted_titles).filter((x) => x !== id);
  return persistGiftedTitles(auth, current);
}

async function setSelectedTitle(auth, titleId) {
  if (!auth) return false;
  patchStatsMemory(auth, { selected_title: titleId ?? null });
  const sb = getSupabase();
  if (!sb) return true;
  await ensurePlayer(auth, null);
  const { data: cur } = await sb.from("player_stats").select("*").eq("auth", auth).maybeSingle();
  const row = overlayMemory(auth, cur || {
    auth,
    ...emptyPlayerStats(),
  });
  row.auth = auth;
  row.selected_title = titleId ?? null;
  row.updated_at = new Date().toISOString();
  const { error } = await sb.from("player_stats").upsert(row);
  if (error) {
    if (/gifted_titles/i.test(error.message || "")) {
      const { gifted_titles: _g, ...withoutGift } = row;
      const retry = await sb.from("player_stats").upsert(withoutGift);
      if (retry.error) {
        console.error("[stats] set title", retry.error.message);
        return false;
      }
      return true;
    }
    console.error("[stats] set title", error.message);
    return false;
  }
  return true;
}

function emptyBoards() {
  return { goals: [], assists: [], own_goals: [], mvps: [], cs: [], woms: [], games: [], wins: [], hat_tricks: [] };
}

const LEADERBOARD_COLS = ["games", "goals", "assists", "own_goals", "mvps", "cs", "woms", "wins", "hat_tricks"];
const OPTIONAL_LEADERBOARD_COLS = new Set(["hat_tricks", "cs", "woms"]);

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

function createLeaderboardStore({ ttlMs = LEADERBOARD_TTL_MS, load } = {}) {
  let cache = { at: 0, payload: null };
  let inflight = null;

  function slice(payload, stat) {
    if (!payload || payload.unavailable) return { unavailable: true, rows: [] };
    return { unavailable: false, rows: payload.boards?.[stat] || [] };
  }

  function usable(payload) {
    return !!(payload && !payload.unavailable);
  }

  function startLoad() {
    if (inflight) return inflight;
    if (typeof load !== "function") {
      return Promise.resolve({ unavailable: true, boards: emptyBoards() });
    }
    inflight = Promise.resolve()
      .then(() => load())
      .then((raw) => {
        if (!raw || raw.unavailable) {
          return usable(cache.payload) ? cache.payload : { unavailable: true, boards: emptyBoards() };
        }
        const payload = { unavailable: false, boards: { ...emptyBoards(), ...raw.boards } };
        cache = { at: Date.now(), payload };
        return payload;
      })
      .catch((err) => {
        console.error("[stats] leaderboard", err?.message || err);
        return usable(cache.payload) ? cache.payload : { unavailable: true, boards: emptyBoards() };
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  async function get(stat) {
    const now = Date.now();
    if (usable(cache.payload) && now - cache.at < ttlMs) return slice(cache.payload, stat);
    if (usable(cache.payload)) {
      startLoad();
      return slice(cache.payload, stat);
    }
    return slice(await startLoad(), stat);
  }

  function invalidate() {
    cache = { at: 0, payload: cache.payload };
    return startLoad();
  }

  return { get, invalidate };
}

async function fetchTopColumn(sb, col) {
  const { data, error } = await sb
    .from("player_stats")
    .select(`auth, ${col}`)
    .order(col, { ascending: false })
    .limit(8);
  if (error) return { error: error.message || String(error), rows: [] };
  return { error: null, rows: data || [] };
}

async function resolveNickMap(sb, auths) {
  const nickMap = {};
  if (!auths.length) return nickMap;

  const { data: people, error } = await sb.from("players").select("auth, nick").in("auth", auths);
  if (error) console.error("[stats] top nicks", error.message);
  for (const p of people || []) {
    if (p.nick && String(p.nick).trim()) nickMap[p.auth] = String(p.nick).trim();
  }

  const missingAuths = auths.filter((auth) => !nickMap[auth]);
  if (!missingAuths.length) return nickMap;

  const { data: history, error: historyError } = await sb
    .from("match_players")
    .select("auth, nick")
    .in("auth", missingAuths)
    .not("nick", "is", null)
    .neq("nick", "")
    .order("match_id", { ascending: false })
    .limit(200);
  if (historyError) console.error("[stats] fallback nicks", historyError.message);
  for (const row of history || []) {
    const nick = row.nick && String(row.nick).trim();
    if (row.auth && nick && !nickMap[row.auth]) nickMap[row.auth] = nick;
  }
  return nickMap;
}

async function queryLeaderboards(sb) {
  const fetched = await Promise.all(LEADERBOARD_COLS.map(async (col) => ({ col, ...(await fetchTopColumn(sb, col)) })));
  const coreFailed = fetched.filter((r) => r.error && !OPTIONAL_LEADERBOARD_COLS.has(r.col));
  if (coreFailed.length) {
    const err = new Error(coreFailed.map((r) => `${r.col}: ${r.error}`).join(" | "));
    err.unavailable = true;
    throw err;
  }

  const auths = [...new Set(fetched.flatMap((r) => (r.rows || []).map((row) => row.auth).filter(Boolean)))];
  const nickMap = await resolveNickMap(sb, auths);
  const boards = emptyBoards();
  for (const item of fetched) {
    if (item.error) {
      console.error("[stats] top", item.col, item.error);
      boards[item.col] = [];
      continue;
    }
    boards[item.col] = mapLeaderboardRows(item.rows, item.col, nickMap).slice(0, 5);
  }
  return boards;
}

const leaderboardStore = createLeaderboardStore({
  async load() {
    const sb = getSupabase();
    if (!sb) return { unavailable: true };
    try {
      return { unavailable: false, boards: await queryLeaderboards(sb) };
    } catch (err) {
      console.error("[stats] leaderboard", err?.message || err);
      return { unavailable: true };
    }
  },
});

function invalidateLeaderboards() {
  leaderboardStore.invalidate();
}

function getLeaderboard(stat) {
  return leaderboardStore.get(stat);
}

async function persistPlayerStatsRow(auth, row) {
  if (!auth) return false;
  const next = { ...emptyPlayerStats(), ...row, gifted_titles: normalizeGiftedIds(row?.gifted_titles) };
  next.selected_title = row?.selected_title ?? null;
  patchStatsMemory(auth, { ...next, _full: true });
  const sb = getSupabase();
  if (!sb) return true;
  await ensurePlayer(auth, null);
  const { data: cur } = await sb.from("player_stats").select("*").eq("auth", auth).maybeSingle();
  const saved = overlayMemory(auth, cur || { auth, ...emptyPlayerStats() });
  Object.assign(saved, next);
  saved.auth = auth;
  saved.updated_at = new Date().toISOString();
  const { error } = await sb.from("player_stats").upsert(saved);
  if (error) {
    if (/gifted_titles|hat_tricks/i.test(error.message || "")) {
      const { gifted_titles: _g, hat_tricks: _ht, ...withoutGift } = saved;
      const retry = await sb.from("player_stats").upsert(withoutGift);
      if (retry.error) {
        console.error("[stats] persist", retry.error.message);
        return false;
      }
      return true;
    }
    console.error("[stats] persist", error.message);
    return false;
  }
  return true;
}

async function transferPlayerStats(targetAuth, sourceAuth) {
  const targetId = String(targetAuth || "").trim();
  const sourceId = String(sourceAuth || "").trim();
  if (!targetId || !sourceId) return { ok: false, reason: "invalid" };
  if (targetId === sourceId) return { ok: false, reason: "same" };

  const sb = getSupabase();
  if (sb) {
    await ensurePlayer(targetId, null);
    await ensurePlayer(sourceId, null);
    const { data, error } = await sb.rpc("transfer_player_stats", {
      p_target_auth: targetId,
      p_source_auth: sourceId,
    });
    if (error || !data?.before || !data?.after) {
      console.error("[stats] transfer", error?.message || "resposta inválida da função");
      return { ok: false, reason: "database" };
    }

    const zeroed = { ...emptyPlayerStats(), gifted_titles: [], selected_title: null };
    patchStatsMemory(targetId, { ...data.after, _full: true });
    patchStatsMemory(sourceId, { ...zeroed, _full: true });
    invalidateLeaderboards();
    return {
      ok: true,
      before: data.before,
      after: data.after,
      sourceAfter: data.source_after || zeroed,
    };
  }

  const target = await getPlayerStats(targetId);
  const source = await getPlayerStats(sourceId);
  const summed = emptyPlayerStats();
  for (const k of STAT_SUM_KEYS) {
    summed[k] = (Number(target[k]) || 0) + (Number(source[k]) || 0);
  }
  summed.gifted_titles = [
    ...new Set([...normalizeGiftedIds(target.gifted_titles), ...normalizeGiftedIds(source.gifted_titles)]),
  ];
  summed.selected_title = target.selected_title || source.selected_title || null;
  const zeroed = { ...emptyPlayerStats(), gifted_titles: [], selected_title: null };
  const okT = await persistPlayerStatsRow(targetId, summed);
  const okS = await persistPlayerStatsRow(sourceId, zeroed);
  if (okT && okS) invalidateLeaderboards();
  return {
    ok: okT && okS,
    before: { target, source },
    after: summed,
    sourceAfter: zeroed,
  };
}

async function resetPlayerCareer(auth) {
  const id = String(auth || "").trim();
  if (!id) return false;
  const gifted = normalizeGiftedIds(mergeGiftedTitles(id, readStatsMemory(id).gifted_titles));
  const blank = { ...emptyPlayerStats(), gifted_titles: gifted, selected_title: null };
  patchStatsMemory(id, { ...blank, _full: true });
  const sb = getSupabase();
  if (!sb) return true;
  try {
    const { data: cur } = await sb.from("player_stats").select("gifted_titles").eq("auth", id).maybeSingle();
    const kept = mergeGiftedTitles(id, cur?.gifted_titles);
    const row = {
      auth: id,
      ...emptyPlayerStats(),
      gifted_titles: kept,
      selected_title: null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from("player_stats").upsert(row);
    if (error) {
      console.error("[stats] reset career", error.message);
      return false;
    }
    const deleted = await sb.from("match_players").delete().eq("auth", id);
    if (deleted.error) console.warn("[stats] reset history", deleted.error.message);
    invalidateLeaderboards();
    return true;
  } catch (err) {
    console.error("[stats] reset career", err?.message || err);
    return false;
  }
}

module.exports = {
  saveMatch,
  getPlayerStats,
  bumpPlayerStats,
  setSelectedTitle,
  grantGiftedTitle,
  revokeGiftedTitle,
  resetStatsMemory,
  persistPlayerStatsRow,
  transferPlayerStats,
  resetPlayerCareer,
  pickMatchMvps,
  emptyPlayerStats,
  formatStatusCard,
  winratePct,
  isHatTrick,
  isHatTrickForMatch,
  formatTop5,
  mapLeaderboardRows,
  createLeaderboardStore,
  getLeaderboard,
  invalidateLeaderboards,
};

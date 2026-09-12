const fs = require("fs");
const path = require("path");
const config = require("../config");
const { getSupabase } = require("../db/supabase");
const { sanitizeHolders } = require("./streak");

const ROOM_META_ID = "x4";

function emptyTotals() {
  return { goals: 0, games: 0, bets: 0, viados: 0, bestStreak: 0, bestStreakHolders: [] };
}

function sanitize(row) {
  return {
    goals: Math.max(0, Math.floor(Number(row?.goals) || 0)),
    games: Math.max(0, Math.floor(Number(row?.games) || 0)),
    bets: Math.max(0, Math.floor(Number(row?.bets) || 0)),
    viados: Math.max(0, Math.floor(Number(row?.viados) || 0)),
    bestStreak: Math.max(0, Math.floor(Number(row?.bestStreak ?? row?.best_streak) || 0)),
    bestStreakHolders: sanitizeHolders(
      row?.bestStreakHolders ?? row?.best_streak_holders
    ),
  };
}

function defaultFilePath() {
  if (process.env.ROOM_STATS_FILE) return process.env.ROOM_STATS_FILE;
  if (process.env.NODE_TEST_CONTEXT) return "";
  return path.join(config.root, "data", "room-stats.json");
}

async function persistBestStreak(n, holders = []) {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from("room_meta").upsert({
    id: ROOM_META_ID,
    best_streak: n,
    best_streak_holders: sanitizeHolders(holders),
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn("[room-stats] persist best", error.message);
}

async function persistBets(n) {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from("room_meta").upsert({
    id: ROOM_META_ID,
    bets: Math.max(0, Math.floor(Number(n) || 0)),
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn("[room-stats] persist bets", error.message);
}

async function persistViados(n) {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from("room_meta").upsert({
    id: ROOM_META_ID,
    viados: Math.max(0, Math.floor(Number(n) || 0)),
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn("[room-stats] persist viados", error.message);
}

async function persistTotals(games, goals) {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from("room_meta").upsert({
    id: ROOM_META_ID,
    games: Math.max(0, Math.floor(Number(games) || 0)),
    goals: Math.max(0, Math.floor(Number(goals) || 0)),
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn("[room-stats] persist totals", error.message);
}

/**
 * Totais da sala (gols, partidas 4v4 válidas, apostas Haxbooket + recorde de streak).
 * Persistidos em JSON para não zerar no restart; se o Supabase tiver mais, usa o maior.
 */
function createRoomStats({ filePath } = {}) {
  const file = filePath || defaultFilePath();
  let state = load();

  function load() {
    try {
      return sanitize(JSON.parse(fs.readFileSync(file, "utf8")));
    } catch {
      return emptyTotals();
    }
  }

  function save() {
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(state)}\n`, "utf8");
    } catch (err) {
      console.warn("[room-stats] save", err.message);
    }
  }

  function snapshot() {
    return {
      ...state,
      bestStreakHolders: [...(state.bestStreakHolders || [])],
    };
  }

  function recordCompletedMatch({ goals = 0 } = {}) {
    state.goals += Math.max(0, Math.floor(Number(goals) || 0));
    state.games += 1;
    save();
    persistTotals(state.games, state.goals).catch(() => {});
    return snapshot();
  }

  function setBestStreak(n, holders = []) {
    const v = Math.max(0, Math.floor(Number(n) || 0));
    const names = sanitizeHolders(holders);
    if (v < state.bestStreak) return snapshot();
    const sameHolders =
      names.length === (state.bestStreakHolders || []).length &&
      names.every((name, i) => name === state.bestStreakHolders[i]);
    if (v === state.bestStreak && (sameHolders || !names.length)) return snapshot();
    state.bestStreak = v;
    if (names.length) state.bestStreakHolders = names;
    save();
    persistBestStreak(state.bestStreak, state.bestStreakHolders).catch(() => {});
    return snapshot();
  }

  function recordBet() {
    state.bets += 1;
    save();
    persistBets(state.bets).catch(() => {});
    return snapshot();
  }

  function recordViado() {
    state.viados += 1;
    save();
    persistViados(state.viados).catch(() => {});
    return snapshot();
  }

  async function hydrateFromDb() {
    const sb = getSupabase();
    if (!sb) return snapshot();
    try {
      const metaRes = await sb
        .from("room_meta")
        .select("best_streak, best_streak_holders, bets, viados, games, goals")
        .eq("id", ROOM_META_ID)
        .maybeSingle();
      let remoteGames = Number(metaRes.data?.games) || 0;
      let remoteGoals = Number(metaRes.data?.goals) || 0;
      if ((!remoteGames && !state.games) || (!remoteGoals && !state.goals)) {
        const [gamesRes, goalsRes] = await Promise.all([
          sb.from("matches").select("id", { count: "exact", head: true }).eq("valid", true),
          sb.from("match_goals").select("id", { count: "exact", head: true }).eq("is_own_goal", false),
        ]);
        remoteGames = Math.max(remoteGames, Number(gamesRes.count) || 0);
        remoteGoals = Math.max(remoteGoals, Number(goalsRes.count) || 0);
      }
      const remote = sanitize({
        games: remoteGames,
        goals: remoteGoals,
        bets: metaRes.data?.bets,
        viados: metaRes.data?.viados,
        bestStreak: metaRes.data?.best_streak,
        bestStreakHolders: metaRes.data?.best_streak_holders,
      });
      if (remote.games > state.games) state.games = remote.games;
      if (remote.goals > state.goals) state.goals = remote.goals;
      if (remote.bets > state.bets) state.bets = remote.bets;
      if (remote.viados > state.viados) state.viados = remote.viados;
      if (remote.bestStreak > state.bestStreak) {
        state.bestStreak = remote.bestStreak;
        state.bestStreakHolders = remote.bestStreakHolders;
      } else if (
        remote.bestStreak === state.bestStreak &&
        !(state.bestStreakHolders || []).length &&
        remote.bestStreakHolders.length
      ) {
        state.bestStreakHolders = remote.bestStreakHolders;
      }
      save();
      if (!metaRes.error && state.bestStreak > remote.bestStreak) {
        persistBestStreak(state.bestStreak, state.bestStreakHolders).catch(() => {});
      } else if (
        !metaRes.error &&
        state.bestStreak === remote.bestStreak &&
        (state.bestStreakHolders || []).length &&
        !remote.bestStreakHolders.length
      ) {
        persistBestStreak(state.bestStreak, state.bestStreakHolders).catch(() => {});
      }
      if (!metaRes.error && state.bets > remote.bets) {
        persistBets(state.bets).catch(() => {});
      }
      if (!metaRes.error && state.viados > remote.viados) {
        persistViados(state.viados).catch(() => {});
      }
      if (
        !metaRes.error &&
        (state.games > (Number(metaRes.data?.games) || 0) ||
          state.goals > (Number(metaRes.data?.goals) || 0))
      ) {
        persistTotals(state.games, state.goals).catch(() => {});
      }
    } catch (err) {
      console.warn("[room-stats] hydrate", err.message);
    }
    return snapshot();
  }

  return { snapshot, recordCompletedMatch, setBestStreak, recordBet, recordViado, hydrateFromDb };
}

module.exports = { createRoomStats, emptyTotals, ROOM_META_ID };

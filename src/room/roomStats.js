const fs = require("fs");
const path = require("path");
const config = require("../config");
const { getSupabase } = require("../db/supabase");

const ROOM_META_ID = "x4";

function emptyTotals() {
  return { goals: 0, games: 0, bestStreak: 0 };
}

function sanitize(row) {
  return {
    goals: Math.max(0, Math.floor(Number(row?.goals) || 0)),
    games: Math.max(0, Math.floor(Number(row?.games) || 0)),
    bestStreak: Math.max(0, Math.floor(Number(row?.bestStreak ?? row?.best_streak) || 0)),
  };
}

function defaultFilePath() {
  if (process.env.ROOM_STATS_FILE) return process.env.ROOM_STATS_FILE;
  if (process.env.NODE_TEST_CONTEXT) return "";
  return path.join(config.root, "data", "room-stats.json");
}

async function persistBestStreak(n) {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from("room_meta").upsert({
    id: ROOM_META_ID,
    best_streak: n,
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn("[room-stats] persist best", error.message);
}

/**
 * Totais da sala (gols e partidas 4v4 válidas + recorde de streak).
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
    return { ...state };
  }

  function recordCompletedMatch({ goals = 0 } = {}) {
    state.goals += Math.max(0, Math.floor(Number(goals) || 0));
    state.games += 1;
    save();
    return snapshot();
  }

  function setBestStreak(n) {
    const v = Math.max(state.bestStreak || 0, Math.max(0, Math.floor(Number(n) || 0)));
    if (v === state.bestStreak) return snapshot();
    state.bestStreak = v;
    save();
    persistBestStreak(v).catch(() => {});
    return snapshot();
  }

  async function hydrateFromDb() {
    const sb = getSupabase();
    if (!sb) return snapshot();
    try {
      const [gamesRes, goalsRes, metaRes] = await Promise.all([
        sb.from("matches").select("*", { count: "exact", head: true }).eq("valid", true),
        sb.from("match_goals").select("*", { count: "exact", head: true }).eq("is_own_goal", false),
        sb.from("room_meta").select("best_streak").eq("id", ROOM_META_ID).maybeSingle(),
      ]);
      const remote = sanitize({
        games: gamesRes.count,
        goals: goalsRes.count,
        bestStreak: metaRes.data?.best_streak,
      });
      if (remote.games > state.games) state.games = remote.games;
      if (remote.goals > state.goals) state.goals = remote.goals;
      if (remote.bestStreak > state.bestStreak) state.bestStreak = remote.bestStreak;
      save();
      if (!metaRes.error && state.bestStreak > remote.bestStreak) {
        persistBestStreak(state.bestStreak).catch(() => {});
      }
    } catch (err) {
      console.warn("[room-stats] hydrate", err.message);
    }
    return snapshot();
  }

  return { snapshot, recordCompletedMatch, setBestStreak, hydrateFromDb };
}

module.exports = { createRoomStats, emptyTotals, ROOM_META_ID };

const fs = require("fs");
const path = require("path");
const config = require("../config");
const { getSupabase } = require("../db/supabase");

function emptyTotals() {
  return { goals: 0, games: 0 };
}

function sanitize(row) {
  return {
    goals: Math.max(0, Math.floor(Number(row?.goals) || 0)),
    games: Math.max(0, Math.floor(Number(row?.games) || 0)),
  };
}

function defaultFilePath() {
  if (process.env.ROOM_STATS_FILE) return process.env.ROOM_STATS_FILE;
  if (process.env.NODE_TEST_CONTEXT) return "";
  return path.join(config.root, "data", "room-stats.json");
}

/**
 * Totais da sala (gols e partidas 4v4 válidas). Persistidos em JSON
 * para o carrossel não zerar no restart; se o Supabase tiver mais, usa o maior.
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

  async function hydrateFromDb() {
    const sb = getSupabase();
    if (!sb) return snapshot();
    try {
      const [gamesRes, goalsRes] = await Promise.all([
        sb.from("matches").select("*", { count: "exact", head: true }).eq("valid", true),
        sb.from("match_goals").select("*", { count: "exact", head: true }).eq("is_own_goal", false),
      ]);
      const remote = sanitize({
        games: gamesRes.count,
        goals: goalsRes.count,
      });
      if (remote.games > state.games) state.games = remote.games;
      if (remote.goals > state.goals) state.goals = remote.goals;
      save();
    } catch (err) {
      console.warn("[room-stats] hydrate", err.message);
    }
    return snapshot();
  }

  return { snapshot, recordCompletedMatch, hydrateFromDb };
}

module.exports = { createRoomStats, emptyTotals };

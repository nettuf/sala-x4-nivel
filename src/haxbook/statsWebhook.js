/**
 * POST de stats 4v4 para a API do site. Independente do Discord e do Supabase.
 */

const PARTICIPANT_KEYS = [
  "nickname",
  "team",
  "goals",
  "assists",
  "cleanSheet",
  "ownGoals",
  "playTime",
  "isGoalkeeper",
];

function lastFourOnTeam(players, team) {
  const onField = (players || []).filter((p) => p && p.id !== 0 && p.team === team);
  if (onField.length < 4) return null;
  return onField.slice(-4);
}

function fieldEightAtWhistle(players) {
  const red = lastFourOnTeam(players, 1);
  const blue = lastFourOnTeam(players, 2);
  if (!red || !blue) return null;
  return { red, blue };
}

function shouldSendHaxbookStats({ valid, startedFourOnFour, formatBroken, fieldEight } = {}) {
  return !!(
    valid &&
    startedFourOnFour &&
    !formatBroken &&
    fieldEight?.red?.length === 4 &&
    fieldEight?.blue?.length === 4
  );
}

function winnerLabel(winner) {
  if (winner === 1) return "RED";
  if (winner === 2) return "BLUE";
  return "DRAW";
}

function makeMatchId(now = Date.now(), random = Math.random) {
  let rand = random().toString(36).slice(2, 11);
  if (rand.length < 9) rand = rand.padEnd(9, "0");
  return `${now}-${rand}`;
}

function participantRow({ nickname, team, goals, assists, ownGoals, cleanSheet, isGoalkeeper }) {
  return {
    nickname: nickname == null ? "" : String(nickname),
    team,
    goals: Number(goals) || 0,
    assists: Number(assists) || 0,
    cleanSheet: cleanSheet ? 1 : 0,
    ownGoals: Number(ownGoals) || 0,
    playTime: 0,
    isGoalkeeper: !!isGoalkeeper,
  };
}

function buildParticipants({ red, blue, tally, gk, redScore, blueScore } = {}) {
  const rows = [];
  const redGk = gk?.redId ?? null;
  const blueGk = gk?.blueId ?? null;
  for (const p of red || []) {
    const t = typeof tally === "function" ? tally(p) : {};
    const isGk = redGk != null && p.id === redGk;
    rows.push(
      participantRow({
        nickname: p.name,
        team: "RED",
        goals: t.goals,
        assists: t.assists,
        ownGoals: t.own_goals,
        cleanSheet: Number(blueScore) === 0 && isGk,
        isGoalkeeper: isGk,
      })
    );
  }
  for (const p of blue || []) {
    const t = typeof tally === "function" ? tally(p) : {};
    const isGk = blueGk != null && p.id === blueGk;
    rows.push(
      participantRow({
        nickname: p.name,
        team: "BLUE",
        goals: t.goals,
        assists: t.assists,
        ownGoals: t.own_goals,
        cleanSheet: Number(redScore) === 0 && isGk,
        isGoalkeeper: isGk,
      })
    );
  }
  return rows;
}

function buildStatsBody({ matchId, redScore, blueScore, winner, roomName, participants }) {
  return {
    matchId,
    redScore: Number(redScore) || 0,
    blueScore: Number(blueScore) || 0,
    winner: winnerLabel(winner),
    roomName,
    participants,
  };
}

function delay(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t.unref === "function") t.unref();
  });
}

/**
 * Uma tentativa extra se o POST falhar; se a segunda também falhar, perde.
 * Não lança — o próximo jogo não espera.
 */
async function postMatchStats(url, apiKey, body, opts = {}) {
  const fetchImpl = opts.fetch || globalThis.fetch;
  const retryDelayMs = opts.retryDelayMs ?? 500;
  const timeoutMs = opts.timeoutMs ?? 8000;
  if (!url || !apiKey || !body) return { ok: false, attempts: 0 };

  async function once() {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res?.ok) {
      throw new Error(`HTTP ${res?.status || 0}`);
    }
    return true;
  }

  let attempts = 0;
  try {
    attempts += 1;
    await once();
    return { ok: true, attempts };
  } catch (err) {
    console.warn("[haxbook] stats", err.message);
  }
  try {
    if (retryDelayMs > 0) await delay(retryDelayMs);
    attempts += 1;
    await once();
    return { ok: true, attempts };
  } catch (err) {
    console.warn("[haxbook] stats retry failed — partida perdida no site", err.message);
    return { ok: false, attempts };
  }
}

module.exports = {
  PARTICIPANT_KEYS,
  lastFourOnTeam,
  fieldEightAtWhistle,
  shouldSendHaxbookStats,
  winnerLabel,
  makeMatchId,
  participantRow,
  buildParticipants,
  buildStatsBody,
  postMatchStats,
};

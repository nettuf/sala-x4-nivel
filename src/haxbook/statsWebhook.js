/**
 * POST de stats 4v4 para a API do site. Independente do Discord e do Supabase.
 */

const PARTICIPANT_KEYS = [
  "nickname",
  "auth",
  "team",
  "goals",
  "assists",
  "cleanSheet",
  "ownGoals",
  "playTime",
  "isGoalkeeper",
  "mvp",
  "worst",
  "passes",
  "misplaced",
  "tackles",
  "interceptions",
  "saves",
  "lost",
  "possTicks",
  "clearances",
  "errors",
  "shotSaved",
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

/** Últimos 4 de cada lado no lineup oficial (reposições entram; saída pós-apito não apaga). */
function fieldEightFromLineup(lineupRed, lineupBlue) {
  const red = (lineupRed || []).filter((p) => p && p.id !== 0).slice(-4);
  const blue = (lineupBlue || []).filter((p) => p && p.id !== 0).slice(-4);
  if (red.length < 4 || blue.length < 4) return null;
  return { red, blue };
}

/**
 * Partida decidida: lineup oficial primeiro (ragequit / saída na celebração
 * não mudam quem conta). Senão: campo ao vivo (reposição ainda no apito),
 * com fallback no lineup.
 */
function resolveFieldEightForSite(livePlayers, lineupRed, lineupBlue, { decided = false } = {}) {
  const lineup = fieldEightFromLineup(lineupRed, lineupBlue);
  const live = fieldEightAtWhistle(livePlayers);
  if (decided && lineup) return { fieldEight: lineup, source: "lineup" };
  if (live) return { fieldEight: live, source: "apito" };
  if (lineup) return { fieldEight: lineup, source: "lineup" };
  return { fieldEight: null, source: null };
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

function siteStatsSkipReason({ valid, startedFourOnFour, formatBroken, fieldEight } = {}) {
  if (!valid) return "invalida";
  if (!startedFourOnFour) return "nao-comecou-4v4";
  if (formatBroken) return "format-broken";
  if (!fieldEight || fieldEight.red?.length !== 4 || fieldEight.blue?.length !== 4) {
    return "sem-8-jogadores";
  }
  return null;
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

function intStat(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function playForPlayer(player, playMap) {
  if (!player || !playMap) return null;
  if (player.id != null && playMap.has?.(player.id)) return playMap.get(player.id);
  if (player.auth) {
    for (const row of playMap.values()) {
      if (row?.auth && row.auth === player.auth) return row;
    }
  }
  return null;
}

function participantRow({
  nickname,
  auth,
  team,
  goals,
  assists,
  ownGoals,
  cleanSheet,
  isGoalkeeper,
  playTime,
  play,
  mvp,
  worst,
}) {
  return {
    nickname: nickname == null ? "" : String(nickname),
    auth: auth == null ? null : String(auth),
    team,
    goals: Number(goals) || 0,
    assists: Number(assists) || 0,
    cleanSheet: cleanSheet ? 1 : 0,
    ownGoals: Number(ownGoals) || 0,
    playTime: intStat(playTime),
    isGoalkeeper: !!isGoalkeeper,
    mvp: !!mvp,
    worst: !!worst,
    passes: intStat(play?.passes),
    misplaced: intStat(play?.misplaced),
    tackles: intStat(play?.tackles),
    interceptions: intStat(play?.interceptions),
    saves: intStat(play?.saves),
    lost: intStat(play?.lost),
    possTicks: intStat(play?.possTicks),
    clearances: intStat(play?.clearances),
    errors: intStat(play?.errors),
    shotSaved: intStat(play?.shotSaved),
  };
}

function buildParticipants({
  red,
  blue,
  tally,
  gk,
  redScore,
  blueScore,
  playMap,
  mvpAuths,
  worstAuths,
  playTime,
} = {}) {
  const rows = [];
  const redGk = gk?.redId ?? null;
  const blueGk = gk?.blueId ?? null;
  for (const p of red || []) {
    const t = typeof tally === "function" ? tally(p) : {};
    const isGk = redGk != null && p.id === redGk;
    rows.push(
      participantRow({
        nickname: p.name,
        auth: p.auth,
        team: "RED",
        goals: t.goals,
        assists: t.assists,
        ownGoals: t.own_goals,
        cleanSheet: Number(blueScore) === 0 && isGk,
        isGoalkeeper: isGk,
        playTime,
        play: playForPlayer(p, playMap),
        mvp: !!(p.auth && mvpAuths?.has(p.auth)),
        worst: !!(p.auth && worstAuths?.has(p.auth)),
      })
    );
  }
  for (const p of blue || []) {
    const t = typeof tally === "function" ? tally(p) : {};
    const isGk = blueGk != null && p.id === blueGk;
    rows.push(
      participantRow({
        nickname: p.name,
        auth: p.auth,
        team: "BLUE",
        goals: t.goals,
        assists: t.assists,
        ownGoals: t.own_goals,
        cleanSheet: Number(redScore) === 0 && isGk,
        isGoalkeeper: isGk,
        playTime,
        play: playForPlayer(p, playMap),
        mvp: !!(p.auth && mvpAuths?.has(p.auth)),
        worst: !!(p.auth && worstAuths?.has(p.auth)),
      })
    );
  }
  return rows;
}

function buildStatsBody({ matchId, redScore, blueScore, winner, roomName, participants, startedAt }) {
  const body = {
    matchId,
    redScore: Number(redScore) || 0,
    blueScore: Number(blueScore) || 0,
    winner: winnerLabel(winner),
    roomName,
    participants,
  };
  if (startedAt != null) body.startedAt = Number(startedAt);
  return body;
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
  if (!url || !apiKey || !body) {
    console.warn(
      `[haxbook] stats skip: ${!url ? "url" : !apiKey ? "apiKey" : "body"} ausente` +
        (body?.matchId ? ` matchId=${body.matchId}` : "")
    );
    return { ok: false, attempts: 0 };
  }

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
    console.log(
      `[haxbook] stats ok matchId=${body.matchId || "?"} ${body.redScore ?? "?"}x${body.blueScore ?? "?"} attempts=${attempts}`
    );
    return { ok: true, attempts };
  } catch (err) {
    console.warn("[haxbook] stats", err.message);
  }
  try {
    if (retryDelayMs > 0) await delay(retryDelayMs);
    attempts += 1;
    await once();
    console.log(
      `[haxbook] stats ok matchId=${body.matchId || "?"} ${body.redScore ?? "?"}x${body.blueScore ?? "?"} attempts=${attempts}`
    );
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
  fieldEightFromLineup,
  resolveFieldEightForSite,
  shouldSendHaxbookStats,
  siteStatsSkipReason,
  winnerLabel,
  makeMatchId,
  participantRow,
  buildParticipants,
  buildStatsBody,
  postMatchStats,
};

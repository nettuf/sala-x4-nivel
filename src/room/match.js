const config = require("../config");
const { saveMatch } = require("../db/stats");
const { sendReplayAndSummary } = require("../discord/replay");
const {
  attributeGoal,
  isValidMatchScores,
  formatMatchClock,
  possessionPercents,
  canJoinMatchStats,
  isDecidedLosingScore,
  pickGoalkeeper,
  sameTouchPlayer,
} = require("../gameLogic");
const { pickMatchMvps, pickMatchWorst } = require("../titles");

/**
 * Controle de partida: recording, toques (gol/assist), stats e replay.
 */
function createMatchController(room, { identify, onCompletedMatch } = {}) {
  /** @type {null | {
   *   recordingStarted: boolean,
   *   touches: object[],
   *   goals: object[],
   *   lineupRed: object[],
   *   lineupBlue: object[],
   * }} */
  let match = null;
  let endByVictory = false;
  let lastScores = null;
  let goldenGoal = false;
  let timeExpiryHandled = false;
  let activePlay = false;
  let redPoss = 0;
  let bluePoss = 0;
  let tickN = 0;
  /** @type {Map<number, { xSum: number, n: number, team: number }>} */
  let gkSamples = new Map();
  const TOUCH_RADIUS = 27;
  const TOUCH_RADIUS_SQ = TOUCH_RADIUS * TOUCH_RADIUS;
  const TOUCH_HISTORY = 16;

  function who(player) {
    if (!player) return player;
    if (typeof identify !== "function") return player;
    try {
      return identify(player) || player;
    } catch {
      return player;
    }
  }

  function playersOf(team) {
    return room.getPlayerList().filter((p) => p.team === team).map((p) => who(p));
  }

  function rememberScores(s) {
    if (!s) return lastScores;
    lastScores = {
      red: s.red,
      blue: s.blue,
      time: s.time,
      scoreLimit: s.scoreLimit,
      timeLimit: s.timeLimit,
    };
    return lastScores;
  }

  function snapshotScores() {
    const live = room.getScores();
    if (live && ((live.red || 0) > 0 || (live.blue || 0) > 0 || (live.time || 0) > 0)) {
      return rememberScores(live);
    }
    return lastScores || live || null;
  }

  function onTick() {
    const s = room.getScores();
    rememberScores(s);

    if (match && activePlay) {
      const last = match.touches[0];
      if (last?.team === 1) redPoss += 1;
      else if (last?.team === 2) bluePoss += 1;
    }

    if (match && s) {
      tickN += 1;
      sampleField();
    }

    if (!match || !s) return;
    const timeLimit = s.timeLimit || 0;
    if (timeLimit > 0 && Math.abs((s.time || 0) - timeLimit) <= 0.08) {
      if (s.red !== s.blue) {
        if (!timeExpiryHandled) {
          timeExpiryHandled = true;
          markVictory();
          const timer = setTimeout(() => {
            try {
              room.stopGame();
            } catch {
              /* ignore */
            }
          }, 2000);
          if (typeof timer.unref === "function") timer.unref();
        }
        return;
      }
      if (!goldenGoal) {
        goldenGoal = true;
        try {
          room.setTimeLimit(0);
        } catch {
          /* ignore */
        }
        room.sendAnnouncement(
          "⚽ Empate no tempo! Gol de ouro — próximo gol vence.",
          null,
          0xf1c40f,
          "bold",
          2
        );
      }
    }
  }

  function start({ competitive = false } = {}) {
    endByVictory = false;
    lastScores = null;
    goldenGoal = false;
    timeExpiryHandled = false;
    activePlay = false;
    redPoss = 0;
    bluePoss = 0;
    tickN = 0;
    gkSamples = new Map();
    match = {
      competitive,
      everCompetitive: !!competitive,
      recordingStarted: false,
      touches: [],
      goals: [],
      lastGoal: null,
      lineupRed: playersOf(1).map((p) => ({ id: p.id, name: p.name, auth: p.auth || null })),
      lineupBlue: playersOf(2).map((p) => ({ id: p.id, name: p.name, auth: p.auth || null })),
    };
    try {
      room.startRecording();
      match.recordingStarted = true;
    } catch (err) {
      console.warn("[match] startRecording", err.message);
    }
    room.startGame();
  }

  function recordTouch(player) {
    if (!match || !player || player.team === 0) return;
    const p = who(player);
    if (!p || p.team === 0) return;
    const last = match.touches[0];
    if (last && sameTouchPlayer(last, p)) return;
    match.touches.unshift({
      id: p.id,
      name: p.name,
      auth: p.auth || null,
      team: p.team,
    });
    if (match.touches.length > TOUCH_HISTORY) match.touches.length = TOUCH_HISTORY;
  }

  function sampleField() {
    const ball = typeof room.getBallPosition === "function" ? room.getBallPosition() : null;
    const canDisc = typeof room.getPlayerDiscProperties === "function";
    if (!canDisc) return;
    const sampleGk = tickN % 15 === 0;
    let closest = null;
    let closestD = TOUCH_RADIUS_SQ;
    for (const raw of room.getPlayerList()) {
      if (!raw || raw.id === 0 || raw.team === 0) continue;
      let disc = null;
      try {
        disc = room.getPlayerDiscProperties(raw.id);
      } catch {
        disc = null;
      }
      if (!disc) continue;
      if (ball && Number.isFinite(disc.x) && Number.isFinite(disc.y)) {
        const dx = disc.x - (ball.x || 0);
        const dy = disc.y - (ball.y || 0);
        const d = dx * dx + dy * dy;
        if (d <= closestD) {
          closestD = d;
          closest = raw;
        }
      }
      if (sampleGk && Number.isFinite(disc.x)) {
        const cur = gkSamples.get(raw.id) || { xSum: 0, n: 0, team: raw.team };
        cur.xSum += disc.x;
        cur.n += 1;
        cur.team = raw.team;
        gkSamples.set(raw.id, cur);
      }
    }
    if (closest) recordTouch(closest);
  }

  function onBallKick(player) {
    if (!match || !player) return;
    activePlay = true;
    recordTouch(player);
  }

  function onTeamGoal(team) {
    if (!match) return;
    activePlay = false;
    const scores = rememberScores(room.getScores());
    const time = scores?.time ?? 0;
    const { scorer, assist, isOwnGoal } = attributeGoal(match.touches, team);
    const clock = formatMatchClock(time);
    const side = team === 1 ? "🔴" : "🔵";
    const assistText = assist?.name ? ` · Assist: ${assist.name}` : "";

    const goal = {
      team,
      time,
      scorerId: scorer?.id || null,
      scorerAuth: scorer?.auth || null,
      scorerNick: scorer?.name || null,
      assistId: assist?.id || null,
      assistAuth: assist?.auth || null,
      assistNick: assist?.name || null,
      isOwnGoal,
    };
    match.goals.push(goal);
    match.lastGoal = { scoringTeam: team, at: Date.now() };

    if (isOwnGoal) {
      room.sendAnnouncement(
        `😂 [${clock}] GC de ${scorer?.name || "?"} ${side}`,
        null,
        0xe67e22,
        "bold",
        2
      );
    } else if (scorer) {
      room.sendAnnouncement(
        `⚽ [${clock}] Gol de ${scorer.name}${assistText} ${side}`,
        null,
        0x2ecc71,
        "bold",
        2
      );
    } else {
      room.sendAnnouncement(
        `⚽ [${clock}] Gol time ${team === 1 ? "vermelho" : "azul"}! ${side}`,
        null,
        0x2ecc71,
        "bold",
        2
      );
    }

    match.touches = [];

    if (goldenGoal) {
      markVictory();
      const timer = setTimeout(() => {
        try {
          room.stopGame();
        } catch {
          /* ignore */
        }
      }, 1000);
      if (typeof timer.unref === "function") timer.unref();
    }
  }

  function addToLineup(player, team) {
    if (!match?.competitive || !player) return false;
    const p = who(player);
    if (!p.auth) return false;
    if (!canJoinMatchStats(room.getScores())) return false;
    const list = team === 1 ? match.lineupRed : team === 2 ? match.lineupBlue : null;
    if (!list) return false;
    if (list.some((row) => row.id === p.id || (p.auth && row.auth === p.auth))) return false;
    list.push({ id: p.id, name: p.name, auth: p.auth });
    return true;
  }

  function notePositionsReset() {
    activePlay = false;
  }

  function isValidGame(scores) {
    // Treino e warmup (1–7 jogadores) nunca contam para stats/replay.
    if (!match?.competitive) return false;
    return isValidMatchScores(scores, {
      scoreLimit: config.scoreLimit,
      timeLimitMin: config.timeLimit,
      endByVictory,
    });
  }

  function scoredBy(goal, player) {
    if (!player) return false;
    if (player.auth && goal.scorerAuth && goal.scorerAuth === player.auth) return true;
    if (player.id && goal.scorerId && goal.scorerId === player.id) return true;
    return false;
  }

  function assistedBy(goal, player) {
    if (!player) return false;
    if (player.auth && goal.assistAuth && goal.assistAuth === player.auth) return true;
    if (player.id && goal.assistId && goal.assistId === player.id) return true;
    return false;
  }

  function tallyForPlayer(player) {
    const g = { goals: 0, assists: 0, own_goals: 0 };
    if (!match || !player) return g;
    for (const goal of match.goals) {
      if (scoredBy(goal, player)) {
        if (goal.isOwnGoal) g.own_goals += 1;
        else g.goals += 1;
      }
      if (assistedBy(goal, player)) g.assists += 1;
    }
    return g;
  }

  function hydrateLineup(list) {
    return (list || []).map((p) => {
      const live = room.getPlayerList().find((x) => x.id === p.id);
      const identified = who(live || p);
      return {
        ...p,
        auth: identified?.auth || p.auth || null,
        name: identified?.name || p.name,
      };
    });
  }

  function gkAuths() {
    const samples = [];
    for (const [id, s] of gkSamples) {
      if (!s.n) continue;
      samples.push({ id, team: s.team, xAvg: s.xSum / s.n });
    }
    const red = pickGoalkeeper(samples, 1);
    const blue = pickGoalkeeper(samples, 2);
    return {
      redId: red?.id ?? null,
      blueId: blue?.id ?? null,
    };
  }

  function buildPlayersPayload(scores, winner, lineupRed, lineupBlue) {
    const gk = gkAuths();
    const rows = [];
    for (const p of lineupRed) {
      if (!p.auth) continue;
      const t = tallyForPlayer(p);
      rows.push({
        auth: p.auth,
        nick: p.name,
        team: 1,
        ...t,
        result: winner === 0 ? "draw" : winner === 1 ? "win" : "loss",
        cleanSheet: Number(scores?.blue ?? 0) === 0 && gk.redId === p.id,
      });
    }
    for (const p of lineupBlue) {
      if (!p.auth) continue;
      const t = tallyForPlayer(p);
      rows.push({
        auth: p.auth,
        nick: p.name,
        team: 2,
        ...t,
        result: winner === 0 ? "draw" : winner === 2 ? "win" : "loss",
        cleanSheet: Number(scores?.red ?? 0) === 0 && gk.blueId === p.id,
      });
    }
    return rows;
  }

  async function finish(scores) {
    if (!match) return null;

    const finalScores = scores || lastScores;

    let recording = null;
    if (match.recordingStarted) {
      try {
        recording = room.stopRecording();
      } catch (err) {
        console.warn("[match] stopRecording", err.message);
      }
    }

    const scoreRed = finalScores?.red ?? 0;
    const scoreBlue = finalScores?.blue ?? 0;
    let winner = null;
    if (scoreRed > scoreBlue) winner = 1;
    else if (scoreBlue > scoreRed) winner = 2;
    else winner = 0;

    const valid = isValidGame(finalScores);
    const lineupRed = hydrateLineup(match.lineupRed);
    const lineupBlue = hydrateLineup(match.lineupBlue);
    const byId = new Map([...lineupRed, ...lineupBlue].map((p) => [p.id, p]));
    const goals = match.goals.map((g) => {
      const scorer = g.scorerId ? byId.get(g.scorerId) : null;
      const assist = g.assistId ? byId.get(g.assistId) : null;
      return {
        ...g,
        scorerAuth: g.scorerAuth || scorer?.auth || null,
        assistAuth: g.assistAuth || assist?.auth || null,
      };
    });
    match.goals = goals;
    const players = buildPlayersPayload(finalScores, winner, lineupRed, lineupBlue);
    const mvps = valid ? pickMatchMvps(players) : [];
    const worst = valid ? pickMatchWorst(players) : [];
    const poss = possessionPercents(redPoss, bluePoss);

    const snapshot = {
      scoreRed,
      scoreBlue,
      goals: [...goals],
      redPlayers: lineupRed.map((p) => ({ name: p.name })),
      bluePlayers: lineupBlue.map((p) => ({ name: p.name })),
      recording,
    };

    match = null;
    lastScores = null;
    goldenGoal = false;
    timeExpiryHandled = false;
    activePlay = false;
    redPoss = 0;
    bluePoss = 0;
    tickN = 0;
    gkSamples = new Map();

    let titleUnlocks = [];

    if (valid) {
      room.sendAnnouncement(
        `⭐ Posse: 🔴 ${poss.red.toFixed(1)}% : ${poss.blue.toFixed(1)}% 🔵`,
        null,
        0xecf0f1,
        "bold",
        1
      );
      if (mvps.length) {
        room.sendAnnouncement(`⭐ MVP: ${mvps[0].nick}`, null, 0xf1c40f, "bold", 2);
      }
      if (worst.length) {
        room.sendAnnouncement(`💩 Pior: ${worst[0].nick}`, null, 0xe67e22, "bold", 2);
      }

      try {
        const saved = await saveMatch({
          scoreRed,
          scoreBlue,
          winner,
          valid: true,
          players,
          goals,
        });
        titleUnlocks = saved?.titleUnlocks || [];
      } catch (e) {
        console.error("[match] save", e.message);
      }

      try {
        onCompletedMatch?.({ goals: scoreRed + scoreBlue });
      } catch (e) {
        console.warn("[match] room stats", e.message);
      }

      setTimeout(() => {
        sendReplayAndSummary(snapshot).catch(() => {});
      }, 400);
    } else {
      console.log("[match] partida inválida — sem stats/replay");
    }

    return { valid, winner, scoreRed, scoreBlue, titleUnlocks, players };
  }

  function markVictory() {
    endByVictory = true;
  }

  function playerTeamInMatch(player) {
    if (player.team === 1 || player.team === 2) return player.team;
    const inList = (list) =>
      list.some((p) => p.id === player.id || (player.auth && p.auth && p.auth === player.auth));
    const inRed = inList(match.lineupRed);
    const inBlue = inList(match.lineupBlue);
    if (inRed && !inBlue) return 1;
    if (inBlue && !inRed) return 2;
    return 0;
  }

  /**
   * Ragequit: quem saiu do time perdedor com o jogo decidido (diff 2+, ou 1 no fim).
   * Treino/warmup não conta. Se o 4v4 oficial virou 3v3 no meio (competitive off),
   * ainda conta — senão quit no 3x1 não encerrava.
   */
  function rageQuitReason(player, scores) {
    if (!match?.everCompetitive || !player) return null;
    const resolved = scores || snapshotScores();
    if (!resolved) return null;

    const team = playerTeamInMatch(player);
    if (!team) return null;

    const losingTeam =
      resolved.red < resolved.blue ? 1 : resolved.blue < resolved.red ? 2 : 0;
    if (!losingTeam || team !== losingTeam) return null;

    if (!isDecidedLosingScore(resolved)) return null;
    return `abandonou perdendo ${resolved.red}x${resolved.blue}`;
  }

  function cancelRecordingOnly() {
    if (match?.recordingStarted) {
      try {
        room.stopRecording();
      } catch {
        /* ignore */
      }
    }
    match = null;
  }

  return {
    start,
    onBallKick,
    onTeamGoal,
    onTick,
    finish,
    markVictory,
    addToLineup,
    notePositionsReset,
    rageQuitReason,
    snapshotScores,
    cancelRecordingOnly,
    setCompetitive(value) {
      if (!match) return;
      match.competitive = !!value;
      if (value) match.everCompetitive = true;
    },
    isRunning: () => !!match,
    isCompetitive: () => !!match?.competitive,
    isActivePlay: () => activePlay,
    isGoldenGoal: () => goldenGoal,
  };
}

module.exports = { createMatchController };

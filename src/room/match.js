const config = require("../config");
const { saveMatch } = require("../db/stats");
const { sendReplayAndSummary } = require("../discord/replay");
const {
  attributeGoal,
  isValidMatchScores,
  formatMatchClock,
  ballSpeedKmh,
  possessionPercents,
  canJoinMatchStats,
} = require("../gameLogic");
const { pickMatchMvps } = require("../titles");

/**
 * Controle de partida: recording, toques (gol/assist), stats e replay.
 */
function createMatchController(room) {
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
  let prevBall = null;
  let ballSpeed = 0;
  let goldenGoal = false;
  let timeExpiryHandled = false;
  let activePlay = false;
  let redPoss = 0;
  let bluePoss = 0;

  function playersOf(team) {
    return room.getPlayerList().filter((p) => p.team === team);
  }

  function ballPosition() {
    try {
      return typeof room.getBallPosition === "function" ? room.getBallPosition() : null;
    } catch {
      return null;
    }
  }

  function onTick() {
    const s = room.getScores();
    if (s) lastScores = { red: s.red, blue: s.blue, time: s.time, scoreLimit: s.scoreLimit, timeLimit: s.timeLimit };

    const pos = ballPosition();
    if (pos && prevBall) {
      ballSpeed = ballSpeedKmh(prevBall, pos);
    }
    if (pos) prevBall = pos;

    if (match && activePlay) {
      const last = match.touches[0];
      if (last?.team === 1) redPoss += 1;
      else if (last?.team === 2) bluePoss += 1;
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
    prevBall = null;
    ballSpeed = 0;
    goldenGoal = false;
    timeExpiryHandled = false;
    activePlay = false;
    redPoss = 0;
    bluePoss = 0;
    match = {
      competitive,
      recordingStarted: false,
      touches: [],
      goals: [],
      lastGoal: null,
      lineupRed: playersOf(1).map((p) => ({ id: p.id, name: p.name, auth: p.auth })),
      lineupBlue: playersOf(2).map((p) => ({ id: p.id, name: p.name, auth: p.auth })),
    };
    try {
      room.startRecording();
      match.recordingStarted = true;
    } catch (err) {
      console.warn("[match] startRecording", err.message);
    }
    room.startGame();
  }

  function onBallKick(player) {
    if (!match || !player) return;
    activePlay = true;
    match.touches.unshift({
      id: player.id,
      name: player.name,
      auth: player.auth,
      team: player.team,
    });
    if (match.touches.length > 3) match.touches.length = 3;
  }

  function onTeamGoal(team) {
    if (!match) return;
    activePlay = false;
    const scores = room.getScores();
    const time = scores?.time ?? 0;
    const { scorer, assist, isOwnGoal } = attributeGoal(match.touches, team);
    const clock = formatMatchClock(time);
    const speed = Number.isFinite(ballSpeed) && ballSpeed > 0
      ? ` · ${ballSpeed.toPrecision(3)} km/h`
      : "";
    const side = team === 1 ? "🔴" : "🔵";

    const goal = {
      team,
      time,
      scorerAuth: scorer?.auth || null,
      scorerNick: scorer?.name || null,
      assistAuth: assist?.auth || null,
      assistNick: assist?.name || null,
      isOwnGoal,
    };
    match.goals.push(goal);
    match.lastGoal = { scoringTeam: team, at: Date.now() };

    if (isOwnGoal) {
      room.sendAnnouncement(
        `😂 [${clock}] GC de ${scorer?.name || "?"}${speed} ${side}`,
        null,
        0xe67e22,
        "bold",
        2
      );
    } else if (assist) {
      room.sendAnnouncement(
        `⚽ [${clock}] Gol de ${scorer.name}! Assistência: ${assist.name}${speed} ${side}`,
        null,
        0x2ecc71,
        "bold",
        2
      );
    } else if (scorer) {
      room.sendAnnouncement(
        `⚽ [${clock}] Gol de ${scorer.name}!${speed} ${side}`,
        null,
        0x2ecc71,
        "bold",
        2
      );
    } else {
      room.sendAnnouncement(
        `⚽ [${clock}] Gol time ${team === 1 ? "vermelho" : "azul"}!${speed} ${side}`,
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
    if (!match?.competitive || !player || !player.auth) return false;
    if (!canJoinMatchStats(room.getScores())) return false;
    const list = team === 1 ? match.lineupRed : team === 2 ? match.lineupBlue : null;
    if (!list) return false;
    if (list.some((row) => row.id === player.id || row.auth === player.auth)) return false;
    list.push({ id: player.id, name: player.name, auth: player.auth });
    return true;
  }

  function notePositionsReset() {
    prevBall = null;
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

  function tallyForAuth(auth) {
    const g = { goals: 0, assists: 0, own_goals: 0 };
    if (!match || !auth) return g;
    for (const goal of match.goals) {
      if (goal.isOwnGoal && goal.scorerAuth === auth) g.own_goals += 1;
      else if (!goal.isOwnGoal && goal.scorerAuth === auth) g.goals += 1;
      if (goal.assistAuth === auth) g.assists += 1;
    }
    return g;
  }

  function buildPlayersPayload(scores, winner) {
    const rows = [];
    for (const p of match.lineupRed) {
      if (!p.auth) continue;
      const t = tallyForAuth(p.auth);
      rows.push({
        auth: p.auth,
        nick: p.name,
        team: 1,
        ...t,
        result: winner === 0 ? "draw" : winner === 1 ? "win" : "loss",
      });
    }
    for (const p of match.lineupBlue) {
      if (!p.auth) continue;
      const t = tallyForAuth(p.auth);
      rows.push({
        auth: p.auth,
        nick: p.name,
        team: 2,
        ...t,
        result: winner === 0 ? "draw" : winner === 2 ? "win" : "loss",
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
    const players = buildPlayersPayload(finalScores, winner);
    const goals = match.goals;
    const mvps = valid ? pickMatchMvps(players) : [];
    const poss = possessionPercents(redPoss, bluePoss);

    const snapshot = {
      scoreRed,
      scoreBlue,
      goals: [...goals],
      redPlayers: match.lineupRed.map((p) => ({ name: p.name })),
      bluePlayers: match.lineupBlue.map((p) => ({ name: p.name })),
      recording,
    };

    match = null;
    lastScores = null;
    goldenGoal = false;
    timeExpiryHandled = false;
    activePlay = false;
    redPoss = 0;
    bluePoss = 0;

    if (valid) {
      room.sendAnnouncement(
        `⭐ Posse: 🔴 ${poss.red.toFixed(1)}% : ${poss.blue.toFixed(1)}% 🔵`,
        null,
        0xecf0f1,
        "bold",
        1
      );
      if (mvps.length) {
        const names = mvps.map((p) => p.nick).join(", ");
        room.sendAnnouncement(`⭐ MVP: ${names}`, null, 0xf1c40f, "bold", 2);
      }

      saveMatch({
        scoreRed,
        scoreBlue,
        winner,
        valid: true,
        players,
        goals,
      }).catch((e) => console.error("[match] save", e.message));

      setTimeout(() => {
        sendReplayAndSummary(snapshot).catch(() => {});
      }, 400);
    } else {
      console.log("[match] partida inválida — sem stats/replay");
    }

    return { valid, winner, scoreRed, scoreBlue };
  }

  function markVictory() {
    endByVictory = true;
  }

  /**
   * Ragequit só vale no 4v4 oficial e para quem saiu do time perdedor.
   * - diferença de 2+ gols; ou
   * - saída até 10s depois de sofrer um gol enquanto perdia.
   */
  function rageQuitReason(player, scores = room.getScores(), now = Date.now()) {
    if (!match?.competitive || !player || player.team === 0 || !scores) return null;

    const losingTeam =
      scores.red < scores.blue ? 1 : scores.blue < scores.red ? 2 : 0;
    if (!losingTeam || player.team !== losingTeam) return null;

    const difference = Math.abs(scores.red - scores.blue);
    if (difference >= 2) {
      return `abandonou perdendo ${scores.red}x${scores.blue}`;
    }

    if (
      match.lastGoal &&
      match.lastGoal.scoringTeam !== player.team &&
      now - match.lastGoal.at <= 10_000
    ) {
      return "abandonou até 10s após sofrer um gol";
    }

    return null;
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
    cancelRecordingOnly,
    isRunning: () => !!match,
    isCompetitive: () => !!match?.competitive,
    isActivePlay: () => activePlay,
    isGoldenGoal: () => goldenGoal,
  };
}

module.exports = { createMatchController };

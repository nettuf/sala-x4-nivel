const config = require("../config");
const { saveMatch } = require("../db/stats");
const { sendReplayAndSummary } = require("../discord/replay");
const { attributeGoal, isValidMatchScores } = require("../gameLogic");
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

  function playersOf(team) {
    return room.getPlayerList().filter((p) => p.team === team);
  }

  function onTick() {
    const s = room.getScores();
    if (s) lastScores = { red: s.red, blue: s.blue, time: s.time, scoreLimit: s.scoreLimit, timeLimit: s.timeLimit };
  }

  function start() {
    endByVictory = false;
    lastScores = null;
    match = {
      recordingStarted: false,
      touches: [],
      goals: [],
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
    const scores = room.getScores();
    const time = scores?.time ?? 0;
    const { scorer, assist, isOwnGoal } = attributeGoal(match.touches, team);

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

    if (isOwnGoal) {
      room.sendAnnouncement(`😂 GC de ${scorer?.name || "?"}!`, null, 0xe67e22, "bold", 2);
    } else if (assist) {
      room.sendAnnouncement(
        `⚽ Gol de ${scorer.name}! Assistência: ${assist.name}`,
        null,
        0x2ecc71,
        "bold",
        2
      );
    } else if (scorer) {
      room.sendAnnouncement(`⚽ Gol de ${scorer.name}!`, null, 0x2ecc71, "bold", 2);
    } else {
      room.sendAnnouncement(`⚽ Gol time ${team === 1 ? "vermelho" : "azul"}!`, null, 0x2ecc71, "bold", 2);
    }

    match.touches = [];
  }

  function isValidGame(scores) {
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

    if (valid) {
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
    cancelRecordingOnly,
    isRunning: () => !!match,
  };
}

module.exports = { createMatchController };

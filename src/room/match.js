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
  dedupeMatchPlayers,
} = require("../gameLogic");
const { pickMatchMvps, pickMatchWorst, filterPlayersAtWhistle } = require("../titles");
const {
  fieldEightAtWhistle,
  shouldSendHaxbookStats,
  makeMatchId,
  buildParticipants,
  buildStatsBody,
  postMatchStats,
} = require("../haxbook/statsWebhook");
const { createHaxbooket, marketParticipants } = require("../haxbook/haxbooket");
const { createPostMatchInsights } = require("../haxbook/insight");

/**
 * Controle de partida: recording, toques (gol/assist), stats e replay.
 */
function createMatchController(room, { identify, onCompletedMatch, getStreak } = {}) {
  const haxbooket = createHaxbooket(room, {
    statsUrl: config.haxbookStatsUrl,
    apiKey: config.haxbookApiKey,
    getRedStreak: getStreak,
  });
  const postMatchInsights = createPostMatchInsights(room, {
    statsUrl: config.haxbookStatsUrl,
    apiKey: config.haxbookApiKey,
  });
  /** @type {null | {
   *   recordingStarted: boolean,
   *   touches: object[],
   *   goals: object[],
   *   lineupRed: object[],
   *   lineupBlue: object[],
   * }} */
  let match = null;
  let endByVictory = false;
  /** 1|2 gravado no markVictory: o stopGame pode zerar o placar ao vivo. */
  let forcedWinner = 0;
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
    const next = {
      red: s.red || 0,
      blue: s.blue || 0,
      time: s.time,
      scoreLimit: s.scoreLimit,
      timeLimit: s.timeLimit,
    };
    // stopGame às vezes devolve 0x0 com o relógio ainda andando — não apaga o 2x0.
    if (lastScores) {
      const lastTotal = (lastScores.red || 0) + (lastScores.blue || 0);
      const nextTotal = next.red + next.blue;
      if (nextTotal === 0 && lastTotal > 0) return lastScores;
    }
    lastScores = next;
    return lastScores;
  }

  function snapshotScores() {
    const live = room.getScores();
    if (live && ((live.red || 0) > 0 || (live.blue || 0) > 0)) {
      return rememberScores(live);
    }
    if (lastScores && ((lastScores.red || 0) > 0 || (lastScores.blue || 0) > 0)) {
      return lastScores;
    }
    if (live) return rememberScores(live);
    return lastScores || null;
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
      if (tickN % 3 === 0) sampleField();
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
    forcedWinner = 0;
    lastScores = null;
    goldenGoal = false;
    timeExpiryHandled = false;
    activePlay = false;
    redPoss = 0;
    bluePoss = 0;
    tickN = 0;
    gkSamples = new Map();
    const redN = room.getPlayerList().filter((p) => p && p.id !== 0 && p.team === 1).length;
    const blueN = room.getPlayerList().filter((p) => p && p.id !== 0 && p.team === 2).length;
    const startedFourOnFour = !!competitive && redN >= 4 && blueN >= 4;
    const matchId = startedFourOnFour ? makeMatchId() : null;
    match = {
      competitive,
      everCompetitive: !!competitive,
      startedFourOnFour,
      matchId,
      formatBroken: false,
      recordingStarted: false,
      touches: [],
      goals: [],
      lastGoal: null,
      lineupRed: playersOf(1).map((p) => ({ id: p.id, name: p.name, auth: p.auth || null })),
      lineupBlue: playersOf(2).map((p) => ({ id: p.id, name: p.name, auth: p.auth || null })),
    };
    if (matchId) {
      haxbooket.open({
        matchId,
        participants: room.getPlayerList().map((p) => who(p)),
      });
    }
    try {
      room.startRecording();
      match.recordingStarted = true;
    } catch (err) {
      console.warn("[match] startRecording", err.message);
    }
    room.startGame();
  }

  function recordTouch(player, { kind = "kick" } = {}) {
    if (!match || !player || player.team === 0) return;
    const p = who(player);
    if (!p || p.team === 0) return;
    const last = match.touches[0];
    if (last && sameTouchPlayer(last, p)) {
      if (kind === "kick") last.kind = "kick";
      last.team = p.team;
      last.name = p.name;
      if (p.auth) last.auth = p.auth;
      return;
    }
    match.touches.unshift({
      id: p.id,
      name: p.name,
      auth: p.auth || null,
      team: p.team,
      kind,
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
    if (closest) recordTouch(closest, { kind: "body" });
  }

  function onBallKick(player) {
    if (!match || !player) return;
    activePlay = true;
    recordTouch(player);
  }

  function onTeamGoal(team) {
    if (!match) return;
    haxbooket.goal(team);
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
    if (match) match.touches = [];
  }

  function isValidGame(scores) {
    if (!match) return false;
    const opts = {
      scoreLimit: config.scoreLimit,
      timeLimitMin: config.timeLimit,
      endByVictory,
    };
    // Ragequit após 4v4 oficial (mesmo se virou 3v3 no meio) ainda conta.
    if (endByVictory && match.everCompetitive) {
      return isValidMatchScores(scores, opts);
    }
    // Treino e warmup (1–7 jogadores) nunca contam para stats/replay.
    if (!match.competitive) return false;
    return isValidMatchScores(scores, opts);
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

  function gkFromSamples(ids = null) {
    const samples = [];
    for (const [id, s] of gkSamples) {
      if (!s.n) continue;
      if (ids && !ids.has(id)) continue;
      samples.push({ id, team: s.team, xAvg: s.xSum / s.n });
    }
    const red = pickGoalkeeper(samples, 1);
    const blue = pickGoalkeeper(samples, 2);
    return {
      redId: red?.id ?? null,
      blueId: blue?.id ?? null,
    };
  }

  function gkAuths() {
    return gkFromSamples();
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
        goalkeeper: gk.redId === p.id,
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
        goalkeeper: gk.blueId === p.id,
        cleanSheet: Number(scores?.red ?? 0) === 0 && gk.blueId === p.id,
      });
    }
    return dedupeMatchPlayers(rows);
  }

  async function finish(scores, opts = {}) {
    if (!match) return null;

    const incoming = scores || lastScores;
    const rememberedTotal =
      (lastScores?.red || 0) + (lastScores?.blue || 0);
    const incomingTotal = (incoming?.red || 0) + (incoming?.blue || 0);
    const finalScores =
      incomingTotal === 0 && rememberedTotal > 0 ? lastScores : incoming;

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
    else if (forcedWinner === 1 || forcedWinner === 2) winner = forcedWinner;
    else winner = 0;

    const valid = isValidGame(finalScores);
    const competitive = !!match.competitive;
    const scoreLimit = Number(finalScores?.scoreLimit) || config.scoreLimit;
    const hitScore = scoreRed >= scoreLimit || scoreBlue >= scoreLimit;
    // Admin stop / RR: sem gol da vitória e sem fim de tempo. Não conta streak.
    const decided = !!endByVictory || !!timeExpiryHandled || hitScore;
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
    const finishedAuths = new Set(
      room
        .getPlayerList()
        .filter((p) => p && p.id !== 0 && (p.team === 1 || p.team === 2))
        .map((p) => who(p).auth)
        .filter(Boolean)
    );
    const playersForTitles = filterPlayersAtWhistle(players, finishedAuths);
    const fieldEight = fieldEightAtWhistle(
      room.getPlayerList().map((p) => who(p))
    );
    const siteEligible = shouldSendHaxbookStats({
      valid,
      startedFourOnFour: !!match.startedFourOnFour,
      formatBroken: !!match.formatBroken,
      fieldEight,
    });
    const fieldIds = siteEligible
      ? new Set([...fieldEight.red, ...fieldEight.blue].map((p) => p.id))
      : null;
    const haxbook = siteEligible
      ? buildStatsBody({
          matchId: match.matchId,
          redScore: scoreRed,
          blueScore: scoreBlue,
          winner,
          roomName: config.haxbookRoomName,
          participants: buildParticipants({
            red: fieldEight.red,
            blue: fieldEight.blue,
            tally: tallyForPlayer,
            gk: gkFromSamples(fieldIds),
            redScore: scoreRed,
            blueScore: scoreBlue,
          }),
        })
      : null;
    const marketFinalists = marketParticipants(room.getPlayerList().map((p) => {
      const player = who(p);
      return { ...player, goals: tallyForPlayer(player).goals };
    }));
    if (match.matchId) {
      if (valid && decided && !match.formatBroken) haxbooket.finish(winner, marketFinalists);
      else haxbooket.void(match.formatBroken ? "format-broken" : "stop-invalido");
    }
    const mvps = valid ? pickMatchMvps(playersForTitles) : [];
    const worst = valid ? pickMatchWorst(playersForTitles) : [];
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
    forcedWinner = 0;
    goldenGoal = false;
    timeExpiryHandled = false;
    endByVictory = false;
    activePlay = false;
    redPoss = 0;
    bluePoss = 0;
    tickN = 0;
    gkSamples = new Map();

    let titleUnlocks = [];
    const persistPayload = valid
      ? { scoreRed, scoreBlue, winner, players, goals, snapshot, haxbook }
      : null;

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
        onCompletedMatch?.({ goals: scoreRed + scoreBlue });
      } catch (e) {
        console.warn("[match] room stats", e.message);
      }
    } else {
      console.log("[match] partida inválida — sem stats/replay");
    }

    const persist = opts.persist !== false;
    if (persist && persistPayload) {
      const saved = await persistMatch(persistPayload);
      titleUnlocks = saved?.titleUnlocks || [];
    }

    return {
      valid,
      competitive,
      decided,
      winner,
      scoreRed,
      scoreBlue,
      titleUnlocks,
      players,
      persistPayload,
    };
  }

  async function persistMatch(payload) {
    if (!payload) return { titleUnlocks: [] };
    let titleUnlocks = [];
    try {
      const saved = await saveMatch({
        scoreRed: payload.scoreRed,
        scoreBlue: payload.scoreBlue,
        winner: payload.winner,
        valid: true,
        players: payload.players,
        goals: payload.goals,
      });
      titleUnlocks = saved?.titleUnlocks || [];
    } catch (e) {
      console.error("[match] save", e.message);
    }
    setTimeout(() => {
      sendReplayAndSummary(payload.snapshot).catch(() => {});
    }, 400);
    if (payload.haxbook) {
      postMatchStats(config.haxbookStatsUrl, config.haxbookApiKey, payload.haxbook).catch((err) => {
        console.warn("[haxbook] stats", err?.message || err);
      });
      postMatchInsights.onOfficialMatch();
    }
    return { titleUnlocks };
  }

  function markVictory() {
    endByVictory = true;
    const s = snapshotScores();
    if (s && (s.red || 0) > (s.blue || 0)) forcedWinner = 1;
    else if (s && (s.blue || 0) > (s.red || 0)) forcedWinner = 2;
  }

  /**
   * Placar ou tempo já decidiram: comemoração ainda com o jogo "vivo".
   * Não é hora de repor vaga — o onGameStop monta o próximo.
   */
  function isDecided() {
    if (!match) return false;
    if (endByVictory || timeExpiryHandled) return true;
    const s = snapshotScores() || room.getScores();
    if (!s) return false;
    const limit = Number(s.scoreLimit) || config.scoreLimit;
    return (s.red || 0) >= limit || (s.blue || 0) >= limit;
  }

  /**
   * Ragequit: quem saiu do time perdedor com o jogo decidido (diff 2+, placar 3, ou 1 no fim).
   * Só conta quem estava no campo ao sair (ou AFK mandado pro spec com fieldTeam guardado).
   * Spec exterior / rejoin não entram.
   */
  function rageQuitReason(player, scores, { fieldTeam = 0 } = {}) {
    if (!match || !player) return null;
    const resolved = scores || snapshotScores();
    if (!resolved) return null;

    const onFieldNow = player.team === 1 || player.team === 2;
    const onFieldViaAfk = fieldTeam === 1 || fieldTeam === 2;
    if (!onFieldNow && !onFieldViaAfk) return null;

    const team = onFieldNow ? player.team : fieldTeam;

    const losingTeam =
      resolved.red < resolved.blue ? 1 : resolved.blue < resolved.red ? 2 : 0;
    if (!losingTeam || team !== losingTeam) return null;

    if (!isDecidedLosingScore(resolved)) return null;
    return `abandonou perdendo ${resolved.red}x${resolved.blue}`;
  }

  function cancelRecordingOnly(reason = "rr-ou-desmontagem") {
    if (match?.matchId) haxbooket.void(reason);
    if (match?.recordingStarted) {
      try {
        room.stopRecording();
      } catch {
        /* ignore */
      }
    }
    match = null;
  }

  function captureState() {
    if (!match) return null;
    return {
      competitive: !!match.competitive,
      everCompetitive: !!match.everCompetitive,
      startedFourOnFour: !!match.startedFourOnFour,
      formatBroken: !!match.formatBroken,
    };
  }

  /** Admin startGame no painel: o motor já rodou, só sincroniza o controller. */
  function adoptLiveGame(state = {}) {
    if (match) return;
    const redN = room.getPlayerList().filter((p) => p && p.id !== 0 && p.team === 1).length;
    const blueN = room.getPlayerList().filter((p) => p && p.id !== 0 && p.team === 2).length;
    const startedFourOnFour = !!state.startedFourOnFour || (!!state.competitive && redN >= 4 && blueN >= 4);
    const matchId = startedFourOnFour ? makeMatchId() : null;
    match = {
      competitive: !!state.competitive,
      everCompetitive: !!state.everCompetitive,
      startedFourOnFour,
      matchId,
      formatBroken: !!state.formatBroken,
      recordingStarted: false,
      touches: [],
      goals: [],
      lastGoal: null,
      lineupRed: playersOf(1).map((p) => ({ id: p.id, name: p.name, auth: p.auth || null })),
      lineupBlue: playersOf(2).map((p) => ({ id: p.id, name: p.name, auth: p.auth || null })),
    };
    if (matchId) {
      haxbooket.open({ matchId, participants: room.getPlayerList().map((p) => who(p)) });
    }
    try {
      room.startRecording();
      match.recordingStarted = true;
    } catch (err) {
      console.warn("[match] startRecording (adopt)", err.message);
    }
    if (!state.competitive && redN >= 4 && blueN >= 4) {
      match.competitive = true;
      match.everCompetitive = true;
      match.startedFourOnFour = true;
    }
  }

  return {
    start,
    onBallKick,
    onTeamGoal,
    onTick,
    finish,
    persistMatch,
    markVictory,
    isDecided,
    addToLineup,
    notePositionsReset,
    rageQuitReason,
    snapshotScores,
    cancelRecordingOnly,
    captureState,
    adoptLiveGame,
  /** breakFormat: true só quando o formato oficial quebrou (ex. 4v4→3v3). Lobby não marca. */
    setCompetitive(value, { breakFormat = false } = {}) {
      if (!match) return;
      match.competitive = !!value;
      if (value) {
        match.everCompetitive = true;
        if (!match.matchId && !match.formatBroken) {
          const redN = playersOf(1).length;
          const blueN = playersOf(2).length;
          if (redN >= 4 && blueN >= 4) {
            match.startedFourOnFour = true;
            match.matchId = makeMatchId();
            haxbooket.open({
              matchId: match.matchId,
              participants: room.getPlayerList().map((p) => who(p)),
            });
          }
        }
        return;
      }
      if (breakFormat) {
        match.formatBroken = true;
        if (match.matchId) haxbooket.void("format-broken");
      }
    },
    markFormatBroken() {
      if (!match) return;
      match.formatBroken = true;
      if (match.matchId) haxbooket.void("format-broken");
    },
    isRunning: () => !!match,
    isCompetitive: () => !!match?.competitive,
    isActivePlay: () => activePlay,
    isGoldenGoal: () => goldenGoal,
  };
}

module.exports = { createMatchController };

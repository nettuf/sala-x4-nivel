const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");

const { reloadMaps, stadiumForPlayerCount } = require("../src/room/maps");
const { createChooseController, TEAM } = require("../src/room/choose");
const { createMatchController } = require("../src/room/match");
const { createStreakTracker, applyWinnerStays, shouldUseWinnerStays } = require("../src/room/streak");
const { attributeGoal, detectRageQuit, rageQuitMessages, targetTeamSize } = require("../src/gameLogic");
const { planCompetitiveRecovery, planExactFill, applyExactFill } = require("../src/room/recovery");
const { pickMatchMvps } = require("../src/titles");
const config = require("../src/config");

/**
 * Simula o host da sala (mesmo refreshLobby do createRoom).
 * Fluxo real: com 2+ o warmup inicia partida; quem entra no meio espera
 * até o jogo parar para o lobby reavaliar (choose/balance).
 */
function createMockRoomHost() {
  let nextId = 1;
  /** @type {any[]} */
  const players = [];
  let scores = null;
  let stadiumName = null;
  let gameStarted = 0;
  const announcements = [];
  const kicks = [];
  /** @type {Set<number>} */
  const voluntaryAfk = new Set();

  const room = {
    getPlayerList: () => players.map((p) => ({ ...p })),
    getScores: () => scores,
    setPlayerTeam: (id, team) => {
      const p = players.find((x) => x.id === id);
      if (p) p.team = team;
    },
    sendAnnouncement: (msg, to, color) => announcements.push({ msg, to, color }),
    kickPlayer: (id, reason) => {
      kicks.push({ id, reason });
      const i = players.findIndex((p) => p.id === id);
      if (i >= 0) players.splice(i, 1);
      choose.onPlayerLeave();
      settleLobby();
    },
    setCustomStadium: (s) => {
      try {
        stadiumName = JSON.parse(s).name;
      } catch {
        stadiumName = "custom";
      }
    },
    setDefaultStadium: (n) => {
      stadiumName = n;
    },
    startRecording: () => {},
    stopRecording: () => new Uint8Array([1, 2, 3]),
    startGame: () => {
      gameStarted += 1;
      scores = {
        red: 0,
        blue: 0,
        time: 0,
        scoreLimit: config.scoreLimit,
        timeLimit: config.timeLimit * 60,
      };
    },
    stopGame: () => {
      scores = null;
    },
    getDiscProperties: () => ({ xspeed: 0, yspeed: 0 }),
    getBallPosition: () => ({ x: 0, y: 0 }),
    pauseGame: () => {},
    setTimeLimit: () => {},
  };

  let match = null;
  let choose = null;
  let readyStarts = 0;
  const streak = createStreakTracker();

  match = createMatchController(room);
  choose = createChooseController(room, {
    isExcluded: (p) => voluntaryAfk.has(p.id),
    getStreakLabel: () => (streak.get() > 0 ? streak.label() : ""),
    getStreak: () => streak.get(),
    onPickFromSpec(p) {
      voluntaryAfk.delete(p.id);
    },
    onCaptainTimeout(player) {
      voluntaryAfk.add(player.id);
    },
    onReadyToStart() {
      readyStarts += 1;
      const eligible = players.filter((p) => p.id !== 0 && !voluntaryAfk.has(p.id));
      const size = targetTeamSize(eligible.length, config.teamSize);
      const { applyStadium } = require("../src/room/maps");
      if (size >= config.teamSize) {
        applyStadium(room, config.teamSize * 2);
        match.start({ competitive: true });
        return;
      }
      match.start({ competitive: false });
    },
  });

  function refreshLobby() {
    const { applyStadium } = require("../src/room/maps");
    const { planWarmup, applyWarmupMoves, planPromoteToX4, planHeldWinnersToChoose } = require("../src/room/warmupFlow");
    const all = players.filter((p) => p.id !== 0);
    const eligibleCount = all.filter((p) => !voluntaryAfk.has(p.id)).length;

    if (match.isCompetitive()) {
      if (choose.isActive()) choose.onPlayerJoin();
      return;
    }

    if (choose.isActive() && !choose.isReplacement()) {
      choose.onPlayerJoin();
      return;
    }

    if (eligibleCount >= config.teamSize * 2) {
      if (choose.isActive()) {
        choose.onPlayerJoin();
        return;
      }
      const promo = planPromoteToX4(all, {
        isExcluded: (p) => voluntaryAfk.has(p.id),
        teamSize: config.teamSize,
      });
      if (promo) {
        match.cancelRecordingOnly();
        room.stopGame();
        applyWarmupMoves(room, promo);
        applyStadium(room, eligibleCount);
        match.start({ competitive: true });
        return;
      }
      const held = planHeldWinnersToChoose(all, {
        isExcluded: (p) => voluntaryAfk.has(p.id),
        teamSize: config.teamSize,
      });
      if (held) {
        match.cancelRecordingOnly();
        room.stopGame();
        applyWarmupMoves(room, held);
        if (held.start) {
          match.start({ competitive: true });
        } else {
          choose.continueFromField();
        }
        return;
      }
      match.cancelRecordingOnly();
      room.stopGame();
      choose.tryStartChoose();
      return;
    }

    const plan = planWarmup(all, {
      isExcluded: (p) => voluntaryAfk.has(p.id),
    });

    if (!plan.eligibleCount) {
      choose.deactivate();
      match.cancelRecordingOnly();
      room.stopGame();
      return;
    }

    if (plan.replacementTeam) {
      applyWarmupMoves(room, plan);
      applyStadium(room, plan.eligibleCount);
      if (choose.isReplacement()) {
        choose.onPlayerJoin();
      } else {
        choose.deactivate();
        choose.startReplacement(plan.replacementTeam, () => refreshLobby());
      }
      return;
    }

    if (choose.isActive()) choose.deactivate();

    const live = !!(match.isRunning() && room.getScores());
    const { stadiumKindForCount } = require("../src/room/maps");
    const nextKind = stadiumKindForCount(plan.eligibleCount);
    const isTraining = /training|treino|ice bear/i.test(String(stadiumName));
    const loadX3 = nextKind === "x3" && isTraining;
    const loadTraining = nextKind === "training" && !isTraining;
    if (loadX3 || loadTraining) {
      match.cancelRecordingOnly();
      room.stopGame();
      applyWarmupMoves(room, plan);
      applyStadium(room, plan.eligibleCount);
      if (plan.shouldStart) match.start({ competitive: false });
      return;
    }

    applyWarmupMoves(room, plan);
    const keepX4Live = live && /x4/i.test(String(stadiumName)) && nextKind === "x3";
    if (!keepX4Live) applyStadium(room, plan.eligibleCount);
    if (!live && plan.shouldStart) match.start({ competitive: false });
  }
  /** Encerra partida em andamento e reavalia lobby (como onGameStop). */
  function settleLobby() {
    if (match.isRunning()) {
      match.cancelRecordingOnly();
    }
    room.stopGame();
    refreshLobby();
  }

  function addPlayer(name, { settle = false, afk = false } = {}) {
    const p = {
      id: nextId++,
      name: name || `P${nextId}`,
      team: TEAM.SPEC,
      auth: `auth_${nextId}`,
      conn: Buffer.from("1.1.1.1").toString("hex"),
    };
    players.push(p);
    if (afk) voluntaryAfk.add(p.id);
    refreshLobby();
    if (settle) settleLobby();
    return p;
  }

  /** Cresce até N jogadores, reavaliando lobby a cada entrada (para testes de estágio). */
  function growTo(n) {
    while (players.length < n) {
      addPlayer(`P${players.length + 1}`);
    }
  }

  function recoverCompetitiveLineup() {
    const eligible = players.filter((p) => p.id !== 0 && !voluntaryAfk.has(p.id));
    const red = eligible.filter((p) => p.team === TEAM.RED);
    const blue = eligible.filter((p) => p.team === TEAM.BLUE);
    const specs = eligible.filter((p) => p.team === TEAM.SPEC);
    const live = !!room.getScores();
    const plan = planCompetitiveRecovery({
      redCount: red.length,
      blueCount: blue.length,
      specCount: specs.length,
      teamSize: config.teamSize,
      live,
    });

    if (plan.action === "none") return;

    if (plan.action === "fill-pairs") {
      if (plan.restart) {
        match.cancelRecordingOnly();
        room.stopGame();
      }
      for (let index = 0; index < plan.pairs * 2; index += 2) {
        room.setPlayerTeam(specs[index].id, TEAM.RED);
        room.setPlayerTeam(specs[index + 1].id, TEAM.BLUE);
        if (!plan.restart) {
          match.addToLineup(specs[index], TEAM.RED);
          match.addToLineup(specs[index + 1], TEAM.BLUE);
        }
      }
      if (plan.restart) match.start({ competitive: true });
      return;
    }

    if (plan.action === "fill-one") {
      room.setPlayerTeam(specs[0].id, plan.targetTeam);
      match.addToLineup(specs[0], plan.targetTeam);
      room.sendAnnouncement(
        `${specs[0].name} entrou no time ${plan.targetTeam === TEAM.RED ? "vermelho" : "azul"} — jogo segue.`,
        null,
        0x2ecc71,
        1
      );
      return;
    }

    if (plan.action === "choose") {
      choose.deactivate();
      choose.startReplacement(plan.targetTeam, ({ chosen, cancelled } = {}) => {
        if (cancelled || !chosen) {
          recoverCompetitiveLineup();
          return;
        }
        match.addToLineup(chosen, plan.targetTeam);
      });
      return;
    }

    if (plan.action === "park-larger") {
      const larger = eligible.filter((p) => p.team === plan.targetTeam);
      const last = larger[larger.length - 1];
      if (last) room.setPlayerTeam(last.id, TEAM.SPEC);
      match.setCompetitive(false);
      return;
    }

    if (plan.action === "keep-play") {
      match.setCompetitive(false);
      return;
    }

    settleLobby();
  }

  function removePlayer(id) {
    const leaving = players.find((p) => p.id === id);
    const i = players.findIndex((p) => p.id === id);
    if (i >= 0) players.splice(i, 1);

    if (choose.isActive()) {
      choose.onPlayerLeave();
      if (!choose.isActive() && !match.isCompetitive()) settleLobby();
      return;
    }

    if (match.isRunning()) {
      const rageReason = leaving ? match.rageQuitReason(leaving) : null;
      if (rageReason) {
        const msgs = rageQuitMessages(leaving.name, rageReason);
        room.sendAnnouncement(msgs.public, null, 0xe74c3c);
        room.sendAnnouncement(msgs.private, leaving.id, 0xe74c3c);
        match.markVictory();
        room.stopGame();
        return;
      }
    }

    if (match.isCompetitive()) {
      if (leaving && leaving.team === TEAM.SPEC) return;

      const remaining = players.filter((p) => p.id !== 0 && !voluntaryAfk.has(p.id));
      const classic = detectRageQuit({
        redCount: remaining.filter((p) => p.team === TEAM.RED).length,
        blueCount: remaining.filter((p) => p.team === TEAM.BLUE).length,
        scores: room.getScores(),
      });
      if (classic && remaining.length >= config.teamSize * 2) {
        room.sendAnnouncement("🤖 Abandono detectado no fim do jogo. Partida encerrada.", null, 0xe74c3c);
        match.markVictory();
        room.stopGame();
        return;
      }

      recoverCompetitiveLineup();
      return;
    }

    if (leaving && leaving.team === TEAM.SPEC) return;

    refreshLobby();
  }

  function snapshot() {
    const list = players.filter((p) => p.id !== 0);
    return {
      count: list.length,
      red: list.filter((p) => p.team === TEAM.RED).length,
      blue: list.filter((p) => p.team === TEAM.BLUE).length,
      spec: list.filter((p) => p.team === TEAM.SPEC).length,
      stadiumName,
      chooseActive: choose.isActive(),
      matchRunning: match.isRunning(),
      gameStarted,
      readyStarts,
      announcements: announcements.map((a) => a.msg),
    };
  }

  function currentCaptain() {
    return choose.currentCaptain();
  }

  function captainPick(token) {
    const cap = currentCaptain();
    if (!cap) return false;
    return choose.handleCaptainChat(cap, token);
  }

  async function endValidMatch({ red = config.scoreLimit, blue = 1 } = {}) {
    const scoresObj = {
      red,
      blue,
      time: 100,
      scoreLimit: config.scoreLimit,
      timeLimit: config.timeLimit * 60,
    };
    match.markVictory();
    room.startGame();
    Object.assign(room.getScores(), scoresObj);
    const result = await match.finish(scoresObj);
    room.stopGame();

    const count = players.filter((p) => p.id !== 0 && !voluntaryAfk.has(p.id)).length;
    if (result && shouldUseWinnerStays(count, result.valid, result.winner)) {
      const { mode } = applyWinnerStays(room, result.winner, streak, {
        isExcluded: (p) => voluntaryAfk.has(p.id),
      });
      if (mode === "choose") {
        const eligible = players.filter((p) => p.id !== 0 && !voluntaryAfk.has(p.id));
        const specs = eligible.filter((p) => p.team === TEAM.SPEC);
        const fill = planExactFill({
          redCount: eligible.filter((p) => p.team === TEAM.RED).length,
          blueCount: eligible.filter((p) => p.team === TEAM.BLUE).length,
          specCount: specs.length,
          teamSize: targetTeamSize(eligible.length, config.teamSize),
        });
        if (fill.action === "start") {
          match.start({
            competitive: targetTeamSize(eligible.length, config.teamSize) >= config.teamSize,
          });
          return result;
        }
        if (fill.action === "fill-all") {
          applyExactFill(room, specs, fill);
          match.start({
            competitive: targetTeamSize(eligible.length, config.teamSize) >= config.teamSize,
          });
          return result;
        }
        if (fill.action === "keep") {
          return result;
        }
        choose.continueFromField();
        return result;
      }
      refreshLobby();
      return result;
    }

    if (result?.valid && count >= 2 && count < config.teamSize * 2) {
      if (result.winner === TEAM.BLUE) {
        for (const p of players) {
          if (p.team === TEAM.RED) p.team = TEAM.BLUE;
          else if (p.team === TEAM.BLUE) p.team = TEAM.RED;
        }
      }
      if (result.winner === TEAM.RED || result.winner === TEAM.BLUE) {
        streak.recordWin(result.winner);
      } else streak.reset();
    }

    refreshLobby();
    return result;
  }

  /** Primeiro 4v4 não picka. Choose só depois da vitória, se sobrar spec. */
  async function enterChoose({ extra = 1, red = config.scoreLimit, blue = 1 } = {}) {
    growTo(8 + extra);
    const result = await endValidMatch({ red, blue });
    assert.equal(
      snapshot().chooseActive,
      true,
      "choose deveria estar ativo após vitória com sobra no spec"
    );
    return result;
  }

  return {
    addPlayer,
    growTo,
    removePlayer,
    snapshot,
    captainPick,
    currentCaptain,
    settleLobby,
    refreshLobby,
    endValidMatch,
    enterChoose,
    match,
    choose,
    streak,
    setVoluntaryAfk(id, on, { refresh = false, notify = true } = {}) {
      if (on) {
        voluntaryAfk.add(id);
        room.setPlayerTeam(id, 0);
      } else {
        voluntaryAfk.delete(id);
      }
      if (!notify) return;
      if (refresh) refreshLobby();
      else if (choose.isActive()) choose.onPlayerJoin();
      else if (match.isCompetitive()) recoverCompetitiveLineup();
    },
    cleanup: () => choose.deactivate(),
    get players() {
      return players;
    },
    get kicks() {
      return kicks;
    },
    get announcements() {
      return announcements;
    },
    getScores: () => scores,
    setScores(partial) {
      if (!scores) {
        scores = {
          red: 0,
          blue: 0,
          time: 0,
          scoreLimit: config.scoreLimit,
          timeLimit: config.timeLimit * 60,
        };
      }
      Object.assign(scores, partial);
    },
  };
}

/** Deixa só os 4 vencedores no vermelho (AFK no spec evita o auto-fill do 4v4). */
async function holdFourWinners(host) {
  host.growTo(9);
  await host.endValidMatch({ red: config.scoreLimit, blue: 1 });
  for (const p of host.players.filter((p) => p.team === TEAM.SPEC)) {
    host.setVoluntaryAfk(p.id, true, { notify: false });
  }
  const others = host.players.filter((p) => p.team !== TEAM.RED);
  for (const p of others) host.removePlayer(p.id);
}

describe("fluxo por estágios da sala", () => {
  before(() => reloadMaps());

  it("1 jogador → mapa treino, vermelho e partida ativa", () => {
    const host = createMockRoomHost();
    host.addPlayer("Solo");
    const s = host.snapshot();
    assert.equal(s.count, 1);
    assert.match(String(s.stadiumName), /training|treino|ice bear/i);
    assert.equal(s.red, 1);
    assert.equal(s.blue, 0);
    assert.equal(s.spec, 0);
    assert.equal(s.matchRunning, true);
    assert.equal(host.match.isCompetitive(), false);
    assert.equal(s.chooseActive, false);
    assert.equal(s.gameStarted, 1);
    host.cleanup();
  });

  it("2 jogadores → mapa x3 + warmup 1v1", () => {
    const host = createMockRoomHost();
    host.growTo(2);
    const s = host.snapshot();
    assert.equal(s.count, 2);
    assert.match(String(s.stadiumName), /x3/i);
    assert.doesNotMatch(String(s.stadiumName), /x4/i);
    assert.equal(s.red, 1);
    assert.equal(s.blue, 1);
    assert.equal(s.chooseActive, false);
    assert.equal(s.matchRunning, true);
    assert.equal(host.match.isCompetitive(), false);
    host.cleanup();
  });

  it("1v1 e um sai → volta pro treino", () => {
    const host = createMockRoomHost();
    host.growTo(2);
    const leaving = host.players.find((p) => p.team === TEAM.BLUE);
    host.removePlayer(leaving.id);
    const s = host.snapshot();
    assert.equal(s.count, 1);
    assert.equal(s.red, 1);
    assert.equal(s.blue, 0);
    assert.equal(s.matchRunning, true);
    assert.equal(host.match.isCompetitive(), false);
    assert.match(String(s.stadiumName), /training|treino|ice bear/i);
    host.cleanup();
  });

  it("1v1 !afk manda para spec e o outro vai ao treino", () => {
    const host = createMockRoomHost();
    host.growTo(2);
    const afkOne = host.players.find((p) => p.team === TEAM.BLUE);
    host.setVoluntaryAfk(afkOne.id, true, { refresh: true });
    assert.equal(afkOne.team, 0);
    const s = host.snapshot();
    assert.equal(s.red, 1);
    assert.equal(s.spec, 1);
    assert.match(String(s.stadiumName), /training|treino|ice bear/i);
    host.cleanup();
  });

  it("2v2 AFK no campo → spec e vira 1v1 sem RR", () => {
    const host = createMockRoomHost();
    host.growTo(4);
    const started = host.snapshot().gameStarted;
    const idle = host.players.find((p) => p.team === TEAM.RED);
    host.setVoluntaryAfk(idle.id, true, { refresh: true });
    const s = host.snapshot();
    assert.equal(idle.team, TEAM.SPEC);
    assert.equal(s.red, 1);
    assert.equal(s.blue, 1);
    assert.equal(s.matchRunning, true);
    assert.equal(s.gameStarted, started);
    assert.equal(host.match.isCompetitive(), false);
    host.cleanup();
  });

  it("3 a 7 → pares jogam e, no número ímpar, 1 aguarda no spec", () => {
    for (let n = 3; n <= 7; n++) {
      const host = createMockRoomHost();
      host.growTo(n);
      const s = host.snapshot();
      assert.equal(s.count, n, `count ${n}`);
      assert.equal(s.chooseActive, false, `choose off @${n}`);
      assert.equal(s.spec, n % 2, `fila @${n}`);
      assert.equal(s.red, Math.floor(n / 2), `red @${n}`);
      assert.equal(s.blue, Math.floor(n / 2), `blue @${n}`);
      assert.equal(s.matchRunning, true, `match @${n}`);
      assert.equal(host.match.isCompetitive(), false, `warmup @${n}`);
      assert.match(String(s.stadiumName), /x3/i, `mapa x3 @${n}`);
      assert.doesNotMatch(String(s.stadiumName), /x4/i, `não x4 @${n}`);
      host.cleanup();
    }
  });

  it("8 jogadores a partir do 3v3 → acrescenta e inicia 4v4, sem choose", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    const s = host.snapshot();
    assert.equal(s.count, 8);
    assert.equal(s.chooseActive, false);
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    assert.equal(s.spec, 0);
    assert.equal(s.matchRunning, true);
    assert.equal(host.match.isCompetitive(), true);
    assert.match(String(s.stadiumName), /x4/i);
    host.cleanup();
  });

  it("8 jogadores → 4v4 competitivo já montado", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    const s = host.snapshot();
    assert.equal(s.chooseActive, false);
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    assert.equal(s.spec, 0);
    assert.equal(s.matchRunning, true);
    assert.equal(host.match.isCompetitive(), true);
    host.cleanup();
  });

  it("8 jogadores: após vitória os vencedores ficam e o azul remonta na ordem, sem pick", async () => {
    const host = createMockRoomHost();
    host.growTo(8);
    const redIds = host.players.filter((p) => p.team === TEAM.RED).map((p) => p.id);
    await host.endValidMatch({ red: config.scoreLimit, blue: 1 });
    const s = host.snapshot();
    assert.equal(s.chooseActive, false);
    assert.equal(s.matchRunning, true);
    assert.equal(host.match.isCompetitive(), true);
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    assert.equal(s.spec, 0);
    for (const id of redIds) {
      assert.equal(host.players.find((p) => p.id === id).team, TEAM.RED);
    }
    host.cleanup();
  });

  it("após vitória, só os 4 vencedores → ficam juntos (não vira 2v2)", async () => {
    const host = createMockRoomHost();
    await holdFourWinners(host);
    const s = host.snapshot();
    assert.equal(s.count, 4);
    assert.equal(s.red, 4);
    assert.equal(s.blue, 0);
    assert.equal(s.spec, 0);
    assert.equal(s.chooseActive, false);
    assert.equal(host.match.isCompetitive(), false);
    host.cleanup();
  });

  it("9+ após vitória: perdedor desce e o capitão picka", async () => {
    const host = createMockRoomHost();
    host.growTo(9);
    const redIds = host.players.filter((p) => p.team === TEAM.RED).map((p) => p.id);
    await host.endValidMatch({ red: config.scoreLimit, blue: 1 });
    const s = host.snapshot();
    assert.equal(s.chooseActive, true);
    assert.equal(s.matchRunning, false);
    assert.equal(s.red, 4);
    assert.equal(s.blue, 1);
    assert.equal(s.spec, 4);
    for (const id of redIds) {
      assert.equal(host.players.find((p) => p.id === id).team, TEAM.RED);
    }
    host.cleanup();
  });

  it("0→1 treino → 1v1 → spec → 2v2 → 3v3 → 8 sem pick", () => {
    const host = createMockRoomHost();
    assert.equal(host.snapshot().count, 0);
    assert.equal(host.snapshot().matchRunning, false);

    host.addPlayer("A");
    let s = host.snapshot();
    assert.equal(s.red, 1);
    assert.equal(s.blue, 0);
    assert.equal(host.match.isCompetitive(), false);
    assert.match(String(s.stadiumName), /training|treino|ice bear/i);

    host.addPlayer("B");
    s = host.snapshot();
    assert.equal(s.red, 1);
    assert.equal(s.blue, 1);
    assert.equal(s.spec, 0);

    host.addPlayer("C");
    s = host.snapshot();
    assert.equal(s.red, 1);
    assert.equal(s.blue, 1);
    assert.equal(s.spec, 1);
    assert.equal(s.chooseActive, false);

    host.addPlayer("D");
    s = host.snapshot();
    assert.equal(s.red, 2);
    assert.equal(s.blue, 2);
    assert.equal(s.spec, 0);

    host.addPlayer("E");
    host.addPlayer("F");
    s = host.snapshot();
    assert.equal(s.red, 3);
    assert.equal(s.blue, 3);
    assert.equal(s.spec, 0);

    host.addPlayer("G");
    s = host.snapshot();
    assert.equal(s.red, 3);
    assert.equal(s.blue, 3);
    assert.equal(s.spec, 1);
    assert.equal(s.chooseActive, false);

    host.addPlayer("H");
    s = host.snapshot();
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    assert.equal(s.spec, 0);
    assert.equal(s.chooseActive, false);
    assert.equal(s.matchRunning, true);
    assert.equal(host.match.isCompetitive(), true);
    host.cleanup();
  });

  it("vencedores parados + 4 specs → 4v4 na ordem, sem pick", async () => {
    const host = createMockRoomHost();
    await holdFourWinners(host);
    assert.equal(host.snapshot().red, 4);
    assert.equal(host.snapshot().count, 4);

    host.growTo(8);
    const s = host.snapshot();
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    assert.equal(s.spec, 0);
    assert.equal(s.chooseActive, false);
    assert.equal(s.matchRunning, true);
    assert.equal(host.match.isCompetitive(), true);
    host.cleanup();
  });

  it("vencedores parados: 8 fecha sem pick; o 9º espera e após vitória o capitão picka", async () => {
    const host = createMockRoomHost();
    await holdFourWinners(host);

    host.growTo(8);
    let s = host.snapshot();
    assert.equal(s.chooseActive, false);
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    assert.equal(host.match.isCompetitive(), true);

    host.addPlayer("Nono");
    s = host.snapshot();
    assert.equal(s.spec, 1);
    assert.equal(s.chooseActive, false);
    assert.equal(host.match.isCompetitive(), true);

    const redIds = host.players.filter((p) => p.team === TEAM.RED).map((p) => p.id);
    await host.endValidMatch({ red: config.scoreLimit, blue: 1 });
    s = host.snapshot();
    assert.equal(s.chooseActive, true);
    assert.equal(s.red, 4);
    assert.equal(s.blue, 1);
    assert.equal(s.spec, 4);
    for (const id of redIds) {
      assert.equal(host.players.find((p) => p.id === id).team, TEAM.RED);
    }
    host.cleanup();
  });

  it("choose: AFK deixa exatamente 3 vagas → puxa direto", async () => {
    const host = createMockRoomHost();
    await host.enterChoose();
    assert.equal(host.snapshot().red, 4);
    assert.equal(host.snapshot().blue, 1);
    assert.equal(host.snapshot().spec, 4);
    const afkOne = host.choose.list().specReady[0];
    host.setVoluntaryAfk(afkOne.id, true);
    const s = host.snapshot();
    assert.equal(s.chooseActive, false);
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    assert.equal(s.spec, 1);
    assert.equal(s.matchRunning, true);
    assert.equal(host.players.find((p) => p.id === afkOne.id).team, TEAM.SPEC);
    host.cleanup();
  });

  it("choose: sai 1 e restam 2 vagas = 2 specs → puxa direto", async () => {
    const host = createMockRoomHost();
    await host.enterChoose();
    host.captainPick("1");
    assert.equal(host.snapshot().red, 4);
    assert.equal(host.snapshot().blue, 2);
    assert.equal(host.snapshot().spec, 3);
    const leftover = host.choose.list().spec[0];
    host.removePlayer(leftover.id);
    const s = host.snapshot();
    assert.equal(s.chooseActive, false);
    assert.equal(s.matchRunning, true);
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    assert.equal(s.spec, 0);
    host.cleanup();
  });

  it("treino/warmup nunca vira partida válida para stats", async () => {
    const host = createMockRoomHost();
    host.addPlayer("Solo");
    const scores = host.getScores();
    Object.assign(scores, {
      red: config.scoreLimit,
      blue: 0,
      time: 180,
      scoreLimit: config.scoreLimit,
      timeLimit: config.timeLimit * 60,
    });

    host.match.markVictory();
    const result = await host.match.finish(scores);

    assert.equal(result.valid, false);
    host.cleanup();
  });

  it("9, 12 e 16 jogadores → primeiro 4v4 acrescenta; extra fica no spec", () => {
    for (const n of [9, 12, 16]) {
      const host = createMockRoomHost();
      host.growTo(n);
      const s = host.snapshot();
      assert.equal(s.chooseActive, false, `sem choose na 1ª @${n}`);
      assert.equal(s.red, 4, `red @${n}`);
      assert.equal(s.blue, 4, `blue @${n}`);
      assert.equal(s.spec, n - 8, `spec resto @${n}`);
      assert.equal(s.matchRunning, true);
      assert.equal(host.match.isCompetitive(), true);
      host.cleanup();
    }
  });

  it("8→7 vira 3v3 sem reiniciar o jogo", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    const started = host.snapshot().gameStarted;
    const last = host.players[host.players.length - 1];
    host.removePlayer(last.id);
    const s = host.snapshot();
    assert.equal(s.count, 7);
    assert.equal(s.chooseActive, false);
    assert.equal(s.matchRunning, true);
    assert.equal(s.gameStarted, started);
    assert.equal(s.red, 3);
    assert.equal(s.blue, 3);
    assert.equal(s.spec, 1);
    assert.equal(host.match.isCompetitive(), false);
    assert.match(String(s.stadiumName), /x4/i);
    host.cleanup();
  });

  it("3v3 + 1 spec sai → o 3v3 segue sem RR", () => {
    const host = createMockRoomHost();
    host.growTo(7);
    const started = host.snapshot().gameStarted;
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    host.removePlayer(spec.id);
    const s = host.snapshot();
    assert.equal(s.count, 6);
    assert.equal(s.red, 3);
    assert.equal(s.blue, 3);
    assert.equal(s.spec, 0);
    assert.equal(s.matchRunning, true);
    assert.equal(s.gameStarted, started);
    assert.equal(host.match.isCompetitive(), false);
    host.cleanup();
  });

  it("3v3 + 1 spec ativo e 4 AFK: winner stays, o spec vira capitão", async () => {
    const host = createMockRoomHost();
    host.growTo(7);
    const specId = host.players.find((p) => p.team === TEAM.SPEC).id;
    const redIds = host.players.filter((p) => p.team === TEAM.RED).map((p) => p.id);
    for (let i = 0; i < 4; i++) host.addPlayer(`Afk${i + 1}`, { afk: true });
    assert.equal(host.snapshot().red, 3);
    assert.equal(host.snapshot().blue, 3);
    assert.equal(host.players.length, 11);

    await host.endValidMatch({ red: config.scoreLimit, blue: 0 });
    const s = host.snapshot();
    assert.equal(s.chooseActive, true, "AFK no spec não pode pular o winner stays");
    assert.equal(s.red, 3);
    assert.equal(s.blue, 1);
    assert.equal(host.currentCaptain().id, specId);
    for (const id of redIds) {
      assert.equal(host.players.find((p) => p.id === id).team, TEAM.RED);
    }
    host.cleanup();
  });

  it("7 pessoas 3v3: vermelho ganha, spec vira capitão e escolhe 2 dos 3", async () => {
    const host = createMockRoomHost();
    host.growTo(7);
    const specId = host.players.find((p) => p.team === TEAM.SPEC).id;
    const redIds = host.players.filter((p) => p.team === TEAM.RED).map((p) => p.id);
    await host.endValidMatch({ red: config.scoreLimit, blue: 0 });
    const s = host.snapshot();
    assert.equal(s.chooseActive, true);
    assert.equal(s.red, 3);
    assert.equal(s.blue, 1);
    assert.equal(s.spec, 3);
    assert.equal(host.currentCaptain().id, specId);
    for (const id of redIds) {
      assert.equal(host.players.find((p) => p.id === id).team, TEAM.RED);
    }
    assert.equal(host.captainPick("1"), true);
    assert.equal(host.captainPick("1"), true);
    const after = host.snapshot();
    assert.equal(after.red, 3);
    assert.equal(after.blue, 3);
    assert.equal(after.spec, 1);
    assert.equal(after.chooseActive, false);
    assert.equal(after.matchRunning, true);
    assert.equal(host.match.isCompetitive(), false);
    host.cleanup();
  });

  it("4v4 cai pra 3v3 + spec sai → segue 3v3 sem RR", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    const last = host.players[host.players.length - 1];
    host.removePlayer(last.id);
    const started = host.snapshot().gameStarted;
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    host.removePlayer(spec.id);
    const s = host.snapshot();
    assert.equal(s.count, 6);
    assert.equal(s.red, 3);
    assert.equal(s.blue, 3);
    assert.equal(s.spec, 0);
    assert.equal(s.matchRunning, true);
    assert.equal(s.gameStarted, started);
    assert.match(String(s.stadiumName), /x4/i);
    host.settleLobby();
    assert.match(String(host.snapshot().stadiumName), /x3/i);
    host.cleanup();
  });

  it("3v3 ao vivo + 2 specs → puxa um de cada lado e reinicia 4v4", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    const last = host.players[host.players.length - 1];
    host.removePlayer(last.id);
    assert.equal(host.snapshot().red, 3);
    assert.equal(host.snapshot().blue, 3);
    const started = host.snapshot().gameStarted;
    host.addPlayer("Novo");
    const s = host.snapshot();
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    assert.equal(s.spec, 0);
    assert.equal(s.chooseActive, false);
    assert.equal(s.matchRunning, true);
    assert.equal(host.match.isCompetitive(), true);
    assert.ok(s.gameStarted > started);
    host.cleanup();
  });

  it("mapas: 1 = treino, 2–7 = x3, 8 = x4", () => {
    const t = stadiumForPlayerCount(1);
    const x3 = stadiumForPlayerCount(2);
    const x4 = stadiumForPlayerCount(8);
    assert.notEqual(t, x3);
    assert.notEqual(x3, x4);
    assert.equal(stadiumForPlayerCount(7), x3);
    assert.match(JSON.parse(t).name, /training|ice bear/i);
    assert.match(JSON.parse(x3).name, /x3/i);
    assert.match(JSON.parse(x4).name, /x4/i);
  });

  it("partida: gol+assist+MVP", async () => {
    const host = createMockRoomHost();
    host.growTo(8);

    const red = host.players.filter((p) => p.team === TEAM.RED);
    const a = red[0];
    const b = red[1];
    host.match.onBallKick(b);
    host.match.onBallKick(a);
    host.match.onTeamGoal(TEAM.RED);

    const goalMsg = host.announcements.map((a) => a.msg).join("\n");
    assert.match(goalMsg, /Gol de .*Assist:/);
    assert.equal(/km\/h/.test(goalMsg), false);

    const attr = attributeGoal(
      [
        { name: a.name, auth: a.auth, team: 1 },
        { name: b.name, auth: b.auth, team: 1 },
      ],
      1
    );
    assert.equal(attr.scorer.auth, a.auth);
    assert.equal(attr.assist.auth, b.auth);

    const mvps = pickMatchMvps([
      { auth: a.auth, nick: a.name, goals: 1, assists: 0, result: "win" },
      { auth: b.auth, nick: b.name, goals: 0, assists: 1, result: "win" },
      { auth: "loser", nick: "L", goals: 3, assists: 0, result: "loss" },
    ]);
    assert.equal(mvps[0].auth, a.auth);

    await host.endValidMatch();
    assert.equal(host.snapshot().chooseActive, false);
    assert.equal(host.snapshot().red, 4);
    assert.equal(host.snapshot().blue, 4);
    assert.equal(host.match.isRunning(), true);
    assert.equal(host.match.isCompetitive(), true);
    host.cleanup();
  });

  it("entra no meio do choose → não reseta times", async () => {
    const host = createMockRoomHost();
    await host.enterChoose();
    const before = host.snapshot();
    host.addPlayer("Late");
    const after = host.snapshot();
    assert.equal(after.chooseActive, true);
    assert.equal(after.red, before.red);
    assert.equal(after.blue, before.blue);
    assert.equal(after.spec, before.spec + 1);
    host.cleanup();
  });

  it("4v4 + spec sai → o 4v4 segue sem RR", () => {
    const host = createMockRoomHost();
    host.growTo(9);
    const started = host.snapshot().gameStarted;
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    host.removePlayer(spec.id);
    const s = host.snapshot();
    assert.equal(s.count, 8);
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    assert.equal(s.spec, 0);
    assert.equal(s.matchRunning, true);
    assert.equal(s.gameStarted, started);
    assert.equal(host.match.isCompetitive(), true);
    host.cleanup();
  });

  it("2v2 + spec sai → o 2v2 segue sem RR", () => {
    const host = createMockRoomHost();
    host.growTo(5);
    const started = host.snapshot().gameStarted;
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    host.removePlayer(spec.id);
    const s = host.snapshot();
    assert.equal(s.count, 4);
    assert.equal(s.red, 2);
    assert.equal(s.blue, 2);
    assert.equal(s.spec, 0);
    assert.equal(s.matchRunning, true);
    assert.equal(s.gameStarted, started);
    host.cleanup();
  });

  it("entra no meio do 4v4 competitivo → fica spec até o fim", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    assert.equal(host.snapshot().matchRunning, true);
    assert.equal(host.match.isCompetitive(), true);
    host.addPlayer("Spectator");
    const s = host.snapshot();
    assert.equal(s.count, 9);
    assert.equal(s.spec, 1);
    assert.equal(s.matchRunning, true);
    host.cleanup();
  });

  it("sai capitão com 8 → cancela choose (fica 7) e volta warmup", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    const cap = host.players.find((p) => p.team === TEAM.RED);
    host.removePlayer(cap.id);
    const s = host.snapshot();
    assert.equal(s.count, 7);
    assert.equal(s.chooseActive, false);
    assert.equal(s.matchRunning, true);
    host.cleanup();
  });

  it("sai jogador do time vencedor no choose → não remonta do zero", async () => {
    const host = createMockRoomHost();
    await host.enterChoose();
    const reds = host.players.filter((p) => p.team === TEAM.RED);
    const leaving = reds[0];
    const remainingRed = reds.filter((p) => p.id !== leaving.id);
    host.removePlayer(leaving.id);
    const s = host.snapshot();
    assert.equal(s.count, 8);
    for (const p of remainingRed) {
      assert.equal(host.players.find((x) => x.id === p.id).team, TEAM.RED);
    }
    assert.ok(s.red >= 3, "vencedores que ficaram não vão pro spec");
    host.cleanup();
  });

  it("choose: diff == specs → bot completa e inicia", async () => {
    const host = createMockRoomHost();
    await host.enterChoose();
    while (host.snapshot().blue < 3) host.captainPick("1");
    assert.equal(host.snapshot().red, 4);
    assert.equal(host.snapshot().blue, 3);
    assert.equal(host.snapshot().spec, 2);
    const leftover = host.choose.list().spec[0];
    host.removePlayer(leftover.id);
    const s = host.snapshot();
    assert.equal(s.chooseActive, false);
    assert.equal(s.matchRunning, true);
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    host.cleanup();
  });

  it("sair no warmup → rebalanceia sem RR", () => {
    const host = createMockRoomHost();
    host.growTo(4);
    const started = host.snapshot().gameStarted;
    assert.equal(host.snapshot().matchRunning, true);
    const red = host.players.find((p) => p.team === TEAM.RED);
    host.removePlayer(red.id);
    const s = host.snapshot();
    assert.equal(s.count, 3);
    assert.equal(s.matchRunning, true);
    assert.equal(s.gameStarted, started);
    assert.ok(Math.abs(s.red - s.blue) <= 1);
    host.cleanup();
  });

  it("3v3 sai um → vira 2v2 e o jogo segue sem RR", () => {
    const host = createMockRoomHost();
    host.growTo(6);
    const started = host.snapshot().gameStarted;
    assert.equal(host.snapshot().red, 3);
    assert.equal(host.snapshot().blue, 3);
    const leaving = host.players.find((p) => p.team === TEAM.RED);
    host.removePlayer(leaving.id);
    const s = host.snapshot();
    assert.equal(s.count, 5);
    assert.equal(s.red, 2);
    assert.equal(s.blue, 2);
    assert.equal(s.spec, 1);
    assert.equal(s.matchRunning, true);
    assert.equal(s.gameStarted, started);
    assert.equal(host.match.isCompetitive(), false);
    host.cleanup();
  });

  it("2v2 sai um → vira 1v1 e o jogo segue sem RR", () => {
    const host = createMockRoomHost();
    host.growTo(4);
    const started = host.snapshot().gameStarted;
    const leaving = host.players.find((p) => p.team === TEAM.RED);
    host.removePlayer(leaving.id);
    const s = host.snapshot();
    assert.equal(s.count, 3);
    assert.equal(s.red, 1);
    assert.equal(s.blue, 1);
    assert.equal(s.spec, 1);
    assert.equal(s.matchRunning, true);
    assert.equal(s.gameStarted, started);
    host.cleanup();
  });

  it("sair no 4v4 com spec → preenche vaga", () => {
    const host = createMockRoomHost();
    host.growTo(9);
    assert.equal(host.snapshot().matchRunning, true);
    assert.equal(host.snapshot().spec, 1);
    const red = host.players.find((p) => p.team === TEAM.RED);
    host.removePlayer(red.id);
    const s = host.snapshot();
    assert.equal(s.matchRunning, true);
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    assert.equal(s.spec, 0);
    host.cleanup();
  });

  it("ragequit: desbalance + diff 2 + tempo alto → encerra", () => {
    const host = createMockRoomHost();
    host.growTo(9);
    // 4v4 + 1 spec → após sair ainda ≥8
    host.setScores({ red: 2, blue: 0, time: config.timeLimit * 60 * 0.9 });
    const blue = host.players.find((p) => p.team === TEAM.BLUE);
    host.removePlayer(blue.id);
    assert.ok(
      host.announcements.some((a) => a.to == null && /Ragequit de @/.test(a.msg)),
      `devia anunciar ragequit, got ${JSON.stringify(host.announcements.map((a) => a.msg))}`
    );
    assert.ok(
      host.announcements.some((a) => a.to === blue.id && a.msg.includes(`@${blue.name}`)),
      "devia mencionar o jogador no PV"
    );
    host.cleanup();
  });

  it("ragequit: 3x0 quitando antes de acabar menciona no PV", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    host.setScores({ red: 3, blue: 0, time: 40 });
    const blue = host.players.find((p) => p.team === TEAM.BLUE);
    const blueId = blue.id;
    const blueName = blue.name;
    host.removePlayer(blue.id);
    assert.ok(
      host.announcements.some((a) => a.to == null && a.msg.includes(`@${blueName}`) && /3x0/.test(a.msg)),
      `devia anunciar ragequit 3x0, got ${JSON.stringify(host.announcements.map((a) => a.msg))}`
    );
    assert.ok(
      host.announcements.some((a) => a.to === blueId && a.msg.includes(`@${blueName}`)),
      "devia mencionar o jogador no PV"
    );
    host.cleanup();
  });

  it("ragequit: 3x1 encerra mesmo depois do 4v3 (competitive off)", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    host.setScores({ red: 3, blue: 1, time: 50 });
    host.match.setCompetitive(false);
    const blue = host.players.find((p) => p.team === TEAM.BLUE);
    host.removePlayer(blue.id);
    assert.ok(
      host.announcements.some((a) => a.to == null && /Ragequit de @/.test(a.msg) && /3x1/.test(a.msg)),
      `devia anunciar ragequit 3x1, got ${JSON.stringify(host.announcements.map((a) => a.msg))}`
    );
    assert.equal(host.getScores(), null, "partida parada");
    host.cleanup();
  });

  it("AFK voluntário sai da fila de pick e não aparece na lista", async () => {
    const host = createMockRoomHost();
    await host.enterChoose({ extra: 2 });
    const specs = host.players.filter((p) => p.team === TEAM.SPEC);
    const afkOne = specs[0];
    host.setVoluntaryAfk(afkOne.id, true);
    const listed = host.choose.list().spec.map((p) => p.id);
    assert.equal(listed[listed.length - 1], afkOne.id);
    assert.ok(host.choose.list().specReady.every((p) => p.id !== afkOne.id));
    assert.ok(!lastSpecMsg(host).msg.includes(`${afkOne.name}[`));
    host.cleanup();
  });

  it("pós-vitória 4v3: capitão azul sai e o de baixo picka", async () => {
    const host = createMockRoomHost();
    host.growTo(10);
    await host.endValidMatch({ red: config.scoreLimit, blue: 0 });
    assert.equal(host.snapshot().red, 4);
    assert.equal(host.snapshot().chooseActive, true);
    assert.equal(host.currentCaptain()?.team, TEAM.BLUE);
    assert.equal(host.captainPick("1"), true);
    assert.equal(host.captainPick("1"), true);
    assert.equal(host.snapshot().red, 4);
    assert.equal(host.snapshot().blue, 3);

    const redIds = host.players.filter((p) => p.team === TEAM.RED).map((p) => p.id);
    const blue = host.players.filter((p) => p.team === TEAM.BLUE);
    const next = blue[1];
    host.removePlayer(blue[0].id);

    assert.equal(host.snapshot().chooseActive, true);
    assert.equal(host.currentCaptain().id, next.id);
    assert.equal(host.choose.handleCaptainChat(host.players.find((p) => redIds.includes(p.id)), "1"), true);
    assert.equal(host.captainPick("1"), true);
    assert.equal(host.snapshot().blue, 3);
    assert.equal(host.snapshot().red, 4);
    assert.equal(host.currentCaptain()?.team, TEAM.BLUE);
    host.cleanup();
  });

  it("capitão AFK no choose → vai pro spec; se sobrar gente o próximo picka", async () => {
    const host = createMockRoomHost();
    const prev = config.chooseTimeSec;
    config.chooseTimeSec = 0.05;
    await host.enterChoose({ extra: 4 }); // 4 vagas azuis? 4 red + 1 blue + 8 specs
    const capId = host.currentCaptain().id;
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(host.kicks.some((k) => k.id === capId), false, "não kicka");
    const parked = host.players.find((p) => p.id === capId);
    assert.equal(parked?.team, TEAM.SPEC);
    assert.equal(host.snapshot().chooseActive, true, "com specs sobrando o choose segue");
    assert.notEqual(host.currentCaptain()?.id, capId);
    config.chooseTimeSec = prev;
    host.cleanup();
  });

  it("admin completa 4v4 no choose → não kicka o capitão", async () => {
    const host = createMockRoomHost();
    const prev = config.chooseTimeSec;
    config.chooseTimeSec = 0.05;
    await host.enterChoose();
    const capId = host.currentCaptain().id;
    const specs = host.players.filter((p) => p.team === TEAM.SPEC);
    for (let i = 0; i < 3; i++) specs[i].team = TEAM.BLUE;
    host.choose.onTeamChange(specs[2]);
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(
      host.kicks.some((k) => k.id === capId),
      false,
      `não devia kickar capitão, got ${JSON.stringify(host.kicks)}`
    );
    assert.equal(host.snapshot().chooseActive, false);
    assert.equal(host.snapshot().red, 4);
    assert.equal(host.snapshot().blue, 4);
    config.chooseTimeSec = prev;
    host.cleanup();
  });

  it("azul ganha → vencedores vão pro vermelho + streak 1 + choose", async () => {
    const host = createMockRoomHost();
    host.growTo(9);
    const blueIds = host.players.filter((p) => p.team === TEAM.BLUE).map((p) => p.id);
    await host.endValidMatch({ red: 1, blue: config.scoreLimit });
    const s = host.snapshot();
    assert.equal(host.streak.get(), 1);
    assert.equal(s.chooseActive, true);
    assert.equal(s.matchRunning, false);
    // todos que eram azul estão no vermelho
    for (const id of blueIds) {
      const p = host.players.find((x) => x.id === id);
      assert.equal(p.team, TEAM.RED, `${p.name} deveria estar no vermelho`);
    }
    assert.equal(s.red, 4);
    assert.equal(s.blue, 1); // 1º do spec como adversário
    assert.ok(host.announcements.some((a) => /streak/i.test(a.msg)));
    host.cleanup();
  });

  it("vermelho ganha de novo → streak incrementa e azul vai pro spec", async () => {
    const host = createMockRoomHost();
    host.growTo(9);
    await host.endValidMatch({ red: config.scoreLimit, blue: 0 });
    assert.equal(host.streak.get(), 1);
    // completa choose e joga de novo
    while (host.snapshot().chooseActive) {
      host.captainPick("top");
    }
    assert.equal(host.snapshot().matchRunning, true);
    const redIds = host.players.filter((p) => p.team === TEAM.RED).map((p) => p.id);
    await host.endValidMatch({ red: config.scoreLimit, blue: 1 });
    assert.equal(host.streak.get(), 2);
    for (const id of redIds) {
      const p = host.players.find((x) => x.id === id);
      if (p) assert.equal(p.team, TEAM.RED);
    }
    assert.ok(host.announcements.some((a) => /streak 2/i.test(a.msg)));
    host.cleanup();
  });

  it("empate no 4v4 não zera times (gol de ouro)", async () => {
    const host = createMockRoomHost();
    host.growTo(8);
    const redIds = host.players.filter((p) => p.team === TEAM.RED).map((p) => p.id);
    const blueIds = host.players.filter((p) => p.team === TEAM.BLUE).map((p) => p.id);
    await host.endValidMatch({ red: 2, blue: 2 });
    assert.equal(host.streak.get(), 0);
    for (const id of redIds) {
      assert.equal(host.players.find((p) => p.id === id).team, TEAM.RED);
    }
    for (const id of blueIds) {
      assert.equal(host.players.find((p) => p.id === id).team, TEAM.BLUE);
    }
    assert.ok(!host.announcements.some((a) => /times resetados/i.test(a.msg)));
    host.cleanup();
  });

  it("pós-vitória com spec: vermelho cheio não é capitão", async () => {
    const host = createMockRoomHost();
    await host.enterChoose({ extra: 2 });
    assert.equal(host.snapshot().red, 4);
    assert.ok(host.snapshot().blue < 4);
    const cap = host.currentCaptain();
    assert.ok(cap);
    assert.equal(cap.team, TEAM.BLUE);
    const red = host.players.find((p) => p.team === TEAM.RED);
    assert.equal(host.choose.handleCaptainChat(red, "1"), true);
    host.cleanup();
  });

  it("4v4 2x0 cedo: perdedor sair é ragequit com @ no PV", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    host.setScores({ red: 2, blue: 0, time: 25 });
    const blue = host.players.find((p) => p.team === TEAM.BLUE);
    host.removePlayer(blue.id);
    assert.ok(host.announcements.some((a) => a.to == null && /Ragequit de @/.test(a.msg)));
    assert.ok(host.announcements.some((a) => a.to === blue.id && a.msg.includes(`@${blue.name}`)));
    host.cleanup();
  });

  it("sobra 1 jogador no meio do 4v4 → volta pro treino", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    assert.equal(host.snapshot().matchRunning, true);

    for (const p of [...host.players].slice(1)) host.removePlayer(p.id);

    const s = host.snapshot();
    assert.equal(s.count, 1);
    assert.equal(s.red, 1);
    assert.equal(s.matchRunning, true);
    assert.equal(host.match.isCompetitive(), false);
    assert.equal(s.chooseActive, false);
    assert.match(String(s.stadiumName), /training|treino|ice bear/i);
    host.cleanup();
  });

  it("sala esvazia por completo → sem partida e sem choose", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    for (const p of [...host.players]) host.removePlayer(p.id);

    const s = host.snapshot();
    assert.equal(s.count, 0);
    assert.equal(s.matchRunning, false);
    assert.equal(s.chooseActive, false);
    host.cleanup();
  });

  it("admin completa os times no choose → inicia sem picks", async () => {
    const host = createMockRoomHost();
    await host.enterChoose();
    assert.equal(host.snapshot().chooseActive, true);

    const specs = host.players.filter((p) => p.team === TEAM.SPEC);
    for (let i = 0; i < 3; i++) specs[i].team = TEAM.BLUE;
    host.choose.onTeamChange();

    const s = host.snapshot();
    assert.equal(s.chooseActive, false);
    assert.equal(s.matchRunning, true);
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    host.cleanup();
  });

  it("choose mostra streak na mensagem de pick, sem anúncio público", async () => {
    const host = createMockRoomHost();
    await host.enterChoose();
    assert.equal(host.announcements.some((a) => /Choose ativado/i.test(a.msg)), false);
    const pickHint = host.announcements.filter((a) => /Escolha em .*streak/i.test(a.msg));
    assert.ok(pickHint.length, `msgs: ${host.announcements.map((a) => a.msg).join(" | ")}`);
    const cap = host.currentCaptain();
    assert.ok(pickHint.every((a) => a.to === cap.id), "instrução de pick só para o capitão");
    assert.equal(
      host.announcements.some((a) => a.to == null && /^Specs:/.test(a.msg)),
      false
    );
    host.cleanup();
  });

  it("4v4 sem spec: capitão sai → rebalanceia para warmup 3v3 + 1 spec", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    assert.equal(host.match.isCompetitive(), true);

    const redCap = host.players.find((p) => p.team === TEAM.RED);
    host.removePlayer(redCap.id);

    const s = host.snapshot();
    assert.equal(s.count, 7);
    assert.equal(s.chooseActive, false);
    assert.equal(s.red, 3);
    assert.equal(s.blue, 3);
    assert.equal(s.spec, 1);
    assert.equal(s.matchRunning, true);
    assert.equal(host.match.isCompetitive(), false);
    assert.match(String(s.stadiumName), /x4/i);
    host.cleanup();
  });

  it("4v4 + 1 spec: capitão sai → spec entra sozinho e o jogo segue", () => {
    const host = createMockRoomHost();
    host.growTo(9);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const redCap = host.players.find((p) => p.team === TEAM.RED);
    const remainingRed = host.players.filter((p) => p.team === TEAM.RED && p.id !== redCap.id);

    host.removePlayer(redCap.id);

    const s = host.snapshot();
    assert.equal(s.matchRunning, true);
    assert.equal(host.match.isCompetitive(), true);
    assert.equal(s.chooseActive, false);
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    assert.equal(s.spec, 0);
    assert.equal(host.players.find((p) => p.id === spec.id).team, TEAM.RED);
    assert.equal(host.players.find((p) => p.id === remainingRed[0].id).team, TEAM.RED);
    host.cleanup();
  });

  it("4v4 + 2 specs: capitão sai → o 2º do time vira capitão e escolhe o spec", () => {
    const host = createMockRoomHost();
    host.growTo(10);
    host.captainPick("top");
    host.captainPick("top");
    assert.equal(host.snapshot().spec, 2);

    const redBefore = host.players.filter((p) => p.team === TEAM.RED);
    const redCap = redBefore[0];
    const newCap = redBefore[1];
    const leftover = redBefore[2];
    const specIds = host.players.filter((p) => p.team === TEAM.SPEC).map((p) => p.id);

    host.removePlayer(redCap.id);

    const mid = host.snapshot();
    assert.equal(mid.chooseActive, true);
    assert.equal(host.choose.isReplacement(), true);
    assert.equal(mid.red, 3);
    assert.equal(mid.blue, 4);
    assert.equal(mid.spec, 2);
    assert.equal(mid.matchRunning, true);
    assert.equal(host.match.isCompetitive(), true);
    assert.equal(host.currentCaptain().id, newCap.id);

    assert.equal(host.choose.handleCaptainChat(leftover, "1"), true);
    assert.equal(host.captainPick("2"), true);

    const after = host.snapshot();
    assert.equal(after.chooseActive, false);
    assert.equal(after.red, 4);
    assert.equal(after.blue, 4);
    assert.equal(after.spec, 1);
    assert.equal(after.matchRunning, true);
    assert.equal(host.match.isCompetitive(), true);
    assert.equal(host.players.find((p) => p.id === specIds[1]).team, TEAM.RED);
    assert.equal(host.players.find((p) => p.id === specIds[0]).team, TEAM.SPEC);
    host.cleanup();
  });

  it("4v4 + 2 specs: jogador comum sai → capitão original escolhe", () => {
    const host = createMockRoomHost();
    host.growTo(10);
    host.captainPick("top");
    host.captainPick("top");

    const red = host.players.filter((p) => p.team === TEAM.RED);
    const cap = red[0];
    const common = red[3];
    host.removePlayer(common.id);

    assert.equal(host.choose.isReplacement(), true);
    assert.equal(host.currentCaptain().id, cap.id);
    assert.equal(host.captainPick("1"), true);

    const s = host.snapshot();
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    assert.equal(s.spec, 1);
    assert.equal(host.match.isCompetitive(), true);
    host.cleanup();
  });

  it("4v4 + 1 spec: AFK no campo puxa o spec e o jogo segue", () => {
    const host = createMockRoomHost();
    host.growTo(9);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const red = host.players.find((p) => p.team === TEAM.RED);
    host.setVoluntaryAfk(red.id, true);
    const s = host.snapshot();
    assert.equal(s.chooseActive, false);
    assert.equal(s.matchRunning, true);
    assert.equal(host.match.isCompetitive(), true);
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    assert.equal(s.spec, 1);
    assert.equal(host.players.find((p) => p.id === spec.id).team, TEAM.RED);
    assert.equal(host.players.find((p) => p.id === red.id).team, TEAM.SPEC);
    host.cleanup();
  });

  it("4v4 + 2 specs: AFK no campo → capitão escolhe o substituto", () => {
    const host = createMockRoomHost();
    host.growTo(10);
    const red = host.players.filter((p) => p.team === TEAM.RED);
    const cap = red[0];
    const idle = red[3];
    host.setVoluntaryAfk(idle.id, true);
    assert.equal(host.choose.isReplacement(), true);
    assert.equal(host.currentCaptain().id, cap.id);
    assert.equal(host.captainPick("1"), true);
    const s = host.snapshot();
    assert.equal(s.chooseActive, false);
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    assert.equal(s.spec, 2);
    assert.equal(host.match.isCompetitive(), true);
    assert.equal(host.players.find((p) => p.id === idle.id).team, TEAM.SPEC);
    host.cleanup();
  });

  it("4v4 sem spec: AFK no campo → vira 3v3 e o jogo segue", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    const idle = host.players.find((p) => p.team === TEAM.RED);
    host.setVoluntaryAfk(idle.id, true);
    const s = host.snapshot();
    assert.equal(s.chooseActive, false);
    assert.equal(s.matchRunning, true);
    assert.equal(host.match.isCompetitive(), false);
    assert.equal(s.red, 3);
    assert.equal(s.blue, 3);
    assert.ok(s.spec >= 1);
    assert.equal(host.players.find((p) => p.id === idle.id).team, TEAM.SPEC);
    host.cleanup();
  });

  it("4v4 + spec AFK: capitão sai → AFK não preenche e rebalanceia", () => {
    const host = createMockRoomHost();
    host.growTo(9);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    host.setVoluntaryAfk(spec.id, true);

    const redCap = host.players.find((p) => p.team === TEAM.RED);
    host.removePlayer(redCap.id);

    const s = host.snapshot();
    assert.equal(s.chooseActive, false);
    assert.equal(host.match.isCompetitive(), false);
    assert.ok(Math.abs(s.red - s.blue) <= 1);
    assert.ok(s.spec >= 1);
    assert.equal(host.players.find((p) => p.id === spec.id).team, TEAM.SPEC);
    host.cleanup();
  });

  it("4v4 + 2 specs: capitão azul sai → capitão azul restante escolhe", () => {
    const host = createMockRoomHost();
    host.growTo(10);
    host.captainPick("top");
    host.captainPick("top");

    const blue = host.players.filter((p) => p.team === TEAM.BLUE);
    host.removePlayer(blue[0].id);

    assert.equal(host.choose.isReplacement(), true);
    assert.equal(host.currentCaptain().id, blue[1].id);
    assert.equal(host.captainPick("1"), true);
    assert.equal(host.snapshot().blue, 4);
    assert.equal(host.snapshot().red, 4);
    host.cleanup();
  });

  it("choose: entra spec → lista do capitão inclui o novo e os números mudam", async () => {
    const host = createMockRoomHost();
    await host.enterChoose();
    const before = lastSpecMsg(host);
    assert.ok(before);
    assert.match(before.msg, /\[4\]/);
    assert.equal(before.to, host.currentCaptain().id);
    const teams = host.snapshot();

    const late = host.addPlayer("LateSpec");
    const after = lastSpecMsg(host);
    assert.ok(after);
    assert.match(after.msg, /LateSpec\[5\]/);
    assert.equal(after.to, host.currentCaptain().id);
    assert.ok(host.choose.list().spec.some((p) => p.id === late.id));
    assert.equal(host.snapshot().red, teams.red);
    assert.equal(host.snapshot().blue, teams.blue);
    host.cleanup();
  });

  it("choose: spec que fica AFK some da lista e o próximo herda o número", async () => {
    const host = createMockRoomHost();
    await host.enterChoose({ extra: 2 });
    const specs = host.choose.list().spec;
    const first = specs[0];
    const second = specs[1];
    assert.match(lastSpecMsg(host).msg, new RegExp(`${escapeReg(first.name)}\\[1\\]`));

    host.setVoluntaryAfk(first.id, true);
    const listed = host.choose.list().spec.map((p) => p.id);
    assert.equal(listed[0], second.id);
    assert.equal(listed[listed.length - 1], first.id);
    const msg = lastSpecMsg(host).msg;
    assert.match(msg, new RegExp(`${escapeReg(second.name)}\\[1\\]`));
    assert.ok(!msg.includes(`${first.name}[`), "AFK não pode aparecer na lista do pick");
    host.cleanup();
  });

  it("choose: spec sai → lista reenvia sem ele", async () => {
    const host = createMockRoomHost();
    await host.enterChoose({ extra: 2 });
    const spec = host.choose.list().spec[0];
    host.removePlayer(spec.id);
    assert.equal(host.snapshot().chooseActive, true);
    const listed = host.choose.list().spec.map((p) => p.id);
    assert.ok(!listed.includes(spec.id));
    assert.ok(!lastSpecMsg(host).msg.includes(spec.name));
    host.cleanup();
  });

  it("choose: depois de um pick o capitão sai → o 2º do time vira capitão", () => {
    const host = createMockRoomHost();
    host.growTo(10);
    host.captainPick("1");
    const red = host.players.filter((p) => p.team === TEAM.RED);
    assert.ok(red.length >= 2);
    const cap = red[0];
    const next = red[1];
    host.removePlayer(cap.id);
    assert.equal(host.snapshot().chooseActive, true);
    assert.equal(host.currentCaptain().id, next.id);
    assert.equal(host.choose.handleCaptainChat(next, "1"), true);
    host.cleanup();
  });

  it("choose: jogador comum não picka no lugar do capitão", async () => {
    const host = createMockRoomHost();
    await host.enterChoose();
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    assert.equal(host.choose.handleCaptainChat(spec, "1"), true);
    assert.equal(spec.team, TEAM.SPEC);
    const otherTeam = host.players.find(
      (p) => p.team !== 0 && p.id !== host.currentCaptain().id
    );
    const otherTeamBefore = otherTeam.team;
    assert.equal(host.choose.handleCaptainChat(otherTeam, "1"), true);
    assert.equal(otherTeam.team, otherTeamBefore);
    host.cleanup();
  });

  it("4v4 reposição: entra spec → lista do capitão atualiza", () => {
    const host = createMockRoomHost();
    host.growTo(10);
    host.captainPick("top");
    host.captainPick("top");
    const redCap = host.players.find((p) => p.team === TEAM.RED);
    host.removePlayer(redCap.id);
    assert.equal(host.choose.isReplacement(), true);
    const capId = host.currentCaptain().id;
    const beforeIds = host.choose.list().spec.map((p) => p.id);

    const late = host.addPlayer("RepoLate");
    const listed = host.choose.list().spec.map((p) => p.id);
    assert.ok(listed.includes(late.id));
    assert.equal(listed.length, beforeIds.length + 1);
    assert.match(lastSpecMsg(host).msg, /RepoLate\[\d+\]/);
    assert.equal(lastSpecMsg(host).to, capId);
    assert.equal(host.match.isCompetitive(), true);
    host.cleanup();
  });

  it("4v4 reposição: spec AFK some da lista; !afk volta", () => {
    const host = createMockRoomHost();
    host.growTo(11);
    host.removePlayer(host.players.find((p) => p.team === TEAM.RED).id);
    const specs = host.choose.list().spec;
    assert.ok(specs.length >= 3);
    const afkOne = specs[0];
    const other = specs[1];

    host.setVoluntaryAfk(afkOne.id, true);
    const listed = host.choose.list().spec.map((p) => p.id);
    assert.equal(listed[listed.length - 1], afkOne.id);
    assert.equal(host.choose.isActive(), true);
    assert.match(lastSpecMsg(host).msg, new RegExp(`${escapeReg(other.name)}\\[1\\]`));
    assert.ok(!lastSpecMsg(host).msg.includes(`${afkOne.name}[`));

    host.setVoluntaryAfk(afkOne.id, false);
    assert.ok(host.choose.list().spec.some((p) => p.id === afkOne.id));
    assert.match(lastSpecMsg(host).msg, new RegExp(escapeReg(afkOne.name)));
    host.cleanup();
  });

  it("4v4 reposição: spec sai → números atualizam e o capitão ainda picka", () => {
    const host = createMockRoomHost();
    host.growTo(11);
    host.captainPick("top");
    host.captainPick("top");
    host.removePlayer(host.players.find((p) => p.team === TEAM.RED).id);
    const specs = host.choose.list().spec;
    const gone = specs[0];
    const stay = specs[1];
    host.removePlayer(gone.id);
    assert.equal(host.choose.isReplacement(), true);
    assert.ok(!lastSpecMsg(host).msg.includes(gone.name));
    assert.match(lastSpecMsg(host).msg, new RegExp(`${escapeReg(stay.name)}\\[1\\]`));
    assert.equal(host.captainPick("1"), true);
    assert.equal(host.players.find((p) => p.id === stay.id).team, TEAM.RED);
    host.cleanup();
  });

  it("4v4 reposição: último spec sai → cancela e rebalanceia", () => {
    const host = createMockRoomHost();
    host.growTo(10);
    host.captainPick("top");
    host.captainPick("top");
    host.removePlayer(host.players.find((p) => p.team === TEAM.RED).id);
    const specs = host.choose.list().spec;
    assert.equal(specs.length, 2);
    host.removePlayer(specs[0].id);
    host.removePlayer(specs[1].id);
    const s = host.snapshot();
    assert.equal(s.chooseActive, false);
    assert.equal(host.match.isCompetitive(), false);
    host.cleanup();
  });
});

function lastSpecMsg(host) {
  return [...host.announcements].reverse().find((a) => /^Specs:/.test(a.msg));
}

function escapeReg(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

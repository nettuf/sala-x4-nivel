const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");

const { reloadMaps, stadiumForPlayerCount } = require("../src/room/maps");
const { createChooseController, TEAM } = require("../src/room/choose");
const { createMatchController } = require("../src/room/match");
const { createStreakTracker, applyWinnerStays, shouldUseWinnerStays } = require("../src/room/streak");
const { attributeGoal, detectRageQuit } = require("../src/gameLogic");
const { planCompetitiveRecovery } = require("../src/room/recovery");
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
    onReadyToStart() {
      readyStarts += 1;
      const { applyStadium } = require("../src/room/maps");
      applyStadium(room, config.teamSize * 2);
      match.start({ competitive: true });
    },
  });

  function refreshLobby() {
    const { applyStadium } = require("../src/room/maps");
    const { planWarmup, applyWarmupMoves } = require("../src/room/warmupFlow");
    const all = players.filter((p) => p.id !== 0);
    const eligibleCount = all.filter((p) => !voluntaryAfk.has(p.id)).length;

    if (match.isCompetitive()) {
      if (choose.isActive()) choose.onPlayerJoin();
      return;
    }

    if (room.getScores() || match.isRunning()) {
      match.cancelRecordingOnly();
      room.stopGame();
    }

    applyStadium(room, all.length);

    if (eligibleCount >= config.teamSize * 2) {
      if (choose.isActive()) {
        choose.onPlayerJoin();
        return;
      }
      choose.tryStartChoose();
      return;
    }

    const plan = planWarmup(all, {
      isExcluded: (p) => voluntaryAfk.has(p.id),
    });

    if (!plan.eligibleCount) {
      choose.deactivate();
      return;
    }

    if (plan.replacementTeam) {
      applyWarmupMoves(room, plan);
      if (choose.isReplacement()) {
        choose.onPlayerJoin();
      } else {
        choose.deactivate();
        choose.startReplacement(plan.replacementTeam, () => refreshLobby());
      }
      return;
    }

    if (choose.isActive()) choose.deactivate();
    applyWarmupMoves(room, plan);
    if (plan.shouldStart) match.start({ competitive: false });
  }
  /** Encerra partida em andamento e reavalia lobby (como onGameStop). */
  function settleLobby() {
    if (match.isRunning()) {
      match.cancelRecordingOnly();
    }
    room.stopGame();
    refreshLobby();
  }

  function addPlayer(name, { settle = false } = {}) {
    const p = {
      id: nextId++,
      name: name || `P${nextId}`,
      team: TEAM.SPEC,
      auth: `auth_${nextId}`,
      conn: Buffer.from("1.1.1.1").toString("hex"),
    };
    players.push(p);
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
      for (let index = 0; index < plan.pairs * 2; index += 2) {
        room.setPlayerTeam(specs[index].id, TEAM.RED);
        room.setPlayerTeam(specs[index + 1].id, TEAM.BLUE);
        match.addToLineup(specs[index], TEAM.RED);
        match.addToLineup(specs[index + 1], TEAM.BLUE);
      }
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

    settleLobby();
  }

  function removePlayer(id) {
    const leaving = players.find((p) => p.id === id);
    const i = players.findIndex((p) => p.id === id);
    if (i >= 0) players.splice(i, 1);

    if (choose.isActive()) {
      choose.onPlayerLeave();
      if (!choose.isActive()) settleLobby();
      return;
    }

    if (match.isCompetitive()) {
      const rageReason = leaving ? match.rageQuitReason(leaving) : null;
      if (rageReason) {
        room.sendAnnouncement(
          `🚨 Ragequit de ${leaving.name}: ${rageReason}. Partida encerrada.`,
          null,
          0xe74c3c
        );
        match.markVictory();
        room.stopGame();
        return;
      }

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

    if (room.getScores() || match.isRunning()) {
      settleLobby();
      return;
    }

    choose.onPlayerLeave();
    settleLobby();
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
    assert.ok(cap, "sem capitão");
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

    const count = players.filter((p) => p.id !== 0).length;
    if (result && shouldUseWinnerStays(count, result.valid, result.winner)) {
      const { mode } = applyWinnerStays(room, result.winner, streak, {
        isExcluded: (p) => voluntaryAfk.has(p.id),
      });
      if (mode === "choose") {
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
    match,
    choose,
    streak,
    setVoluntaryAfk(id, on) {
      if (on) voluntaryAfk.add(id);
      else voluntaryAfk.delete(id);
      if (choose.isActive()) choose.onPlayerJoin();
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

  it("2 jogadores → mapa x4 + warmup 1v1", () => {
    const host = createMockRoomHost();
    host.growTo(2);
    const s = host.snapshot();
    assert.equal(s.count, 2);
    assert.match(String(s.stadiumName), /x4|futsal/i);
    assert.equal(s.red, 1);
    assert.equal(s.blue, 1);
    assert.equal(s.chooseActive, false);
    assert.equal(s.matchRunning, true);
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
      assert.match(String(s.stadiumName), /x4|futsal/i);
      host.cleanup();
    }
  });

  it("8 jogadores → choose (1+1 + 6 spec), sem auto 4v4", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    const s = host.snapshot();
    assert.equal(s.count, 8);
    assert.equal(s.chooseActive, true);
    assert.equal(s.red, 1);
    assert.equal(s.blue, 1);
    assert.equal(s.spec, 6);
    assert.equal(s.matchRunning, false);
    assert.ok(s.announcements.some((m) => /Choose/i.test(m)));
    host.cleanup();
  });

  it("8 jogadores → picks até 4v4 e inicia", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    assert.equal(host.captainPick("top"), true);
    assert.equal(host.captainPick("top"), true);
    const s = host.snapshot();
    assert.equal(s.chooseActive, false);
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    assert.equal(s.spec, 0);
    assert.equal(s.matchRunning, true);
    assert.equal(host.match.isCompetitive(), true);
    assert.ok(s.readyStarts >= 1);
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

  it("9, 12 e 16 jogadores → choose + extras no spec após 4v4", () => {
    for (const n of [9, 12, 16]) {
      const host = createMockRoomHost();
      host.growTo(n);
      assert.equal(host.snapshot().chooseActive, true, `choose @${n}`);
      assert.equal(host.snapshot().spec, n - 2);

      host.captainPick("top");
      host.captainPick("top");
      const after = host.snapshot();
      assert.equal(after.red, 4, `red @${n}`);
      assert.equal(after.blue, 4, `blue @${n}`);
      assert.equal(after.spec, n - 8, `spec resto @${n}`);
      assert.equal(after.matchRunning, true);
      host.cleanup();
    }
  });

  it("8→7 cancela choose e volta warmup", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    assert.equal(host.snapshot().chooseActive, true);
    const last = host.players[host.players.length - 1];
    host.removePlayer(last.id);
    const s = host.snapshot();
    assert.equal(s.count, 7);
    assert.equal(s.chooseActive, false);
    assert.equal(s.matchRunning, true);
    assert.equal(s.red, 3);
    assert.equal(s.blue, 3);
    assert.equal(s.spec, 1);
    host.cleanup();
  });

  it("mapas: 1 = treino, 2+ = x4", () => {
    const t = stadiumForPlayerCount(1);
    const x = stadiumForPlayerCount(2);
    assert.notEqual(t, x);
    assert.match(JSON.parse(t).name, /training|ice bear/i);
    assert.match(JSON.parse(x).name, /x4|futsal/i);
  });

  it("partida: gol+assist+MVP", async () => {
    const host = createMockRoomHost();
    host.growTo(8);
    host.captainPick("top");
    host.captainPick("top");

    const red = host.players.filter((p) => p.team === TEAM.RED);
    const a = red[0];
    const b = red[1];
    host.match.onBallKick(b);
    host.match.onBallKick(a);
    host.match.onTeamGoal(TEAM.RED);

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
      { auth: a.auth, nick: a.name, goals: 1, assists: 0 },
      { auth: b.auth, nick: b.name, goals: 0, assists: 1 },
    ]);
    assert.equal(mvps[0].auth, a.auth);

    await host.endValidMatch();
    assert.equal(host.match.isRunning(), false);
    host.cleanup();
  });

  it("entra no meio do choose → não reseta times", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    host.captainPick("top");
    const before = host.snapshot();
    assert.equal(before.red + before.blue, 3);
    host.addPlayer("Late");
    const after = host.snapshot();
    assert.equal(after.chooseActive, true);
    assert.equal(after.red, before.red);
    assert.equal(after.blue, before.blue);
    assert.equal(after.spec, before.spec + 1);
    host.cleanup();
  });

  it("entra no meio do 4v4 competitivo → fica spec até o fim", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    host.captainPick("top");
    host.captainPick("top");
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

  it("sai capitão com 9+ → promove spec (não remonta do zero)", () => {
    const host = createMockRoomHost();
    host.growTo(9);
    assert.equal(host.snapshot().chooseActive, true);
    const cap = host.players.find((p) => p.team === TEAM.RED);
    const specsBefore = host.players.filter((p) => p.team === TEAM.SPEC).map((p) => p.id);
    host.removePlayer(cap.id);
    const s = host.snapshot();
    assert.equal(s.count, 8);
    assert.equal(s.chooseActive, true);
    assert.equal(s.red, 1);
    assert.equal(s.blue, 1);
    const newRed = host.players.find((p) => p.team === TEAM.RED);
    assert.ok(specsBefore.includes(newRed.id));
    host.cleanup();
  });

  it("choose: diff == specs → bot completa e inicia", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    for (let i = 0; i < 5; i++) host.captainPick("1"); // 4v3 + 1 spec (número não grava modo)
    assert.equal(host.snapshot().red, 4);
    assert.equal(host.snapshot().blue, 3);
    assert.equal(host.snapshot().spec, 1);
    host.choose.onPlayerLeave();
    const s = host.snapshot();
    assert.equal(s.chooseActive, false);
    assert.equal(s.matchRunning, true);
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    host.cleanup();
  });

  it("sair no warmup → rebalanceia", () => {
    const host = createMockRoomHost();
    host.growTo(4);
    assert.equal(host.snapshot().matchRunning, true);
    const red = host.players.find((p) => p.team === TEAM.RED);
    host.removePlayer(red.id);
    const s = host.snapshot();
    assert.equal(s.count, 3);
    assert.equal(s.matchRunning, true);
    assert.ok(Math.abs(s.red - s.blue) <= 1);
    host.cleanup();
  });

  it("sair no 4v4 com spec → preenche vaga", () => {
    const host = createMockRoomHost();
    host.growTo(9);
    host.captainPick("top");
    host.captainPick("top");
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
    host.captainPick("top");
    host.captainPick("top");
    // 4v4 + 1 spec → após sair ainda ≥8
    host.setScores({ red: 2, blue: 0, time: config.timeLimit * 60 * 0.9 });
    const blue = host.players.find((p) => p.team === TEAM.BLUE);
    host.removePlayer(blue.id);
    assert.ok(
      host.announcements.some((a) => /Ragequit/i.test(a.msg)),
      `devia anunciar ragequit, got ${JSON.stringify(host.announcements.map((a) => a.msg))}`
    );
    host.cleanup();
  });

  it("AFK voluntário não entra na lista de pick", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    const specs = host.players.filter((p) => p.team === TEAM.SPEC);
    const afkOne = specs[0];
    host.setVoluntaryAfk(afkOne.id, true);
    const listed = host.choose.list().spec.map((p) => p.id);
    assert.ok(!listed.includes(afkOne.id));
    host.cleanup();
  });

  it("capitão AFK no choose → kick por tempo", async () => {
    const host = createMockRoomHost();
    const prev = config.chooseTimeSec;
    config.chooseTimeSec = 0.05;
    host.growTo(8);
    const capId = host.players.find((p) => p.team === TEAM.RED || p.team === TEAM.BLUE).id;
    await new Promise((r) => setTimeout(r, 120));
    assert.ok(
      host.kicks.some((k) => k.id === capId && /tempo|AFK/i.test(k.reason)),
      `kick esperado, got ${JSON.stringify(host.kicks)}`
    );
    config.chooseTimeSec = prev;
    host.cleanup();
  });

  it("azul ganha → vencedores vão pro vermelho + streak 1 + choose", async () => {
    const host = createMockRoomHost();
    host.growTo(9);
    host.captainPick("top");
    host.captainPick("top");
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
    host.captainPick("top");
    host.captainPick("top");
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

  it("sobra 1 jogador no meio do 4v4 → volta pro treino", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    host.captainPick("top");
    host.captainPick("top");
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
    host.captainPick("top");
    host.captainPick("top");
    for (const p of [...host.players]) host.removePlayer(p.id);

    const s = host.snapshot();
    assert.equal(s.count, 0);
    assert.equal(s.matchRunning, false);
    assert.equal(s.chooseActive, false);
    host.cleanup();
  });

  it("admin completa os times no choose → inicia sem picks", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    assert.equal(host.snapshot().chooseActive, true);

    const specs = host.players.filter((p) => p.team === TEAM.SPEC);
    for (let i = 0; i < 3; i++) specs[i].team = TEAM.RED;
    for (let i = 3; i < 6; i++) specs[i].team = TEAM.BLUE;
    host.choose.onTeamChange();

    const s = host.snapshot();
    assert.equal(s.chooseActive, false);
    assert.equal(s.matchRunning, true);
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    host.cleanup();
  });

  it("choose mostra streak na mensagem de pick", async () => {
    const host = createMockRoomHost();
    host.growTo(8);
    host.captainPick("top");
    host.captainPick("top");
    await host.endValidMatch({ red: config.scoreLimit, blue: 0 });
    assert.ok(
      host.announcements.some((a) => /Choose.*streak/i.test(a.msg)),
      `msgs: ${host.announcements.map((a) => a.msg).join(" | ")}`
    );
    host.cleanup();
  });

  it("4v4 sem spec: capitão sai → rebalanceia para warmup 3v3 + 1 spec", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    host.captainPick("top");
    host.captainPick("top");
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
    host.cleanup();
  });

  it("4v4 + 1 spec: capitão sai → spec entra sozinho e o jogo segue", () => {
    const host = createMockRoomHost();
    host.growTo(9);
    host.captainPick("top");
    host.captainPick("top");
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

    assert.equal(host.choose.handleCaptainChat(leftover, "1"), false);
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

  it("4v4 + spec AFK: capitão sai → AFK não preenche e rebalanceia", () => {
    const host = createMockRoomHost();
    host.growTo(9);
    host.captainPick("top");
    host.captainPick("top");
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

  it("choose: entra spec → lista do capitão inclui o novo e os números mudam", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    const before = lastSpecMsg(host);
    assert.ok(before);
    assert.match(before.msg, /\[6\]/);
    assert.equal(before.to, host.currentCaptain().id);

    const late = host.addPlayer("LateSpec");
    const after = lastSpecMsg(host);
    assert.ok(after);
    assert.match(after.msg, /LateSpec\[7\]/);
    assert.equal(after.to, host.currentCaptain().id);
    assert.ok(host.choose.list().spec.some((p) => p.id === late.id));
    assert.equal(host.snapshot().red, 1);
    assert.equal(host.snapshot().blue, 1);
    host.cleanup();
  });

  it("choose: spec AFK some da lista e o próximo herda o número", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    const specs = host.choose.list().spec;
    const first = specs[0];
    const second = specs[1];
    assert.match(lastSpecMsg(host).msg, new RegExp(`${escapeReg(first.name)}\\[1\\]`));

    host.setVoluntaryAfk(first.id, true);
    const listed = host.choose.list().spec.map((p) => p.id);
    assert.ok(!listed.includes(first.id));
    assert.equal(listed[0], second.id);
    assert.match(lastSpecMsg(host).msg, new RegExp(`${escapeReg(second.name)}\\[1\\]`));
    assert.ok(!lastSpecMsg(host).msg.includes(first.name));
    host.cleanup();
  });

  it("choose: spec sai → lista reenvia sem ele", () => {
    const host = createMockRoomHost();
    host.growTo(9);
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

  it("choose: jogador comum não picka no lugar do capitão", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    assert.equal(host.choose.handleCaptainChat(spec, "1"), false);
    const otherTeam = host.players.find(
      (p) => p.team !== 0 && p.id !== host.currentCaptain().id
    );
    assert.equal(host.choose.handleCaptainChat(otherTeam, "1"), false);
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

  it("4v4 reposição: spec AFK some da lista; !back volta", () => {
    const host = createMockRoomHost();
    host.growTo(10);
    host.captainPick("top");
    host.captainPick("top");
    host.removePlayer(host.players.find((p) => p.team === TEAM.RED).id);
    const specs = host.choose.list().spec;
    assert.ok(specs.length >= 2);
    const afkOne = specs[0];
    const other = specs[1];

    host.setVoluntaryAfk(afkOne.id, true);
    assert.ok(!host.choose.list().spec.some((p) => p.id === afkOne.id));
    assert.match(lastSpecMsg(host).msg, new RegExp(`${escapeReg(other.name)}\\[1\\]`));

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

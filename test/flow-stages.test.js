const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");

const { reloadMaps, stadiumForPlayerCount } = require("../src/room/maps");
const { createChooseController, TEAM } = require("../src/room/choose");
const { createMatchController } = require("../src/room/match");
const { warmupBalanceAndStart } = require("../src/room/balance");
const { createStreakTracker, applyWinnerStays, shouldUseWinnerStays } = require("../src/room/streak");
const { attributeGoal } = require("../src/gameLogic");
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
  };

  let match = null;
  let choose = null;
  let readyStarts = 0;
  const streak = createStreakTracker();

  match = createMatchController(room);
  choose = createChooseController(room, {
    isExcluded: (p) => voluntaryAfk.has(p.id),
    getStreakLabel: () => (streak.get() > 0 ? streak.label() : ""),
    onReadyToStart() {
      readyStarts += 1;
      const { applyStadium } = require("../src/room/maps");
      applyStadium(room, config.teamSize * 2);
      match.start();
    },
  });

  function refreshLobby() {
    const count = players.filter((p) => p.id !== 0).length;
    const { applyStadium } = require("../src/room/maps");
    applyStadium(room, count);

    if (room.getScores() || match.isRunning()) return;

    if (count >= config.teamSize * 2) {
      if (choose.isActive()) {
        choose.onPlayerJoin();
        return;
      }
      choose.tryStartChoose();
    } else {
      choose.deactivate();
      warmupBalanceAndStart(room, match);
    }
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
      const need = config.teamSize * 2;
      // Warmup rodando e ainda < 8 → reinicia lobby p/ incluir novos no balance
      if (players.length < need && match.isRunning()) {
        settleLobby();
      }
      // Cruzou limiar do choose → para warmup e abre choose
      if (players.length >= need && (match.isRunning() || !choose.isActive())) {
        settleLobby();
      }
    }
  }

  function removePlayer(id) {
    const i = players.findIndex((p) => p.id === id);
    if (i >= 0) players.splice(i, 1);

    const inGame = !!(room.getScores() || match.isRunning());
    if (inGame && !choose.isActive()) {
      const { handleInGameLeave } = require("../src/room/leaveFlow");
      const result = handleInGameLeave(room, match, {
        isExcluded: (p) => voluntaryAfk.has(p.id),
      });
      if (result === "warmup-reset" || result === "ended") {
        settleLobby();
      }
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
    const red = players.filter((p) => p.team === TEAM.RED);
    const blue = players.filter((p) => p.team === TEAM.BLUE);
    if (!red.length || !blue.length) return null;
    return red.length <= blue.length ? red[0] : blue[0];
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
    settleLobby,
    refreshLobby,
    endValidMatch,
    match,
    choose,
    streak,
    setVoluntaryAfk(id, on) {
      if (on) voluntaryAfk.add(id);
      else voluntaryAfk.delete(id);
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

  it("1 jogador → mapa treino, sem partida", () => {
    const host = createMockRoomHost();
    host.addPlayer("Solo");
    const s = host.snapshot();
    assert.equal(s.count, 1);
    assert.match(String(s.stadiumName), /training|treino|ice bear/i);
    assert.equal(s.matchRunning, false);
    assert.equal(s.chooseActive, false);
    assert.equal(s.gameStarted, 0);
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
    host.cleanup();
  });

  it("3 a 7 jogadores → warmup balanceado, sem choose", () => {
    for (let n = 3; n <= 7; n++) {
      const host = createMockRoomHost();
      host.growTo(n);
      const s = host.snapshot();
      assert.equal(s.count, n, `count ${n}`);
      assert.equal(s.chooseActive, false, `choose off @${n}`);
      assert.equal(s.spec, 0, `sem spec @${n}`);
      assert.equal(s.red + s.blue, n);
      assert.ok(Math.abs(s.red - s.blue) <= 1, `balance @${n}: ${s.red}x${s.blue}`);
      assert.equal(s.matchRunning, true, `match @${n}`);
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
    for (let i = 0; i < 6; i++) {
      assert.equal(host.captainPick("top"), true, `pick ${i}`);
    }
    const s = host.snapshot();
    assert.equal(s.chooseActive, false);
    assert.equal(s.red, 4);
    assert.equal(s.blue, 4);
    assert.equal(s.spec, 0);
    assert.equal(s.matchRunning, true);
    assert.ok(s.readyStarts >= 1);
    host.cleanup();
  });

  it("9, 12 e 16 jogadores → choose + extras no spec após 4v4", () => {
    for (const n of [9, 12, 16]) {
      const host = createMockRoomHost();
      host.growTo(n);
      assert.equal(host.snapshot().chooseActive, true, `choose @${n}`);
      assert.equal(host.snapshot().spec, n - 2);

      for (let i = 0; i < 6; i++) host.captainPick("top");
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
    assert.equal(s.spec, 0);
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
    for (let i = 0; i < 6; i++) host.captainPick("top");

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

  it("entra no meio da partida → fica spec até o fim", () => {
    const host = createMockRoomHost();
    host.growTo(2);
    assert.equal(host.snapshot().matchRunning, true);
    host.addPlayer("Spectator");
    const s = host.snapshot();
    assert.equal(s.count, 3);
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
    for (let i = 0; i < 5; i++) host.captainPick("top"); // 4v3 + 1 spec
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
    for (let i = 0; i < 6; i++) host.captainPick("top");
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
    for (let i = 0; i < 6; i++) host.captainPick("top");
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
    for (let i = 0; i < 6; i++) host.captainPick("top");
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
    for (let i = 0; i < 6; i++) host.captainPick("top");
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
    for (let i = 0; i < 6; i++) host.captainPick("top");
    assert.equal(host.snapshot().matchRunning, true);

    for (const p of [...host.players].slice(1)) host.removePlayer(p.id);

    const s = host.snapshot();
    assert.equal(s.count, 1);
    assert.equal(s.matchRunning, false);
    assert.equal(s.chooseActive, false);
    assert.match(String(s.stadiumName), /training|treino|ice bear/i);
    host.cleanup();
  });

  it("sala esvazia por completo → sem partida e sem choose", () => {
    const host = createMockRoomHost();
    host.growTo(8);
    for (let i = 0; i < 6; i++) host.captainPick("top");
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
    for (let i = 0; i < 6; i++) host.captainPick("top");
    await host.endValidMatch({ red: config.scoreLimit, blue: 0 });
    assert.ok(
      host.announcements.some((a) => /Choose.*streak/i.test(a.msg)),
      `msgs: ${host.announcements.map((a) => a.msg).join(" | ")}`
    );
    host.cleanup();
  });
});

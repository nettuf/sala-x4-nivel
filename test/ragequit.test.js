const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createMatchController } = require("../src/room/match");
const { TEAM } = require("../src/room/choose");

function setup({ competitive = true } = {}) {
  const players = [
    { id: 1, name: "R", auth: "r", team: TEAM.RED },
    { id: 2, name: "B", auth: "b", team: TEAM.BLUE },
    { id: 3, name: "S", auth: "s", team: TEAM.SPEC },
  ];
  let scores = {
    red: 0,
    blue: 0,
    time: 30,
    scoreLimit: 3,
    timeLimit: 240,
  };
  const room = {
    getPlayerList: () => players,
    getScores: () => scores,
    startRecording: () => {},
    stopRecording: () => new Uint8Array(),
    startGame: () => {},
    sendAnnouncement: () => {},
  };
  const match = createMatchController(room);
  match.start({ competitive });
  return {
    players,
    match,
    setScores(next) {
      scores = { ...scores, ...next };
    },
    clearScores() {
      scores = null;
    },
  };
}

describe("ragequit no x4 oficial", () => {
  it("jogador do time perdendo 0x2 sai → ragequit", () => {
    const host = setup();
    host.setScores({ red: 2, blue: 0 });
    assert.match(
      host.match.rageQuitReason(host.players[1]),
      /abandonou perdendo 2x0/i
    );
  });

  it("3x0 quitando antes de acabar → ragequit", () => {
    const host = setup();
    host.setScores({ red: 3, blue: 0 });
    assert.match(
      host.match.rageQuitReason(host.players[1]),
      /abandonou perdendo 3x0/i
    );
  });

  it("3x1 quitando encerra mesmo sem competitive", () => {
    const host = setup();
    host.setScores({ red: 3, blue: 1 });
    host.match.setCompetitive(false);
    assert.match(
      host.match.rageQuitReason(host.players[1]),
      /abandonou perdendo 3x1/i
    );
  });

  it("3x0 com getScores nulo usa o último placar", () => {
    const host = setup();
    host.setScores({ red: 3, blue: 0 });
    host.match.onTick();
    host.clearScores();
    assert.match(
      host.match.rageQuitReason(host.players[1]),
      /abandonou perdendo 3x0/i
    );
  });

  it("perdedor já em spec no leave ainda conta pelo lineup", () => {
    const host = setup();
    host.setScores({ red: 3, blue: 0 });
    assert.match(
      host.match.rageQuitReason({ ...host.players[1], team: TEAM.SPEC }),
      /abandonou perdendo 3x0/i
    );
  });

  it("jogador do time vencedor sai no 2x0 → não é ragequit", () => {
    const host = setup();
    host.setScores({ red: 2, blue: 0 });
    assert.equal(host.match.rageQuitReason(host.players[0]), null);
  });

  it("spec sai → não é ragequit", () => {
    const host = setup();
    host.setScores({ red: 2, blue: 0 });
    assert.equal(host.match.rageQuitReason(host.players[2]), null);
  });

  it("perdedor sai no 1x0 no começo → saída normal", () => {
    const host = setup();
    host.setScores({ red: 1, blue: 0, time: 40, timeLimit: 240 });
    host.match.onTeamGoal(TEAM.RED);
    assert.equal(host.match.rageQuitReason(host.players[1]), null);
  });

  it("1x0 no último minuto → ragequit", () => {
    const host = setup();
    host.setScores({ red: 1, blue: 0, time: 185, timeLimit: 240 });
    assert.match(
      host.match.rageQuitReason(host.players[1]),
      /abandonou perdendo 1x0/i
    );
  });

  it("treino/warmup nunca classifica ragequit", () => {
    const host = setup({ competitive: false });
    host.setScores({ red: 2, blue: 0 });
    assert.equal(host.match.rageQuitReason(host.players[1]), null);
  });

  it("0x3 o perdedor sai → ragequit; o vencedor não", () => {
    const host = setup();
    host.setScores({ red: 0, blue: 3 });
    assert.match(host.match.rageQuitReason(host.players[0]), /0x3/);
    assert.equal(host.match.rageQuitReason(host.players[1]), null);
  });

  it("empate 1x1 não é ragequit", () => {
    const host = setup();
    host.setScores({ red: 1, blue: 1 });
    assert.equal(host.match.rageQuitReason(host.players[0]), null);
    assert.equal(host.match.rageQuitReason(host.players[1]), null);
  });
});

describe("gol de ouro, posse e late joiner", () => {
  function matchRoom() {
    const players = [
      { id: 1, name: "R", auth: "r", team: TEAM.RED },
      { id: 2, name: "B", auth: "b", team: TEAM.BLUE },
    ];
    let scores = {
      red: 0,
      blue: 0,
      time: 0,
      scoreLimit: 3,
      timeLimit: 180,
    };
    const announcements = [];
    let timeLimitSet = null;
    const room = {
      getPlayerList: () => players,
      getScores: () => scores,
      getBallPosition: () => ({ x: 0, y: 0 }),
      setTimeLimit: (value) => {
        timeLimitSet = value;
        scores.timeLimit = value;
      },
      startRecording: () => {},
      stopRecording: () => new Uint8Array(),
      startGame: () => {},
      stopGame: () => {
        scores = null;
      },
      sendAnnouncement: (msg) => announcements.push(msg),
    };
    const match = createMatchController(room);
    match.start({ competitive: true });
    return {
      players,
      match,
      announcements,
      get timeLimitSet() {
        return timeLimitSet;
      },
      setScores(next) {
        scores = { ...scores, ...next };
      },
    };
  }

  it("empate no timeLimit ativa gol de ouro", () => {
    const host = matchRoom();
    host.setScores({ red: 1, blue: 1, time: 180, timeLimit: 180 });
    host.match.onTick();
    assert.equal(host.match.isGoldenGoal(), true);
    assert.equal(host.timeLimitSet, 0);
    assert.ok(host.announcements.some((msg) => /gol de ouro/i.test(msg)));
  });

  it("late joiner só entra nas stats cedo e sem goleada", () => {
    const host = matchRoom();
    const extra = { id: 3, name: "C", auth: "c", team: TEAM.RED };
    host.setScores({ red: 0, blue: 0, time: 20, timeLimit: 180 });
    assert.equal(host.match.addToLineup(extra, TEAM.RED), true);
    assert.equal(host.match.addToLineup(extra, TEAM.RED), false);
    host.setScores({ red: 2, blue: 0, time: 30, timeLimit: 180 });
    assert.equal(
      host.match.addToLineup({ id: 4, name: "D", auth: "d", team: TEAM.BLUE }, TEAM.BLUE),
      false
    );
  });

  it("anúncio de gol inclui relógio", () => {
    const host = matchRoom();
    host.setScores({ red: 0, blue: 0, time: 125, timeLimit: 180 });
    host.match.onBallKick(host.players[0]);
    host.match.onTeamGoal(TEAM.RED);
    assert.ok(host.announcements.some((msg) => /\[02:05\]/.test(msg)));
  });
});

describe("stats da partida x4", () => {
  it("auth só no join ainda grava gol e assistência no payload do !stats", async () => {
    const auths = new Map([
      [1, "auth-r"],
      [2, "auth-r2"],
      [3, "auth-b"],
    ]);
    const players = [
      { id: 1, name: "R", team: TEAM.RED },
      { id: 2, name: "R2", team: TEAM.RED },
      { id: 3, name: "B", team: TEAM.BLUE },
    ];
    let scores = {
      red: 0,
      blue: 0,
      time: 40,
      scoreLimit: 3,
      timeLimit: 240,
    };
    const room = {
      getPlayerList: () => players.map((p) => ({ ...p })),
      getScores: () => scores,
      getBallPosition: () => ({ x: 0, y: 0 }),
      startRecording: () => {},
      stopRecording: () => new Uint8Array(),
      startGame: () => {},
      sendAnnouncement: () => {},
    };
    const match = createMatchController(room, {
      identify: (player) => ({ ...player, auth: auths.get(player.id) || null }),
    });
    match.start({ competitive: true });

    match.onBallKick({ id: 2, name: "R2", team: TEAM.RED });
    match.onBallKick({ id: 1, name: "R", team: TEAM.RED });
    scores = { ...scores, red: 1 };
    match.onTeamGoal(TEAM.RED);
    match.markVictory();
    scores = { ...scores, red: 3, blue: 0, time: 90 };

    const result = await match.finish(scores);
    assert.equal(result.valid, true);
    const scorer = result.players.find((p) => p.auth === "auth-r");
    const assist = result.players.find((p) => p.auth === "auth-r2");
    const rival = result.players.find((p) => p.auth === "auth-b");
    assert.equal(scorer.goals, 1);
    assert.equal(scorer.assists, 0);
    assert.equal(scorer.result, "win");
    assert.equal(assist.goals, 0);
    assert.equal(assist.assists, 1);
    assert.equal(rival.goals, 0);
    assert.equal(rival.result, "loss");
  });

  it("assist conta o último toque do time mesmo com rival chutando no meio", async () => {
    const players = [
      { id: 1, name: "R", auth: "auth-r", team: TEAM.RED },
      { id: 2, name: "R2", auth: "auth-r2", team: TEAM.RED },
      { id: 3, name: "B", auth: "auth-b", team: TEAM.BLUE },
    ];
    let scores = { red: 0, blue: 0, time: 40, scoreLimit: 3, timeLimit: 240 };
    const room = {
      getPlayerList: () => players.map((p) => ({ ...p })),
      getScores: () => scores,
      getBallPosition: () => ({ x: 0, y: 0 }),
      startRecording: () => {},
      stopRecording: () => new Uint8Array(),
      startGame: () => {},
      sendAnnouncement: () => {},
    };
    const match = createMatchController(room);
    match.start({ competitive: true });
    match.onBallKick(players[1]);
    match.onBallKick(players[2]);
    match.onBallKick(players[0]);
    scores = { ...scores, red: 1 };
    match.onTeamGoal(TEAM.RED);
    match.markVictory();
    const result = await match.finish({ ...scores, red: 3, blue: 0, time: 90 });
    const scorer = result.players.find((p) => p.auth === "auth-r");
    const assist = result.players.find((p) => p.auth === "auth-r2");
    assert.equal(scorer.goals, 1);
    assert.equal(assist.assists, 1);
  });

  it("CS só o goleiro do time que não sofreu", async () => {
    const players = [
      { id: 1, name: "GkRed", auth: "gk-r", team: TEAM.RED },
      { id: 2, name: "AtkRed", auth: "atk-r", team: TEAM.RED },
      { id: 3, name: "GkBlue", auth: "gk-b", team: TEAM.BLUE },
      { id: 4, name: "AtkBlue", auth: "atk-b", team: TEAM.BLUE },
    ];
    const discs = {
      1: { x: -220, y: 0 },
      2: { x: -30, y: 0 },
      3: { x: 220, y: 0 },
      4: { x: 40, y: 0 },
    };
    const scores = { red: 3, blue: 0, time: 90, scoreLimit: 3, timeLimit: 240 };
    const room = {
      getPlayerList: () => players.map((p) => ({ ...p })),
      getScores: () => scores,
      getBallPosition: () => ({ x: 80, y: 0 }),
      getPlayerDiscProperties: (id) => discs[id] || null,
      startRecording: () => {},
      stopRecording: () => new Uint8Array(),
      startGame: () => {},
      sendAnnouncement: () => {},
    };
    const match = createMatchController(room);
    match.start({ competitive: true });
    for (let i = 0; i < 20; i++) match.onTick();
    match.markVictory();
    const result = await match.finish(scores);
    const gkRed = result.players.find((p) => p.auth === "gk-r");
    const atkRed = result.players.find((p) => p.auth === "atk-r");
    const gkBlue = result.players.find((p) => p.auth === "gk-b");
    assert.equal(gkRed.cleanSheet, true);
    assert.equal(atkRed.cleanSheet, false);
    assert.equal(gkBlue.cleanSheet, false);
  });

  it("toque perto da bola (sem chute) também vira assistência", async () => {
    const players = [
      { id: 1, name: "R", auth: "auth-r", team: TEAM.RED },
      { id: 2, name: "R2", auth: "auth-r2", team: TEAM.RED },
      { id: 3, name: "B", auth: "auth-b", team: TEAM.BLUE },
    ];
    const discs = {
      1: { x: 80, y: 0 },
      2: { x: 8, y: 0 },
      3: { x: -80, y: 0 },
    };
    let scores = { red: 0, blue: 0, time: 40, scoreLimit: 3, timeLimit: 240 };
    const room = {
      getPlayerList: () => players.map((p) => ({ ...p })),
      getScores: () => scores,
      getBallPosition: () => ({ x: 0, y: 0 }),
      getPlayerDiscProperties: (id) => discs[id] || null,
      startRecording: () => {},
      stopRecording: () => new Uint8Array(),
      startGame: () => {},
      sendAnnouncement: () => {},
    };
    const match = createMatchController(room);
    match.start({ competitive: true });
    match.onTick();
    match.onBallKick(players[0]);
    scores = { ...scores, red: 1 };
    match.onTeamGoal(TEAM.RED);
    match.markVictory();
    const result = await match.finish({ ...scores, red: 3, blue: 0, time: 90 });
    assert.equal(result.players.find((p) => p.auth === "auth-r").goals, 1);
    assert.equal(result.players.find((p) => p.auth === "auth-r2").assists, 1);
  });

  it("sem identify e sem auth no getPlayerList não inventa stats", async () => {
    const players = [
      { id: 1, name: "R", team: TEAM.RED },
      { id: 2, name: "B", team: TEAM.BLUE },
    ];
    const scores = { red: 3, blue: 0, time: 90, scoreLimit: 3, timeLimit: 240 };
    const room = {
      getPlayerList: () => players,
      getScores: () => scores,
      startRecording: () => {},
      stopRecording: () => new Uint8Array(),
      startGame: () => {},
      sendAnnouncement: () => {},
    };
    const match = createMatchController(room);
    match.start({ competitive: true });
    match.markVictory();
    const result = await match.finish(scores);
    assert.equal(result.players.length, 0);
  });
});

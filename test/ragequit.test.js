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
    timeLimit: 180,
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

  it("perdedor sai até 10s depois de sofrer gol → ragequit", () => {
    const host = setup();
    host.setScores({ red: 1, blue: 0 });
    host.match.onTeamGoal(TEAM.RED);
    assert.match(
      host.match.rageQuitReason(host.players[1]),
      /até 10s após sofrer/i
    );
  });

  it("após mais de 10s do gol e diferença 1 → saída normal", () => {
    const host = setup();
    host.setScores({ red: 1, blue: 0 });
    host.match.onTeamGoal(TEAM.RED);
    assert.equal(
      host.match.rageQuitReason(host.players[1], undefined, Date.now() + 10_001),
      null
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

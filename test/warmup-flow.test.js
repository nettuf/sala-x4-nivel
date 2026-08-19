const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { planWarmup, applyWarmupMoves } = require("../src/room/warmupFlow");
const { createChooseController, TEAM } = require("../src/room/choose");

function p(id, team = TEAM.SPEC) {
  return { id, name: `P${id}`, auth: `a${id}`, team };
}

function finalTeams(players, plan) {
  const copy = players.map((player) => ({ ...player }));
  const room = {
    setPlayerTeam(id, team) {
      copy.find((player) => player.id === id).team = team;
    },
  };
  applyWarmupMoves(room, plan);
  return {
    red: copy.filter((player) => player.team === TEAM.RED).map((player) => player.id),
    blue: copy.filter((player) => player.team === TEAM.BLUE).map((player) => player.id),
    spec: copy.filter((player) => player.team === TEAM.SPEC).map((player) => player.id),
  };
}

describe("máquina de estados do treino/warmup", () => {
  it("0 jogadores → nada inicia", () => {
    const plan = planWarmup([]);
    assert.equal(plan.eligibleCount, 0);
    assert.equal(plan.shouldStart, false);
  });

  it("1 jogador → vermelho e treino", () => {
    const players = [p(1)];
    const plan = planWarmup(players);
    assert.deepEqual(finalTeams(players, plan), { red: [1], blue: [], spec: [] });
    assert.equal(plan.shouldStart, true);
  });

  it("entra o 2º → azul e 1v1", () => {
    const players = [p(1, TEAM.RED), p(2)];
    const plan = planWarmup(players);
    assert.deepEqual(finalTeams(players, plan), { red: [1], blue: [2], spec: [] });
  });

  it("entra o 3º → aguarda no spec sem mudança", () => {
    const players = [p(1, TEAM.RED), p(2, TEAM.BLUE), p(3)];
    const plan = planWarmup(players);
    assert.equal(plan.moves.length, 0);
    assert.deepEqual(finalTeams(players, plan), { red: [1], blue: [2], spec: [3] });
  });

  it("entra o 4º → os dois specs sobem automaticamente para 2v2", () => {
    const players = [
      p(1, TEAM.RED),
      p(2, TEAM.BLUE),
      p(3),
      p(4),
    ];
    const plan = planWarmup(players);
    assert.deepEqual(finalTeams(players, plan), {
      red: [1, 3],
      blue: [2, 4],
      spec: [],
    });
  });

  it("5º aguarda; 6º forma 3v3; 7º aguarda", () => {
    const base = [
      p(1, TEAM.RED),
      p(2, TEAM.BLUE),
      p(3, TEAM.RED),
      p(4, TEAM.BLUE),
    ];

    const five = [...base, p(5)];
    assert.deepEqual(finalTeams(five, planWarmup(five)).spec, [5]);

    const six = [...five, p(6)];
    assert.deepEqual(finalTeams(six, planWarmup(six)), {
      red: [1, 3, 5],
      blue: [2, 4, 6],
      spec: [],
    });

    const seven = [
      p(1, TEAM.RED),
      p(2, TEAM.BLUE),
      p(3, TEAM.RED),
      p(4, TEAM.BLUE),
      p(5, TEAM.RED),
      p(6, TEAM.BLUE),
      p(7),
    ];
    assert.deepEqual(finalTeams(seven, planWarmup(seven)).spec, [7]);
  });

  it("sai de um 2v2 sem spec → último do time maior desce e vira 1v1", () => {
    const players = [
      p(1, TEAM.RED),
      p(2, TEAM.BLUE),
      p(4, TEAM.BLUE),
    ];
    const plan = planWarmup(players);
    assert.deepEqual(finalTeams(players, plan), {
      red: [1],
      blue: [2],
      spec: [4],
    });
  });

  it("time desfalcado + 1 spec → preenche automaticamente", () => {
    const players = [
      p(1, TEAM.RED),
      p(2, TEAM.BLUE),
      p(3, TEAM.BLUE),
      p(4),
    ];
    const plan = planWarmup(players);
    assert.deepEqual(finalTeams(players, plan), {
      red: [1, 4],
      blue: [2, 3],
      spec: [],
    });
  });

  it("time desfalcado + 2 specs → capitão do menor deve escolher", () => {
    const players = [
      p(1, TEAM.RED),
      p(2, TEAM.BLUE),
      p(3, TEAM.BLUE),
      p(4),
      p(5),
    ];
    const plan = planWarmup(players);
    assert.equal(plan.replacementTeam, TEAM.RED);
    assert.equal(plan.shouldStart, false);
    assert.equal(plan.moves.length, 0);
  });

  it("AFK voluntário no spec não entra nos pares nem nas escolhas", () => {
    const players = [p(1, TEAM.RED), p(2, TEAM.BLUE), p(3), p(4)];
    const plan = planWarmup(players, { isExcluded: (player) => player.id === 3 });
    assert.equal(plan.moves.length, 0);
    assert.deepEqual(finalTeams(players, plan).spec, [3, 4]);
  });
});

describe("escolha de reposição", () => {
  it("capitão do time desfalcado escolhe entre vários specs e encerra", () => {
    const players = [
      p(1, TEAM.RED),
      p(2, TEAM.BLUE),
      p(3, TEAM.BLUE),
      p(4),
      p(5),
    ];
    const announcements = [];
    let ready = 0;
    const room = {
      getPlayerList: () => players,
      getScores: () => null,
      setPlayerTeam(id, team) {
        players.find((player) => player.id === id).team = team;
      },
      sendAnnouncement: (msg, to) => announcements.push({ msg, to }),
      kickPlayer: () => {},
    };
    const choose = createChooseController(room, {
      onReadyToStart: () => {},
    });

    choose.startReplacement(TEAM.RED, () => {
      ready += 1;
    });
    assert.equal(choose.isReplacement(), true);
    assert.equal(announcements.at(-2).to, 1);
    assert.equal(choose.handleCaptainChat(players[0], "2"), true);
    assert.equal(players.find((player) => player.id === 5).team, TEAM.RED);
    assert.equal(ready, 1);
    assert.equal(choose.isActive(), false);
  });

  it("mantém os picks corretos quando setPlayerTeam é assíncrono", () => {
    const players = Array.from({ length: 8 }, (_, index) => p(index + 1));
    const pendingChanges = [];
    const deferred = [];
    let ready = 0;
    const room = {
      getPlayerList: () => players,
      getScores: () => null,
      setPlayerTeam(id, team) {
        pendingChanges.push({ id, team });
      },
      sendAnnouncement: () => {},
      kickPlayer: () => {},
    };
    const choose = createChooseController(room, {
      onReadyToStart: () => {
        ready += 1;
      },
      deferAfterTeamChange: (callback) => deferred.push(callback),
    });

    choose.tryStartChoose();
    for (let index = 0; index < 6; index += 1) {
      const captain = choose.list().red.length <= choose.list().blue.length
        ? choose.list().red[0]
        : choose.list().blue[0];
      assert.equal(choose.handleCaptainChat(captain, "1"), true);
    }

    assert.equal(choose.bothFull(), true);
    assert.equal(ready, 0);
    for (const change of pendingChanges) {
      const player = players.find((item) => item.id === change.id);
      player.team = change.team;
      choose.confirmTeamChange(player);
    }
    deferred.forEach((callback) => callback());
    assert.equal(ready, 1);
  });

  it("lembra top/random/bottom e repete no próximo pick do mesmo capitão", () => {
    const players = Array.from({ length: 8 }, (_, index) => p(index + 1));
    let ready = 0;
    const room = {
      getPlayerList: () => players,
      getScores: () => null,
      setPlayerTeam(id, team) {
        players.find((player) => player.id === id).team = team;
      },
      sendAnnouncement: () => {},
      kickPlayer: () => {},
    };
    const choose = createChooseController(room, {
      onReadyToStart: () => {
        ready += 1;
      },
    });
    choose.tryStartChoose();
    const redCap = players.find((player) => player.id === 1);
    const blueCap = players.find((player) => player.id === 2);
    assert.equal(choose.handleCaptainChat(redCap, "top"), true);
    assert.equal(choose.handleCaptainChat(blueCap, "bottom"), true);
    // Com os dois modos gravados, o restante do 4v4 se completa sozinho.
    assert.equal(choose.bothFull(), true);
    assert.equal(ready, 1);
    assert.deepEqual(
      choose.list().red.map((player) => player.id).sort((a, b) => a - b),
      [1, 3, 4, 5]
    );
    assert.deepEqual(
      choose.list().blue.map((player) => player.id).sort((a, b) => a - b),
      [2, 6, 7, 8]
    );
  });

  it("sem streak, diff 2 no choose devolve o último escolhido ao spec", () => {
    const players = Array.from({ length: 9 }, (_, index) => p(index + 1));
    const room = {
      getPlayerList: () => players,
      getScores: () => null,
      setPlayerTeam(id, team) {
        players.find((player) => player.id === id).team = team;
      },
      sendAnnouncement: () => {},
      kickPlayer: () => {},
    };
    const choose = createChooseController(room, {
      onReadyToStart: () => {},
      getStreak: () => 0,
    });
    choose.tryStartChoose();
    const redCap = players.find((player) => player.id === 1);
    const blueCap = players.find((player) => player.id === 2);
    choose.handleCaptainChat(redCap, "1");
    choose.handleCaptainChat(blueCap, "1");
    choose.handleCaptainChat(redCap, "1");
    assert.equal(choose.list().red.length, 3);
    assert.equal(choose.list().blue.length, 2);

    const bluePicked = players.find((player) => player.id === 4);
    players.splice(players.indexOf(bluePicked), 1);
    choose.onPlayerLeave();
    assert.equal(choose.list().red.length, 2);
    assert.equal(choose.list().blue.length, 1);
    assert.equal(players.find((player) => player.id === 5).team, TEAM.SPEC);
  });

  it("com streak não desfaz o último pick", () => {
    const players = Array.from({ length: 9 }, (_, index) => p(index + 1));
    const room = {
      getPlayerList: () => players,
      getScores: () => null,
      setPlayerTeam(id, team) {
        players.find((player) => player.id === id).team = team;
      },
      sendAnnouncement: () => {},
      kickPlayer: () => {},
    };
    const choose = createChooseController(room, {
      onReadyToStart: () => {},
      getStreak: () => 2,
    });
    choose.tryStartChoose();
    const redCap = players.find((player) => player.id === 1);
    const blueCap = players.find((player) => player.id === 2);
    choose.handleCaptainChat(redCap, "1");
    choose.handleCaptainChat(blueCap, "1");
    choose.handleCaptainChat(redCap, "1");
    const bluePicked = players.find((player) => player.id === 4);
    players.splice(players.indexOf(bluePicked), 1);
    choose.onPlayerLeave();
    assert.equal(choose.list().red.length, 3);
    assert.equal(choose.list().blue.length, 1);
  });

  it("reposição aceita pick com o jogo pausado (getScores != null)", () => {
    const players = [
      p(1, TEAM.RED),
      p(2, TEAM.BLUE),
      p(3, TEAM.BLUE),
      p(4),
      p(5),
    ];
    let ready = 0;
    const room = {
      getPlayerList: () => players,
      getScores: () => ({ red: 1, blue: 1, time: 40, timeLimit: 180 }),
      setPlayerTeam(id, team) {
        players.find((player) => player.id === id).team = team;
      },
      sendAnnouncement: () => {},
      kickPlayer: () => {},
    };
    const choose = createChooseController(room, { onReadyToStart: () => {} });
    choose.startReplacement(TEAM.RED, () => {
      ready += 1;
    });
    assert.equal(choose.handleCaptainChat(players[0], "top"), true);
    assert.equal(players.find((player) => player.id === 4).team, TEAM.RED);
    assert.equal(ready, 1);
  });
});

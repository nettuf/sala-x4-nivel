const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { planWarmup, applyWarmupMoves, planPromoteToX4, planHeldWinnersToChoose } = require("../src/room/warmupFlow");
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

  it("AFK ainda no time é mandado para spec e não volta", () => {
    const players = [p(1, TEAM.RED), p(2, TEAM.BLUE), p(3, TEAM.RED), p(4, TEAM.BLUE)];
    const plan = planWarmup(players, { isExcluded: (player) => player.id === 4 });
    assert.ok(plan.moves.some((m) => m.id === 4 && m.team === TEAM.SPEC));
    assert.ok(!plan.moves.some((m) => m.id === 4 && m.team !== TEAM.SPEC));
    const teams = finalTeams(players, plan);
    assert.ok(teams.spec.includes(4));
  });

  it("1v1 com um AFK deixa o outro no vermelho (treino)", () => {
    const players = [p(1, TEAM.RED), p(2, TEAM.BLUE)];
    const plan = planWarmup(players, { isExcluded: (player) => player.id === 2 });
    assert.equal(plan.eligibleCount, 1);
    assert.equal(plan.shouldStart, true);
    assert.ok(plan.moves.some((m) => m.id === 2 && m.team === TEAM.SPEC));
    assert.deepEqual(finalTeams(players, plan), { red: [1], blue: [], spec: [2] });
  });

  it("3v3 + 2 specs promove para 4v4 sem choose", () => {
    const players = [
      p(1, TEAM.RED),
      p(2, TEAM.BLUE),
      p(3, TEAM.RED),
      p(4, TEAM.BLUE),
      p(5, TEAM.RED),
      p(6, TEAM.BLUE),
      p(7),
      p(8),
    ];
    const promo = planPromoteToX4(players);
    assert.ok(promo);
    assert.equal(promo.moves.length, 2);
    assert.equal(promo.leftoverSpec, 0);
    const teams = finalTeams(players, promo);
    assert.equal(teams.red.length, 4);
    assert.equal(teams.blue.length, 4);
  });

  it("3v3 + 3 specs acrescenta o par e deixa 1 no spec", () => {
    const players = [
      p(1, TEAM.RED),
      p(2, TEAM.BLUE),
      p(3, TEAM.RED),
      p(4, TEAM.BLUE),
      p(5, TEAM.RED),
      p(6, TEAM.BLUE),
      p(7),
      p(8),
      p(9),
    ];
    const promo = planPromoteToX4(players);
    assert.ok(promo);
    assert.equal(promo.leftoverSpec, 1);
    const teams = finalTeams(players, promo);
    assert.equal(teams.red.length, 4);
    assert.equal(teams.blue.length, 4);
    assert.equal(teams.spec.length, 1);
  });

  it("4 vencedores + extras abaixo de 8 → os 4 ficam juntos", () => {
    const players = [
      p(1, TEAM.RED),
      p(2, TEAM.RED),
      p(3, TEAM.RED),
      p(4, TEAM.RED),
      p(5),
      p(6),
    ];
    const plan = planWarmup(players);
    assert.equal(plan.shouldStart, false);
    assert.deepEqual(finalTeams(players, plan), {
      red: [1, 2, 3, 4],
      blue: [],
      spec: [5, 6],
    });
  });

  it("4 vencedores + exatamente 4 specs → preenche o azul na ordem e inicia, sem pick", () => {
    const players = [
      p(1, TEAM.RED),
      p(2, TEAM.RED),
      p(3, TEAM.RED),
      p(4, TEAM.RED),
      p(5),
      p(6),
      p(7),
      p(8),
    ];
    const held = planHeldWinnersToChoose(players);
    assert.ok(held);
    assert.equal(held.start, true);
    assert.deepEqual(
      held.moves.map((m) => m.id),
      [5, 6, 7, 8]
    );
    assert.ok(held.moves.every((m) => m.team === TEAM.BLUE));
  });

  it("4 vencedores + 5 specs → 1º spec vira capitão azul e o resto picka", () => {
    const players = [
      p(1, TEAM.RED),
      p(2, TEAM.RED),
      p(3, TEAM.RED),
      p(4, TEAM.RED),
      p(5),
      p(6),
      p(7),
      p(8),
      p(9),
    ];
    const held = planHeldWinnersToChoose(players);
    assert.ok(held);
    assert.equal(held.start, false);
    assert.deepEqual(held.moves, [{ id: 5, team: TEAM.BLUE }]);
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
    const players = [
      p(1, TEAM.RED), p(11, TEAM.RED), p(12, TEAM.RED), p(13, TEAM.RED),
      p(2, TEAM.BLUE),
      p(4), p(5), p(6), p(7),
    ];
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

    choose.continueFromField();
    const blueCap = players.find((player) => player.id === 2);
    assert.equal(choose.handleCaptainChat(blueCap, "1"), true);
    assert.equal(choose.handleCaptainChat(blueCap, "1"), true);
    assert.equal(choose.handleCaptainChat(blueCap, "1"), true);

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

  it("top/bottom só valem para um pick; com gente sobrando o capitão escolhe de novo", () => {
    const players = [
      p(1, TEAM.RED), p(11, TEAM.RED), p(12, TEAM.RED), p(13, TEAM.RED),
      p(2, TEAM.BLUE),
      p(4), p(5), p(6), p(7),
    ];
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
    choose.continueFromField();
    const blueCap = players.find((player) => player.id === 2);
    assert.equal(choose.handleCaptainChat(blueCap, "top"), true);
    assert.equal(choose.bothFull(), false);
    assert.equal(ready, 0);
    assert.equal(choose.isActive(), true);
    assert.equal(choose.list().blue.length, 2);
    assert.equal(players.find((player) => player.id === 4).team, TEAM.BLUE);
  });

  it("sem streak, diff 2 no choose devolve o último escolhido ao spec", () => {
    const players = [
      p(1, TEAM.RED), p(11, TEAM.RED), p(12, TEAM.RED),
      p(2, TEAM.BLUE), p(22, TEAM.BLUE), p(23, TEAM.BLUE),
      p(4), p(5), p(6), p(7),
    ];
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
    choose.continueFromField();
    const redCap = players.find((player) => player.id === 1);
    choose.handleCaptainChat(redCap, "1");
    assert.equal(choose.list().red.length, 4);
    assert.equal(choose.list().blue.length, 3);

    const blueLeft = players.find((player) => player.id === 23);
    players.splice(players.indexOf(blueLeft), 1);
    choose.onPlayerLeave();
    assert.equal(choose.list().red.length, 3);
    assert.equal(choose.list().blue.length, 2);
  });

  it("com streak não desfaz o último pick", () => {
    const players = [
      p(1, TEAM.RED), p(11, TEAM.RED), p(12, TEAM.RED),
      p(2, TEAM.BLUE), p(22, TEAM.BLUE), p(23, TEAM.BLUE),
      p(4), p(5), p(6), p(7),
    ];
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
    choose.continueFromField();
    const redCap = players.find((player) => player.id === 1);
    choose.handleCaptainChat(redCap, "1");
    const blueLeft = players.find((player) => player.id === 23);
    players.splice(players.indexOf(blueLeft), 1);
    choose.onPlayerLeave();
    assert.equal(choose.list().red.length, 4);
    assert.equal(choose.list().blue.length, 2);
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

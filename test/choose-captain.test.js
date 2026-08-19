const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const config = require("../src/config");
const { createChooseController, TEAM } = require("../src/room/choose");

function p(id, team = TEAM.SPEC) {
  return { id, name: `P${id}`, auth: `a${id}`, team };
}

function setup(players, { excluded = new Set(), scores = null, streak = 0 } = {}) {
  const announcements = [];
  const kicks = [];
  const room = {
    getPlayerList: () => players,
    getScores: () => scores,
    setPlayerTeam(id, team) {
      players.find((player) => player.id === id).team = team;
    },
    sendAnnouncement: (msg, to) => announcements.push({ msg, to }),
    kickPlayer: (id, reason) => kicks.push({ id, reason }),
  };
  const choose = createChooseController(room, {
    onReadyToStart: () => {},
    isExcluded: (player) => excluded.has(player.id),
    getStreak: () => streak,
  });
  return { room, choose, announcements, excluded, kicks };
}

function lastSpecs(announcements) {
  return [...announcements].reverse().find((row) => /^Specs:/.test(row.msg));
}

/** Winner stays: 4 vermelho + 1 azul + specs extras. O azul picka; o vermelho fica. */
function winnersAndSpecs(extra = 4) {
  const players = [
    p(1, TEAM.RED),
    p(11, TEAM.RED),
    p(12, TEAM.RED),
    p(13, TEAM.RED),
    p(2, TEAM.BLUE),
  ];
  for (let i = 0; i < extra; i++) players.push(p(30 + i));
  return players;
}

describe("capitão e lista de pick", () => {
  it("capitão é o 1º do time menor; o 2º não picka", () => {
    const players = winnersAndSpecs(4);
    const { choose } = setup(players);
    choose.continueFromField();
    const redCap = choose.list().red[0];
    const blueCap = choose.list().blue[0];
    assert.equal(redCap.id, 1);
    assert.equal(blueCap.id, 2);
    assert.equal(choose.currentCaptain().id, 2);
    assert.equal(choose.handleCaptainChat(redCap, "1"), false);
    assert.equal(choose.handleCaptainChat(blueCap, "1"), true);
    assert.equal(choose.currentCaptain().id, 2);
    assert.equal(choose.handleCaptainChat(redCap, "1"), false);
  });

  it("quem entra no spec entra na lista na hora, com número novo", () => {
    const players = winnersAndSpecs(4);
    const { choose, announcements } = setup(players);
    choose.continueFromField();
    const cap = choose.currentCaptain();
    assert.match(lastSpecs(announcements).msg, /\[4\]/);
    assert.equal(lastSpecs(announcements).to, cap.id);

    players.push(p(99));
    choose.onPlayerJoin();
    assert.match(lastSpecs(announcements).msg, /P99\[5\]/);
    assert.equal(lastSpecs(announcements).to, cap.id);
    assert.equal(choose.handleCaptainChat(cap, "5"), true);
    assert.equal(players.find((row) => row.id === 99).team, TEAM.BLUE);
  });

  it("AFK sai da lista de pick e o próximo herda o número", () => {
    const players = winnersAndSpecs(5);
    const excluded = new Set();
    const { choose, announcements } = setup(players, { excluded });
    choose.continueFromField();
    const firstReady = choose.list().specReady[0];
    excluded.add(firstReady.id);
    choose.onPlayerJoin();

    assert.equal(choose.list().specReady.some((row) => row.id === firstReady.id), false);
    assert.equal(choose.list().specReady[0].id, choose.list().spec[0].id);

    const msg = lastSpecs(announcements).msg;
    assert.ok(!msg.includes(`${firstReady.name}[`), "AFK não pode aparecer na lista");
    assert.ok(!/AFK/.test(msg));
  });

  it("número do AFK não existe mais: pick avisa e remostra a lista", () => {
    const players = winnersAndSpecs(5);
    const excluded = new Set();
    const { choose, announcements } = setup(players, { excluded });
    choose.continueFromField();
    const readyBefore = choose.list().specReady.length;
    const afkId = choose.list().specReady[0].id;
    excluded.add(afkId);
    choose.onPlayerJoin();

    const cap = choose.currentCaptain();
    const outOfRange = String(readyBefore);
    assert.equal(choose.handleCaptainChat(cap, outOfRange), true);
    assert.equal(players.find((row) => row.id === afkId).team, TEAM.SPEC);
    assert.ok(announcements.some((row) => /lista mudou/i.test(row.msg)));
  });

  it("único spec AFK não entra sozinho e a reposição é cancelada (nada de choose travado)", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(2, TEAM.BLUE),
      p(22, TEAM.BLUE),
      p(3, TEAM.BLUE),
      p(4, TEAM.BLUE),
      p(5),
    ];
    const excluded = new Set([5]);
    const { choose } = setup(players, { excluded });
    let result = null;
    choose.startReplacement(TEAM.RED, (payload) => {
      result = payload;
    });
    assert.equal(choose.isActive(), false);
    assert.deepEqual(result, { cancelled: true });
    assert.equal(players.find((row) => row.id === 5).team, TEAM.SPEC);
  });

  it("capitão sai e o que estava abaixo assume o pick", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(2, TEAM.BLUE),
      p(3, TEAM.BLUE),
      p(4),
      p(5),
    ];
    const { choose, announcements } = setup(players);
    choose.startReplacement(TEAM.RED);
    assert.equal(choose.currentCaptain().id, 1);

    players.splice(players.findIndex((row) => row.id === 1), 1);
    choose.onPlayerLeave();
    assert.equal(choose.currentCaptain().id, 11);
    assert.equal(lastSpecs(announcements).to, 11);
    assert.equal(choose.handleCaptainChat(players.find((row) => row.id === 11), "2"), true);
    assert.equal(players.find((row) => row.id === 5).team, TEAM.RED);
  });

  it("só 1 spec no pick → puxa automaticamente", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(2, TEAM.BLUE),
      p(22, TEAM.BLUE),
      p(3, TEAM.BLUE),
      p(4, TEAM.BLUE),
      p(5),
    ];
    const { choose, announcements } = setup(players);
    choose.startReplacement(TEAM.RED);
    assert.equal(choose.isActive(), false);
    assert.equal(players.find((row) => row.id === 5).team, TEAM.RED);
    assert.ok(announcements.some((row) => /única opção/i.test(row.msg)));
  });

  it("reposição: 2 specs e um sai → o que sobrou entra sozinho", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(2, TEAM.BLUE),
      p(3, TEAM.BLUE),
      p(4, TEAM.BLUE),
      p(5, TEAM.BLUE),
      p(6),
      p(7),
    ];
    const { choose } = setup(players);
    choose.startReplacement(TEAM.RED);
    assert.equal(choose.isActive(), true);
    players.splice(
      players.findIndex((row) => row.id === 6),
      1
    );
    choose.onPlayerLeave();
    assert.equal(choose.isActive(), false);
    assert.equal(players.find((row) => row.id === 7).team, TEAM.RED);
  });

  it("choose com 2 specs: um sai e o que sobrou entra sozinho", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(12, TEAM.RED),
      p(13, TEAM.RED),
      p(2, TEAM.BLUE),
      p(22, TEAM.BLUE),
      p(23, TEAM.BLUE),
      p(4),
      p(5),
    ];
    const { choose } = setup(players);
    choose.continueFromField();
    assert.equal(choose.isActive(), true);
    assert.equal(choose.list().spec.length, 2);

    players.splice(players.findIndex((row) => row.id === 4), 1);
    choose.onPlayerLeave();
    assert.equal(choose.isActive(), false);
    assert.equal(players.find((row) => row.id === 5).team, TEAM.BLUE);
    assert.equal(choose.list().red.length, 4);
    assert.equal(choose.list().blue.length, 4);
  });

  it("4v1 + 3 specs prontos → completa o azul na ordem, sem pick", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(12, TEAM.RED),
      p(13, TEAM.RED),
      p(2, TEAM.BLUE),
      p(4),
      p(5),
      p(6),
    ];
    const { choose, announcements } = setup(players);
    choose.continueFromField();
    assert.equal(choose.isActive(), false);
    assert.equal(players.filter((row) => row.team === TEAM.BLUE).length, 4);
    assert.equal(players.filter((row) => row.team === TEAM.RED).length, 4);
    assert.deepEqual(
      players.filter((row) => row.team === TEAM.BLUE).map((row) => row.id),
      [2, 4, 5, 6]
    );
    assert.ok(announcements.some((row) => /Sem escolhas restantes/i.test(row.msg)));
  });

  it("4v1 + 4 specs, um AFK → os 3 prontos entram e o AFK fica spec", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(12, TEAM.RED),
      p(13, TEAM.RED),
      p(2, TEAM.BLUE),
      p(4),
      p(5),
      p(6),
      p(7),
    ];
    const excluded = new Set();
    const { choose } = setup(players, { excluded });
    choose.continueFromField();
    assert.equal(choose.isActive(), true);
    excluded.add(4);
    choose.onPlayerJoin();
    assert.equal(choose.isActive(), false);
    assert.equal(players.find((row) => row.id === 4).team, TEAM.SPEC);
    assert.equal(players.filter((row) => row.team === TEAM.BLUE).length, 4);
    assert.equal(players.filter((row) => row.team === TEAM.RED).length, 4);
  });

  it("reposição com jogo pausado: join atualiza a lista do capitão restante", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(2, TEAM.BLUE),
      p(3, TEAM.BLUE),
      p(4, TEAM.BLUE),
      p(5, TEAM.BLUE),
      p(6),
      p(7),
    ];
    const { choose, announcements } = setup(players, {
      scores: { red: 1, blue: 0, time: 30, timeLimit: 180 },
    });
    choose.startReplacement(TEAM.RED);
    players.push(p(88));
    choose.onPlayerJoin();
    assert.match(lastSpecs(announcements).msg, /P88\[3\]/);
    assert.equal(lastSpecs(announcements).to, 1);
    assert.equal(choose.handleCaptainChat(players[0], "3"), true);
    assert.equal(players.find((row) => row.id === 88).team, TEAM.RED);
  });

  it("admin puxa do spec na reposição pausada → fecha o 4v4 e não kicka", async () => {
    const prev = config.chooseTimeSec;
    config.chooseTimeSec = 0.05;
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(12, TEAM.RED),
      p(2, TEAM.BLUE),
      p(3, TEAM.BLUE),
      p(4, TEAM.BLUE),
      p(5, TEAM.BLUE),
      p(6),
      p(7),
    ];
    const ready = [];
    const { choose, kicks } = setup(players, {
      scores: { red: 1, blue: 0, time: 30, timeLimit: 180 },
    });
    choose.startReplacement(TEAM.RED, (result) => ready.push(result));
    assert.equal(choose.isActive(), true);
    const spec = players.find((row) => row.id === 6);
    spec.team = TEAM.RED;
    choose.onTeamChange(spec);
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(choose.isActive(), false);
    assert.equal(ready.length, 1);
    assert.equal(ready[0].chosen.id, 6);
    assert.equal(kicks.length, 0);
    config.chooseTimeSec = prev;
  });

  it("admin puxa um spec no choose → reinicia o timer e o capitão não toma kick na hora", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(12, TEAM.RED),
      p(13, TEAM.RED),
      p(2, TEAM.BLUE),
      p(4),
      p(5),
      p(6),
      p(7),
    ];
    const { choose, announcements, kicks } = setup(players);
    choose.continueFromField();
    assert.equal(choose.isActive(), true);
    const capId = choose.currentCaptain().id;
    const spec = players.find((row) => row.id === 4);
    spec.team = TEAM.BLUE;
    choose.onTeamChange(spec);
    assert.equal(choose.isActive(), true);
    assert.equal(choose.currentCaptain().id, capId);
    assert.equal(players.filter((row) => row.team === TEAM.BLUE).length, 2);
    assert.equal(lastSpecs(announcements).to, capId);
    assert.equal(kicks.length, 0);
  });

  it("4v3: só o azul picka; vermelho cheio não escolhe", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(12, TEAM.RED),
      p(13, TEAM.RED),
      p(2, TEAM.BLUE),
      p(22, TEAM.BLUE),
      p(23, TEAM.BLUE),
      p(4),
      p(5),
    ];
    const { choose, announcements } = setup(players);
    choose.continueFromField();
    assert.equal(choose.currentCaptain().id, 2);
    assert.equal(choose.handleCaptainChat(players[0], "1"), false);
    assert.equal(lastSpecs(announcements).to, 2);
    assert.equal(choose.handleCaptainChat(players.find((row) => row.id === 2), "1"), true);
    assert.equal(players.find((row) => row.id === 4).team, TEAM.BLUE);
  });

  it("time com 3: capitão sai e o de baixo assume o pick", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(12, TEAM.RED),
      p(13, TEAM.RED),
      p(2, TEAM.BLUE),
      p(22, TEAM.BLUE),
      p(23, TEAM.BLUE),
      p(4),
      p(5),
      p(6),
    ];
    const { choose, announcements } = setup(players, { streak: 1 });
    choose.continueFromField();
    players.splice(
      players.findIndex((row) => row.id === 2),
      1
    );
    choose.onPlayerLeave();
    assert.equal(choose.currentCaptain().id, 22);
    assert.equal(lastSpecs(announcements).to, 22);
    assert.equal(choose.handleCaptainChat(players.find((row) => row.id === 22), "1"), true);
    assert.equal(players.find((row) => row.id === 4).team, TEAM.BLUE);
    assert.equal(choose.list().red.length, 4);
  });

  it("3v3: capitão vermelho sai e o 2º assume", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(12, TEAM.RED),
      p(2, TEAM.BLUE),
      p(22, TEAM.BLUE),
      p(23, TEAM.BLUE),
      p(4),
      p(5),
      p(6),
    ];
    const { choose, announcements } = setup(players);
    choose.continueFromField();
    assert.equal(choose.currentCaptain().id, 1);
    players.splice(
      players.findIndex((row) => row.id === 1),
      1
    );
    choose.onPlayerLeave();
    assert.equal(choose.isActive(), false);
    assert.equal(choose.list().red.length, 4);
    assert.equal(choose.list().blue.length, 4);
  });

  it("vencedores no red e azul vazio → sobe spec sem resetar o red", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(12, TEAM.RED),
      p(13, TEAM.RED),
      p(4),
      p(5),
      p(6),
      p(7),
      p(8),
    ];
    const { choose } = setup(players);
    choose.continueFromField();
    assert.equal(choose.list().red.length, 4);
    assert.deepEqual(
      choose.list().red.map((row) => row.id),
      [1, 11, 12, 13]
    );
    assert.equal(choose.list().blue.length, 1);
    assert.equal(choose.list().blue[0].id, 4);
    assert.equal(choose.currentCaptain().id, 4);
    assert.equal(choose.handleCaptainChat(players[0], "1"), false);
  });

  it("4v3: timeout kicka o azul, não o vermelho cheio", async () => {
    const prev = config.chooseTimeSec;
    config.chooseTimeSec = 0.05;
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(12, TEAM.RED),
      p(13, TEAM.RED),
      p(2, TEAM.BLUE),
      p(22, TEAM.BLUE),
      p(23, TEAM.BLUE),
      p(4),
      p(5),
    ];
    const { choose, kicks } = setup(players);
    choose.continueFromField();
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.ok(
      kicks.some((k) => k.id === 2 && /tempo|AFK/i.test(k.reason)),
      `kick do azul esperado, got ${JSON.stringify(kicks)}`
    );
    assert.ok(kicks.every((k) => ![1, 11, 12, 13].includes(k.id)));
    config.chooseTimeSec = prev;
  });
});

describe("winner stays 3v3/2v2/1v1", () => {
  it("3v3 + 1 spec: capitão (ex-spec) escolhe 2 entre os 3", () => {
    const players = [
      p(1, TEAM.RED),
      p(2, TEAM.RED),
      p(3, TEAM.RED),
      p(7, TEAM.BLUE),
      p(4),
      p(5),
      p(6),
    ];
    const { choose } = setup(players);
    choose.continueFromField();
    const cap = choose.currentCaptain();
    assert.equal(cap.id, 7);
    assert.equal(choose.handleCaptainChat(cap, "1"), true);
    assert.equal(choose.handleCaptainChat(cap, "1"), true);
    assert.equal(choose.list().red.length, 3);
    assert.equal(choose.list().blue.length, 3);
    assert.equal(choose.list().spec.length, 1);
    assert.equal(choose.isActive(), false);
  });

  it("2v2 + 1 spec: capitão escolhe 1 entre os 2", () => {
    const players = [
      p(1, TEAM.RED),
      p(2, TEAM.RED),
      p(5, TEAM.BLUE),
      p(3),
      p(4),
    ];
    const { choose } = setup(players);
    choose.continueFromField();
    const cap = choose.currentCaptain();
    assert.equal(cap.id, 5);
    assert.equal(choose.handleCaptainChat(cap, "1"), true);
    assert.equal(choose.list().red.length, 2);
    assert.equal(choose.list().blue.length, 2);
    assert.equal(choose.list().spec.length, 1);
    assert.equal(choose.isActive(), false);
  });

  it("1v1 + 1 spec: já está completo, começa sem pick", () => {
    const players = [p(1, TEAM.RED), p(3, TEAM.BLUE), p(2)];
    const { choose } = setup(players);
    choose.continueFromField();
    assert.equal(choose.isActive(), false);
    assert.equal(choose.list().red.length, 1);
    assert.equal(choose.list().blue.length, 1);
    assert.equal(choose.list().spec.length, 1);
  });
});

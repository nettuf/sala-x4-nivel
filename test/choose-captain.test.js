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
    onCaptainTimeout(player) {
      excluded.add(player.id);
    },
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
    const blueBefore = choose.list().blue.length;
    assert.equal(choose.handleCaptainChat(redCap, "1"), true, "consome o chat sem pickar");
    assert.equal(choose.list().blue.length, blueBefore);
    assert.equal(choose.handleCaptainChat(blueCap, "1"), true);
    assert.equal(choose.currentCaptain().id, 2);
    assert.equal(choose.handleCaptainChat(redCap, "1"), true);
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
    // 2 vagas e 4 opções: o capitão escolhe. (2=2 puxaria auto.)
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(2, TEAM.BLUE),
      p(3, TEAM.BLUE),
      p(4),
      p(5),
      p(6),
      p(7),
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

  it("reposição AO VIVO: 1 vaga e 1 spec elegível entra sem pick (AFK não contam)", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(12, TEAM.RED),
      p(13, TEAM.RED),
      p(2, TEAM.BLUE),
      p(22, TEAM.BLUE),
      p(3, TEAM.BLUE),
      p(5),
      p(6),
      p(7),
      p(8),
      p(9),
      p(10),
    ];
    const excluded = new Set([6, 7, 8, 9, 10]);
    const { choose, announcements } = setup(players, {
      excluded,
      scores: { red: 0, blue: 0, time: 10 },
    });
    let result = null;
    choose.startReplacement(TEAM.BLUE, (payload) => {
      result = payload;
    });
    assert.equal(choose.isActive(), false);
    assert.equal(players.find((row) => row.id === 5).team, TEAM.BLUE);
    assert.ok(result && result.chosen);
    assert.ok(announcements.some((row) => /única opção/i.test(row.msg)));
  });

  it("reposição AO VIVO com specs não fecha sozinha só porque o time ainda conta 4", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(12, TEAM.RED),
      p(13, TEAM.RED),
      p(2, TEAM.BLUE),
      p(22, TEAM.BLUE),
      p(3, TEAM.BLUE),
      p(4, TEAM.BLUE),
      p(5),
      p(6),
    ];
    const { choose } = setup(players, { scores: { red: 0, blue: 0, time: 10 } });
    let resolved = null;
    choose.startReplacement(TEAM.RED, (payload) => {
      resolved = payload;
    });
    assert.equal(choose.isReplacement(), true, "4 no time + spec não encerra o pick ao vivo");
    assert.equal(players.find((row) => row.id === 5).team, TEAM.SPEC);
    assert.equal(resolved, null);
  });

  it("reposição ao vivo: lista aparece na hora após cada pick (sem esperar defer)", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(2, TEAM.BLUE),
      p(3, TEAM.BLUE),
      p(4, TEAM.BLUE),
      p(5, TEAM.BLUE),
      p(6),
      p(7),
      p(8),
    ];
    const deferred = [];
    const announcements = [];
    const room = {
      getPlayerList: () => players,
      getScores: () => ({ red: 0, blue: 0, time: 10 }),
      setPlayerTeam(id, team) {
        players.find((row) => row.id === id).team = team;
      },
      sendAnnouncement: (msg, to) => announcements.push({ msg, to }),
      kickPlayer: () => {},
    };
    const choose = createChooseController(room, {
      onReadyToStart: () => {},
      deferAfterTeamChange: (cb) => deferred.push(cb),
    });
    choose.startReplacement(TEAM.RED, () => {});
    const cap = choose.currentCaptain();
    announcements.length = 0;
    assert.equal(choose.handleCaptainChat(cap, "1"), true);
    assert.equal(choose.isReplacement(), true, "ainda falta 1 vaga no vermelho");
    const immediate = lastSpecs(announcements);
    assert.ok(immediate, "reposição ao vivo: lista na hora do 2º pick");
    assert.equal(immediate.to, cap.id);
    deferred.forEach((fn) => fn());
    assert.ok(lastSpecs(announcements), "lista permanece após defer");
  });

  it("reposição 2 vagas e 2 specs → puxa os dois sem pick", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(2, TEAM.BLUE),
      p(22, TEAM.BLUE),
      p(3, TEAM.BLUE),
      p(4, TEAM.BLUE),
      p(5),
      p(6),
    ];
    const { choose, announcements } = setup(players);
    let result = null;
    choose.startReplacement(TEAM.RED, (payload) => {
      result = payload;
    });
    assert.equal(choose.isActive(), false);
    assert.equal(players.find((row) => row.id === 5).team, TEAM.RED);
    assert.equal(players.find((row) => row.id === 6).team, TEAM.RED);
    assert.equal(choose.list().red.length, 4);
    assert.ok(result && result.chosen);
    assert.ok(announcements.some((row) => /2 vagas, 2 opções/i.test(row.msg)));
  });

  it("reposição 3 vagas e 3 specs → puxa os três sem pick", () => {
    const players = [
      p(1, TEAM.RED),
      p(2, TEAM.BLUE),
      p(22, TEAM.BLUE),
      p(3, TEAM.BLUE),
      p(4, TEAM.BLUE),
      p(5),
      p(6),
      p(7),
    ];
    const { choose } = setup(players);
    choose.startReplacement(TEAM.RED);
    assert.equal(choose.isActive(), false);
    assert.equal(choose.list().red.length, 4);
    assert.equal(choose.list().blue.length, 4);
  });

  it("reposição: 2 specs e um sai → o que sobrou entra sozinho", () => {
    // 1 vaga e 2 opções: capitão escolhe. Quando sobra 1=1, puxa auto.
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

  it("dois capitães + 6 specs: vermelho escolhe um; não auto nos dois times", () => {
    const players = [
      p(1, TEAM.RED),
      p(2, TEAM.BLUE),
      p(3),
      p(4),
      p(5),
      p(6),
      p(7),
      p(8),
    ];
    const { choose } = setup(players);
    choose.continueFromField();
    assert.equal(choose.isActive(), true);
    assert.equal(choose.list().red.length, 1);
    assert.equal(choose.list().blue.length, 1);
    assert.equal(choose.currentCaptain().id, 1);

    assert.equal(choose.handleCaptainChat(choose.currentCaptain(), "1"), true);
    assert.equal(choose.list().red.length, 2);
    assert.equal(choose.list().blue.length, 1);
    assert.equal(choose.isActive(), true);
    assert.equal(choose.currentCaptain().id, 2, "depois do 1º pick, o azul escolhe");
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
    // 1 vaga e 2 opções: o capitão continua no pick; o join vira [3] na lista.
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
    assert.equal(choose.handleCaptainChat(players[0], "1"), true);
    assert.equal(players.find((row) => row.id === 4).team, TEAM.SPEC);
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
    assert.equal(choose.isActive(), true);
    assert.equal(choose.currentCaptain().id, 11);
    assert.equal(choose.list().red.length, 2);
    assert.equal(choose.list().blue.length, 3);
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
    assert.equal(choose.handleCaptainChat(players[0], "1"), true);
    assert.equal(players.find((row) => row.id === 5).team, TEAM.SPEC);
  });

  it("4v3: timeout manda o azul AFK; com specs sobrando o próximo picka", async () => {
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
      p(6),
      p(7),
      p(8),
    ];
    const { choose, kicks, excluded } = setup(players);
    choose.continueFromField();
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(kicks.length, 0, "timeout não kicka");
    assert.equal(players.find((row) => row.id === 2).team, TEAM.SPEC);
    assert.equal(excluded.has(2), true);
    assert.equal(choose.isActive(), true);
    assert.equal(choose.currentCaptain()?.id, 22, "2º do azul herda o pick");
    assert.ok(players.filter((row) => row.team === TEAM.RED).every((row) => [1, 11, 12, 13].includes(row.id)));
    config.chooseTimeSec = prev;
  });

  it("reposição 3v4: timeout do cap e o próximo picka as duas vagas (não começa 3v4)", async () => {
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
      p(8),
    ];
    const ready = [];
    const { choose, announcements } = setup(players, {
      scores: { red: 1, blue: 0, time: 30, timeLimit: 180 },
    });
    choose.startReplacement(TEAM.RED, (result) => ready.push(result));
    assert.equal(choose.currentCaptain().id, 1);

    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(players.find((row) => row.id === 1).team, TEAM.SPEC);
    assert.equal(choose.isActive(), true);
    assert.equal(choose.isReplacement(), true);
    assert.equal(choose.currentCaptain()?.id, 11);
    assert.ok(announcements.some((row) => /novo capitão/i.test(row.msg)));

    const cap2 = players.find((row) => row.id === 11);
    assert.equal(choose.handleCaptainChat(cap2, "1"), true);
    assert.equal(choose.list().red.length, 3, "ainda falta uma vaga");
    assert.equal(choose.isActive(), true, "não fecha a reposição no 3v4");
    assert.equal(ready.length, 0);
    assert.equal(
      choose.handleCaptainChat(players.find((row) => row.id === 12), "1"),
      true,
      "só o cap da vez picka"
    );
    assert.equal(choose.list().red.length, 3);
    assert.equal(choose.handleCaptainChat(cap2, "1"), true);
    assert.equal(choose.list().red.length, 4);
    assert.equal(choose.isActive(), false);
    assert.equal(ready.length, 1);
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

describe("matriz de pick do capitão", () => {
  function blueCap(choose) {
    return choose.currentCaptain();
  }

  it("números 1, 2, 3: reindexam a lista e o que sobra fica spec", () => {
    const players = winnersAndSpecs(4);
    const { choose } = setup(players);
    choose.continueFromField();
    const cap = blueCap(choose);
    const first = choose.list().specReady[0].id;
    const third = choose.list().specReady[2].id;
    const leftover = choose.list().specReady[1].id;

    assert.equal(choose.handleCaptainChat(cap, "3"), true);
    assert.equal(players.find((row) => row.id === third).team, TEAM.BLUE);
    assert.equal(choose.handleCaptainChat(cap, "1"), true);
    assert.equal(players.find((row) => row.id === first).team, TEAM.BLUE);
    assert.equal(choose.handleCaptainChat(cap, "2"), true);
    assert.equal(choose.isActive(), false);
    assert.equal(choose.list().blue.length, 4);
    assert.equal(players.find((row) => row.id === leftover).team, TEAM.SPEC);
  });

  it("número não grava modo: cada pick espera o capitão de novo", () => {
    const players = winnersAndSpecs(4);
    const { choose, announcements } = setup(players);
    choose.continueFromField();
    const cap = blueCap(choose);
    assert.equal(choose.handleCaptainChat(cap, "2"), true);
    assert.equal(choose.isActive(), true);
    assert.equal(choose.list().blue.length, 2);
    assert.ok(announcements.some((row) => /^Specs:/.test(row.msg) && /\[3\]/.test(row.msg)));
    const afterPick = lastSpecs(announcements);
    assert.equal(afterPick.to, cap.id);
    assert.match(afterPick.msg, /\[3\]/);
    assert.ok(!/\[4\]/.test(afterPick.msg));
    assert.equal(choose.handleCaptainChat(cap, "1"), true);
    assert.equal(choose.list().blue.length, 3);
    assert.equal(choose.isActive(), true);
  });

  it("top / auto / TOP / !top pegam o 1º; o próximo pick o capitão escolhe de novo", () => {
    for (const token of ["top", "auto", "TOP", "!top"]) {
      const players = winnersAndSpecs(4);
      const { choose } = setup(players);
      choose.continueFromField();
      const cap = blueCap(choose);
      const first = choose.list().specReady[0].id;
      assert.equal(choose.handleCaptainChat(cap, token), true, token);
      assert.equal(choose.isActive(), true, token);
      assert.equal(choose.list().blue.length, 2, token);
      assert.equal(players.find((row) => row.id === first).team, TEAM.BLUE, token);
    }
  });

  it("bottom / bot / !bottom pegam o último; o próximo pick o capitão escolhe de novo", () => {
    const players = winnersAndSpecs(4);
    const { choose } = setup(players);
    choose.continueFromField();
    const cap = blueCap(choose);
    const ready = choose.list().specReady.map((row) => row.id);
    assert.equal(choose.handleCaptainChat(cap, "bottom"), true);
    assert.equal(choose.isActive(), true, "com specs sobrando não fecha sozinho");
    assert.equal(players.find((row) => row.id === ready[3]).team, TEAM.BLUE);
    assert.equal(players.find((row) => row.id === ready[0]).team, TEAM.SPEC);
    assert.equal(choose.list().blue.length, 2);
  });

  it("bottom com AFK no spec pega o último pronto, não o AFK", () => {
    const players = winnersAndSpecs(5);
    const excluded = new Set([players[players.length - 1].id]);
    const { choose } = setup(players, { excluded });
    choose.continueFromField();
    const cap = blueCap(choose);
    const lastReady = choose.list().specReady[choose.list().specReady.length - 1];
    assert.equal(choose.handleCaptainChat(cap, "bottom"), true);
    assert.equal(lastReady.team, TEAM.BLUE);
    assert.equal(players.find((row) => row.id === [...excluded][0]).team, TEAM.SPEC);
  });

  it("random / rand / !random escolhem alguém da lista pronta", () => {
    const orig = Math.random;
    Math.random = () => 0.99;
    try {
      const players = winnersAndSpecs(4);
      const { choose } = setup(players);
      choose.continueFromField();
      const cap = blueCap(choose);
      const last = choose.list().specReady[choose.list().specReady.length - 1];
      assert.equal(choose.handleCaptainChat(cap, "random"), true);
      assert.equal(last.team, TEAM.BLUE);
    } finally {
      Math.random = orig;
    }
  });

  it("!1 e '1 extra' pickam o número; 0 e 99 avisam e não movem", () => {
    const players = winnersAndSpecs(4);
    const { choose, announcements } = setup(players);
    choose.continueFromField();
    const cap = blueCap(choose);
    const first = choose.list().specReady[0];
    assert.equal(choose.handleCaptainChat(cap, "0"), true);
    assert.equal(first.team, TEAM.SPEC);
    assert.ok(announcements.some((row) => /lista mudou|inválida/i.test(row.msg)));
    assert.equal(choose.handleCaptainChat(cap, "99"), true);
    assert.equal(choose.handleCaptainChat(cap, "!1"), true);
    assert.equal(first.team, TEAM.BLUE);
    assert.equal(choose.handleCaptainChat(cap, "1 restante"), true);
    assert.equal(choose.list().blue.length, 3);
  });

  it("spec, 2º do time e time cheio não pickam", () => {
    const players = winnersAndSpecs(4);
    const { choose } = setup(players);
    choose.continueFromField();
    const spec = players.find((row) => row.team === TEAM.SPEC);
    const redSecond = choose.list().red[1];
    const redCap = choose.list().red[0];
    const cap = blueCap(choose);
    const specTeam = spec.team;
    assert.equal(choose.handleCaptainChat(spec, "1"), true);
    assert.equal(spec.team, specTeam);
    assert.equal(choose.handleCaptainChat(redSecond, "1"), true);
    assert.equal(choose.handleCaptainChat(redCap, "1"), true);
    assert.equal(choose.handleCaptainChat(cap, "oi"), false);
    assert.equal(choose.handleCaptainChat(cap, "!help"), false);
  });

  it("lista e instrução de pick só aparecem para o capitão", () => {
    const players = winnersAndSpecs(4);
    const { choose, announcements } = setup(players);
    choose.continueFromField();
    const cap = choose.currentCaptain();
    const privateMsgs = announcements.filter(
      (row) => /^Specs:/.test(row.msg) || /^Escolha em/.test(row.msg) || /Sem jogadores no spec/.test(row.msg)
    );
    assert.ok(privateMsgs.length, "manda a ordem de pick");
    assert.ok(
      privateMsgs.every((row) => row.to === cap.id),
      "ninguém além do capitão vê Specs/Escolha"
    );
    assert.equal(
      announcements.some((row) => row.to == null && (/^Specs:/.test(row.msg) || /^Escolha em/.test(row.msg))),
      false
    );
  });

  it("não-capitão que manda 1 não picka e só ele vê o aviso", () => {
    const players = winnersAndSpecs(4);
    const { choose, announcements } = setup(players);
    choose.continueFromField();
    const spec = players.find((row) => row.team === TEAM.SPEC);
    const beforeBlue = choose.list().blue.length;
    announcements.length = 0;

    assert.equal(choose.handleCaptainChat(spec, "1"), true);
    assert.equal(spec.team, TEAM.SPEC);
    assert.equal(choose.list().blue.length, beforeBlue);
    assert.ok(announcements.some((row) => row.to === spec.id && /Só o capitão/.test(row.msg)));
    assert.equal(announcements.some((row) => row.to == null && /Só o capitão|Specs:/.test(row.msg)), false);
  });

  it("3v3: escolhe 2 de 3 por número; 2v2: escolhe 1 de 2", () => {
    const three = [
      p(1, TEAM.RED),
      p(2, TEAM.RED),
      p(3, TEAM.RED),
      p(7, TEAM.BLUE),
      p(4),
      p(5),
      p(6),
    ];
    const a = setup(three);
    a.choose.continueFromField();
    const cap3 = a.choose.currentCaptain();
    assert.equal(cap3.id, 7);
    assert.equal(a.choose.handleCaptainChat(cap3, "2"), true);
    assert.equal(a.choose.handleCaptainChat(cap3, "2"), true);
    assert.equal(a.choose.list().red.length, 3);
    assert.equal(a.choose.list().blue.length, 3);
    assert.equal(three.find((row) => row.id === 4).team, TEAM.SPEC);

    const two = [p(1, TEAM.RED), p(2, TEAM.RED), p(5, TEAM.BLUE), p(3), p(4)];
    const b = setup(two);
    b.choose.continueFromField();
    const cap2 = b.choose.currentCaptain();
    assert.equal(b.choose.handleCaptainChat(cap2, "2"), true);
    assert.equal(b.choose.isActive(), false);
    assert.equal(two.find((row) => row.id === 3).team, TEAM.SPEC);
    assert.equal(two.find((row) => row.id === 4).team, TEAM.BLUE);
  });

  it("depois do pick a lista aparece na hora, sem esperar defer do Haxball", () => {
    const players = winnersAndSpecs(6);
    const deferred = [];
    const announcements = [];
    const room = {
      getPlayerList: () => players,
      getScores: () => null,
      setPlayerTeam(id, team) {
        players.find((row) => row.id === id).team = team;
      },
      sendAnnouncement: (msg, to) => announcements.push({ msg, to }),
      kickPlayer: () => {},
    };
    const choose = createChooseController(room, {
      onReadyToStart: () => {},
      deferAfterTeamChange: (cb) => deferred.push(cb),
    });
    choose.continueFromField();
    const cap = choose.currentCaptain();
    announcements.length = 0;
    assert.equal(choose.handleCaptainChat(cap, "1"), true);
    const immediate = lastSpecs(announcements);
    assert.ok(immediate, "lista na hora do pick, não só após defer");
    assert.equal(immediate.to, cap.id);
    deferred.forEach((fn) => fn());
    assert.ok(lastSpecs(announcements), "lista permanece após times assentarem");
  });

  it("8º entra no 3v3 choose: lista atualiza e o capitão continua pickando", () => {
    const players = [
      p(1, TEAM.RED),
      p(2, TEAM.RED),
      p(3, TEAM.RED),
      p(7, TEAM.BLUE),
      p(4),
      p(5),
      p(6),
    ];
    const { choose, announcements } = setup(players);
    choose.continueFromField();
    const cap = choose.currentCaptain();
    assert.equal(choose.handleCaptainChat(cap, "1"), true);
    players.push(p(99));
    choose.onPlayerJoin();
    assert.match(lastSpecs(announcements).msg, /P99/);
    assert.equal(choose.currentCaptain().id, cap.id);
    assert.equal(choose.handleCaptainChat(cap, "1"), true);
    assert.ok(choose.list().blue.length >= 3);
  });

  it("depois da reposição o choose novo pede pick (não herda top)", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(12, TEAM.RED),
      p(2, TEAM.BLUE),
      p(22, TEAM.BLUE),
      p(23, TEAM.BLUE),
      p(24, TEAM.BLUE),
      p(4),
      p(5),
    ];
    let replaced = 0;
    const { choose, room } = setup(players, {
      scores: { red: 1, blue: 0, time: 30, timeLimit: 240 },
    });
    choose.startReplacement(TEAM.RED, () => {
      replaced += 1;
    });
    assert.equal(choose.handleCaptainChat(players[0], "top"), true);
    assert.equal(replaced, 1);
    assert.equal(choose.isActive(), false);

    room.getScores = () => null;
    for (const row of players) {
      row.team = [1, 11, 12, 13].includes(row.id)
        ? TEAM.RED
        : row.id === 2
          ? TEAM.BLUE
          : TEAM.SPEC;
    }
    players.push(p(13, TEAM.RED), p(30), p(31));
    choose.continueFromField();
    assert.equal(choose.isActive(), true);
    assert.equal(choose.list().blue.length, 1);
    const cap = choose.currentCaptain();
    assert.equal(choose.handleCaptainChat(cap, "1"), true);
    assert.equal(choose.isActive(), true);
    assert.equal(choose.list().blue.length, 2);
  });
});



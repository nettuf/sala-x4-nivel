const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createChooseController, TEAM } = require("../src/room/choose");

function p(id, team = TEAM.SPEC) {
  return { id, name: `P${id}`, auth: `a${id}`, team };
}

function setup(players, { excluded = new Set(), scores = null } = {}) {
  const announcements = [];
  const room = {
    getPlayerList: () => players,
    getScores: () => scores,
    setPlayerTeam(id, team) {
      players.find((player) => player.id === id).team = team;
    },
    sendAnnouncement: (msg, to) => announcements.push({ msg, to }),
    kickPlayer: () => {},
  };
  const choose = createChooseController(room, {
    onReadyToStart: () => {},
    isExcluded: (player) => excluded.has(player.id),
  });
  return { room, choose, announcements, excluded };
}

function lastSpecs(announcements) {
  return [...announcements].reverse().find((row) => /^Specs:/.test(row.msg));
}

describe("capitão e lista de pick", () => {
  it("capitão é o 1º do time menor; o 2º não picka", () => {
    const players = Array.from({ length: 8 }, (_, index) => p(index + 1));
    const { choose } = setup(players);
    choose.tryStartChoose();
    const redCap = choose.list().red[0];
    const blueCap = choose.list().blue[0];
    assert.equal(redCap.id, 1);
    assert.equal(blueCap.id, 2);
    assert.equal(choose.currentCaptain().id, 1);
    assert.equal(choose.handleCaptainChat(blueCap, "1"), false);
    assert.equal(choose.handleCaptainChat(redCap, "1"), true);
    assert.equal(choose.currentCaptain().id, 2);
    assert.equal(choose.handleCaptainChat(redCap, "1"), false);
  });

  it("quem entra no spec entra na lista na hora, com número novo", () => {
    const players = Array.from({ length: 8 }, (_, index) => p(index + 1));
    const { choose, announcements } = setup(players);
    choose.tryStartChoose();
    const cap = choose.currentCaptain();
    assert.match(lastSpecs(announcements).msg, /\[6\]/);
    assert.equal(lastSpecs(announcements).to, cap.id);

    players.push(p(99));
    choose.onPlayerJoin();
    assert.match(lastSpecs(announcements).msg, /P99\[7\]/);
    assert.equal(lastSpecs(announcements).to, cap.id);
    assert.equal(choose.handleCaptainChat(cap, "7"), true);
    assert.equal(players.find((row) => row.id === 99).team, TEAM.RED);
  });

  it("AFK vai para o fim da fila de pick", () => {
    const players = Array.from({ length: 8 }, (_, index) => p(index + 1));
    const excluded = new Set();
    const { choose, announcements } = setup(players, { excluded });
    choose.tryStartChoose();
    const specs = choose.list().spec;
    excluded.add(specs[0].id);
    choose.onPlayerJoin();
    const listed = choose.list().spec;
    assert.equal(listed[0].id, specs[1].id);
    assert.equal(listed[listed.length - 1].id, specs[0].id);
    assert.match(lastSpecs(announcements).msg, /P4\[1\]/);
    assert.match(lastSpecs(announcements).msg, new RegExp(`${specs[0].name}\\[\\d+\\] AFK`));
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
});

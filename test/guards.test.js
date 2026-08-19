const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  duplicateAuthPlayers,
  sameConnPlayers,
  evaluateJoin,
  applyJoinGuards,
} = require("../src/room/joinGuards");
const { createAfkTracker } = require("../src/room/afk");
const config = require("../src/config");

function mockRoom(players) {
  const kicks = [];
  const announcements = [];
  return {
    kicks,
    announcements,
    getPlayerList: () => players,
    sendAnnouncement: (msg, to) => announcements.push({ msg, to }),
    kickPlayer: (id, reason) => {
      kicks.push({ id, reason });
      const i = players.findIndex((p) => p.id === id);
      if (i >= 0) players.splice(i, 1);
    },
    setPlayerTeam: (id, team) => {
      const p = players.find((x) => x.id === id);
      if (p) p.team = team;
    },
  };
}

describe("proteções de entrada", () => {
  it("detecta auth duplicada e mesma conn", () => {
    const players = [
      { id: 1, name: "A", auth: "x", conn: "c1", team: 1 },
      { id: 2, name: "B", auth: "y", conn: "c1", team: 0 },
      { id: 3, name: "A2", auth: "x", conn: "c2", team: 0 },
    ];
    const novo = players[2];
    assert.equal(duplicateAuthPlayers(players, novo).length, 1);
    assert.equal(duplicateAuthPlayers(players, novo)[0].id, 1);
    assert.equal(sameConnPlayers(players, players[1]).length, 2);
  });

  it("ghost kick: auth repetida derruba a sessão antiga e herda o time", () => {
    const players = [
      { id: 1, name: "Netto", auth: "authA", conn: "c1", team: 1 },
      { id: 2, name: "Netto", auth: "authA", conn: "c9", team: 0 },
    ];
    const room = mockRoom(players);
    const result = applyJoinGuards(room, players[1]);
    assert.equal(result, "ghost-kick");
    assert.equal(room.kicks.length, 1);
    assert.equal(room.kicks[0].id, 1);
    assert.match(room.kicks[0].reason, /ghost/i);
    assert.equal(players.find((p) => p.id === 2).team, 1);
  });

  it("limite por conexão: 3º da mesma conn é recusado", () => {
    const players = [
      { id: 1, name: "A", auth: "a1", conn: "same", team: 0 },
      { id: 2, name: "B", auth: "a2", conn: "same", team: 0 },
      { id: 3, name: "C", auth: "a3", conn: "same", team: 0 },
    ];
    const room = mockRoom(players);
    const result = applyJoinGuards(room, players[2], { maxPerConn: 2 });
    assert.equal(result, "conn-limit");
    assert.equal(room.kicks[0].id, 3);
    assert.match(room.kicks[0].reason, /conex/i);
  });

  it("entrada normal passa", () => {
    const players = [
      { id: 1, name: "A", auth: "a1", conn: "c1", team: 0 },
      { id: 2, name: "B", auth: "a2", conn: "c2", team: 0 },
    ];
    const room = mockRoom(players);
    assert.equal(applyJoinGuards(room, players[1]), "ok");
    assert.equal(room.kicks.length, 0);
  });

  it("sem auth (host/anônimo) não vira ghost", () => {
    const players = [
      { id: 1, name: "A", auth: null, conn: "c1", team: 0 },
      { id: 2, name: "B", auth: null, conn: "c2", team: 0 },
    ];
    assert.equal(evaluateJoin(players, players[1]).action, "ok");
  });

  it("ghostKick desligado ignora auth repetida", () => {
    const players = [
      { id: 1, name: "A", auth: "same", conn: "c1", team: 0 },
      { id: 2, name: "A", auth: "same", conn: "c2", team: 0 },
    ];
    assert.equal(evaluateJoin(players, players[1], { ghostKick: false }).action, "ok");
  });
});

describe("AFK: ações e pausa", () => {
  function afkSetup(count) {
    const players = [];
    for (let i = 1; i <= count; i++) {
      players.push({ id: i, name: `P${i}`, team: i <= 2 ? i : 0, auth: `a${i}` });
    }
    const room = mockRoom(players);
    return { room, players };
  }

  it("sala pequena: AFK vai para spec, sem kick", () => {
    const { room, players } = afkSetup(4);
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 0;
    config.afkActionMs = 0;

    afk.touch(1);
    afk.touch(2);
    afk.tick();

    assert.equal(room.kicks.length, 0);
    assert.equal(players.find((p) => p.id === 1).team, 0);
    assert.equal(afk.isVoluntary(1), true);
    assert.ok(room.announcements.some((a) => /spect/i.test(a.msg)));

    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("sala cheia (>= limiar): AFK é kickado", () => {
    const { room, players } = afkSetup(config.afkFullThreshold);
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 0;
    config.afkActionMs = 0;

    afk.tick();

    assert.ok(room.kicks.length > 0);
    assert.match(room.kicks[0].reason, /AFK/i);
    // Specs não são avaliados como AFK.
    assert.ok(players.some((p) => p.id === 3 && p.team === 0));

    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("jogo pausado não pune ninguém", () => {
    const { room, players } = afkSetup(config.afkFullThreshold);
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 0;
    config.afkActionMs = 0;

    afk.setPaused(true);
    afk.tick();
    assert.equal(room.kicks.length, 0);

    // ao despausar, todos recebem atividade nova (sem punição imediata)
    afk.setPaused(false);
    config.afkActionMs = 60000;
    afk.tick();
    assert.equal(room.kicks.length, 0);
    assert.equal(players.length, config.afkFullThreshold);

    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("AFK voluntário é mantido no spec e não é kickado", () => {
    const { room, players } = afkSetup(config.afkFullThreshold);
    const afk = createAfkTracker(room);
    const p = players[0];
    afk.setVoluntary(p, true);
    p.team = 1; // alguém tenta puxar pro time

    afk.tick();

    assert.equal(p.team, 0);
    assert.ok(!room.kicks.some((k) => k.id === p.id));
    afk.stop();
  });

  it("10s parado no time → spec; menos que isso não pune", () => {
    const { room, players } = afkSetup(4);
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 5000;
    config.afkActionMs = 10000;

    afk.touch(1);
    const at = Date.now();

    afk.tick(at + 4000);
    assert.equal(players.find((p) => p.id === 1).team, 1);
    assert.ok(!room.announcements.some((a) => /10s/i.test(a.msg)));

    afk.tick(at + 6000);
    assert.ok(room.announcements.some((a) => /10s/i.test(a.msg)));
    assert.equal(players.find((p) => p.id === 1).team, 1);

    afk.tick(at + 9000);
    assert.equal(players.find((p) => p.id === 1).team, 1);

    afk.tick(at + 11000);
    assert.equal(players.find((p) => p.id === 1).team, 0);

    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });
});

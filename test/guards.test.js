const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  duplicateAuthPlayers,
  sameConnPlayers,
  evaluateJoin,
  applyJoinGuards,
} = require("../src/room/joinGuards");
const { createAfkTracker, shouldCountAutoAfk, hasMoved } = require("../src/room/afk");
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
    getScores: () => ({ red: 0, blue: 0, time: 10 }),
    pauseGame: () => {},
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
    assert.equal(afk.isAfk(1), true);
    assert.ok(room.announcements.some((a) => /parado/i.test(a.msg)));

    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("parado em campo vira AFK; quem anda o disco não", () => {
    const { room, players } = afkSetup(4);
    const discs = new Map([
      [1, { x: 0, y: 0 }],
      [2, { x: 0, y: 0 }],
    ]);
    room.getPlayerDiscProperties = (id) => discs.get(id) || null;
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 8000;
    config.afkActionMs = 12000;
    const at = Date.now();

    afk.touch(1, at);
    afk.touch(2, at);
    afk.noteGameTick(at);
    // P2 anda; P1 fica plantado. Tecla não entra nesta conta.
    for (let i = 1; i <= 5; i++) {
      discs.set(2, { x: i * 10, y: 0 });
      afk.noteGameTick(at + i * 1000);
    }

    afk.tick(at + 13000);

    assert.equal(players.find((p) => p.id === 1).team, 0, "parado devia ir pro spec");
    assert.equal(afk.isAfk(1), true);
    assert.equal(players.find((p) => p.id === 2).team, 2, "quem andou continua em campo");
    assert.equal(afk.isAfk(2), false);

    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("sem atividade o timer corre mesmo sem disco", () => {
    const { room, players } = afkSetup(4);
    room.getPlayerDiscProperties = () => null;
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 0;
    config.afkActionMs = 0;

    afk.touch(1);
    afk.tick();

    assert.equal(players.find((p) => p.id === 1).team, 0);
    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("disco andou → zera AFK; tecla no lugar não zera", () => {
    const { room, players } = afkSetup(4);
    const discs = new Map([
      [1, { x: 0, y: 0 }],
      [2, { x: 0, y: 0 }],
    ]);
    room.getPlayerDiscProperties = (id) => discs.get(id) || null;
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 8000;
    config.afkActionMs = 12000;
    const at = Date.now();
    afk.touch(1, at);
    afk.touch(2, at);
    afk.sampleMovement(at);

    discs.set(1, { x: 80, y: 40 });
    afk.sampleMovement(at + 4000);

    afk.tick(at + 13000);
    assert.equal(players.find((p) => p.id === 1).team, 1, "andar o disco zera o relógio");
    assert.equal(players.find((p) => p.id === 2).team, 0, "tecla no lugar não impede o AFK");
    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("gol não pausa o AFK: o parado continua acumulando", () => {
    const { room, players } = afkSetup(4);
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 8000;
    config.afkActionMs = 12000;
    const at = Date.now();

    afk.touch(1, at);
    afk.tick(at + 5000);
    assert.equal(players.find((p) => p.id === 1).team, 1, "ainda abaixo do limite");

    afk.tick(at + 13000);
    assert.equal(players.find((p) => p.id === 1).team, 0, "completa os 12s mesmo após um gol");
    assert.equal(afk.isAfk(1), true);

    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("onGameTick pune o parado mesmo se a flag de pausa ficou presa", () => {
    const { room, players } = afkSetup(4);
    const { TICK_HZ } = require("../src/room/afk");
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 8000;
    config.afkActionMs = 12000;
    afk.touch(1);
    afk.touch(2);
    afk.setPaused(true);

    const ticks = Math.ceil((12000 / 1000) * TICK_HZ) + 2;
    for (let i = 0; i < ticks; i++) afk.noteGameTick();

    assert.equal(players.find((p) => p.id === 1).team, 0, "física rodando ignora paused preso");
    assert.equal(afk.isAfk(1), true);
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
    afk.setAfk(p, true);
    p.team = 1; // alguém tenta puxar pro time

    afk.tick();

    assert.equal(p.team, 0);
    assert.ok(!room.kicks.some((k) => k.id === p.id));
    afk.stop();
  });

  it("!afk permanece até o jogador tirar, mesmo com atividade", () => {
    const { room, players } = afkSetup(4);
    const afk = createAfkTracker(room);
    const spec = players.find((p) => p.team === 0);
    afk.setAfk(spec, true);
    afk.touch(spec.id);
    afk.tick();
    assert.equal(afk.isAfk(spec.id), true);
    assert.equal(spec.team, 0);
    afk.setAfk(spec, false);
    assert.equal(afk.isAfk(spec.id), false);
    afk.stop();
  });

  it("faltando 5 vagas kicka só o AFK mais antigo; os outros ficam", () => {
    const { room, players } = afkSetup(26);
    const afk = createAfkTracker(room);
    const prevMax = config.maxPlayers;
    config.maxPlayers = 40;
    const first = players.find((p) => p.id === 20);
    const second = players.find((p) => p.id === 21);
    const third = players.find((p) => p.id === 22);
    afk.setAfk(first, true);
    afk.setAfk(second, true);
    afk.setAfk(third, true);
    assert.equal(room.kicks.length, 0);
    config.maxPlayers = prevMax;
    afk.ensureReserveSlots();

    assert.ok(room.kicks.some((k) => k.id === 20));
    assert.ok(room.kicks.some((k) => k.id === 21));
    assert.equal(room.kicks.some((k) => k.id === 22), false);
    assert.equal(afk.isAfk(22), true);
    assert.equal(players.length, 24);
    afk.stop();
  });

  it("sala folgada não kicka AFK voluntário", () => {
    const { room, players } = afkSetup(20);
    const afk = createAfkTracker(room);
    afk.setAfk(players[5], true);
    afk.ensureReserveSlots();
    assert.equal(room.kicks.length, 0);
    assert.equal(afk.isAfk(players[5].id), true);
    afk.stop();
  });

  it("8s parado avisa; 12s manda para o spec", () => {
    const { room, players } = afkSetup(4);
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 8000;
    config.afkActionMs = 12000;

    afk.touch(1);
    const at = Date.now();

    afk.tick(at + 7000);
    assert.equal(players.find((p) => p.id === 1).team, 1);
    assert.ok(!room.announcements.some((a) => /faltam 4s/i.test(a.msg)));

    afk.tick(at + 9000);
    assert.ok(room.announcements.some((a) => /faltam 4s/i.test(a.msg)));
    assert.equal(players.find((p) => p.id === 1).team, 1);

    afk.tick(at + 11000);
    assert.equal(players.find((p) => p.id === 1).team, 1);

    afk.tick(at + 13000);
    assert.equal(players.find((p) => p.id === 1).team, 0);

    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("treino/warmup: parado não gera AFK automático", () => {
    const { room, players } = afkSetup(4);
    const afk = createAfkTracker(room, { shouldAutoAfk: () => false });
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 0;
    config.afkActionMs = 0;

    afk.touch(1);
    afk.tick();

    assert.equal(players.find((p) => p.id === 1).team, 1);
    assert.equal(afk.isAfk(1), false);
    assert.equal(room.kicks.length, 0);

    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("treino solo não conta AFK; 1v1, 2v2 e 4v4 contam", () => {
    assert.equal(shouldCountAutoAfk([{ id: 1, team: 1 }]), false);
    assert.equal(
      shouldCountAutoAfk([
        { id: 1, team: 1 },
        { id: 2, team: 2 },
      ]),
      true
    );
    assert.equal(
      shouldCountAutoAfk([
        { id: 1, team: 1 },
        { id: 2, team: 1 },
        { id: 3, team: 2 },
        { id: 4, team: 2 },
      ]),
      true
    );
    assert.equal(
      shouldCountAutoAfk(
        Array.from({ length: 8 }, (_, i) => ({ id: i + 1, team: i < 4 ? 1 : 2 }))
      ),
      true
    );
  });

  it("quem nunca teclou ainda cai no AFK pelo onGameTick", () => {
    const { room, players } = afkSetup(4);
    const { TICK_HZ } = require("../src/room/afk");
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 8000;
    config.afkActionMs = 12000;
    afk.resetClocks();

    const ticks = Math.ceil((12000 / 1000) * TICK_HZ) + 2;
    for (let i = 0; i < ticks; i++) afk.noteGameTick();

    assert.equal(players.find((p) => p.id === 1).team, 0, "parado sem tecla vai pro spec");
    assert.equal(afk.isAfk(1), true);
    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("onGameTick lento (longe de 60Hz) ainda pune pelos 12s no 2v2", () => {
    const players = [
      { id: 1, name: "A", team: 1, auth: "a1" },
      { id: 2, name: "B", team: 1, auth: "a2" },
      { id: 3, name: "C", team: 2, auth: "a3" },
      { id: 4, name: "D", team: 2, auth: "a4" },
    ];
    const room = mockRoom(players);
    const afk = createAfkTracker(room, {
      shouldAutoAfk: () => shouldCountAutoAfk(room.getPlayerList()),
    });
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 8000;
    config.afkActionMs = 12000;
    const t0 = 1_700_000_000_000;
    afk.resetClocks(t0);

    // ~1 Hz: 12 callbacks em 12s. Só ticks dariam ~200ms e ninguém caía.
    for (let i = 1; i <= 12; i++) afk.noteGameTick(t0 + i * 1000);

    assert.equal(players.find((p) => p.id === 1).team, 0, "relógio de parede manda pro spec");
    assert.equal(afk.isAfk(1), true);
    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("1v1 parado vai para spect", () => {
    const players = [
      { id: 1, name: "A", team: 1, auth: "a1" },
      { id: 2, name: "B", team: 2, auth: "a2" },
    ];
    const room = mockRoom(players);
    room.getScores = () => ({ red: 0, blue: 0, time: 10 });
    room.pauseGame = () => {};
    const afk = createAfkTracker(room, {
      shouldAutoAfk: () => shouldCountAutoAfk(room.getPlayerList()),
    });
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 0;
    config.afkActionMs = 0;

    afk.touch(1);
    afk.touch(2);
    afk.tick();

    assert.equal(players.find((p) => p.id === 1).team, 0);
    assert.equal(afk.isAfk(1), true);
    assert.equal(room.kicks.length, 0);

    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("2v2 parado vai para spect", () => {
    const players = [
      { id: 1, name: "A", team: 1, auth: "a1" },
      { id: 2, name: "B", team: 1, auth: "a2" },
      { id: 3, name: "C", team: 2, auth: "a3" },
      { id: 4, name: "D", team: 2, auth: "a4" },
    ];
    const room = mockRoom(players);
    const afk = createAfkTracker(room, {
      shouldAutoAfk: () => shouldCountAutoAfk(room.getPlayerList()),
    });
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 0;
    config.afkActionMs = 0;
    afk.touch(1);
    afk.tick();
    assert.equal(players.find((p) => p.id === 1).team, 0);
    assert.equal(afk.isAfk(1), true);
    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("4v4 parado vai para spect", () => {
    const players = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      name: `P${i + 1}`,
      team: i < 4 ? 1 : 2,
      auth: `a${i + 1}`,
    }));
    const room = mockRoom(players);
    const afk = createAfkTracker(room, {
      shouldAutoAfk: () => shouldCountAutoAfk(room.getPlayerList()),
    });
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 0;
    config.afkActionMs = 0;
    afk.touch(1);
    afk.tick();
    assert.equal(players.find((p) => p.id === 1).team, 0);
    assert.equal(afk.isAfk(1), true);
    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("fora de partida (choose/lobby) parado não vai spec", () => {
    const { room, players } = afkSetup(4);
    room.getScores = () => null;
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 0;
    config.afkActionMs = 0;
    afk.touch(1);
    afk.tick();
    assert.equal(players.find((p) => p.id === 1).team, 1);
    assert.equal(afk.isAfk(1), false);
    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("onGameTick lento ainda avisa aos 8s e manda spec aos 12s com disco parado", () => {
    const { room, players } = afkSetup(4);
    const discs = new Map([
      [1, { x: 0, y: 0 }],
      [2, { x: 10, y: 0 }],
    ]);
    room.getPlayerDiscProperties = (id) => discs.get(id) || { x: 0, y: 0 };
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 8000;
    config.afkActionMs = 12000;
    const t0 = 1_700_000_000_000;
    afk.resetClocks(t0);

    afk.noteGameTick(t0 + 1000);
    assert.equal(players.find((p) => p.id === 1).team, 1);
    assert.ok(!room.announcements.some((a) => /faltam 4s/i.test(a.msg)));

    afk.noteGameTick(t0 + 9000);
    assert.ok(room.announcements.some((a) => /faltam 4s/i.test(a.msg)));
    assert.equal(players.find((p) => p.id === 1).team, 1);

    afk.noteGameTick(t0 + 13000);
    assert.equal(players.find((p) => p.id === 1).team, 0);
    assert.equal(afk.isAfk(1), true);

    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("jitter do disco (0.3 por tick) NÃO zera o AFK — o parado cai aos 12s", () => {
    const { room, players } = afkSetup(4);
    const discs = new Map([
      [1, { x: 0, y: 0, xspeed: 0, yspeed: 0 }],
      [2, { x: 10, y: 0, xspeed: 0, yspeed: 0 }],
    ]);
    room.getPlayerDiscProperties = (id) => discs.get(id) || { x: 0, y: 0, xspeed: 0, yspeed: 0 };
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 8000;
    config.afkActionMs = 12000;
    const t0 = 1_700_000_000_000;
    afk.resetClocks(t0);
    afk.noteGameTick(t0);

    // Deriva pequena a cada tick: o código antigo somava e zerava o relógio.
    for (let i = 1; i <= 13; i++) {
      discs.set(1, { x: i * 0.3, y: 0, xspeed: 0.02, yspeed: 0 });
      afk.noteGameTick(t0 + i * 1000);
    }

    assert.equal(players.find((p) => p.id === 1).team, 0, "jitter não é movimento");
    assert.equal(afk.isAfk(1), true);
    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("setInterval pune mesmo se o onGameTick acabou de rodar", () => {
    const { room, players } = afkSetup(4);
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 8000;
    config.afkActionMs = 12000;
    const t0 = 1_700_000_000_000;
    afk.resetClocks(t0);
    afk.noteGameTick(t0 + 11500);
    afk.tick(t0 + 12000);

    assert.equal(players.find((p) => p.id === 1).team, 0, "fallback de 1s não espera o tick sumir");
    assert.equal(afk.isAfk(1), true);
    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("velocidade suja do host não zera; só salto de posição zera", () => {
    const { room, players } = afkSetup(4);
    const discs = new Map([
      [1, { x: 0, y: 0, xspeed: 0.8, yspeed: 0.8 }],
      [2, { x: 0, y: 0, xspeed: 0, yspeed: 0 }],
    ]);
    room.getPlayerDiscProperties = (id) => discs.get(id);
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 8000;
    config.afkActionMs = 12000;
    const t0 = 1_700_000_000_000;
    afk.resetClocks(t0);
    afk.noteGameTick(t0);
    for (let i = 1; i <= 13; i++) {
      discs.set(1, { x: 0.2, y: 0, xspeed: 0.8, yspeed: 0.8 });
      discs.set(2, { x: i * 8, y: 0, xspeed: 0, yspeed: 0 });
      afk.noteGameTick(t0 + i * 1000);
    }
    assert.equal(players.find((p) => p.id === 1).team, 0, "xspeed sujo não impede o AFK");
    assert.equal(players.find((p) => p.id === 2).team, 2, "quem andou de verdade segue em campo");
    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("deriva de 1s no setInterval não zera o AFK", () => {
    const { room, players } = afkSetup(4);
    const discs = new Map([
      [1, { x: 0, y: 0 }],
      [2, { x: 0, y: 0 }],
    ]);
    room.getPlayerDiscProperties = (id) => discs.get(id);
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 8000;
    config.afkActionMs = 12000;
    const t0 = 1_700_000_000_000;
    afk.resetClocks(t0);
    afk.noteGameTick(t0);
    for (let i = 1; i <= 13; i++) {
      discs.set(1, { x: i * 3, y: 0 });
      afk.tick(t0 + i * 1000);
    }
    assert.equal(players.find((p) => p.id === 1).team, 0, "1s de deriva não conta como andar");
    assert.equal(afk.isAfk(1), true);
    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("ocioso só conta se o boneco andou de verdade", () => {
    assert.equal(hasMoved(null, { x: 0, y: 0 }), false);
    assert.equal(hasMoved({ x: 0, y: 0 }, { x: 0.1, y: 0 }), false);
    assert.equal(hasMoved({ x: 0, y: 0 }, { x: 3, y: 0 }), true);
    assert.equal(hasMoved({ x: 0, y: 0 }, { x: 10, y: 0 }), true);
  });
});

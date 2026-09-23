const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  duplicateAuthPlayers,
  sameIpPlayers,
  evaluateJoin,
  applyJoinGuards,
} = require("../src/room/joinGuards");
const { createAfkTracker, shouldCountAutoAfk } = require("../src/room/afk");
const config = require("../src/config");
const conn = (ip) => Buffer.from(ip, "utf8").toString("hex");

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
  it("detecta auth duplicada e jogadores no mesmo IP", () => {
    const players = [
      { id: 1, name: "A", auth: "x", conn: conn("10.0.0.1"), team: 1 },
      { id: 2, name: "B", auth: "y", conn: conn("10.0.0.1"), team: 0 },
      { id: 3, name: "A2", auth: "x", conn: conn("10.0.0.2"), team: 0 },
    ];
    const novo = players[2];
    assert.equal(duplicateAuthPlayers(players, novo).length, 1);
    assert.equal(duplicateAuthPlayers(players, novo)[0].id, 1);
    assert.equal(sameIpPlayers(players, players[1]).length, 2);
  });

  it("auth repetida: kicka a 2ª entrada e mantém a antiga", () => {
    const players = [
      { id: 1, name: "Netto", auth: "authA", conn: "c1", team: 1 },
      { id: 2, name: "Netto", auth: "authA", conn: "c1", team: 0 },
    ];
    const room = mockRoom(players);
    const result = applyJoinGuards(room, players[1]);
    assert.equal(result, "duplicate");
    assert.equal(room.kicks.length, 1);
    assert.equal(room.kicks[0].id, 2);
    assert.match(room.kicks[0].reason, /já está na sala/i);
    assert.equal(players.find((p) => p.id === 1).team, 1);
    assert.equal(players.length, 1);
  });

  it("auth repetida em outra conn: também kicka o novo (F5 com sessão antiga)", () => {
    const players = [
      { id: 1, name: "Netto", auth: "authA", conn: "c1", team: 1 },
      { id: 2, name: "Netto", auth: "authA", conn: "c9", team: 0 },
    ];
    const room = mockRoom(players);
    const result = applyJoinGuards(room, players[1]);
    assert.equal(result, "duplicate");
    assert.equal(room.kicks.length, 1);
    assert.equal(room.kicks[0].id, 2);
    assert.equal(players.find((p) => p.id === 1).team, 1);
    assert.equal(players.length, 1);
  });

  it("mesmo IP com auths diferentes: permite o 2º", () => {
    const players = [
      { id: 1, name: "A", auth: "a1", conn: conn("10.0.0.1"), team: 0 },
      { id: 2, name: "B", auth: "a2", conn: conn("10.0.0.1"), team: 0 },
    ];
    const room = mockRoom(players);
    const result = applyJoinGuards(room, players[1]);
    assert.equal(result, "ok");
    assert.equal(room.kicks.length, 0);
  });

  it("mesmo IP: kicka o 3º jogador", () => {
    const players = [
      { id: 1, name: "A", auth: "a1", conn: conn("10.0.0.1"), team: 0 },
      { id: 2, name: "B", auth: "a2", conn: conn("10.0.0.1"), team: 0 },
      { id: 3, name: "C", auth: "a3", conn: conn("10.0.0.1"), team: 0 },
    ];
    const room = mockRoom(players);
    let rejected = null;
    assert.equal(applyJoinGuards(room, players[2], undefined, (result) => {
      rejected = result;
    }), "duplicate");
    assert.equal(room.kicks[0].id, 3);
    assert.match(room.kicks[0].reason, /2 jogadores por IP/i);
    assert.match(rejected.reason, /2 jogadores por IP/i);
  });

  it("usa identidade em cache quando a lista omite auth e conn", () => {
    const players = [
      { id: 1, name: "Netto", team: 1 },
      { id: 2, name: "Netto", auth: "authA", conn: "c2", team: 0 },
    ];
    const identities = new Map([[1, { auth: "authA", conn: "c1" }]]);
    const identify = (player) => ({ ...player, ...(identities.get(player.id) || {}) });
    const room = mockRoom(players);

    assert.equal(applyJoinGuards(room, players[1], identify), "duplicate");
    assert.equal(room.kicks[0].id, 2);
    assert.equal(players[0].id, 1);
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

  it("sem auth e conns diferentes passa", () => {
    const players = [
      { id: 1, name: "A", auth: null, conn: "c1", team: 0 },
      { id: 2, name: "B", auth: null, conn: "c2", team: 0 },
    ];
    assert.equal(evaluateJoin(players, players[1]).action, "ok");
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

  it("parado em campo vira AFK; quem aperta tecla não", () => {
    const { room, players } = afkSetup(4);
    const p2 = players.find((p) => p.id === 2);
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 8000;
    config.afkActionMs = 12000;
    const at = Date.now();

    afk.touch(1, at);
    afk.touch(2, at);
    afk.noteGameTick(at);
    for (let i = 1; i <= 5; i++) {
      afk.noteActivity(p2, at + i * 2000);
      afk.noteGameTick(at + i * 2000);
    }
    afk.tick(at + 13000);
    assert.equal(players.find((p) => p.id === 1).team, 0, "parado cai");
    assert.equal(afk.isAfk(1), true);
    assert.equal(players.find((p) => p.id === 2).team, 2, "tecla salva");
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

  it("tecla zera AFK; disco andando sem tecla não zera", () => {
    const { room, players } = afkSetup(4);
    const p1 = players.find((p) => p.id === 1);
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 8000;
    config.afkActionMs = 12000;
    const at = Date.now();
    afk.touch(1, at);
    afk.touch(2, at);
    afk.noteActivity(p1, at + 4000);

    afk.tick(at + 13000);
    assert.equal(players.find((p) => p.id === 1).team, 1, "tecla zera o relógio");
    assert.equal(players.find((p) => p.id === 2).team, 0, "parado sem tecla cai");
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

  it("noteGameTick respeita pausa (reposição/choose) e não manda todos pro spec", () => {
    const players = [
      { id: 1, name: "P1", team: 1, auth: "a1" },
      { id: 2, name: "P2", team: 1, auth: "a2" },
      { id: 3, name: "P3", team: 2, auth: "a3" },
      { id: 4, name: "P4", team: 2, auth: "a4" },
    ];
    const room = mockRoom(players);
    const { TICK_HZ } = require("../src/room/afk");
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 8000;
    config.afkActionMs = 12000;
    for (const p of players) afk.touch(p.id);
    afk.setPaused(true);

    const ticks = Math.ceil((12000 / 1000) * TICK_HZ) + 2;
    for (let i = 0; i < ticks; i++) afk.noteGameTick();

    for (const p of players) {
      assert.notEqual(p.team, 0, `${p.name} não deveria ir pro spec durante pausa`);
      assert.equal(afk.isAfk(p.id), false);
    }
    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("após despausar não pune em massa quem tinha idle alto", () => {
    const players = [
      { id: 1, name: "P1", team: 1, auth: "a1" },
      { id: 2, name: "P2", team: 1, auth: "a2" },
      { id: 3, name: "P3", team: 2, auth: "a3" },
      { id: 4, name: "P4", team: 2, auth: "a4" },
    ];
    const room = mockRoom(players);
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 8000;
    config.afkActionMs = 12000;
    const at = Date.now();
    for (const p of players) afk.touch(p.id, at - 11000);
    afk.setPaused(true, at);
    afk.setPaused(false, at + 30000);
    afk.tick(at + 30100);
    for (const p of players) {
      assert.equal(p.team !== 0, true, `${p.name} não cai logo após despausar`);
      assert.equal(afk.isAfk(p.id), false);
    }
    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("no mesmo frame só 1 auto-AFK: evita cascata em massa", () => {
    const players = [
      { id: 1, name: "P1", team: 1, auth: "a1" },
      { id: 2, name: "P2", team: 1, auth: "a2" },
      { id: 3, name: "P3", team: 2, auth: "a3" },
      { id: 4, name: "P4", team: 2, auth: "a4" },
    ];
    const room = mockRoom(players);
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 0;
    config.afkActionMs = 0;
    for (const p of players) afk.touch(p.id);
    afk.tick();
    const afkCount = players.filter((p) => afk.isAfk(p.id)).length;
    assert.equal(afkCount, 1, "só um cai por chamada");
    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("sala com 12+ ainda manda o parado pro spec, não kicka", () => {
    const { room, players } = afkSetup(12);
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 0;
    config.afkActionMs = 0;

    afk.tick();

    assert.equal(room.kicks.length, 0);
    assert.equal(players.find((p) => p.id === 1).team, 0);
    assert.equal(afk.isAfk(1), true);
    assert.ok(players.some((p) => p.id === 3 && p.team === 0));

    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("jogo pausado não pune ninguém", () => {
    const { room, players } = afkSetup(12);
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
    assert.equal(players.length, 12);

    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("AFK voluntário é mantido no spec e não é kickado", () => {
    const { room, players } = afkSetup(12);
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

  it("27 na sala não kicka AFK; no 28 kicka o mais longe do pick só depois de 5 min", () => {
    const { room, players } = afkSetup(26);
    const afk = createAfkTracker(room);
    const t0 = 1_000_000;
    const later = t0 + config.afkSpecGraceMs + 1000;
    const first = players.find((p) => p.id === 20);
    const second = players.find((p) => p.id === 21);
    const third = players.find((p) => p.id === 22);
    afk.setAfk(first, true, t0);
    afk.setAfk(second, true, t0);
    afk.setAfk(third, true, t0);
    afk.ensureReserveSlots(later);
    assert.equal(room.kicks.length, 0, "26 ainda fica AFK infinito");

    players.push({ id: 27, name: "P27", team: 0, auth: "a27" });
    afk.ensureReserveSlots(later);
    assert.equal(room.kicks.length, 0, "27 ainda abaixo de 28");

    players.push({ id: 28, name: "P28", team: 0, auth: "a28" });
    afk.ensureReserveSlots(t0 + 60_000);
    assert.equal(room.kicks.length, 0, "no 28 ainda tem 5 min de graça");

    afk.ensureReserveSlots(later);
    assert.deepEqual(room.kicks.map((k) => k.id), [22], "no 28 depois de 5 min sai o mais longe do pick");
    assert.equal(players.length, 27);
    assert.equal(afk.isAfk(20), true);
    assert.equal(afk.isAfk(21), true);

    players.push({ id: 29, name: "P29", team: 0, auth: "a29" });
    afk.ensureReserveSlots(later);
    assert.deepEqual(room.kicks.map((k) => k.id), [22, 21], "próximo join kicka o próximo mais longe");
    assert.equal(players.length, 27);

    afk.stop();
  });

  it("kick async do Haxball não limpa todos os AFKs: só o excesso", () => {
    const { room, players } = afkSetup(25);
    const leftover = [];
    room.kickPlayer = (id, reason) => {
      leftover.push({ id, reason });
    };
    const afk = createAfkTracker(room);
    const t0 = 2_000_000;
    const later = t0 + config.afkSpecGraceMs + 1000;
    for (const id of [18, 19, 20, 21, 22]) {
      afk.setAfk(players.find((p) => p.id === id), true, t0);
    }
    players.push({ id: 26, name: "P26", team: 0, auth: "a26" });
    players.push({ id: 27, name: "P27", team: 0, auth: "a27" });
    players.push({ id: 28, name: "P28", team: 0, auth: "a28" });
    afk.ensureReserveSlots(later);
    assert.deepEqual(leftover.map((k) => k.id), [22], "28 na sala: 1 kick");
    afk.ensureReserveSlots(later);
    assert.deepEqual(leftover.map((k) => k.id), [22], "ainda na lista: não kicka de novo");

    players.push({ id: 29, name: "P29", team: 0, auth: "a29" });
    players.push({ id: 30, name: "P30", team: 0, auth: "a30" });
    afk.ensureReserveSlots(later);
    assert.deepEqual(leftover.map((k) => k.id), [22, 21, 20], "30 na sala: mais 2 (excesso 3 no total)");
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

  it("AFK há 20 min toma kick mesmo com a sala folgada", () => {
    const { room, players } = afkSetup(4);
    const afk = createAfkTracker(room);
    const t0 = 5_000_000;
    const p = players[0];
    afk.setAfk(p, true, t0);
    afk.ensureReserveSlots(t0 + 19 * 60 * 1000);
    assert.equal(room.kicks.length, 0);
    afk.ensureReserveSlots(t0 + config.afkMaxMs);
    assert.deepEqual(room.kicks.map((k) => k.id), [p.id]);
    assert.equal(afk.isAfk(p.id), false);
    afk.stop();
  });

  it("voltar do AFK recomeça os 20 min", () => {
    const { room, players } = afkSetup(4);
    const afk = createAfkTracker(room);
    const t0 = 6_000_000;
    const p = players[1];
    afk.setAfk(p, true, t0);
    afk.setAfk(p, false, t0 + 10 * 60 * 1000);
    afk.setAfk(p, true, t0 + 10 * 60 * 1000);
    afk.ensureReserveSlots(t0 + config.afkMaxMs);
    assert.equal(room.kicks.length, 0);
    afk.ensureReserveSlots(t0 + 10 * 60 * 1000 + config.afkMaxMs);
    assert.deepEqual(room.kicks.map((k) => k.id), [p.id]);
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

  it("só tecla zera: parado cai mesmo com xspeed sujo no host", () => {
    const { room, players } = afkSetup(4);
    const p2 = players.find((p) => p.id === 2);
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 8000;
    config.afkActionMs = 12000;
    const t0 = 1_700_000_000_000;
    afk.resetClocks(t0);
    afk.noteGameTick(t0);
    for (let i = 1; i <= 13; i++) {
      if (i % 2 === 0) afk.noteActivity(p2, t0 + i * 1000);
      afk.noteGameTick(t0 + i * 1000);
    }
    assert.equal(players.find((p) => p.id === 1).team, 0, "sem tecla cai");
    assert.equal(players.find((p) => p.id === 2).team, 2, "tecla periódica salva");
    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("deslocamento no fallback de 1s sem tecla não zera o AFK", () => {
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
    assert.equal(players.find((p) => p.id === 1).team, 0, "deslocar sem tecla não salva");
    assert.equal(afk.isAfk(1), true);
    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("empurrão (salto grande) não zera AFK nem conta movimento", () => {
    const { room, players } = afkSetup(4);
    const moved = new Set();
    const discs = new Map([
      [1, { x: 0, y: 0, xspeed: 0, yspeed: 0 }],
      [2, { x: 10, y: 0, xspeed: 0.8, yspeed: 0 }],
    ]);
    room.getPlayerDiscProperties = (id) => discs.get(id);
    const afk = createAfkTracker(room, { onFieldMove: (id) => moved.add(id) });
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 8000;
    config.afkActionMs = 12000;
    const t0 = 1_700_000_000_000;
    afk.resetClocks(t0);
    afk.noteGameTick(t0);
    for (let i = 1; i <= 13; i++) {
      discs.set(1, { x: 5, y: 0, xspeed: 0.9, yspeed: 0 });
      afk.noteGameTick(t0 + i * 1000);
    }
    assert.equal(players.find((p) => p.id === 1).team, 0, "empurrado continua parado para o AFK");
    assert.equal(moved.has(1), false, "empurrão não entra em movedThisMatch");
    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });

  it("corrida sem tecla não zera o AFK; parado cai", () => {
    const { room, players } = afkSetup(4);
    const { TICK_HZ } = require("../src/room/afk");
    let x = 0;
    room.getPlayerDiscProperties = (id) =>
      id === 1
        ? { x, y: 0, xspeed: 0.8, yspeed: 0 }
        : { x: 0, y: 0, xspeed: 0, yspeed: 0 };
    const afk = createAfkTracker(room);
    const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
    config.afkWarnMs = 8000;
    config.afkActionMs = 12000;
    const t0 = Date.now();
    afk.touch(1, t0);
    afk.touch(2, t0);
    const ticks = Math.ceil(13 * TICK_HZ);
    for (let i = 0; i < ticks; i++) {
      x += 0.8;
      afk.noteGameTick(t0 + Math.floor((i * 1000) / TICK_HZ));
    }
    assert.equal(players.find((p) => p.id === 1).team, 0, "só deslizar não salva");
    assert.equal(players.find((p) => p.id === 2).team, 0, "parado cai");
    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
    afk.stop();
  });
});

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const config = require("../src/config");
const { createAfkTracker, TICK_HZ } = require("../src/room/afk");
const { mockAfkRoom, runPhysicsTicks, withAfkTimes } = require("./helpers/afkMotionSim");

describe("AFK inatividade (11s/15s, estilo haxballx7)", () => {
  it("config padrão: aviso 11s, spec 15s", () => {
    assert.equal(config.afkWarnMs, 11000);
    assert.equal(config.afkActionMs, 15000);
    assert.equal(config.afkActionMs - config.afkWarnMs, 4000);
  });

  it("11s parado avisa; 15s manda pro spec", () => {
    withAfkTimes(() => {
      const { room, players, announcements } = mockAfkRoom(4);
      const afk = createAfkTracker(room);
      const t0 = 1_700_000_000_000;
      afk.resetClocks(t0);
      afk.noteGameTick(t0);

      afk.tick(t0 + 11000);
      assert.ok(announcements.some((a) => /mexa-se/i.test(a.msg) && a.to === 1));
      assert.equal(players.find((p) => p.id === 1).team, 1, "aviso não tira do time");

      afk.tick(t0 + 15000);
      assert.equal(players.find((p) => p.id === 1).team, 0, "15s → spec");
      assert.equal(afk.isAfk(1), true);
      afk.stop();
    });
  });

  it("tecla (onPlayerActivity) zera o relógio", () => {
    withAfkTimes(() => {
      const { room, players, announcements } = mockAfkRoom(4);
      const p1 = players.find((p) => p.id === 1);
      const afk = createAfkTracker(room);
      const t0 = 1_700_000_000_000;
      afk.resetClocks(t0);
      for (let s = 0; s <= 11 * TICK_HZ; s++) {
        afk.noteGameTick(t0 + Math.floor((s * 1000) / TICK_HZ));
      }
      afk.tick(t0 + config.afkWarnMs + 500);
      assert.ok(announcements.some((a) => /mexa-se/i.test(a.msg)), "aviso após 11s parado");

      const activeAt = t0 + config.afkWarnMs + 600;
      afk.noteActivity(p1, activeAt);
      for (let i = 0; i < 3 * TICK_HZ; i++) {
        afk.noteGameTick(activeAt + Math.floor((i * 1000) / TICK_HZ));
      }
      afk.tick(activeAt + 3500);
      assert.equal(players.find((p) => p.id === 1).team, 1, "tecla a tempo evita AFK");
      afk.stop();
    });
  });

  it("movimento sem tecla não zera AFK", () => {
    withAfkTimes(() => {
      const { room, players } = mockAfkRoom(4);
      let x = 0;
      room.getPlayerDiscProperties = (id) =>
        id === 1
          ? { x, y: 0, xspeed: 0.8, yspeed: 0 }
          : { x: 0, y: 0, xspeed: 0, yspeed: 0 };
      const afk = createAfkTracker(room);
      const t0 = 1_700_000_000_000;
      afk.resetClocks(t0);
      const ticks = Math.ceil(17 * TICK_HZ);
      runPhysicsTicks(afk, null, {
        t0,
        ticks,
        onTick: () => {
          x += 0.8;
        },
      });
      afk.tick(t0 + 17000);
      assert.equal(players.find((p) => p.id === 1).team, 0, "só deslizar não salva");
      assert.equal(afk.isAfk(1), true);
      afk.stop();
    });
  });

  it("empurrão não zera AFK nem movedThisMatch", () => {
    withAfkTimes(() => {
      const { room, players } = mockAfkRoom(4);
      const moved = new Set();
      const discs = new Map([[1, { x: 0, y: 0, xspeed: 0, yspeed: 0 }]]);
      room.getPlayerDiscProperties = (id) => discs.get(id);
      const afk = createAfkTracker(room, { onFieldMove: (id) => moved.add(id) });
      const t0 = 1_700_000_000_000;
      afk.resetClocks(t0);
      afk.noteGameTick(t0);
      for (let i = 1; i <= 17; i++) {
        discs.set(1, { x: 5 * i, y: 0, xspeed: 0.9, yspeed: 0 });
        afk.noteGameTick(t0 + i * 1000);
      }
      afk.tick(t0 + 17000);
      assert.equal(players.find((p) => p.id === 1).team, 0, "empurrão não conta");
      assert.equal(moved.has(1), false);
      afk.stop();
    });
  });

  it("pausa congela o relógio de ociosidade", () => {
    withAfkTimes(() => {
      const { room, players } = mockAfkRoom(4);
      const afk = createAfkTracker(room);
      const t0 = 1_700_000_000_000;
      afk.resetClocks(t0);
      afk.setPaused(true, t0 + 5000);
      afk.tick(t0 + 20000);
      assert.equal(players.find((p) => p.id === 1).team, 1, "pausado não cai AFK");
      afk.stop();
    });
  });

  it("fallback de 1s pune sem onGameTick", () => {
    withAfkTimes(() => {
      const { room, players } = mockAfkRoom(4);
      const afk = createAfkTracker(room);
      const t0 = 1_700_000_000_000;
      afk.resetClocks(t0);
      afk.touch(1, t0);
      afk.touch(2, t0);
      afk.tick(t0 + 16000);
      assert.equal(players.find((p) => p.id === 1).team, 0);
      afk.stop();
    });
  });
});

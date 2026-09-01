const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const config = require("../src/config");
const { createAfkTracker, hasMoved, isWalkingSpeed, TICK_HZ } = require("../src/room/afk");
const { mockAfkRoom, runPhysicsTicks, withAfkTimes } = require("./helpers/afkMotionSim");

describe("AFK movimento vs ociosidade (12s/16s)", () => {
  it("config padrão: aviso 12s, spec 16s", () => {
    assert.equal(config.afkWarnMs, 12000);
    assert.equal(config.afkActionMs, 16000);
    assert.equal(config.afkActionMs - config.afkWarnMs, 4000);
  });

  it("12s parado avisa; 16s manda pro spec", () => {
    withAfkTimes(() => {
      const { room, players, announcements } = mockAfkRoom(4);
      const discs = new Map([
        [1, { x: 0, y: 0, xspeed: 0, yspeed: 0 }],
        [2, { x: 0, y: 0, xspeed: 0, yspeed: 0 }],
      ]);
      room.getPlayerDiscProperties = (id) => discs.get(id);
      const afk = createAfkTracker(room);
      const t0 = 1_700_000_000_000;
      afk.resetClocks(t0);
      afk.noteGameTick(t0);

      afk.tick(t0 + 12000);
      assert.ok(announcements.some((a) => /mexa-se/i.test(a.msg) && a.to === 1));
      assert.equal(players.find((p) => p.id === 1).team, 1, "aviso não tira do time");

      afk.tick(t0 + 16000);
      assert.equal(players.find((p) => p.id === 1).team, 0, "16s → spec");
      assert.equal(afk.isAfk(1), true);
      afk.stop();
    });
  });
});

describe("linha reta = movimento (zera AFK)", () => {
  it("horizontal 60Hz por 17s mantém em campo", () => {
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
      assert.equal(players.find((p) => p.id === 1).team, 1, "linha reta horizontal");
      assert.equal(players.find((p) => p.id === 2).team, 0, "parado cai");
      afk.stop();
    });
  });

  it("vertical 60Hz por 17s mantém em campo", () => {
    withAfkTimes(() => {
      const { room, players } = mockAfkRoom(4);
      let y = 0;
      room.getPlayerDiscProperties = (id) =>
        id === 1
          ? { x: 0, y, xspeed: 0, yspeed: 0.75 }
          : { x: 0, y: 0, xspeed: 0, yspeed: 0 };
      const afk = createAfkTracker(room);
      const t0 = 1_700_000_000_000;
      afk.resetClocks(t0);
      const ticks = Math.ceil(17 * TICK_HZ);
      runPhysicsTicks(afk, null, {
        t0,
        ticks,
        onTick: () => {
          y += 0.75;
        },
      });
      assert.equal(players.find((p) => p.id === 1).team, 1, "linha reta vertical");
      afk.stop();
    });
  });

  it("diagonal 60Hz por 17s mantém em campo", () => {
    withAfkTimes(() => {
      const { room, players } = mockAfkRoom(4);
      let x = 0;
      let y = 0;
      room.getPlayerDiscProperties = (id) =>
        id === 1
          ? { x, y, xspeed: 0.55, yspeed: 0.55 }
          : { x: 0, y: 0, xspeed: 0, yspeed: 0 };
      const afk = createAfkTracker(room);
      const t0 = 1_700_000_000_000;
      afk.resetClocks(t0);
      const ticks = Math.ceil(17 * TICK_HZ);
      runPhysicsTicks(afk, null, {
        t0,
        ticks,
        onTick: () => {
          x += 0.55;
          y += 0.55;
        },
      });
      assert.equal(players.find((p) => p.id === 1).team, 1, "linha reta diagonal");
      afk.stop();
    });
  });

  it("host lento (~4Hz) com corrida contínua não cai AFK", () => {
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
      for (let i = 0; i <= 17; i++) {
        x += 0.8 * 15;
        afk.noteGameTick(t0 + i * 250);
      }
      assert.equal(players.find((p) => p.id === 1).team, 1, "tick irregular + corrida");
      afk.stop();
    });
  });

  it("sem xspeed no host: deslize contínuo 3+ ticks zera AFK", () => {
    withAfkTimes(() => {
      const { room, players } = mockAfkRoom(4);
      let x = 0;
      room.getPlayerDiscProperties = (id) =>
        id === 1 ? { x, y: 0 } : { x: 0, y: 0, xspeed: 0, yspeed: 0 };
      const afk = createAfkTracker(room);
      const t0 = 1_700_000_000_000;
      afk.resetClocks(t0);
      const ticks = Math.ceil(17 * TICK_HZ);
      runPhysicsTicks(afk, null, {
        t0,
        ticks,
        onTick: () => {
          x += 0.5;
        },
      });
      assert.equal(players.find((p) => p.id === 1).team, 1, "só posição contínua");
      afk.stop();
    });
  });

  it("tecla + corrida após ficar parado zera de novo", () => {
    withAfkTimes(() => {
      const { room, players, announcements } = mockAfkRoom(4);
      let x = 0;
      const p1 = players.find((p) => p.id === 1);
      room.getPlayerDiscProperties = (id) =>
        id === 1
          ? { x, y: 0, xspeed: x > 0 ? 0.8 : 0, yspeed: 0 }
          : { x: 0, y: 0, xspeed: 0, yspeed: 0 };
      const afk = createAfkTracker(room);
      const t0 = 1_700_000_000_000;
      afk.resetClocks(t0);
      for (let s = 0; s <= 12 * TICK_HZ; s++) {
        afk.noteGameTick(t0 + Math.floor((s * 1000) / TICK_HZ));
      }
      afk.tick(t0 + config.afkWarnMs + 500);
      assert.ok(announcements.some((a) => /mexa-se/i.test(a.msg)), "aviso após 12s parado");

      x = 0.8;
      afk.noteActivity(p1, t0 + config.afkWarnMs + 600);
      for (let i = 0; i < 20 * TICK_HZ; i++) {
        x += 0.8;
        afk.noteGameTick(t0 + config.afkWarnMs + 600 + Math.floor((i * 1000) / TICK_HZ));
      }
      afk.tick(t0 + config.afkActionMs + 2000);
      assert.equal(players.find((p) => p.id === 1).team, 1, "voltou a correr a tempo");
      afk.stop();
    });
  });
});

describe("empurrão ≠ movimento do ocioso", () => {
  it("salto instantâneo (≥ BUMP_EPS) não zera AFK nem movedThisMatch", () => {
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
        discs.set(1, { x: 5, y: 0, xspeed: 0.9, yspeed: 0 });
        afk.noteGameTick(t0 + i * 1000);
      }
      afk.tick(t0 + 17000);
      assert.equal(players.find((p) => p.id === 1).team, 0, "empurrão instantâneo");
      assert.equal(moved.has(1), false);
      afk.stop();
    });
  });

  it("empurrão gradual com xspeed fantasma em parado 600ms+ não zera", () => {
    withAfkTimes(() => {
      const { room, players } = mockAfkRoom(4);
      const moved = new Set();
      let x = 0;
      room.getPlayerDiscProperties = (id) =>
        id === 1 ? { x, y: 0, xspeed: 0.9, yspeed: 0 } : { x: 10, y: 0, xspeed: 0.8, yspeed: 0 };
      const afk = createAfkTracker(room, { onFieldMove: (id) => moved.add(id) });
      const t0 = 1_700_000_000_000;
      afk.resetClocks(t0);
      afk.noteGameTick(t0);
      for (let i = 1; i <= 17; i++) {
        x += 1.0;
        afk.noteGameTick(t0 + i * 1000);
      }
      afk.tick(t0 + 17000);
      assert.equal(players.find((p) => p.id === 1).team, 0, "empurrão gradual sem tecla");
      assert.equal(moved.has(1), false);
      afk.stop();
    });
  });

  it("empurrão gradual COM tecla recente zera (jogador reagiu)", () => {
    withAfkTimes(() => {
      const { room, players } = mockAfkRoom(4);
      const p1 = players.find((p) => p.id === 1);
      let x = 0;
      room.getPlayerDiscProperties = (id) =>
        id === 1 ? { x, y: 0, xspeed: 0.9, yspeed: 0 } : { x: 10, y: 0, xspeed: 0.8, yspeed: 0 };
      const afk = createAfkTracker(room);
      const t0 = 1_700_000_000_000;
      afk.resetClocks(t0);
      afk.noteGameTick(t0);
      for (let i = 1; i <= 17; i++) {
        if (i === 2) afk.noteActivity(p1, t0 + i * 1000);
        x += 1.0;
        afk.noteGameTick(t0 + i * 1000);
      }
      afk.tick(t0 + 17000);
      assert.equal(players.find((p) => p.id === 1).team, 1, "tecla recente = movimento válido");
      afk.stop();
    });
  });

  it("série de micro-empurrões (< BUMP_EPS) com xspeed sujo não zera", () => {
    withAfkTimes(() => {
      const { room, players } = mockAfkRoom(4);
      let x = 0;
      room.getPlayerDiscProperties = (id) =>
        id === 1 ? { x, y: 0, xspeed: 0.85, yspeed: 0 } : { x: 0, y: 0, xspeed: 0, yspeed: 0 };
      const afk = createAfkTracker(room);
      const t0 = 1_700_000_000_000;
      afk.touch(1, t0 - 2000);
      afk.touch(2, t0);
      afk.noteGameTick(t0);
      for (let i = 1; i <= 17; i++) {
        x += 1.2;
        afk.noteGameTick(t0 + i * 1000);
      }
      afk.tick(t0 + 17000);
      assert.equal(players.find((p) => p.id === 1).team, 0);
      afk.stop();
    });
  });
});

describe("falsos positivos de movimento", () => {
  it("xspeed sujo sem deslocar não zera", () => {
    withAfkTimes(() => {
      const { room, players } = mockAfkRoom(4);
      const discs = new Map([
        [1, { x: 0, y: 0, xspeed: 0.8, yspeed: 0.8 }],
        [2, { x: 0, y: 0, xspeed: 0, yspeed: 0 }],
      ]);
      room.getPlayerDiscProperties = (id) => discs.get(id);
      const afk = createAfkTracker(room);
      const t0 = 1_700_000_000_000;
      afk.resetClocks(t0);
      let x2 = 0;
      for (let i = 1; i <= 17; i++) {
        discs.set(1, { x: 0.2, y: 0, xspeed: 0.8, yspeed: 0.8 });
        x2 += 0.8;
        discs.set(2, { x: x2, y: 0, xspeed: 0.8, yspeed: 0 });
        afk.noteGameTick(t0 + i * 1000);
      }
      afk.tick(t0 + 17000);
      assert.equal(players.find((p) => p.id === 1).team, 0);
      assert.equal(players.find((p) => p.id === 2).team, 2);
      afk.stop();
    });
  });

  it("jitter 0.3/tick não zera AFK", () => {
    withAfkTimes(() => {
      const { room, players } = mockAfkRoom(4);
      let j = 0;
      room.getPlayerDiscProperties = (id) =>
        id === 1 ? { x: j, y: 0, xspeed: 0, yspeed: 0 } : { x: 0, y: 0, xspeed: 0, yspeed: 0 };
      const afk = createAfkTracker(room);
      const t0 = 1_700_000_000_000;
      afk.resetClocks(t0);
      const ticks = Math.ceil(17 * TICK_HZ);
      runPhysicsTicks(afk, null, {
        t0,
        ticks,
        onTick: () => {
          j += 0.3;
        },
      });
      afk.tick(t0 + 17000);
      assert.equal(players.find((p) => p.id === 1).team, 0);
      assert.equal(afk.isAfk(1), true);
      afk.stop();
    });
  });

  it("deriva de 1s no setInterval não zera", () => {
    withAfkTimes(() => {
      const { room, players } = mockAfkRoom(4);
      const discs = new Map([
        [1, { x: 0, y: 0 }],
        [2, { x: 0, y: 0 }],
      ]);
      room.getPlayerDiscProperties = (id) => discs.get(id);
      const afk = createAfkTracker(room);
      const t0 = 1_700_000_000_000;
      afk.resetClocks(t0);
      afk.noteGameTick(t0);
      for (let i = 1; i <= 17; i++) {
        discs.set(1, { x: i * 3, y: 0 });
        afk.tick(t0 + i * 1000);
      }
      assert.equal(players.find((p) => p.id === 1).team, 0);
      afk.stop();
    });
  });

  it("hasMoved: micro-movimento não conta; salto sim", () => {
    assert.equal(hasMoved({ x: 0, y: 0 }, { x: 0.1, y: 0 }), false);
    assert.equal(hasMoved({ x: 0, y: 0 }, { x: 3, y: 0 }), true);
    assert.equal(isWalkingSpeed({ xspeed: 0.8, yspeed: 0 }), true);
    assert.equal(isWalkingSpeed({ xspeed: 0, yspeed: 0 }), false);
  });
});

describe("matriz corrida vs parado vs empurrão (60Hz)", () => {
  const cases = [
    { name: "parado puro", dx: 0, speed: 0, expectField: false },
    { name: "corrida 0.8/tick", dx: 0.8, speed: 0.8, expectField: true },
    { name: "corrida lenta 0.5/tick", dx: 0.5, speed: 0.5, expectField: true },
    { name: "empurrão 5/tick sem tecla", dx: 5, speed: 0.9, expectField: false, idleFirst: true },
  ];

  for (const c of cases) {
    it(c.name, () => {
      withAfkTimes(() => {
        const { room, players } = mockAfkRoom(4);
        const p1 = players.find((p) => p.id === 1);
        let x = 0;
        room.getPlayerDiscProperties = (id) =>
          id === 1 ? { x, y: 0, xspeed: c.speed, yspeed: 0 } : { x: 0, y: 0, xspeed: 0, yspeed: 0 };
        const afk = createAfkTracker(room);
        const t0 = 1_700_000_000_000;
        afk.resetClocks(t0);
        if (c.idleFirst) {
          afk.noteGameTick(t0);
          for (let s = 1; s <= 1; s++) afk.noteGameTick(t0 + s * 600);
        }
        const ticks = Math.ceil(17 * TICK_HZ);
        runPhysicsTicks(afk, null, {
          t0: c.idleFirst ? t0 + 600 : t0,
          ticks,
          onTick: () => {
            if (c.dx > 0 && c.dx < 2 && c.idleFirst && x === 0) afk.noteActivity(p1, t0 + 700);
            x += c.dx;
          },
        });
        afk.tick(t0 + 17000);
        const onField = players.find((p) => p.id === 1).team !== 0;
        assert.equal(onField, c.expectField, c.name);
        afk.stop();
      });
    });
  }
});

describe("paridade TDJ: drible, kickoff e fallback 1s", () => {
  it("colisão grande com tecla recente não cai AFK", () => {
    withAfkTimes(() => {
      const { room, players } = mockAfkRoom(4);
      const p1 = players.find((p) => p.id === 1);
      let x = 0;
      room.getPlayerDiscProperties = (id) =>
        id === 1 ? { x, y: 0, xspeed: 0.8, yspeed: 0 } : { x: 10, y: 0, xspeed: 0, yspeed: 0 };
      const afk = createAfkTracker(room);
      const t0 = 1_700_000_000_000;
      afk.resetClocks(t0);
      afk.noteGameTick(t0);
      for (let i = 1; i <= 17; i++) {
        afk.noteActivity(p1, t0 + i * 1000 - 50);
        x += 2.0;
        afk.noteGameTick(t0 + i * 1000);
      }
      afk.tick(t0 + 17000);
      assert.equal(players.find((p) => p.id === 1).team, 1, "drible/colisão");
      afk.stop();
    });
  });

  it("notePositionsReset evita falso empurrão no kickoff", () => {
    withAfkTimes(() => {
      const { room, players } = mockAfkRoom(4);
      const p1 = players.find((p) => p.id === 1);
      let x = 100;
      room.getPlayerDiscProperties = (id) =>
        id === 1 ? { x, y: 0, xspeed: 0.8, yspeed: 0 } : { x: 0, y: 0, xspeed: 0, yspeed: 0 };
      const afk = createAfkTracker(room);
      const t0 = 1_700_000_000_000;
      afk.resetClocks(t0);
      afk.noteGameTick(t0);
      afk.notePositionsReset();
      x = 0;
      for (let i = 1; i <= 17; i++) {
        afk.noteActivity(p1, t0 + i * 1000 - 50);
        x += 0.8;
        afk.noteGameTick(t0 + i * 1000);
      }
      afk.tick(t0 + 17000);
      assert.equal(players.find((p) => p.id === 1).team, 1, "pós-kickoff");
      afk.stop();
    });
  });

  it("fallback de 1s reamostra movimento sem onGameTick", () => {
    withAfkTimes(() => {
      const { room, players } = mockAfkRoom(4);
      const p1 = players.find((p) => p.id === 1);
      let x = 0;
      room.getPlayerDiscProperties = (id) =>
        id === 1 ? { x, y: 0, xspeed: 0.8, yspeed: 0 } : { x: 0, y: 0, xspeed: 0, yspeed: 0 };
      const afk = createAfkTracker(room);
      const t0 = 1_700_000_000_000;
      afk.resetClocks(t0);
      for (let s = 1; s <= 17; s++) {
        afk.noteActivity(p1, t0 + s * 1000 - 100);
        x += 0.8 * 15;
        afk.tick(t0 + s * 1000);
      }
      assert.equal(players.find((p) => p.id === 1).team, 1, "só tick de 1s");
      afk.stop();
    });
  });
});

describe("comparação com AFK ingênuo (comunidade Haxball)", () => {
  it("padrão onPlayerActivity: tecla sem deslocar nunca pune (falso negativo)", () => {
    const last = new Map();
    const t0 = 1_000_000;
    last.set(1, t0);
    const idle = Date.now() - last.get(1);
    assert.ok(idle >= 0);
    last.set(1, t0);
    assert.equal(t0 + 20_000 - last.get(1) > 16_000, true, "ingênuo puniria só pelo relógio");
    last.set(1, t0 + 19_000);
    assert.equal(t0 + 20_000 - last.get(1) < 16_000, true, "ingênuo zera com qualquer tecla");
  });

  it("nosso: tecla sem deslocar no disco ainda cai AFK", () => {
    withAfkTimes(() => {
      const { room, players } = mockAfkRoom(4);
      const p1 = players.find((p) => p.id === 1);
      room.getPlayerDiscProperties = () => ({ x: 0, y: 0, xspeed: 0, yspeed: 0 });
      const afk = createAfkTracker(room);
      const t0 = 1_700_000_000_000;
      afk.resetClocks(t0);
      for (let i = 1; i <= 17; i++) {
        afk.noteActivity(p1, t0 + i * 1000);
        afk.noteGameTick(t0 + i * 1000);
      }
      afk.tick(t0 + 17000);
      assert.equal(players.find((p) => p.id === 1).team, 0, "parado de verdade");
      afk.stop();
    });
  });
});

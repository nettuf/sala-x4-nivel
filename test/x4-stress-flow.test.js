const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const config = require("../src/config");
const { bootRoom } = require("./helpers/roomHost");
const {
  waitLobby,
  settle,
  field,
  enter,
  growTo,
  assertNvN,
  assertLegal,
  assertHealthy4v4,
  pickReplacement,
  finishWithRedWin,
  specCountAll,
  touchField,
  idleToAfk,
  TEAM,
} = require("./helpers/lobbyAssert");

async function boot4v4(host, extraSpec = 0) {
  await growTo(host, 8 + extraSpec);
  await waitLobby(1600);
  assertHealthy4v4(host);
}

/**
 * Stress E2E: crescimento 1→12, !afk, ociosidade, entradas/saídas.
 * Usa createRoom real (roomHost).
 */

const STAGES_1_TO_12 = [
  { n: 1, red: 1, blue: 0, spec: 0, competitive: false },
  { n: 2, red: 1, blue: 1, spec: 0, competitive: false },
  { n: 3, red: 1, blue: 1, spec: 1, competitive: false },
  { n: 4, red: 2, blue: 2, spec: 0, competitive: false },
  { n: 5, red: 2, blue: 2, spec: 1, competitive: false },
  { n: 6, red: 3, blue: 3, spec: 0, competitive: false },
  { n: 7, red: 3, blue: 3, spec: 1, competitive: false },
  { n: 8, red: 4, blue: 4, spec: 0, competitive: true },
  { n: 9, red: 4, blue: 4, spec: 1, competitive: true },
  { n: 10, red: 4, blue: 4, spec: 2, competitive: true },
  { n: 11, red: 4, blue: 4, spec: 3, competitive: true },
  { n: 12, red: 4, blue: 4, spec: 4, competitive: true },
];

describe("stress: crescimento 1→12", () => {
  for (const stage of STAGES_1_TO_12) {
    it(`${stage.n} jogador(es) → ${stage.red}v${stage.blue}${stage.spec ? ` +${stage.spec} spec` : ""}`, async () => {
      const host = bootRoom();
      await growTo(host, stage.n);
      const f = field(host);
      assert.equal(f.n, stage.n, "elegíveis");
      assert.equal(f.red, stage.red);
      assert.equal(f.blue, stage.blue);
      assert.equal(f.spec, stage.spec);
      assert.equal(host.handles.match.isCompetitive(), stage.competitive, "competitivo");
      if (stage.n >= 2) assert.ok(host.live(), "warmup/competitivo vivo");
      assertLegal(host, `@${stage.n}`);
      host.cleanup();
    });
  }

  it("filme: sobe 1→12 numa sala só, sem 2v1 nem pausa presa", async () => {
    const host = bootRoom();
    const gameIds = [];

    for (let n = 1; n <= 12; n++) {
      enter(host);
      await waitLobby(n === 8 ? 1600 : 400);
      const f = field(host);
      const expect = STAGES_1_TO_12[n - 1];
      assert.equal(f.red, expect.red, `red @${n}`);
      assert.equal(f.blue, expect.blue, `blue @${n}`);
      assert.equal(f.spec, expect.spec, `spec @${n}`);
      assertLegal(host, `filme @${n}`);
      if (host.live()) gameIds.push(host.live());
    }

    assertHealthy4v4(host, "fechou 12");
    assert.equal(new Set(gameIds).size >= 1, true, "teve jogo rodando");
    host.cleanup();
  });

  it("desce 12→1 saindo um por um: formatos corretos", async () => {
    const host = bootRoom();
    await growTo(host, 12);
    assertHealthy4v4(host);

    const leaveOrder = [...host.players].reverse();
    for (const p of leaveOrder) {
      host.quit(p);
      await waitLobby(400);
      assertLegal(host, `restam ${host.players.length}`);
    }
    assert.equal(host.players.length, 0);
    host.cleanup();
  });
});

describe("stress: !afk no spec", () => {
  it("1v1 + spec: !afk não entra no par", async () => {
    const host = bootRoom();
    await growTo(host, 3);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    await host.chat(spec, "!afk");
    await settle();
    assert.equal(host.handles.afk.isAfk(spec.id), true);
    // AFK não conta como elegível: precisa de 2 specs ativos para subir 2v2.
    enter(host);
    await waitLobby();
    assertNvN(host, 1, 1, "ainda 1v1 + spec ativo");
    enter(host);
    await waitLobby();
    assertNvN(host, 2, 0, "2v2 (AFK não conta na fila elegível)");
    assert.equal(host.find(spec.id).team, TEAM.SPEC);
    assert.equal(host.handles.afk.isAfk(spec.id), true);
    host.cleanup();
  });

  it("3v3 + spec: !afk no spec não é puxado quando alguém sai", async () => {
    const host = bootRoom();
    await growTo(host, 7);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    await host.chat(spec, "!afk");
    await settle();
    const scores = host.live();
    host.quit(host.players.find((p) => p.team === TEAM.RED));
    await waitLobby();
    assertNvN(host, 2, 1, "desceu 2v2");
    assert.equal(host.find(spec.id).team, TEAM.SPEC);
    assert.equal(host.live(), scores, "sem RR");
    host.cleanup();
  });

  it("4v4 + spec: !afk não pausa e fica fora do pick", async () => {
    const host = bootRoom();
    await growTo(host, 9);
    assertHealthy4v4(host);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const scores = host.live();
    await host.chat(spec, "!afk");
    await settle();
    assert.equal(host.handles.afk.isAfk(spec.id), true);
    assertHealthy4v4(host);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("4v4 + 2 specs: um !afk, sai do campo → único ativo entra automático", async () => {
    const host = bootRoom();
    await growTo(host, 10);
    const specs = host.players.filter((p) => p.team === TEAM.SPEC);
    await host.chat(specs[0], "!afk");
    await settle();
    const ativo = specs[1];
    host.quit(host.players.find((p) => p.team === TEAM.RED));
    await waitLobby();
    assert.equal(host.handles.choose.isReplacement(), false, "1 vaga e 1 ativo → auto");
    assert.equal(host.find(ativo.id).team, TEAM.RED);
    assertHealthy4v4(host);
    host.cleanup();
  });

  it("!afk no spec e volta (!afk de novo) entra na fila de novo", async () => {
    const host = bootRoom();
    await growTo(host, 5);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    await host.chat(spec, "!afk");
    await host.chat(spec, "!afk");
    await settle();
    assert.equal(host.handles.afk.isAfk(spec.id), false);
    host.quit(host.players.find((p) => p.team === TEAM.RED));
    await waitLobby();
    assert.equal(host.find(spec.id).team, TEAM.RED, "spec ativo cobre a saída");
    host.cleanup();
  });

  it("choose pós-vitória: spec !afk some da lista do capitão", async () => {
    const host = bootRoom();
    await boot4v4(host, 2);
    finishWithRedWin(host);
    host.room.stopGame();
    await host.room.onGameStop();
    await settle();
    assert.equal(host.handles.choose.isActive(), true);
    const afkSpec = host.handles.choose.list().spec[0];
    await host.chat(afkSpec, "!afk");
    await settle();
    const ready = host.handles.choose.list().specReady.map((p) => p.id);
    assert.ok(!ready.includes(afkSpec.id));
    host.cleanup();
  });
});

describe("stress: ociosidade → auto-AFK", () => {
  it("2v2 + spec: ocioso no campo vira AFK e o spec sobe", async () => {
    const host = bootRoom();
    await growTo(host, 5);
    const scores = host.live();
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const idle = host.players.find((p) => p.team === TEAM.RED);
    await idleToAfk(host, idle);
    assert.equal(host.handles.afk.isAfk(idle.id), true);
    assert.equal(host.find(spec.id).team, TEAM.RED);
    assertNvN(host, 2);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("3v3 + spec: ocioso desce e puxa o spec", async () => {
    const host = bootRoom();
    await growTo(host, 7);
    const scores = host.live();
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const idle = host.players.find((p) => p.team === TEAM.BLUE);
    await idleToAfk(host, idle);
    assert.equal(host.find(spec.id).team, TEAM.BLUE);
    assertNvN(host, 3);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("4v4 + spec: ocioso com 1 spec ativo → auto-reposição", async () => {
    const host = bootRoom();
    await growTo(host, 9);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const idle = host.players.find((p) => p.team === TEAM.RED);
    await idleToAfk(host, idle);
    assert.equal(host.handles.choose.isReplacement(), false, "1 vaga e 1 spec → auto");
    assert.equal(host.find(spec.id).team, TEAM.RED);
    assertHealthy4v4(host);
    host.cleanup();
  });

  it("4v4 sem spec: ocioso desce para 3v3 sem pausar", async () => {
    const host = bootRoom();
    await growTo(host, 8);
    const scores = host.live();
    const idle = host.players.find((p) => p.team === TEAM.RED);
    await idleToAfk(host, idle);
    assertNvN(host, 3, 1);
    assert.equal(host.live(), scores);
    assert.equal(host.handles.match.isCompetitive(), false);
    host.cleanup();
  });

  it("spec parado no banco não vira auto-AFK", async () => {
    const host = bootRoom();
    await growTo(host, 5);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    host.idle(host.players, { idleMs: config.afkActionMs * 3 });
    await settle();
    assert.equal(host.handles.afk.isAfk(spec.id), false);
    assert.equal(host.find(spec.id).team, TEAM.SPEC);
    host.cleanup();
  });

  it("1v1: ocioso no azul puxa o spec (sem choose)", async () => {
    const host = bootRoom();
    await growTo(host, 3);
    const scores = host.live();
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const idle = host.players.find((p) => p.team === TEAM.BLUE);
    await idleToAfk(host, idle);
    assert.equal(host.find(spec.id).team, TEAM.BLUE);
    assertNvN(host, 1);
    assert.equal(host.live(), scores);
    host.cleanup();
  });
});

describe("stress: entradas e saídas", () => {
  it("entrada no meio do 3v3: ímpar espera, par sobe", async () => {
    const host = bootRoom();
    await growTo(host, 6);
    const g1 = host.live();
    enter(host);
    await waitLobby();
    assertNvN(host, 3, 1);
    enter(host);
    await waitLobby();
    assertNvN(host, 4);
    assert.notEqual(host.live(), g1, "RR pro x4");
    host.cleanup();
  });

  it("spec entra e sai no 4v4 ao vivo: jogo não pausa", async () => {
    const host = bootRoom();
    await growTo(host, 8);
    const scores = host.live();
    const late = enter(host);
    await settle();
    assertHealthy4v4(host);
    host.quit(late);
    await settle();
    assertHealthy4v4(host);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("saída no 2v2 sem spec desce 1v1", async () => {
    const host = bootRoom();
    await growTo(host, 4);
    const scores = host.live();
    host.quit(host.players.find((p) => p.team === TEAM.RED));
    await waitLobby();
    assertNvN(host, 1, 1);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("saída no 4v4 com 2 specs: capitão repõe", async () => {
    const host = bootRoom();
    await growTo(host, 10);
    host.quit(host.players.find((p) => p.team === TEAM.BLUE));
    await waitLobby();
    assert.equal(host.handles.choose.isReplacement(), true);
    await pickReplacement(host);
    assertHealthy4v4(host);
    host.cleanup();
  });

  it("capitão sai no 4v4 + spec: único spec entra automático", async () => {
    const host = bootRoom();
    await growTo(host, 9);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const reds = host.players.filter((p) => p.team === TEAM.RED);
    host.quit(reds[0]);
    await waitLobby();
    assert.equal(host.handles.choose.isReplacement(), false);
    assert.equal(host.find(spec.id).team, TEAM.RED);
    assertHealthy4v4(host);
    host.cleanup();
  });

  it("entrada durante choose atualiza lista do capitão", async () => {
    const host = bootRoom();
    await boot4v4(host, 2);
    finishWithRedWin(host);
    host.room.stopGame();
    await host.room.onGameStop();
    await settle();
    assert.equal(host.handles.choose.isActive(), true);
    const before = host.handles.choose.list().spec.length;
    enter(host);
    await settle();
    assert.equal(host.handles.choose.list().spec.length, before + 1);
    host.cleanup();
  });

  it("churn: entra/sai spec várias vezes no 3v3", async () => {
    const host = bootRoom();
    await growTo(host, 6);
    const scores = host.live();
    for (let i = 0; i < 5; i++) {
      const p = enter(host);
      await settle();
      assertNvN(host, 3, 1, `rodada ${i} entrou`);
      host.quit(p);
      await waitLobby(300);
      assertNvN(host, 3, 0, `rodada ${i} saiu`);
      assert.equal(host.live(), scores);
    }
    host.cleanup();
  });
});

describe("stress: filme caótico 1→12", () => {
  it("cresce, !afk, ocioso, saída, vitória, pick, encolhe", async () => {
    const host = bootRoom();

    // treino → 4v4
    for (let n = 1; n <= 8; n++) {
      enter(host);
      await waitLobby(n >= 7 ? 500 : 300);
    }
    await waitLobby(1600);
    assertHealthy4v4(host);

    // +2 specs, um fica AFK voluntário
    const s1 = enter(host);
    const s2 = enter(host);
    await settle();
    await host.chat(s2, "!afk");
    await settle();

    // ocioso no campo → único spec ativo entra automático
    const idle = host.players.find((p) => p.team === TEAM.RED);
    await idleToAfk(host, idle);
    assert.equal(host.handles.choose.isReplacement(), false, "1 vaga e 1 ativo → auto");
    assertHealthy4v4(host);
    assert.equal(host.find(s1.id).team, TEAM.RED, "spec ativo entrou");
    assert.equal(host.find(s2.id).team, TEAM.SPEC, "spec AFK ficou de fora");

    // sobe pra 12 (AFK no spec não entra na conta elegível)
    while (host.players.length < 12) enter(host);
    await settle();
    assert.equal(host.players.length, 12);
    assert.ok(specCountAll(host) >= 2, "fila no spec");
    assertLegal(host, "12 jogadores");

    // vitória → remonta (choose ou auto-fill se deu match exato)
    finishWithRedWin(host);
    host.room.stopGame();
    await host.room.onGameStop();
    await settle();
    if (host.handles.choose.isActive()) {
      const cap = host.handles.choose.currentCaptain();
      assert.ok(cap);
      while (host.handles.choose.isActive() && field(host).blue < 4) {
        await host.chat(cap, "1");
        await settle();
      }
    }
    await waitLobby(1600);
    assertLegal(host, "pós-vitória");
    assert.ok(field(host).red >= 3 && field(host).blue >= 1);

    // desce aos poucos
    while (host.players.length > 6) {
      const spec = host.players.find((p) => p.team === TEAM.SPEC);
      host.quit(spec || host.players[host.players.length - 1]);
      await waitLobby(400);
    }
    host.handles.refreshLobby();
    await waitLobby(1200);
    assert.ok(host.players.length <= 6);
    assertLegal(host, "encolheu");
    host.cleanup();
  });
});

describe("stress: crescimento com !afk na fila", () => {
  it("sobe 1→8 com specs AFK alternados: pares só com elegíveis", async () => {
    const host = bootRoom();
    const afkSpecs = [];
    for (let n = 1; n <= 8; n++) {
      const p = enter(host);
      if (n % 2 === 0) {
        await host.chat(p, "!afk");
        await settle();
        afkSpecs.push(p.id);
      }
      await waitLobby(n === 8 ? 1600 : 350);
    }
    const f = field(host);
    assert.ok(f.red >= 1 && f.blue >= 1);
    assert.equal(f.red, f.blue);
    for (const id of afkSpecs) {
      assert.equal(host.handles.afk.isAfk(id), true);
      assert.equal(host.find(id).team, TEAM.SPEC);
    }
    assertLegal(host, "8 com AFK na fila");
    host.cleanup();
  });

  it("no 4v4: 3 specs AFK + 1 ativo — sai do campo, ativo entra automático", async () => {
    const host = bootRoom();
    await boot4v4(host, 4);
    const specs = host.players.filter((p) => p.team === TEAM.SPEC);
    for (let i = 0; i < 3; i++) {
      await host.chat(specs[i], "!afk");
      await settle();
    }
    const active = specs[3];
    host.quit(host.players.find((p) => p.team === TEAM.BLUE));
    await waitLobby();
    assert.equal(host.handles.choose.isReplacement(), false, "1 vaga e 1 ativo → auto");
    assert.equal(host.find(active.id).team, TEAM.BLUE);
    assertHealthy4v4(host);
    host.cleanup();
  });
});

describe("stress: ociosidade em vários formatos", () => {
  it("2v2 sem spec: ocioso desce para 1v1 + spec", async () => {
    const host = bootRoom();
    await growTo(host, 4);
    const scores = host.live();
    const idle = host.players.find((p) => p.team === TEAM.BLUE);
    await idleToAfk(host, idle);
    assertNvN(host, 1, 1);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("4v4: dois ociosos seguidos com 3 specs → dois picks", async () => {
    const host = bootRoom();
    await boot4v4(host, 3);
    const idle1 = host.players.find((p) => p.team === TEAM.RED);
    await idleToAfk(host, idle1);
    assert.equal(host.handles.choose.isReplacement(), true);
    await pickReplacement(host);
    const idle2 = host.players.find((p) => p.team === TEAM.BLUE);
    await idleToAfk(host, idle2);
    if (host.handles.choose.isReplacement()) {
      await pickReplacement(host);
    }
    assertHealthy4v4(host);
    host.cleanup();
  });

  it("ocioso no spec do 3v3 não muda o jogo", async () => {
    const host = bootRoom();
    await growTo(host, 7);
    const scores = host.live();
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    host.idle(host.players, {
      moving: host.players.filter((p) => p.team !== TEAM.SPEC),
      idleMs: config.afkActionMs * 3,
    });
    await settle();
    assertNvN(host, 3, 1);
    assert.equal(host.handles.afk.isAfk(spec.id), false);
    assert.equal(host.live(), scores);
    host.cleanup();
  });
});

describe("stress: churn pesado", () => {
  it("12 entradas rápidas seguidas de 6 saídas: lobby legal", async () => {
    const host = bootRoom();
    for (let i = 0; i < 12; i++) enter(host);
    await waitLobby(1600);
    assertLegal(host, "12 entradas");
    for (let i = 0; i < 6; i++) {
      host.quit(host.players[host.players.length - 1]);
      await waitLobby(250);
    }
    assertLegal(host, "depois de 6 saídas");
    assert.ok(host.players.length === 6);
    host.cleanup();
  });

  it("alterna entrada/saída no spec durante 4v4", async () => {
    const host = bootRoom();
    await boot4v4(host);
    const scores = host.live();
    for (let i = 0; i < 8; i++) {
      const p = enter(host);
      await settle();
      assertHealthy4v4(host, `rodada ${i} entrou`);
      host.quit(p);
      await settle();
      assertHealthy4v4(host, `rodada ${i} saiu`);
      assert.equal(host.live(), scores);
    }
    host.cleanup();
  });

  it("sai metade no choose pós-vitória: capitão continua", async () => {
    const host = bootRoom();
    await boot4v4(host, 3);
    finishWithRedWin(host);
    host.room.stopGame();
    await host.room.onGameStop();
    await settle();
    assert.equal(host.handles.choose.isActive(), true);
    const capBefore = host.handles.choose.currentCaptain()?.id;
    const specs = host.handles.choose.list().spec;
    host.quit(specs[0]);
    await settle();
    assert.equal(host.handles.choose.isActive(), true);
    assert.ok(host.handles.choose.currentCaptain());
    if (capBefore) {
      // capitão pode ter mudado se era quem saiu; o importante é pickar
      await host.chat(host.handles.choose.currentCaptain(), "1");
      await settle();
    }
    host.cleanup();
  });
});

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const config = require("../src/config");
const { bootRoom, fill4v4 } = require("./helpers/roomHost");
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
  touchField,
  idleToAfk,
  TEAM,
} = require("./helpers/lobbyAssert");

const STAGES_1_TO_12 = [
  { n: 1, red: 1, blue: 0, spec: 0 },
  { n: 2, red: 1, blue: 1, spec: 0 },
  { n: 3, red: 1, blue: 1, spec: 1 },
  { n: 4, red: 2, blue: 2, spec: 0 },
  { n: 5, red: 2, blue: 2, spec: 1 },
  { n: 6, red: 3, blue: 3, spec: 0 },
  { n: 7, red: 3, blue: 3, spec: 1 },
  { n: 8, red: 4, blue: 4, spec: 0 },
  { n: 9, red: 4, blue: 4, spec: 1 },
  { n: 10, red: 4, blue: 4, spec: 2 },
  { n: 11, red: 4, blue: 4, spec: 3 },
  { n: 12, red: 4, blue: 4, spec: 4 },
];

describe("x4 estabilidade: subida 1→12", () => {
  it("cada estágio mantém times iguais e formato legal", async () => {
    const host = bootRoom();
    for (const stage of STAGES_1_TO_12) {
      enter(host);
      await waitLobby(stage.n === 8 ? 1600 : 400);
      const f = field(host);
      assert.equal(f.n, stage.n, `@${stage.n} elegíveis`);
      assert.equal(f.red, stage.red, `@${stage.n} red`);
      assert.equal(f.blue, stage.blue, `@${stage.n} blue`);
      assert.equal(f.spec, stage.spec, `@${stage.n} spec`);
      assertLegal(host, `@${stage.n}`);
      if (stage.n >= 2) assert.ok(host.live(), `@${stage.n} jogo vivo`);
    }
    assertHealthy4v4(host, "fechou 12");
    host.cleanup();
  });
});

describe("x4 estabilidade: ociosidade e AFK", () => {
  it("2v2 + spec: ocioso no campo vira AFK e o spec sobe sem RR", async () => {
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

  it("3v3 + spec (7 elegíveis): ocioso puxa spec e mantém 3v3", async () => {
    const host = bootRoom();
    await growTo(host, 7);
    assert.equal(field(host).n, 7, "7 elegíveis = 3v3 + 1 spec");
    const scores = host.live();
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const idle = host.players.find((p) => p.team === TEAM.BLUE);
    await idleToAfk(host, idle);
    assert.equal(host.find(spec.id).team, TEAM.BLUE);
    assertNvN(host, 3);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("4v4 + spec: ocioso com 1 ativo → auto-reposição", async () => {
    const host = bootRoom();
    await growTo(host, 9);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const idle = host.players.find((p) => p.team === TEAM.RED);
    await idleToAfk(host, idle);
    assert.equal(host.find(spec.id).team, TEAM.RED);
    assertHealthy4v4(host);
    host.cleanup();
  });

  it("4v4 + 2 specs: ocioso abre pick (mais opções que vagas)", async () => {
    const host = bootRoom();
    await growTo(host, 10);
    const idle = host.players.find((p) => p.team === TEAM.RED);
    await idleToAfk(host, idle);
    assert.equal(host.handles.choose.isReplacement(), true);
    await pickReplacement(host);
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
    assert.equal(host.handles.choose.isActive(), false);
    host.cleanup();
  });

  it("spec parado nunca vira AFK automático", async () => {
    const host = bootRoom();
    await growTo(host, 9);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    touchField(host);
    host.idle(host.players, { idleMs: config.afkActionMs * 3 });
    await settle();
    assert.equal(host.handles.afk.isAfk(spec.id), false);
    assert.equal(host.find(spec.id).team, TEAM.SPEC);
    host.cleanup();
  });
});

describe("x4 estabilidade: picks e reposição", () => {
  it("4v4 + 1 spec: sai → auto (1=1)", async () => {
    const host = bootRoom();
    await growTo(host, 9);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    host.quit(host.players.find((p) => p.team === TEAM.BLUE));
    await waitLobby();
    assert.equal(host.find(spec.id).team, TEAM.BLUE);
    assertHealthy4v4(host);
    host.cleanup();
  });

  it("4v4 + 7 specs: sai do campo → capitão escolhe entre 7", async () => {
    const host = bootRoom();
    await growTo(host, 8);
    for (let i = 0; i < 7; i++) enter(host);
    await settle();
    assertHealthy4v4(host);
    assert.equal(field(host).spec, 7);
    host.quit(host.players.find((p) => p.team === TEAM.RED));
    await waitLobby();
    assert.equal(host.handles.choose.isReplacement(), true, "7 opções > 1 vaga");
    assert.equal(host.handles.choose.list().specReady.length, 7);
    await pickReplacement(host);
    assertHealthy4v4(host);
    host.cleanup();
  });

  it("4v4 + 7 specs (6 AFK): sai → único ativo entra automático", async () => {
    const host = bootRoom();
    await growTo(host, 8);
    const specs = [];
    for (let i = 0; i < 7; i++) specs.push(enter(host));
    await settle();
    for (const s of specs.slice(0, 6)) host.handles.afk.setAfk(host.find(s.id), true);
    const ativo = specs[6];
    host.quit(host.players.find((p) => p.team === TEAM.BLUE));
    await waitLobby();
    assert.equal(host.find(ativo.id).team, TEAM.BLUE);
    assertHealthy4v4(host);
    host.cleanup();
  });

  it("4 red + 7 specs no choose: preenche azul sem travar", async () => {
    const host = bootRoom();
    for (let i = 0; i < 4; i++) host.addPlayer(TEAM.RED);
    host.addPlayer(TEAM.BLUE);
    for (let i = 0; i < 7; i++) host.addPlayer(TEAM.SPEC);
    host.handles.choose.continueFromField();
    await waitLobby(600);

    assert.equal(host.handles.choose.isActive(), true);
    assert.equal(field(host).red, 4);
    assert.equal(field(host).spec, 7);
    assert.equal(field(host).blue, 1);

    const cap = host.handles.choose.currentCaptain();
    assert.ok(cap);
    while (host.handles.choose.isActive() && field(host).blue < 4) {
      await host.chat(cap, "1");
      await settle();
    }
    await waitLobby(800);

    const f = field(host);
    assert.equal(f.red, 4);
    assert.equal(f.blue, 4);
    assert.equal(host.handles.choose.isActive(), false);
    host.cleanup();
  });

  it("capitão escolhe por número com specs AFK fora da lista", async () => {
    const host = bootRoom();
    await growTo(host, 11);
    const specs = host.players.filter((p) => p.team === TEAM.SPEC);
    host.handles.afk.setAfk(specs[0], true);
    host.quit(host.players.find((p) => p.team === TEAM.RED));
    await waitLobby();
    assert.equal(host.handles.choose.isReplacement(), true, "2 ativos > 1 vaga");
    const ready = host.handles.choose.list().specReady;
    assert.equal(ready.length, 2);
    await pickReplacement(host);
    assertHealthy4v4(host);
    host.cleanup();
  });
});

describe("x4 estabilidade: rebalanceamento e recovery", () => {
  it("4v4 + spec: refreshLobby repetido não trava nem desequilibra", async () => {
    const host = bootRoom();
    await growTo(host, 9);
    for (let i = 0; i < 5; i++) {
      host.handles.refreshLobby();
      await settle();
    }
    assertHealthy4v4(host);
    host.cleanup();
  });

  it("3v3 + spec: sai do campo puxa spec sem mudar formato", async () => {
    const host = bootRoom();
    await growTo(host, 7);
    const scores = host.live();
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    host.quit(host.players.find((p) => p.team === TEAM.BLUE));
    await waitLobby();
    assert.equal(host.find(spec.id).team, TEAM.BLUE);
    assertNvN(host, 3);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("4v4 sem spec: sai → desce 3v3 no x4", async () => {
    const host = bootRoom();
    await growTo(host, 8);
    const scores = host.live();
    host.quit(host.players.find((p) => p.team === TEAM.RED));
    await waitLobby();
    assertNvN(host, 3, 1);
    assert.equal(host.live(), scores);
    assert.equal(host.handles.choose.isActive(), false);
    host.cleanup();
  });

  it("4v4 ao vivo: 4 red 0 blue 3 spec → sobe azuis e desce 3v3", async () => {
    const host = bootRoom();
    await growTo(host, 11);
    assert.equal(field(host).red, 4);
    assert.equal(field(host).blue, 4);
    assert.equal(field(host).spec, 3);
    const scores = host.live();
    for (const p of [...host.players.filter((x) => x.team === TEAM.BLUE)]) {
      host.quit(p);
    }
    await waitLobby(1200);
    assertNvN(host, 3, 1);
    assert.equal(host.live(), scores);
    assert.equal(host.handles.choose.isActive(), false);
    host.cleanup();
  });

  it("pós-vitória com specs: monta times e não fica pausado", async () => {
    const host = bootRoom();
    await growTo(host, 10);
    finishWithRedWin(host);
    host.room.stopGame();
    await host.room.onGameStop();
    await settle();
    if (host.handles.choose.isActive()) {
      let guard = 0;
      while (host.handles.choose.isActive() && field(host).blue < 4 && guard++ < 8) {
        const cap = host.handles.choose.currentCaptain();
        if (!cap) break;
        await host.chat(cap, "1");
        await settle();
      }
    }
    await waitLobby(1600);
    assertLegal(host, "pós-vitória");
    assert.equal(host.handles.choose.isActive(), false);
    assert.notEqual(host.lastPause(), true);
    host.cleanup();
  });
});

describe("x4 estabilidade: filme integrado", () => {
  it("sobe, ocioso, AFK, pick com 7 specs, desce — sala estável", async () => {
    const host = bootRoom();

    // treino → 4v4
    for (let n = 1; n <= 8; n++) {
      enter(host);
      await waitLobby(n >= 7 ? 500 : 300);
      assertLegal(host, `sobe @${n}`);
    }
    await waitLobby(1600);
    assertHealthy4v4(host);

    // 7 specs na fila
    const specs = [];
    for (let i = 0; i < 7; i++) specs.push(enter(host));
    await settle();
    assert.equal(field(host).spec, 7);

    // ocioso com 7 specs: capitão escolhe (não auto)
    const idle1 = host.players.find((p) => p.team === TEAM.RED);
    await idleToAfk(host, idle1);
    if (host.handles.choose.isReplacement()) {
      await pickReplacement(host);
    }
    assertHealthy4v4(host);

    // 6 AFK + 1 ativo na fila: próxima saída auto
    const fila = host.players.filter(
      (p) => p.team === TEAM.SPEC && !host.handles.afk.isAfk(p.id)
    );
    const ativo = fila[fila.length - 1];
    for (const s of fila) {
      if (s.id !== ativo.id) host.handles.afk.setAfk(host.find(s.id), true);
    }
    host.quit(host.players.find((p) => p.team === TEAM.BLUE));
    await waitLobby();
    assert.equal(host.find(ativo.id).team, TEAM.BLUE);
    assertHealthy4v4(host);

    // !afk no spec não pausa
    const specAtivo = host.players.find(
      (p) => p.team === TEAM.SPEC && !host.handles.afk.isAfk(p.id)
    );
    if (specAtivo) {
      const scores = host.live();
      await host.chat(specAtivo, "!afk");
      await settle();
      assertHealthy4v4(host);
      assert.equal(host.live(), scores);
    }

    // desce gradualmente
    while (host.players.length > 6) {
      const spec = host.players.find((p) => p.team === TEAM.SPEC);
      host.quit(spec || host.players[host.players.length - 1]);
      await waitLobby(400);
      assertLegal(host, `restam ${host.players.length}`);
    }

    host.handles.refreshLobby();
    await waitLobby(1200);
    assert.ok(host.players.length <= 6);
    assertLegal(host, "encolheu");
    host.cleanup();
  });

  it("4v4 ao vivo: blue 3, 6 specs (5 AFK) — auto sem pick", async () => {
    const host = bootRoom();
    for (let i = 0; i < 4; i++) host.addPlayer(TEAM.RED);
    for (let i = 0; i < 3; i++) host.addPlayer(TEAM.BLUE);
    const specs = [];
    for (let i = 0; i < 6; i++) specs.push(host.addPlayer(TEAM.SPEC));
    host.startMatch({ competitive: true });
    for (const s of specs.slice(1)) host.handles.afk.setAfk(host.find(s.id), true);
    await settle();

    host.handles.choose.startReplacement(TEAM.BLUE, () => {});
    await settle();

    assert.equal(host.find(specs[0].id).team, TEAM.BLUE);
    assert.equal(host.teamCount(TEAM.BLUE), 4);
    assert.equal(host.handles.choose.isActive(), false);
    host.cleanup();
  });
});

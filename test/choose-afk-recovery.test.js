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
  touchField,
  TEAM,
} = require("./helpers/lobbyAssert");

async function afkPlayers(host, players) {
  for (const p of players) {
    await host.chat(p, "!afk");
    await settle();
    assert.equal(host.handles.afk.isAfk(p.id), true, `${p.name} AFK`);
  }
}

async function startOfficial4v4(host, extraSpec = 0) {
  const fieldPlayers = fill4v4(host);
  for (let i = 0; i < extraSpec; i++) host.addPlayer(TEAM.SPEC);
  host.startMatch({ competitive: true });
  for (const p of fieldPlayers) host.activity(p);
  await settle();
  assert.ok(host.live(), "4v4 ao vivo");
  assert.equal(host.handles.match.isCompetitive(), true);
  return fieldPlayers;
}

describe("choose + AFK: reposição ao vivo sem spec elegível", () => {
  it("4v4: sai blue, 3 specs AFK → desce 3v3 sem choose preso", async () => {
    const host = bootRoom();
    await startOfficial4v4(host, 3);
    const specs = host.players.filter((p) => p.team === TEAM.SPEC);
    await afkPlayers(host, specs);
    const scores = host.live();

    host.quit(host.players.find((p) => p.team === TEAM.BLUE));
    await waitLobby(1200);

    assert.equal(host.handles.choose.isReplacement(), false, "choose fechou");
    assertNvN(host, 3, 1, "desceu pra 3v3 + extra no spec");
    assert.equal(host.live(), scores, "jogo segue ao vivo");
    assert.notEqual(host.lastPause(), true, "sem pausa presa");
    host.cleanup();
  });

  it("4v4: reposição aberta, specs viram AFK → cancela pick e equilibra", async () => {
    const host = bootRoom();
    await startOfficial4v4(host, 3);
    const specs = host.players.filter((p) => p.team === TEAM.SPEC);

    host.quit(host.players.find((p) => p.team === TEAM.BLUE));
    await waitLobby(800);
    assert.equal(host.handles.choose.isReplacement(), true, "pick aberto com 3 specs");

    for (const spec of specs) host.handles.afk.setAfk(host.find(spec.id), true);
    host.handles.refreshLobby();
    await waitLobby(1200);

    assert.equal(host.handles.choose.isReplacement(), false, "choose soltou");
    assertNvN(host, 3, 1, "3v3 após AFK no spec");
    assert.notEqual(host.lastPause(), true, "sem pausa presa");
    host.cleanup();
  });

  it("4v4: sai red, só specs AFK → desce extra do vermelho", async () => {
    const host = bootRoom();
    await startOfficial4v4(host, 2);
    const specs = host.players.filter((p) => p.team === TEAM.SPEC);
    await afkPlayers(host, specs);

    host.quit(host.players.find((p) => p.team === TEAM.RED));
    await waitLobby(1200);

    const f = field(host);
    assert.equal(f.red, f.blue, "times iguais");
    assert.ok(f.red <= 3 && f.blue <= 3, "desceu formato");
    assert.equal(host.handles.choose.isActive(), false);
    host.cleanup();
  });

  it("4v4: 1 spec ativo → puxa automático e volta 4v4", async () => {
    const host = bootRoom();
    await startOfficial4v4(host, 1);
    const unico = host.players.find((p) => p.team === TEAM.SPEC);

    host.quit(host.players.find((p) => p.team === TEAM.BLUE));
    await waitLobby(800);
    assert.equal(host.handles.choose.isReplacement(), false, "1 vaga e 1 spec → auto");
    assert.equal(host.find(unico.id).team, TEAM.BLUE);
    assertNvN(host, 4, 0, "4v4 restaurado");
    assert.equal(host.handles.choose.isActive(), false);
    assert.notEqual(host.lastPause(), true);
    host.cleanup();
  });
});

describe("choose + AFK: warmup / montagem 4v4", () => {
  it("choose: red 3 blue 3, 1 spec → capitão picka e refresh equilibra", async () => {
    const host = bootRoom();
    for (let i = 0; i < 3; i++) host.addPlayer(TEAM.RED);
    for (let i = 0; i < 3; i++) host.addPlayer(TEAM.BLUE);
    host.addPlayer(TEAM.SPEC);
    host.handles.choose.continueFromField();
    await waitLobby(400);

    if (host.handles.choose.isActive()) {
      const cap = host.handles.choose.currentCaptain();
      assert.ok(cap);
      await host.chat(cap, "1");
      await waitLobby(400);
    }

    const f = field(host);
    assert.ok(f.red >= 3 && f.blue >= 3, "montou pelo menos 3v3");
    host.handles.refreshLobby();
    await waitLobby(600);
    const after = field(host);
    assert.equal(after.red, after.blue, "times equilibrados");
    host.cleanup();
  });

  it("choose: specs AFK durante pick → aborta e refreshLobby", async () => {
    const host = bootRoom();
    for (let i = 0; i < 4; i++) host.addPlayer(TEAM.RED);
    host.addPlayer(TEAM.BLUE);
    for (let i = 0; i < 4; i++) host.addPlayer(TEAM.SPEC);
    host.handles.choose.continueFromField();
    await settle();

    for (const p of host.players.filter((x) => x.team === TEAM.SPEC)) {
      host.handles.afk.noteAfk(p.id);
    }
    host.handles.refreshLobby();
    await waitLobby(800);

    assert.equal(host.handles.choose.isActive(), false);
    const f = field(host);
    assert.equal(f.red, f.blue, "times equilibrados");
    host.cleanup();
  });

  it("warmup: red 4 blue 3, specs só AFK → planWarmup desce 3v3", async () => {
    const host = bootRoom();
    for (let i = 0; i < 4; i++) host.addPlayer(TEAM.RED);
    for (let i = 0; i < 3; i++) host.addPlayer(TEAM.BLUE);
    for (let i = 0; i < 3; i++) host.addPlayer(TEAM.SPEC);
    for (const p of host.players.filter((x) => x.team === TEAM.SPEC)) {
      host.handles.afk.noteAfk(p.id);
    }
    host.handles.refreshLobby();
    await waitLobby(800);

    const f = field(host);
    assert.equal(f.red, 3, "desceu vermelho");
    assert.equal(f.blue, 3, "azul mantido");
    assert.equal(host.handles.choose.isActive(), false);
    host.cleanup();
  });
});

describe("choose + AFK: filme longo", () => {
  it("sobe 1→12 com !afk espalhado, desce com saídas e specs AFK", async () => {
    const host = bootRoom();

    for (let n = 1; n <= 12; n++) {
      enter(host);
      await waitLobby(n === 8 ? 1400 : 350);

      if (n === 5) {
        const spec = host.players.find((x) => x.team === TEAM.SPEC);
        if (spec) await host.chat(spec, "!afk");
      }
      if (n === 9) {
        const specs = host.players.filter((x) => x.team === TEAM.SPEC);
        if (specs[0]) await host.chat(specs[0], "!afk");
      }
      assertLegal(host, `@${n}`);
    }

    assertHealthy4v4(host, "fechou 12");

    const leaveOrder = [...host.players].reverse();
    for (const p of leaveOrder) {
      if (p.team === TEAM.SPEC) {
        await host.chat(p, "!afk");
        await settle();
      }
      host.quit(p);
      await waitLobby(600);
      if (!host.handles.choose.isReplacement()) {
        assertLegal(host, `restam ${host.players.length}`);
      }
    }

    host.cleanup();
  });

  it("4v4 ao vivo: alterna saída, AFK no spec, entrada e recovery", async () => {
    const host = bootRoom();
    await startOfficial4v4(host, 3);
    const scores = host.live();

    const specs = host.players.filter((p) => p.team === TEAM.SPEC);
    for (const p of specs) {
      await host.chat(p, "!afk");
      await settle();
    }

    host.quit(host.players.find((p) => p.team === TEAM.BLUE));
    await waitLobby(1200);

    assertNvN(host, 3, 1, "desceu 4v3→3v3 com specs AFK");
    assert.equal(host.live(), scores);
    assert.equal(host.handles.choose.isReplacement(), false);

    for (const p of host.players.filter((x) => x.team === TEAM.SPEC)) {
      host.handles.afk.noteAfk(p.id);
    }
    host.handles.refreshLobby();
    await waitLobby(800);

    enter(host);
    await waitLobby(500);
    assert.ok(field(host).spec >= 1);

    host.cleanup();
  });

  it("capitão mutado picka número na reposição com spec ativo", async () => {
    const host = bootRoom();
    await startOfficial4v4(host, 2);

    host.quit(host.players.find((p) => p.team === TEAM.RED));
    await waitLobby(800);
    const cap = host.handles.choose.currentCaptain();
    assert.ok(cap);
    host.handles.mutes.set(cap.id, { endsAt: Date.now() + 60_000, reason: "test" });

    await host.chat(cap, "1");
    await waitLobby(600);
    assertNvN(host, 4, 1, "4v4 + 1 spec na fila");
    assert.equal(host.handles.choose.isActive(), false);
    host.cleanup();
  });

  it("filme AFK: várias reposições seguidas com specs mistos", async () => {
    const host = bootRoom();
    await startOfficial4v4(host, 2);

    for (let round = 0; round < 3; round++) {
      const leaving = host.players.find((p) => p.team === (round % 2 ? TEAM.BLUE : TEAM.RED));
      host.quit(leaving);
      await waitLobby(900);

      const specs = host.players.filter((p) => p.team === TEAM.SPEC);
      if (specs[0] && round === 1) {
        await host.chat(specs[0], "!afk");
        await waitLobby(900);
      }

      if (host.handles.choose.isReplacement()) {
        const ready = host.handles.choose.list().specReady;
        if (ready.length) {
          await pickReplacement(host);
          await waitLobby(600);
        } else {
          host.handles.refreshLobby();
          await waitLobby(900);
        }
      }

      const f = field(host);
      assert.equal(f.red, f.blue, `round ${round}: times iguais`);
      assert.ok(f.red >= 2 && f.red <= 4, `round ${round}: formato legal`);
      assert.equal(host.handles.choose.isReplacement(), false, `round ${round}: sem choose preso`);
    }

    host.cleanup();
  });
});

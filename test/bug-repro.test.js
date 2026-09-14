const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const config = require("../src/config");
const {
  bootRoom,
  settle,
  endOfficialMatch,
  TEAM,
} = require("./helpers/roomHost");

const waitLobby = () => new Promise((r) => setTimeout(r, 1400));

function field(host) {
  const elig = host.players.filter((p) => !host.handles.afk.isAfk(p.id));
  return {
    red: elig.filter((p) => p.team === TEAM.RED).length,
    blue: elig.filter((p) => p.team === TEAM.BLUE).length,
    spec: elig.filter((p) => p.team === TEAM.SPEC).length,
    n: elig.length,
  };
}

async function boot3v3(extraSpec = 0, { refreshSpecs = true } = {}) {
  const host = bootRoom();
  for (let i = 0; i < 6; i++) host.addPlayer(TEAM.SPEC);
  host.handles.refreshLobby();
  await waitLobby();
  assert.equal(field(host).red, 3);
  assert.equal(field(host).blue, 3);
  assert.ok(host.live(), "3v3 ao vivo");
  for (let i = 0; i < extraSpec; i++) {
    host.addPlayer(TEAM.SPEC);
    if (refreshSpecs) host.handles.refreshLobby();
  }
  if (extraSpec && refreshSpecs) await waitLobby();
  return host;
}

async function boot4v4WithSpec(extraSpec = 1) {
  const host = bootRoom();
  for (let i = 0; i < 8 + extraSpec; i++) {
    host.addPlayer(TEAM.SPEC);
    host.handles.refreshLobby();
    await settle();
  }
  await waitLobby();
  assert.equal(field(host).red, 4);
  assert.equal(field(host).blue, 4);
  assert.equal(host.handles.match.isCompetitive(), true);
  return host;
}

function finishWithRedWin(host) {
  const scores = host.live();
  assert.ok(scores, "partida ao vivo");
  scores.red = config.scoreLimit;
  scores.blue = 1;
  host.handles.match.markVictory();
}

describe("repro bugs reportados", () => {
  it("3v3 acaba com 2 specs parados (sem refresh no meio) → RR e 4v4", async () => {
    const host = await boot3v3(2, { refreshSpecs: false });
    assert.equal(field(host).n, 8);
    assert.equal(field(host).spec, 2);

    finishWithRedWin(host);
    host.room.stopGame();
    await host.room.onGameStop();
    await waitLobby();

    const f = field(host);
    assert.equal(f.red, 4);
    assert.equal(f.blue, 4);
    assert.equal(f.spec, 0);
    assert.equal(host.handles.match.isCompetitive(), true);
    assert.ok(host.live());
    host.cleanup();
  });

  it("3v3 ao vivo + 2 specs entram → promove para 4v4 sem esperar fim", async () => {
    const host = await boot3v3(0);
    const scores = host.live();
    host.addPlayer(TEAM.SPEC);
    host.handles.refreshLobby();
    await settle();
    host.addPlayer(TEAM.SPEC);
    host.handles.refreshLobby();
    await waitLobby();

    assert.equal(field(host).red, 4);
    assert.equal(field(host).blue, 4);
    assert.equal(host.handles.match.isCompetitive(), true);
    assert.notEqual(host.live(), scores);
    host.cleanup();
  });

  it("4v4 acaba com 1 spec → capitão picka", async () => {
    const host = await boot4v4WithSpec(1);
    finishWithRedWin(host);
    host.room.stopGame();
    await host.room.onGameStop();
    await settle();

    assert.equal(host.handles.choose.isActive(), true);
    assert.ok(host.handles.choose.currentCaptain());
    assert.equal(field(host).red, 4);
    assert.ok(field(host).blue < 4);
    host.cleanup();
  });

  it("4v4 acaba com 2 specs → capitão azul picka", async () => {
    const host = await boot4v4WithSpec(2);
    finishWithRedWin(host);
    host.room.stopGame();
    await host.room.onGameStop();
    await settle();

    assert.equal(host.handles.choose.isActive(), true);
    assert.equal(host.handles.choose.currentCaptain()?.team, TEAM.BLUE);
    host.cleanup();
  });

  it("4v4 para sem vitória + spec → inicia o 4v4 e a fila espera", async () => {
    const host = await boot4v4WithSpec(1);
    host.room.stopGame();
    await host.room.onGameStop();
    await waitLobby();

    assert.equal(field(host).red, 4);
    assert.equal(field(host).blue, 4);
    assert.equal(field(host).spec, 1);
    assert.equal(host.handles.choose.isActive(), false);
    assert.ok(host.live(), "4v4 recomeça; spec continua na fila");
    assert.equal(host.handles.match.isCompetitive(), true);

    host.handles.refreshLobby();
    host.handles.refreshLobby();
    await settle();
    assert.ok(host.live(), "refresh extra não mata o 4v4 já iniciado");
    assert.equal(field(host).spec, 1);
    host.cleanup();
  });

  it("4v4 acaba com spec só AFK → não fica 4v0; sobe capitão ou remonta", async () => {
    const host = await boot4v4WithSpec(3);
    for (const p of host.players.filter((x) => x.team === TEAM.SPEC)) {
      host.handles.afk.setAfk(p, true);
    }
    await settle();
    assert.equal(field(host).red, 4);
    assert.equal(field(host).blue, 4);
    assert.equal(field(host).spec, 0);

    finishWithRedWin(host);
    host.room.stopGame();
    await host.room.onGameStop();
    await waitLobby();

    const f = field(host);
    assert.notEqual(f.blue, 0, "não pode ficar sem azul");
    assert.ok(f.red === f.blue, `times iguais, got ${f.red}v${f.blue}`);
    assert.ok(
      host.live() || host.handles.choose.isActive(),
      "inicia o jogo ou abre choose"
    );
    host.cleanup();
  });

  it("4 vermelhos + spec AFK (ninguém no azul) → parte 2v2 e inicia", async () => {
    const host = bootRoom();
    for (let i = 0; i < 4; i++) host.addPlayer(TEAM.RED);
    for (let i = 0; i < 4; i++) {
      const p = host.addPlayer(TEAM.SPEC);
      host.handles.afk.setAfk(p, true);
    }
    host.handles.refreshLobby();
    await waitLobby();

    const f = field(host);
    assert.equal(f.red, 2, "puxa 2 do vermelho pro azul");
    assert.equal(f.blue, 2);
    assert.equal(f.spec, 0);
    assert.ok(host.live(), "2v2 começa");
    assert.equal(host.handles.choose.isActive(), false);
    host.cleanup();
  });

  it("4 vermelhos + 2 specs ativos → 3v3, não trava 4v0", async () => {
    const host = bootRoom();
    for (let i = 0; i < 4; i++) host.addPlayer(TEAM.RED);
    host.addPlayer(TEAM.SPEC);
    host.addPlayer(TEAM.SPEC);
    host.handles.refreshLobby();
    await waitLobby();

    const f = field(host);
    assert.equal(f.red, 3);
    assert.equal(f.blue, 3);
    assert.ok(host.live() || host.handles.choose.isActive());
    host.cleanup();
  });

  it("4v4 3x1 vencedor sai → para o jogo, não trava 3v4 sem choose", async () => {
    const host = await boot4v4WithSpec(1);
    const scores = host.live();
    scores.red = config.scoreLimit;
    scores.blue = 1;
    const winner = host.players.find((p) => p.team === TEAM.RED);
    host.quit(winner);
    await new Promise((r) => setTimeout(r, 250));

    assert.equal(host.handles.choose.isReplacement(), false);
    assert.equal(host.live(), null, "jogo parou em vez de ficar 3v4");

    await host.room.onGameStop();
    await waitLobby();

    assert.ok(
      host.live() || host.handles.choose.isActive(),
      "remontou ou abriu choose depois do apito"
    );
    const f = field(host);
    assert.ok(f.red === f.blue || host.handles.choose.isActive(), `times iguais ou pick, got ${f.red}v${f.blue}`);
    host.cleanup();
  });

  it("4v4 3x1 sem spec, vencedor sai → para o jogo, não loopa recover", async () => {
    const host = bootRoom();
    for (let i = 0; i < 8; i++) {
      host.addPlayer(TEAM.SPEC);
      host.handles.refreshLobby();
      await settle();
    }
    await waitLobby();
    assert.equal(field(host).red, 4);
    assert.equal(field(host).blue, 4);
    assert.equal(field(host).spec, 0);

    const scores = host.live();
    scores.red = config.scoreLimit;
    scores.blue = 1;
    const winner = host.players.find((p) => p.team === TEAM.RED);
    host.quit(winner);
    await new Promise((r) => setTimeout(r, 250));

    assert.equal(host.live(), null, "jogo parou");
    assert.equal(host.handles.choose.isReplacement(), false);

    await host.room.onGameStop();
    await waitLobby();
    assert.ok(
      host.live() || host.handles.choose.isActive() || field(host).red === field(host).blue,
      "não ficou 3v4 vivo preso"
    );
    host.cleanup();
  });

  it("3v3 acaba com 7 (1 spec) → winner stays + capitão", async () => {
    const host = await boot3v3(1);
    finishWithRedWin(host);
    host.room.stopGame();
    await host.room.onGameStop();
    await settle();

    assert.equal(host.handles.choose.isActive(), true);
    assert.ok(host.handles.choose.currentCaptain());
    assert.equal(field(host).red, 3);
    assert.equal(field(host).blue, 1);
    host.cleanup();
  });
});

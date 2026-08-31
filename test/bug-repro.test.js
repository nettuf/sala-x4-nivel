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

  it("4v4 para sem vitória + spec → não relança por cima da fila", async () => {
    const host = await boot4v4WithSpec(1);
    host.room.stopGame();
    await host.room.onGameStop();
    await waitLobby();

    assert.equal(field(host).red, 4);
    assert.equal(field(host).blue, 4);
    assert.equal(field(host).spec, 1);
    assert.equal(host.handles.choose.isActive(), false);
    assert.equal(host.live(), null, "não reinicia 4v4 ignorando o spec");
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

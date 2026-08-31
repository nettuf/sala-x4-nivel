const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const config = require("../src/config");
const { bootRoom, TEAM } = require("./helpers/roomHost");
const {
  waitLobby,
  settle,
  field,
  growTo,
  assertNvN,
  finishWithRedWin,
} = require("./helpers/lobbyAssert");

function finishWithBlueWin(host) {
  const scores = host.live();
  assert.ok(scores);
  scores.red = 1;
  scores.blue = config.scoreLimit;
  host.handles.match.markVictory();
}

async function endMatch(host) {
  host.room.stopGame();
  await host.room.onGameStop();
  await settle();
  await waitLobby(800);
}

describe("sem spec: winner stays", () => {
  it("2v2 vermelho ganha → vermelhos ficam, azuis descem e remonta 2v2", async () => {
    const host = bootRoom();
    await growTo(host, 4);
    const redIds = host.players.filter((p) => p.team === TEAM.RED).map((p) => p.id);
    assert.equal(field(host).spec, 0);
    finishWithRedWin(host);
    await endMatch(host);

    for (const id of redIds) {
      assert.equal(host.find(id).team, TEAM.RED, "vencedor vermelho fica");
    }
    assert.equal(field(host).red, 2);
    assert.equal(field(host).blue, 2);
    assert.equal(field(host).spec, 0);
    assert.ok(host.live(), "próximo 2v2 inicia");
    host.cleanup();
  });

  it("2v2 azul ganha → azuis vão pro vermelho", async () => {
    const host = bootRoom();
    await growTo(host, 4);
    const blueIds = host.players.filter((p) => p.team === TEAM.BLUE).map((p) => p.id);
    finishWithBlueWin(host);
    await endMatch(host);

    for (const id of blueIds) {
      assert.equal(host.find(id).team, TEAM.RED, "vencedor azul vira vermelho");
    }
    assert.equal(field(host).red, 2);
    assert.equal(field(host).blue, 2);
    host.cleanup();
  });

  it("3v3 vermelho ganha → mantém 3v3 sem spec", async () => {
    const host = bootRoom();
    await growTo(host, 6);
    const redIds = host.players.filter((p) => p.team === TEAM.RED).map((p) => p.id);
    finishWithRedWin(host);
    await endMatch(host);

    for (const id of redIds) {
      assert.equal(host.find(id).team, TEAM.RED);
    }
    assertNvN(host, 3);
    assert.equal(field(host).spec, 0);
    assert.ok(host.live());
    host.cleanup();
  });

  it("3v3 azul ganha → azuis no vermelho", async () => {
    const host = bootRoom();
    await growTo(host, 6);
    const blueIds = host.players.filter((p) => p.team === TEAM.BLUE).map((p) => p.id);
    finishWithBlueWin(host);
    await endMatch(host);

    for (const id of blueIds) {
      assert.equal(host.find(id).team, TEAM.RED);
    }
    assertNvN(host, 3);
    host.cleanup();
  });

  it("4v4 vermelho ganha (8 sem spec) → 4v4 remonta, vermelhos ficam", async () => {
    const host = bootRoom();
    await growTo(host, 8);
    await waitLobby(1600);
    const redIds = host.players.filter((p) => p.team === TEAM.RED).map((p) => p.id);
    assert.equal(field(host).spec, 0);
    finishWithRedWin(host);
    await endMatch(host);

    for (const id of redIds) {
      assert.equal(host.find(id).team, TEAM.RED);
    }
    assertNvN(host, 4);
    assert.equal(field(host).spec, 0);
    assert.equal(host.handles.match.isCompetitive(), true);
    assert.ok(host.live());
    host.cleanup();
  });
});

describe("sem spec: saída desce extra do time maior", () => {
  it("2v2 sai um → 1v1 + extra no spec", async () => {
    const host = bootRoom();
    await growTo(host, 4);
    const scores = host.live();
    host.quit(host.players.find((p) => p.team === TEAM.RED));
    await waitLobby();
    assertNvN(host, 1, 1);
    assert.equal(host.live(), scores, "sem RR");
    host.cleanup();
  });

  it("3v3 sai um → 2v2 + 1 no spec", async () => {
    const host = bootRoom();
    await growTo(host, 6);
    const scores = host.live();
    host.quit(host.players.find((p) => p.team === TEAM.BLUE));
    await waitLobby();
    assertNvN(host, 2, 1);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("4v4 sem spec sai um → 3v3 + extra no spec", async () => {
    const host = bootRoom();
    await growTo(host, 8);
    await waitLobby(1600);
    const scores = host.live();
    host.quit(host.players.find((p) => p.team === TEAM.RED));
    await waitLobby();
    assertNvN(host, 3, 1);
    assert.equal(host.live(), scores);
    assert.equal(host.handles.match.isCompetitive(), false);
    host.cleanup();
  });
});

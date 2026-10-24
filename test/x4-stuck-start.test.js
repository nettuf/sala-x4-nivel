const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { bootRoom, TEAM } = require("./helpers/roomHost");

const waitStart = () => new Promise((resolve) => setTimeout(resolve, 500));

function counts(host) {
  const eligible = host.players.filter((player) => !host.handles.afk.isAfk(player.id));
  return {
    red: eligible.filter((player) => player.team === TEAM.RED).length,
    blue: eligible.filter((player) => player.team === TEAM.BLUE).length,
    spec: eligible.filter((player) => player.team === TEAM.SPEC).length,
  };
}

describe("x4 parado com os dois lados cheios tem que apitar", () => {
  it("5v4 desce o extra e inicia 4v4", async () => {
    const host = bootRoom();
    for (let n = 0; n < 5; n += 1) host.addPlayer(TEAM.RED);
    for (let n = 0; n < 4; n += 1) host.addPlayer(TEAM.BLUE);

    host.handles.refreshLobby();
    await waitStart();

    const field = counts(host);
    assert.equal(field.red, 4, "vermelho");
    assert.equal(field.blue, 4, "azul");
    assert.equal(field.spec, 1, "extra no spec");
    assert.ok(host.live(), "jogo iniciado");
    assert.equal(host.handles.match.isCompetitive(), true);
    host.cleanup();
  });

  it("4v4 já montado inicia sem choose", async () => {
    const host = bootRoom();
    for (let n = 0; n < 4; n += 1) host.addPlayer(TEAM.RED);
    for (let n = 0; n < 4; n += 1) host.addPlayer(TEAM.BLUE);

    host.handles.refreshLobby();
    await waitStart();

    const field = counts(host);
    assert.equal(field.red, 4);
    assert.equal(field.blue, 4);
    assert.equal(field.spec, 0);
    assert.ok(host.live(), "jogo iniciado");
    assert.equal(host.handles.choose.isActive(), false);
    host.cleanup();
  });

  it("entrada com o jogo parado e o 4v4 torto não fica sem apito", async () => {
    const host = bootRoom();
    for (let n = 0; n < 5; n += 1) host.addPlayer(TEAM.RED);
    for (let n = 0; n < 4; n += 1) host.addPlayer(TEAM.BLUE);
    const joiner = host.addPlayer(TEAM.SPEC);
    host.room.onPlayerJoin(joiner);
    await waitStart();

    assert.ok(host.live(), "entrada tinha que puxar o jogo");
    const field = counts(host);
    assert.equal(field.red, 4);
    assert.equal(field.blue, 4);
    assert.ok(field.spec >= 1);
    host.cleanup();
  });
});

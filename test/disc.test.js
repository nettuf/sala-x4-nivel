const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  placeMidgameDisc,
  scheduleMidgameDisc,
  halfFieldX,
  spawnProps,
  preferredSpecSide,
} = require("../src/room/disc");

describe("disc", () => {
  it("meio-campo vermelho no x4 (entre gol e centro)", () => {
    assert.equal(halfFieldX("x4", 1), -350);
    assert.deepEqual(spawnProps("x4", 1), { x: -350, y: 0, xspeed: 0, yspeed: 0 });
  });

  it("meio-campo azul no x4", () => {
    assert.equal(halfFieldX("x4", 2), 350);
  });

  it("escala no x3", () => {
    assert.equal(halfFieldX("x3", 1), -268);
  });

  it("coloca spec no lado com menos gente em campo", () => {
    const calls = [];
    const room = {
      getPlayer: (id) => ({ id, team: 0 }),
      getPlayerList: () => [
        { id: 1, team: 1 },
        { id: 2, team: 1 },
        { id: 3, team: 2 },
      ],
      setPlayerDiscProperties: (id, props) => calls.push({ id, props }),
    };
    assert.equal(preferredSpecSide(room), 2);
    assert.equal(placeMidgameDisc(room, 9, "x4"), true);
    assert.deepEqual(calls[0].props.x, 350);
  });

  it("coloca jogador de time no próprio meio-campo", () => {
    const calls = [];
    const room = {
      getPlayer: () => ({ id: 4, team: 1 }),
      setPlayerDiscProperties: (id, props) => calls.push({ id, props }),
    };
    placeMidgameDisc(room, 4, "x4");
    assert.deepEqual(calls, [{ id: 4, props: { x: -350, y: 0, xspeed: 0, yspeed: 0 } }]);
  });

  it("scheduleMidgameDisc chama depois do delay", async () => {
    const calls = [];
    const room = {
      getPlayer: () => ({ id: 5, team: 2 }),
      setPlayerDiscProperties: (id, props) => calls.push({ id, props }),
    };
    scheduleMidgameDisc(room, 5, "x4", 10);
    assert.equal(calls.length, 0);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls[0].props.x, 350);
  });
});

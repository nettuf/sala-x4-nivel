const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { playerStatusUrl, uniqueAuths, fetchPlayerSiteStatus, gameIsLive } = require("../src/haxbook/playerStatus");

const STATS_URL = "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/stats";

describe("playerStatus", () => {
  it("troca /stats por /player-status", () => {
    assert.equal(
      playerStatusUrl(STATS_URL),
      "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/player-status"
    );
  });

  it("deduplica auths e respeita o teto do back", () => {
    assert.deepEqual(uniqueAuths([" a ", "a", "", "b"]), ["a", "b"]);
    assert.equal(uniqueAuths(Array.from({ length: 50 }, (_, i) => `a${i}`)).length, 40);
  });

  it("consulta o back em lote no contrato { auths } / players", async () => {
    const fetchImpl = async (url, opts) => {
      assert.match(String(url), /\/player-status$/);
      assert.equal(opts.method, "POST");
      assert.equal(opts.headers["Content-Type"], "application/json");
      assert.equal(opts.headers["X-API-Key"], "key");
      assert.deepEqual(JSON.parse(opts.body), { auths: ["abc"] });
      assert.ok(opts.signal, "timeout de 8s para a API não prender o bot");
      return {
        ok: true,
        json: async () => ({ players: { abc: { vip: true, booster: false } } }),
      };
    };
    const result = await fetchPlayerSiteStatus({
      statsUrl: STATS_URL,
      apiKey: "key",
      auths: ["abc"],
      fetchImpl,
    });
    assert.equal(result.ok, true);
    assert.equal(result.players.abc.vip, true);
    assert.equal(result.players.abc.booster, false);
  });

  it("rede lenta ou API fora não explode e não inventa cargo", async () => {
    const result = await fetchPlayerSiteStatus({
      statsUrl: STATS_URL,
      apiKey: "key",
      auths: ["abc"],
      fetchImpl: async () => {
        throw new Error("timeout");
      },
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.players, {});
  });

  it("sem url, chave ou auth não chama fetch", async () => {
    let called = 0;
    const fetchImpl = async () => {
      called += 1;
      return { ok: true, json: async () => ({}) };
    };
    await fetchPlayerSiteStatus({ fetchImpl });
    await fetchPlayerSiteStatus({ statsUrl: STATS_URL, apiKey: "key", auths: [], fetchImpl });
    assert.equal(called, 0);
  });

  it("jogo andando não sincroniza", () => {
    assert.equal(gameIsLive({ getScores: () => ({}) }, { isRunning: () => false }), true);
    assert.equal(gameIsLive({ getScores: () => null }, { isRunning: () => true }), true);
    assert.equal(gameIsLive({ getScores: () => null }, { isRunning: () => false }), false);
  });

  it("tick e sampleField não falam com o site", () => {
    const roomSrc = fs.readFileSync(path.join(__dirname, "../src/room/createRoom.js"), "utf8");
    const tick = roomSrc.split("room.onGameTick")[1]?.split("room.onGameStop")[0] || "";
    assert.ok(tick.length > 20);
    assert.equal(tick.includes("syncSiteStatus"), false);
    assert.equal(tick.includes("fetchPlayerSiteStatus"), false);
    assert.equal(tick.includes("player-status"), false);

    const matchSrc = fs.readFileSync(path.join(__dirname, "../src/room/match.js"), "utf8");
    assert.equal(matchSrc.includes("fetchPlayerSiteStatus"), false);
    assert.equal(matchSrc.includes("player-status"), false);
  });

  it("join não segura o lobby esperando o site", () => {
    const roomSrc = fs.readFileSync(path.join(__dirname, "../src/room/createRoom.js"), "utf8");
    const join = roomSrc.split("room.onPlayerJoin")[1]?.split("const pendingLeaves")[0] || "";
    const refreshAt = join.indexOf("refreshLobby()");
    const syncAt = join.indexOf("syncSiteStatus");
    assert.ok(refreshAt >= 0 && syncAt > refreshAt);
  });
});

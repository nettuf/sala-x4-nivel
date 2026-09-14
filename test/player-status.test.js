const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { playerStatusUrl, uniqueAuths, fetchPlayerSiteStatus, gameIsLive } = require("../src/haxbook/playerStatus");

describe("playerStatus", () => {
  it("troca /stats por /player-status", () => {
    assert.equal(
      playerStatusUrl("https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/stats"),
      "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/player-status"
    );
  });

  it("deduplica auths e respeita o teto", () => {
    assert.deepEqual(uniqueAuths([" a ", "a", "", "b"]), ["a", "b"]);
    assert.equal(uniqueAuths(Array.from({ length: 50 }, (_, i) => `a${i}`)).length, 40);
  });

  it("consulta o back em lote", async () => {
    const fetchImpl = async (url, opts) => {
      assert.match(String(url), /\/player-status$/);
      assert.equal(opts.method, "POST");
      assert.equal(opts.headers["X-API-Key"], "key");
      assert.deepEqual(JSON.parse(opts.body), { auths: ["abc"] });
      return {
        ok: true,
        json: async () => ({ players: { abc: { vip: true, booster: false } } }),
      };
    };
    const result = await fetchPlayerSiteStatus({
      statsUrl: "https://api.example/stats",
      apiKey: "key",
      auths: ["abc"],
      fetchImpl,
    });
    assert.equal(result.ok, true);
    assert.equal(result.players.abc.vip, true);
  });

  it("jogo andando não sincroniza", () => {
    assert.equal(gameIsLive({ getScores: () => ({}) }, { isRunning: () => false }), true);
    assert.equal(gameIsLive({ getScores: () => null }, { isRunning: () => true }), true);
    assert.equal(gameIsLive({ getScores: () => null }, { isRunning: () => false }), false);
  });
});

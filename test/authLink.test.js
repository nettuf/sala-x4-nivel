const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { authLinkUrl, normalizeLinkCode, linkHaxballAuth } = require("../src/haxbook/authLink");

describe("vinculação da auth HaxBall", () => {
  it("deriva a URL de vinculação e normaliza o código", () => {
    assert.equal(
      authLinkUrl("https://api.haxbook.com/api/webhooks/servers/s1/rooms/x4/stats"),
      "https://api.haxbook.com/api/webhooks/servers/s1/rooms/x4/haxball-auth/link"
    );
    assert.equal(normalizeLinkCode(" ab-12 cd "), "AB12CD");
  });

  it("envia API key, auth real e nickname no corpo", async () => {
    let request;
    const result = await linkHaxballAuth({
      statsUrl: "https://api.haxbook.com/api/webhooks/servers/s1/rooms/x4/stats",
      apiKey: "secret",
      code: "ab-12",
      auth: "real-auth",
      nickname: "Jogador",
      fetchImpl: async (url, options) => {
        request = { url, options };
        return { ok: true, json: async () => ({ linked: true }) };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(request.options.headers["X-API-Key"], "secret");
    assert.deepEqual(JSON.parse(request.options.body), {
      code: "AB12",
      auth: "real-auth",
      nickname: "Jogador",
    });
  });
});

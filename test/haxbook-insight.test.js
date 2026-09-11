const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  insightUrl,
  fetchRoomInsight,
  createPostMatchInsights,
} = require("../src/haxbook/insight");

const wait = (ms = 15) => new Promise((resolve) => setTimeout(resolve, ms));

describe("insight pós-partida Haxbook", () => {
  it("deriva URL, autentica e sanitiza a mensagem", async () => {
    let request;
    const result = await fetchRoomInsight("https://api.test/rooms/x4/stats/", "secret", {
      fetch: async (url, opts) => {
        request = { url, opts };
        return {
          ok: true,
          json: async () => ({ type: "GOALS", message: "Linha 1\nLinha 2" }),
        };
      },
    });

    assert.equal(insightUrl("https://api.test/rooms/x4/stats/"), "https://api.test/rooms/x4/stats/insight");
    assert.equal(request.url, "https://api.test/rooms/x4/stats/insight");
    assert.equal(request.opts.headers["X-API-Key"], "secret");
    assert.deepEqual(result, { type: "GOALS", message: "Linha 1 Linha 2" });
  });

  it("anuncia sem bloquear a cada duas partidas oficiais", async () => {
    const announcements = [];
    const room = { sendAnnouncement: (...args) => announcements.push(args) };
    const insights = createPostMatchInsights(room, {
      statsUrl: "https://api.test/stats",
      apiKey: "secret",
      minMatches: 2,
      maxMatches: 2,
      delayMs: 0,
      random: () => 0,
      fetch: async () => ({
        ok: true,
        json: async () => ({ type: "CTA", message: "Crie sua conta" }),
      }),
    });

    assert.equal(insights.onOfficialMatch(), false);
    assert.equal(insights.onOfficialMatch(), true);
    assert.equal(announcements.length, 0, "o término não espera a consulta");
    await wait();
    assert.equal(announcements.length, 1);
    assert.match(announcements[0][0], /Haxbook · Crie sua conta/);
  });

  it("falha HTTP e ausência de API key não anunciam", async () => {
    const announcements = [];
    const room = { sendAnnouncement: (...args) => announcements.push(args) };
    const disabled = createPostMatchInsights(room, {
      statsUrl: "https://api.test/stats",
      apiKey: "",
      minMatches: 1,
    });
    assert.equal(disabled.onOfficialMatch(), false);

    const failing = createPostMatchInsights(room, {
      statsUrl: "https://api.test/stats",
      apiKey: "secret",
      minMatches: 1,
      maxMatches: 1,
      delayMs: 0,
      fetch: async () => ({ ok: false }),
    });
    assert.equal(failing.onOfficialMatch(), true);
    await wait();
    assert.equal(announcements.length, 0);
  });
});

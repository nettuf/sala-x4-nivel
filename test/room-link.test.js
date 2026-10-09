const test = require("node:test");
const assert = require("node:assert/strict");
const { deriveRoomLinkUrl, createRoomLinkSync } = require("../src/haxbook/roomLink");

test("deriva /room-link da URL de stats", () => {
  assert.equal(
    deriveRoomLinkUrl("https://api.example/servers/x/rooms/y/stats"),
    "https://api.example/servers/x/rooms/y/room-link"
  );
});

test("envia payload autenticado, faz retry e deduplica", async () => {
  const requests = [];
  const sync = createRoomLinkSync({
    statsUrl: "https://api.example/room/stats",
    apiKey: "test-key",
    retryDelayMs: 0,
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (requests.length === 1) throw new Error("offline");
      return { ok: true };
    },
  });

  assert.equal(sync.send("https://www.haxball.com/play?c=abc", "room-link"), true);
  assert.equal(sync.send("https://www.haxball.com/play?c=abc", "room-link"), false);
  assert.deepEqual(await sync.flush(), { ok: true, attempts: 2 });
  assert.equal(requests[1].url, "https://api.example/room/room-link");
  assert.equal(requests[1].options.headers["X-API-Key"], "test-key");
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    joinLink: "https://www.haxball.com/play?c=abc",
    reason: "room-link",
  });
});

test("mantém o último link pendente após falha", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const sync = createRoomLinkSync({
      url: "https://api.example/room-link",
      apiKey: "test-key",
      retryDelayMs: 0,
      pendingRetryMs: 60000,
      fetch: async () => {
        throw new Error("offline");
      },
    });
    sync.send("https://www.haxball.com/play?c=latest", "game-stop");
    assert.deepEqual(await sync.flush(), { ok: false, attempts: 2 });
    assert.deepEqual(sync.getPending(), {
      joinLink: "https://www.haxball.com/play?c=latest",
      reason: "game-stop",
    });
  } finally {
    console.warn = originalWarn;
  }
});

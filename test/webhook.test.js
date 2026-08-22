const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { notifyBan } = require("../src/discord/webhook");
const { createChatLogger, formatChatLine } = require("../src/discord/chatLog");

describe("webhook de ban", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("envia nick, auth, conn, motivo e quem baniu", async () => {
    const posts = [];
    globalThis.fetch = async (url, opts) => {
      posts.push({ url, body: JSON.parse(opts.body) });
      return { ok: true };
    };

    const ok = await notifyBan({
      nick: "Trollzao",
      auth: "auth-troll",
      conn: "aabbcc",
      ip: "1.2.3.4",
      reason: "spam",
      duration: "30m",
      endsAt: "2026-08-20T13:00:00.000Z",
      bannedBy: "Mod",
      source: "!ban",
      webhookUrl: "https://discord.example/hook",
    });

    assert.equal(ok, true);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, "https://discord.example/hook");
    assert.match(posts[0].body.content, /Trollzao/);
    assert.match(posts[0].body.content, /auth-troll/);
    assert.match(posts[0].body.content, /aabbcc/);
    assert.match(posts[0].body.content, /1\.2\.3\.4/);
    assert.match(posts[0].body.content, /spam/);
    assert.match(posts[0].body.content, /30m/);
    assert.match(posts[0].body.content, /Mod/);
    assert.match(posts[0].body.content, /!ban/);
  });

  it("sem URL não chama o Discord", async () => {
    let called = 0;
    globalThis.fetch = async () => {
      called += 1;
      return { ok: true };
    };
    const ok = await notifyBan({ nick: "X", reason: "x", webhookUrl: "" });
    assert.equal(ok, false);
    assert.equal(called, 0);
  });
});

describe("log de chat no Discord", () => {
  it("formata hora, nick e texto", () => {
    const line = formatChatLine({
      at: new Date("2026-08-20T12:53:04-03:00"),
      nick: "Netto",
      text: "eae",
      kind: "chat",
    });
    assert.match(line, /\[12:53:04\] Netto: eae/);
    assert.match(
      formatChatLine({ at: new Date("2026-08-20T12:53:04-03:00"), nick: "A", text: "oi", kind: "pv", to: "B" }),
      /A → B: oi/
    );
    assert.match(
      formatChatLine({ at: new Date("2026-08-20T12:53:04-03:00"), nick: "A", text: "bora", kind: "staff" }),
      /\[ADM\] A: bora/
    );
  });

  it("empilha e manda em lote, sem fetch a cada mensagem", async () => {
    const posts = [];
    const log = createChatLogger({
      url: "https://discord.example/chat",
      flushMs: 60_000,
      post: async (content) => {
        posts.push(content);
      },
    });
    log.push({ nick: "A", text: "um" });
    log.push({ nick: "B", text: "dois" });
    assert.equal(posts.length, 0);
    assert.equal(log.queued(), 2);
    await log.flush();
    assert.equal(posts.length, 1);
    assert.match(posts[0], /A: um/);
    assert.match(posts[0], /B: dois/);
    assert.equal(log.queued(), 0);
    log.stop();
  });
});

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createChatFloodGuard } = require("../src/room/chatFlood");

describe("flood no chat", () => {
  it("4 msgs em 5s muta 30s; 3 msgs não", () => {
    const g = createChatFloodGuard({ limit: 4, windowMs: 5000, muteMs: 30000 });
    const t0 = 1_000_000;
    assert.equal(g.note(1, t0), null);
    assert.equal(g.note(1, t0 + 1000), null);
    assert.equal(g.note(1, t0 + 2000), null);
    const hit = g.note(1, t0 + 4000);
    assert.equal(hit.muted, true);
    assert.equal(hit.endsAt, t0 + 4000 + 30000);
  });

  it("janela escorrega: msgs espaçadas não mutam", () => {
    const g = createChatFloodGuard({ limit: 4, windowMs: 5000, muteMs: 30000 });
    const t0 = 1_000_000;
    g.note(1, t0);
    g.note(1, t0 + 2000);
    g.note(1, t0 + 4000);
    assert.equal(g.note(1, t0 + 6000), null);
  });

  it("jogadores são independentes", () => {
    const g = createChatFloodGuard({ limit: 4, windowMs: 5000, muteMs: 30000 });
    const t0 = 1_000_000;
    g.note(1, t0);
    g.note(1, t0 + 1);
    g.note(1, t0 + 2);
    g.note(2, t0);
    g.note(2, t0 + 1);
    g.note(2, t0 + 2);
    assert.equal(g.note(2, t0 + 3).muted, true);
    assert.equal(g.note(1, t0 + 3).muted, true);
  });
});

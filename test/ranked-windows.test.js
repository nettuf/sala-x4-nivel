const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  activeWindow,
  upcomingWindow,
  upcomingMessage,
  startedMessage,
  rankedChatHead,
  formatTop5,
  createRankedAnnouncer,
} = require("../src/room/rankedWindows");

describe("janelas ranqueadas", () => {
  it("15:00–16:00 e 19:00–20:00 em Brasília, intervalo aberto no fim", () => {
    assert.ok(activeWindow(new Date("2026-09-15T18:00:00.000Z")));
    assert.ok(activeWindow(new Date("2026-09-15T18:59:00.000Z")));
    assert.equal(activeWindow(new Date("2026-09-15T19:00:00.000Z")), null);
    assert.ok(activeWindow(new Date("2026-09-15T22:00:00.000Z")));
    assert.equal(activeWindow(new Date("2026-09-15T23:00:00.000Z")), null);
  });

  it("aviso de 15 min só no primeiro minuto da antecedência", () => {
    assert.ok(upcomingWindow(new Date("2026-09-15T17:45:00.000Z")));
    assert.equal(upcomingWindow(new Date("2026-09-15T17:46:00.000Z")), null);
    assert.ok(upcomingWindow(new Date("2026-09-15T21:45:20.000Z")));
  });

  it("anuncia começar e em 15 min uma vez só", () => {
    const lines = [];
    const announcer = createRankedAnnouncer({
      announce: (text) => lines.push(text),
      formatLabel: "4v4",
      now: () => new Date("2026-09-15T17:45:00.000Z"),
    });
    announcer.tick();
    announcer.tick();
    assert.equal(lines.length, 1);
    assert.match(lines[0], /15 min/);
    announcer.tick(new Date("2026-09-15T18:00:00.000Z"));
    announcer.tick(new Date("2026-09-15T18:01:00.000Z"));
    assert.equal(lines.length, 2);
    assert.match(lines[1], /aberta até 16:00/);
  });

  it("textos citam o formato da sala", () => {
    assert.match(upcomingMessage({ startHour: 15, startMinute: 0, endHour: 16, endMinute: 0 }, "4v4"), /4v4/);
    assert.match(startedMessage({ startHour: 19, startMinute: 0, endHour: 20, endMinute: 0 }, "3v3"), /3v3/);
  });

  it("patente no chat e top 5 com elo", () => {
    assert.equal(rankedChatHead({ linked: true, rankTier: "SILVER_2", siteEmblem: "💫" }), "[⬜PRATA II][💫]");
    assert.equal(rankedChatHead({ linked: true, rankTier: "CHALLENGER", siteEmblem: "💫", storeEmoji: "🍔" }), "[🟥DESAFIANTE][🍔][💫]");
    assert.equal(rankedChatHead({ linked: true, rankTier: "UNRANKED" }), "[🟧UNRANKED]");
    assert.equal(rankedChatHead({ linked: false, siteEmblem: "💫" }), "[🔳DESVINCULADO]");
    assert.equal(
      formatTop5([{ nick: "rato", rankTier: "CHALLENGER", elo: 3240 }]),
      "Top 5\n[🟥DESAFIANTE] rato · 3240"
    );
  });

  it("busca o top 15 min antes e anuncia junto quando abre", async () => {
    const publicLines = [];
    const privateLines = [];
    let fetches = 0;
    const present = [{ id: 2 }];
    const announcer = createRankedAnnouncer({
      formatLabel: "4v4",
      now: () => new Date("2026-09-15T17:45:00.000Z"),
      announce: (text) => publicLines.push(text),
      players: () => present,
      tell: (id, text) => privateLines.push({ id, text }),
      fetchTop: async () => {
        fetches += 1;
        return [{ nick: "rato", rankTier: "CHALLENGER", elo: 3240 }];
      },
    });
    announcer.tick();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fetches, 1);
    assert.equal(publicLines.length, 1);
    assert.match(publicLines[0], /15 min/);
    assert.doesNotMatch(publicLines[0], /Top 5/);

    announcer.tick(new Date("2026-09-15T17:55:00.000Z"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fetches, 1);

    announcer.tick(new Date("2026-09-15T18:00:00.000Z"));
    announcer.tick(new Date("2026-09-15T18:01:00.000Z"));
    assert.equal(publicLines.length, 2);
    assert.match(publicLines[1], /aberta até 16:00/);
    assert.match(publicLines[1], /Top 5/);
    assert.match(publicLines[1], /rato · 3240/);
    assert.equal(privateLines.length, 0);
    assert.equal(fetches, 1);

    const during = new Date("2026-09-15T18:00:00.000Z");
    await announcer.greet(2, during);
    assert.equal(privateLines.length, 0);
    await announcer.greet(3, during);
    assert.equal(privateLines.length, 1);
    assert.match(privateLines[0].text, /Ranqueada rolando/);
    assert.match(privateLines[0].text, /Top 5/);
    assert.equal(fetches, 1);
  });

  it("resposta vazia não trava e tenta de novo 5 min antes", async () => {
    let fetches = 0;
    let rows = [];
    const announcer = createRankedAnnouncer({
      formatLabel: "3v3",
      now: () => new Date("2026-09-15T17:45:00.000Z"),
      announce: () => {},
      fetchTop: async () => {
        fetches += 1;
        return rows;
      },
    });
    announcer.tick();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fetches, 1);
    rows = [{ nick: "rato", rankTier: "CHALLENGER", elo: 10 }];
    announcer.tick(new Date("2026-09-15T17:55:00.000Z"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fetches, 2);
  });
});

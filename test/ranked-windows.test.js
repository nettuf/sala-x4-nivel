const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  activeWindow,
  upcomingWindow,
  upcomingMessage,
  startedMessage,
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
});

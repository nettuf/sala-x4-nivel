const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  formatTop5,
  mapLeaderboardRows,
  createLeaderboardStore,
} = require("../src/db/stats");
const { formatCurrentStreak, formatBestStreak } = require("../src/room/streak");

describe("rankings top 5", () => {
  it("formata lista e vazio", () => {
    assert.equal(formatTop5("⚽ Top 5 gols", []), "⚽ Top 5 gols\nNinguém no ranking ainda.");
    const text = formatTop5("⚽ Top 5 gols", [
      { nick: "Netto", value: 42 },
      { nick: "Baleio", value: 31 },
    ]);
    assert.match(text, /1\. Netto — 42/);
    assert.match(text, /2\. Baleio — 31/);
  });

  it("mapeia nicks e ignora zero", () => {
    const rows = mapLeaderboardRows(
      [
        { auth: "a", goals: 9 },
        { auth: "b", goals: 0 },
        { auth: "c", goals: 4 },
      ],
      "goals",
      { a: "Ana", c: "Caio" }
    );
    assert.deepEqual(rows, [
      { auth: "a", nick: "Ana", value: 9 },
      { auth: "c", nick: "Caio", value: 4 },
    ]);
  });

  it("cache TTL + invalidate + inflight compartilhado", async () => {
    let loads = 0;
    const store = createLeaderboardStore({
      ttlMs: 10_000,
      async load() {
        loads += 1;
        return {
          unavailable: false,
          boards: { goals: [{ nick: "A", value: loads }], assists: [], own_goals: [], cs: [] },
        };
      },
    });

    const [a, b] = await Promise.all([store.get("goals"), store.get("goals")]);
    assert.equal(loads, 1);
    assert.deepEqual(a.rows, [{ nick: "A", value: 1 }]);
    assert.deepEqual(b.rows, [{ nick: "A", value: 1 }]);

    const cached = await store.get("assists");
    assert.equal(loads, 1);
    assert.deepEqual(cached.rows, []);

    store.invalidate();
    const next = await store.get("goals");
    assert.equal(loads, 2);
    assert.equal(next.rows[0].value, 2);
  });

  it("falha sem banco não entra no cache", async () => {
    let loads = 0;
    const store = createLeaderboardStore({
      ttlMs: 10_000,
      async load() {
        loads += 1;
        return { unavailable: true };
      },
    });
    const first = await store.get("goals");
    const second = await store.get("goals");
    assert.equal(first.unavailable, true);
    assert.equal(second.unavailable, true);
    assert.equal(loads, 2);
  });
});

describe("mensagens de streak", () => {
  it("atual e recorde", () => {
    assert.match(formatCurrentStreak(0), /Sem streak/);
    assert.match(formatCurrentStreak(4), /Streak atual: 4/);
    assert.match(formatBestStreak(0), /Sem recorde/);
    assert.equal(formatBestStreak(7, 2), "🏆 Maior streak da sala: 7");
    assert.match(formatBestStreak(7, 7), /em andamento/);
  });
});

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  marketsBase,
  marketParticipants,
  summaryLine,
  createHaxbooket,
} = require("../src/haxbook/haxbooket");

const STATS_URL =
  "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/stats";

describe("Haxbooket", () => {
  it("deriva endpoint e preserva auth/time/goals sem poluir o payload inicial", () => {
    assert.equal(
      marketsBase(`${STATS_URL}?ignored=1`),
      "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/haxbooket/markets"
    );
    assert.equal(marketsBase("not-a-url"), "");
    assert.deepEqual(
      marketParticipants([
        { id: 1, name: "R", auth: "auth-r", team: 1 },
        { id: 2, name: "B", auth: "auth-b", team: 2 },
      ]),
      [
        { nickname: "R", auth: "auth-r", team: "RED" },
        { nickname: "B", auth: "auth-b", team: "BLUE" },
      ]
    );
    assert.deepEqual(
      marketParticipants([
        { id: 1, name: "R", auth: "auth-r", team: 1, goals: "2.9" },
        { id: 2, name: "B", auth: "auth-b", team: 2, goals: -1 },
      ]),
      [
        { nickname: "R", auth: "auth-r", team: "RED", goals: 2 },
        { nickname: "B", auth: "auth-b", team: "BLUE", goals: 0 },
      ]
    );
  });

  it("start, timer, GOAL idempotente, FINISHED e resumo", async () => {
    const calls = [];
    const announcements = [];
    const room = { sendAnnouncement: (line) => announcements.push(line) };
    const fetchImpl = async (url, opts) => {
      calls.push({ url, method: opts.method, body: opts.body ? JSON.parse(opts.body) : null });
      if (/\/start$/.test(url)) {
        return { ok: true, json: async () => ({ status: "OPEN", closesAt: new Date(Date.now() + 10).toISOString() }) };
      }
      if (/\/summary$/.test(url)) {
        return {
          ok: true,
          json: async () => ({
            status: "CLOSED",
            redOdd: 1.75,
            blueOdd: 2.25,
            red: { totalStake: 120, bettors: 2 },
            blue: { totalStake: 80, bettors: 1 },
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };
    const client = createHaxbooket(room, {
      statsUrl: STATS_URL,
      apiKey: "key",
      fetchImpl,
      getRedStreak: () => 10,
    });
    client.open({
      matchId: "stable-id",
      participants: [
        { id: 1, name: "R", auth: "auth-r", team: 1 },
        { id: 2, name: "B", auth: "auth-b", team: 2 },
      ],
    });
    await client.wait();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await client.wait();

    assert.equal(client.goal(1), true);
    assert.equal(client.goal(2), false);
    await client.wait();
    assert.equal(client.finish(1, [
      { id: 1, name: "R", auth: "auth-r", team: 1, goals: 2 },
      { id: 2, name: "B", auth: "auth-b", team: 2, goals: 0 },
    ]), true);
    await client.wait();

    const start = calls.find((c) => /\/start$/.test(c.url));
    const events = calls.filter((c) => /\/events$/.test(c.url));
    assert.equal(start.body.matchId, "stable-id");
    assert.equal(start.body.redStreak, 10);
    assert.equal(start.body.participants[0].auth, "auth-r");
    assert.equal(Object.hasOwn(start.body.participants[0], "goals"), false);
    assert.ok(calls.some((c) => /\/summary$/.test(c.url)), "timer deve consultar summary");
    assert.deepEqual(events.map((c) => c.body.type), ["GOAL", "FINISHED"]);
    assert.deepEqual(events.map((c) => c.body.eventId), [
      "stable-id:goal",
      "stable-id:finished",
    ]);
    assert.deepEqual(events[1].body.participants.map(({ auth, goals }) => ({ auth, goals })), [
      { auth: "auth-r", goals: 2 },
      { auth: "auth-b", goals: 0 },
    ]);
    assert.ok(announcements.some((line) => line.includes("www.haxbook.com.br/bet")));
    assert.ok(announcements.some((line) =>
      line.includes("120 coins") &&
      line.includes("1.75x") &&
      line.includes("80 coins") &&
      line.includes("2.25x")
    ));
    assert.ok(summaryLine({ status: "CLOSED", redOdd: 1, blueOdd: 2, red: {}, blue: {} }));
  });

  it("VOID é terminal e não repete", async () => {
    const calls = [];
    const client = createHaxbooket(
      { sendAnnouncement() {} },
      {
        statsUrl: STATS_URL,
        apiKey: "key",
        fetchImpl: async (url, opts) => {
          calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
          return { ok: true, json: async () => ({}) };
        },
      }
    );
    client.open({ matchId: "void-id", participants: [] });
    assert.equal(client.void("kickoff-afk"), true);
    assert.equal(client.void("rr"), false);
    assert.equal(client.finish(1, []), false);
    await client.wait();
    const event = calls.find((c) => /\/events$/.test(c.url));
    assert.equal(event.body.eventId, "void-id:void");
    assert.equal(event.body.reason, "kickoff-afk");
  });
});

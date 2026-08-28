const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { createMatchController } = require("../src/room/match");
const { TEAM } = require("../src/room/choose");
const {
  PARTICIPANT_KEYS,
  lastFourOnTeam,
  fieldEightAtWhistle,
  shouldSendHaxbookStats,
  winnerLabel,
  makeMatchId,
  participantRow,
  buildParticipants,
  buildStatsBody,
  postMatchStats,
} = require("../src/haxbook/statsWebhook");

function eightOnField(extra = []) {
  const red = [1, 2, 3, 4].map((id) => ({
    id,
    name: `R${id}`,
    auth: `auth-r${id}`,
    team: TEAM.RED,
  }));
  const blue = [5, 6, 7, 8].map((id) => ({
    id,
    name: `B${id}`,
    auth: `auth-b${id}`,
    team: TEAM.BLUE,
  }));
  return [...red, ...blue, ...extra];
}

function finishScores(over = {}) {
  return { red: 3, blue: 1, time: 200, scoreLimit: 3, timeLimit: 240, ...over };
}

function roomWith(players, scores) {
  const discs = new Map();
  const room = {
    getPlayerList: () => players.map((p) => ({ ...p })),
    getScores: () => scores,
    getBallPosition: () => ({ x: 0, y: 0 }),
    getPlayerDiscProperties: (id) => discs.get(id) || null,
    startRecording: () => {},
    stopRecording: () => new Uint8Array(),
    startGame: () => {},
    sendAnnouncement: () => {},
  };
  return { room, discs };
}

describe("payload haxbook", () => {
  it("os 4 últimos de cada time no apito; menos de 4 não fecha 8", () => {
    const players = eightOnField([{ id: 9, name: "R5", team: TEAM.RED }]);
    const last = lastFourOnTeam(players, TEAM.RED);
    assert.deepEqual(
      last.map((p) => p.name),
      ["R2", "R3", "R4", "R5"]
    );
    assert.equal(lastFourOnTeam(players.slice(0, 3), TEAM.RED), null);
    const eight = fieldEightAtWhistle(eightOnField());
    assert.equal(eight.red.length, 4);
    assert.equal(eight.blue.length, 4);
  });

  it("só envia se começou 4v4, não quebrou o formato e terminou 8 em campo", () => {
    const fieldEight = fieldEightAtWhistle(eightOnField());
    assert.equal(
      shouldSendHaxbookStats({
        valid: true,
        startedFourOnFour: true,
        formatBroken: false,
        fieldEight,
      }),
      true
    );
    assert.equal(
      shouldSendHaxbookStats({
        valid: true,
        startedFourOnFour: true,
        formatBroken: true,
        fieldEight,
      }),
      false
    );
    assert.equal(
      shouldSendHaxbookStats({
        valid: true,
        startedFourOnFour: false,
        formatBroken: false,
        fieldEight,
      }),
      false
    );
    assert.equal(
      shouldSendHaxbookStats({
        valid: true,
        startedFourOnFour: true,
        formatBroken: false,
        fieldEight: null,
      }),
      false
    );
  });

  it("winner e playTime 0; sem ranked; chaves do contrato", () => {
    assert.equal(winnerLabel(1), "RED");
    assert.equal(winnerLabel(2), "BLUE");
    assert.equal(winnerLabel(0), "DRAW");
    const row = participantRow({
      nickname: "Netto",
      team: "RED",
      goals: 2,
      assists: 1,
      ownGoals: 0,
      cleanSheet: true,
      isGoalkeeper: true,
    });
    assert.deepEqual(Object.keys(row), PARTICIPANT_KEYS);
    assert.equal(row.playTime, 0);
    assert.equal(row.cleanSheet, 1);
    assert.equal(row.isGoalkeeper, true);
    assert.equal("ranked" in row, false);

    const body = buildStatsBody({
      matchId: "1704123456789-abc123xyz",
      redScore: 3,
      blueScore: 1,
      winner: 1,
      roomName: "Comunismo x4",
      participants: [row],
    });
    assert.deepEqual(Object.keys(body), [
      "matchId",
      "redScore",
      "blueScore",
      "winner",
      "roomName",
      "participants",
    ]);
    assert.equal(body.winner, "RED");
    assert.equal("ranked" in body, false);
  });

  it("matchId é timestamp + random", () => {
    const id = makeMatchId(1704123456789, () => 0.123456789);
    assert.match(id, /^1704123456789-/);
    assert.equal(id.startsWith("1704123456789-"), true);
  });

  it("8 participantes com nick do campo e GK da partida", () => {
    const { red, blue } = fieldEightAtWhistle(eightOnField());
    const rows = buildParticipants({
      red,
      blue,
      tally: (p) => ({
        goals: p.id === 2 ? 2 : 0,
        assists: p.id === 3 ? 1 : 0,
        own_goals: 0,
      }),
      gk: { redId: 1, blueId: 5 },
      redScore: 3,
      blueScore: 0,
    });
    assert.equal(rows.length, 8);
    assert.equal(rows.filter((p) => p.team === "RED").length, 4);
    assert.equal(rows.filter((p) => p.team === "BLUE").length, 4);
    assert.equal(rows.every((p) => p.playTime === 0), true);
    const gkRed = rows.find((p) => p.nickname === "R1");
    const gkBlue = rows.find((p) => p.nickname === "B5");
    assert.equal(gkRed.isGoalkeeper, true);
    assert.equal(gkRed.cleanSheet, 1);
    assert.equal(gkBlue.isGoalkeeper, true);
    assert.equal(gkBlue.cleanSheet, 0);
    assert.equal(rows.find((p) => p.nickname === "R2").goals, 2);
    assert.equal(rows.find((p) => p.nickname === "R3").assists, 1);
  });
});

describe("POST stats haxbook", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sem key não chama o endpoint", async () => {
    let called = 0;
    globalThis.fetch = async () => {
      called += 1;
      return { ok: true };
    };
    const r = await postMatchStats("https://api.haxbook.com.br/x", "", { matchId: "1" });
    assert.equal(r.ok, false);
    assert.equal(r.attempts, 0);
    assert.equal(called, 0);
  });

  it("header X-API-Key e body do contrato; sem ranked", async () => {
    const posts = [];
    globalThis.fetch = async (url, opts) => {
      posts.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
      return { ok: true };
    };
    const body = buildStatsBody({
      matchId: "1704123456789-abc123xyz",
      redScore: 3,
      blueScore: 1,
      winner: 1,
      roomName: "Comunismo x4",
      participants: [
        participantRow({ nickname: "Netto", team: "RED", goals: 1, assists: 0, ownGoals: 0 }),
      ],
    });
    const r = await postMatchStats(
      "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/stats",
      "secret-key",
      body,
      { retryDelayMs: 0 }
    );
    assert.equal(r.ok, true);
    assert.equal(posts.length, 1);
    assert.equal(
      posts[0].url,
      "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/stats"
    );
    assert.equal(posts[0].headers["X-API-Key"], "secret-key");
    assert.equal(posts[0].headers["Content-Type"], "application/json");
    assert.equal(posts[0].body.winner, "RED");
    assert.equal("ranked" in posts[0].body, false);
    assert.equal(posts[0].body.participants[0].playTime, 0);
  });

  it("falha uma vez e o retry com o mesmo matchId passa", async () => {
    const posts = [];
    globalThis.fetch = async (_url, opts) => {
      posts.push(JSON.parse(opts.body).matchId);
      if (posts.length === 1) return { ok: false, status: 503 };
      return { ok: true };
    };
    const r = await postMatchStats(
      "https://api.example/stats",
      "k",
      { matchId: "same-id" },
      { retryDelayMs: 0 }
    );
    assert.equal(r.ok, true);
    assert.equal(r.attempts, 2);
    assert.deepEqual(posts, ["same-id", "same-id"]);
  });

  it("duas falhas: perde, não tenta de novo", async () => {
    let called = 0;
    globalThis.fetch = async () => {
      called += 1;
      return { ok: false, status: 500 };
    };
    const r = await postMatchStats("https://api.example/stats", "k", { matchId: "x" }, { retryDelayMs: 0 });
    assert.equal(r.ok, false);
    assert.equal(r.attempts, 2);
    assert.equal(called, 2);
  });
});

describe("finish 4v4 → payload do site", () => {
  it("4v4 que começa e termina 4v4 manda os 8 do apito", async () => {
    const players = eightOnField();
    const scores = finishScores();
    const { room } = roomWith(players, scores);
    const match = createMatchController(room);
    match.start({ competitive: true });
    match.markVictory();
    const result = await match.finish(scores, { persist: false });
    assert.equal(result.valid, true);
    assert.ok(result.persistPayload.haxbook);
    const body = result.persistPayload.haxbook;
    assert.equal(body.winner, "RED");
    assert.equal(body.redScore, 3);
    assert.equal(body.blueScore, 1);
    assert.equal(body.roomName, "Comunismo x4");
    assert.equal(body.participants.length, 8);
    assert.equal(body.participants.every((p) => p.playTime === 0), true);
    assert.equal("ranked" in body, false);
    assert.match(body.matchId, /^\d+-/);
    assert.deepEqual(
      body.participants.filter((p) => p.team === "RED").map((p) => p.nickname),
      ["R1", "R2", "R3", "R4"]
    );
  });

  it("troca no meio: manda quem está em campo no apito, não o que saiu", async () => {
    const players = eightOnField();
    const scores = finishScores();
    const { room } = roomWith(players, scores);
    const match = createMatchController(room);
    match.start({ competitive: true });
    players[0].team = TEAM.SPEC;
    players.push({ id: 99, name: "Sub", auth: "auth-sub", team: TEAM.RED });
    match.markVictory();
    const result = await match.finish(scores, { persist: false });
    const nicks = result.persistPayload.haxbook.participants.map((p) => p.nickname);
    assert.ok(nicks.includes("Sub"));
    assert.equal(nicks.includes("R1"), false);
    assert.equal(nicks.length, 8);
  });

  it("começou 1v1 competitivo não manda pro site", async () => {
    const players = [
      { id: 1, name: "R", auth: "r", team: TEAM.RED },
      { id: 2, name: "B", auth: "b", team: TEAM.BLUE },
    ];
    const scores = finishScores();
    const { room } = roomWith(players, scores);
    const match = createMatchController(room);
    match.start({ competitive: true });
    match.markVictory();
    const result = await match.finish(scores, { persist: false });
    assert.equal(result.valid, true);
    assert.equal(result.persistPayload.haxbook, null);
  });

  it("4v4 que virou 3v3 no meio não manda mesmo se voltar a 4", async () => {
    const players = eightOnField();
    const scores = finishScores();
    const { room } = roomWith(players, scores);
    const match = createMatchController(room);
    match.start({ competitive: true });
    match.setCompetitive(false);
    match.setCompetitive(true);
    match.markVictory();
    const result = await match.finish(scores, { persist: false });
    assert.equal(result.valid, true);
    assert.equal(result.persistPayload.haxbook, null);
  });

  it("terminou 4v3 no apito não manda", async () => {
    const players = eightOnField();
    const scores = finishScores();
    const { room } = roomWith(players, scores);
    const match = createMatchController(room);
    match.start({ competitive: true });
    players[7].team = TEAM.SPEC;
    match.markVictory();
    const result = await match.finish(scores, { persist: false });
    assert.equal(result.persistPayload.haxbook, null);
  });

  it("marca o goleiro pela posição X nesta partida", async () => {
    const players = eightOnField();
    const scores = finishScores({ red: 3, blue: 0 });
    const { room, discs } = roomWith(players, scores);
    for (const p of players) {
      const x = p.team === TEAM.RED ? (p.id === 1 ? -250 : 20) : p.id === 5 ? 250 : -20;
      discs.set(p.id, { x, y: 0 });
    }
    const match = createMatchController(room);
    match.start({ competitive: true });
    for (let i = 0; i < 15; i++) match.onTick();
    match.markVictory();
    const result = await match.finish(scores, { persist: false });
    const body = result.persistPayload.haxbook;
    assert.equal(body.participants.find((p) => p.nickname === "R1").isGoalkeeper, true);
    assert.equal(body.participants.find((p) => p.nickname === "R1").cleanSheet, 1);
    assert.equal(body.participants.find((p) => p.nickname === "B5").isGoalkeeper, true);
    assert.equal(body.participants.find((p) => p.nickname === "R2").isGoalkeeper, false);
  });
});

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  DEFAULT_MIN_RATING,
  RATING_GATE_REASON,
  evaluateRatingGate,
} = require("../src/room/ratingGate");
const config = require("../src/config");

describe("rating gate X4 Nível", () => {
  it("default da sala é 75 e identidade própria", () => {
    assert.equal(DEFAULT_MIN_RATING, 75);
    assert.equal(config.minRating, 75);
    assert.match(config.roomName, /NÍVEL|NIVEL|75/i);
    assert.equal(config.pm2ProcessName, "sala-x4-nivel");
    assert.equal(config.discordRoomTag, "X4NIVEL");
    assert.equal(config.tokenApiPort, 3852);
    assert.match(config.haxbookStatsUrl, /comunax4nivel/);
  });

  it("site fora (syncOk false) deixa entrar — fail-open", () => {
    assert.equal(
      evaluateRatingGate({ rating: 10, linked: true }, { syncOk: false }).action,
      "allow"
    );
    assert.equal(evaluateRatingGate(null, { syncOk: false, hasAuth: false }).action, "allow");
  });

  it("sem auth ou sem conta vinculada/rating: kick", () => {
    assert.equal(
      evaluateRatingGate(null, { syncOk: true, hasAuth: false }).action,
      "kick"
    );
    assert.equal(
      evaluateRatingGate({ rating: null, linked: false }, { syncOk: true, hasAuth: true }).action,
      "kick"
    );
    assert.equal(
      evaluateRatingGate({ linked: true }, { syncOk: true, hasAuth: true }).action,
      "kick"
    );
  });

  it("rating > 75 entra; 75 e abaixo saem", () => {
    assert.equal(
      evaluateRatingGate({ rating: 76, linked: true }, { syncOk: true, hasAuth: true }).action,
      "allow"
    );
    assert.equal(
      evaluateRatingGate({ rating: 75, linked: true }, { syncOk: true, hasAuth: true }).action,
      "kick"
    );
    assert.equal(
      evaluateRatingGate({ rating: 40, linked: true }, { syncOk: true, hasAuth: true }).action,
      "kick"
    );
  });

  it("mensagem de kick orienta conta/rating", () => {
    const r = evaluateRatingGate({ rating: 70, linked: true }, { syncOk: true, hasAuth: true });
    assert.equal(r.action, "kick");
    assert.equal(r.reason, RATING_GATE_REASON);
    assert.match(r.reason, /75/);
    assert.match(r.reason, /conta|vincule|rating/i);
  });

  it("join aplica o gate depois do syncSiteStatus e antes do welcome", () => {
    const roomSrc = fs.readFileSync(path.join(__dirname, "../src/room/createRoom.js"), "utf8");
    const join = roomSrc.split("room.onPlayerJoin")[1]?.split("const pendingLeaves")[0] || "";
    const syncAt = join.indexOf("syncSiteStatus");
    const gateAt = join.indexOf("evaluateRatingGate");
    const welcomeAt = join.indexOf("Bem-vindo");
    assert.ok(syncAt >= 0 && gateAt > syncAt, "gate depois do sync");
    assert.ok(welcomeAt > gateAt, "welcome só se passou no gate");
    assert.match(join, /gate\.action === ["']kick["']/);
  });
});

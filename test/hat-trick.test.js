const test = require("node:test");
const assert = require("node:assert/strict");
const { isHatTrick, isHatTrickForMatch, formatStatusCard, emptyPlayerStats } = require("../src/db/stats");
const { isUnlocked, getTitleById, reqLabelLong } = require("../src/titles");

test("hat-trick exige 3+ gols e vale uma ocorrência por partida", () => {
  assert.equal(isHatTrick({ goals: 2 }), false);
  assert.equal(isHatTrick({ goals: 3 }), true);
  assert.equal(isHatTrick({ goals: 5 }), true);
  assert.equal(isHatTrickForMatch(false, { goals: 5 }), false);
  assert.equal(isHatTrickForMatch(true, { goals: 3 }), true);
});

test("perfil mostra vitórias e hat-tricks explicitamente", () => {
  const text = formatStatusCard("Craque", {
    ...emptyPlayerStats(),
    games: 8,
    wins: 5,
    draws: 1,
    losses: 2,
    hat_tricks: 3,
  });
  assert.match(text, /Vitórias: 5/);
  assert.match(text, /Hat-tricks: 3/);
});

test("cargos de hat-trick desbloqueiam em 50, 200 e 500", () => {
  assert.equal(isUnlocked({ hat_tricks: 49 }, "chapeleiro"), false);
  assert.equal(isUnlocked({ hat_tricks: 50 }, "chapeleiro"), true);
  assert.equal(isUnlocked({ hat_tricks: 199 }, "rei-hattrick"), false);
  assert.equal(isUnlocked({ hat_tricks: 200 }, "rei-hattrick"), true);
  assert.equal(isUnlocked({ hat_tricks: 499 }, "imortal-hattrick"), false);
  assert.equal(isUnlocked({ hat_tricks: 500 }, "imortal-hattrick"), true);
  assert.equal(getTitleById("chapeleiro").emblem, "🎩");
  assert.equal(getTitleById("rei-hattrick").emblem, "👑");
  assert.equal(getTitleById("imortal-hattrick").emblem, "🐐");
  assert.equal(reqLabelLong({ hat_tricks: 500 }), "500 hat-tricks");
});

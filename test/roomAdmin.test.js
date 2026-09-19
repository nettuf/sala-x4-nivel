const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeAuth, banMs, muteMs } = require("../src/server/roomAdmin");

test("auth vazia ou com espaço é inválida", () => {
  assert.equal(normalizeAuth(""), null);
  assert.equal(normalizeAuth("ab cd"), null);
  assert.ok(normalizeAuth("abc123"));
});

test("ban sem minutos é permanente; mute sem minutos é 15 min", () => {
  assert.equal(banMs(), null);
  assert.equal(banMs(""), null);
  assert.equal(banMs(0), null);
  assert.equal(banMs(30), 30 * 60000);
  assert.equal(muteMs(), 15 * 60000);
  assert.equal(muteMs(""), 15 * 60000);
  assert.equal(muteMs(5), 5 * 60000);
});

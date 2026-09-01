const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("listas de moderação paginadas", () => {
  it("formatNickAuthList monta nick · auth e próxima página", () => {
    const { formatNickAuthList } = require("../src/commands/index.js");
    assert.equal(typeof formatNickAuthList, "function");

    const empty = formatNickAuthList({
      label: "ban",
      emoji: "🚫",
      result: { unavailable: false, total: 0, page: 1, pages: 0, rows: [] },
      nextCmd: "!banlist",
    });
    assert.equal(empty, "Nenhum ban ativo.");

    const page = formatNickAuthList({
      label: "mute",
      emoji: "🔇",
      result: {
        unavailable: false,
        total: 8,
        page: 1,
        pages: 2,
        rows: [
          { nick: "João", auth: "authA" },
          { nick: "Maria", auth: null, conn: "aabb" },
        ],
      },
      nextCmd: "!mutelist",
    });
    assert.match(page, /🔇 mute 1\/2 \(8\)/);
    assert.match(page, /João · authA/);
    assert.match(page, /Maria · aabb/);
    assert.match(page, /!mutelist 2/);
  });
});

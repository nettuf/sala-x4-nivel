const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createCommandHandler } = require("../src/commands");

describe("comando !vincular", () => {
  it("usa a auth real e responde somente em privado", async () => {
    const player = { id: 7, name: "Jogador", team: 0, auth: "auth-real" };
    const announcements = [];
    let payload;
    const room = {
      getPlayerList: () => [player],
      sendAnnouncement: (msg, to) => announcements.push({ msg, to }),
    };
    const handler = createCommandHandler(room, {
      admins: new Map(),
      mutes: new Map(),
      linkHaxballAuth: async (value) => {
        payload = value;
        return { ok: true };
      },
    });

    assert.equal(await handler.handle(player, "!vincular abcd-2345"), true);
    assert.deepEqual(payload, { code: "ABCD2345", auth: "auth-real", nickname: "Jogador" });
    assert.ok(announcements.length > 0);
    assert.ok(announcements.every((item) => item.to === player.id));
    assert.ok(announcements.every((item) => !item.msg.includes("AB12")));
  });

  it("recusa guest sem chamar a API", async () => {
    const player = { id: 8, name: "Guest", team: 0 };
    let calls = 0;
    const room = { getPlayerList: () => [player], sendAnnouncement: () => {} };
    const handler = createCommandHandler(room, {
      admins: new Map(),
      mutes: new Map(),
      linkHaxballAuth: async () => {
        calls += 1;
        return { ok: true };
      },
    });

    assert.equal(await handler.handle(player, "!vincular ABC123"), true);
    assert.equal(calls, 0);
  });

  it("traduz conflito, código inválido e indisponibilidade sem resposta pública", async () => {
    const cases = [
      ["HAXBALL_AUTH_ALREADY_LINKED", /suporte/i],
      ["INVALID_CHALLENGE", /inválido|expirado/i],
      ["CHALLENGE_EXPIRED", /inválido|expirado/i],
      ["CHALLENGE_ALREADY_USED", /já utilizado/i],
      ["CONFIG_UNAVAILABLE", /indisponível/i],
      ["NETWORK_ERROR", /tente novamente/i],
    ];
    for (const [backendCode, expected] of cases) {
      const player = { id: 7, name: "Jogador", team: 0, auth: "auth-real" };
      const announcements = [];
      const room = {
        getPlayerList: () => [player],
        sendAnnouncement: (msg, to) => announcements.push({ msg, to }),
      };
      const handler = createCommandHandler(room, {
        admins: new Map(),
        mutes: new Map(),
        linkHaxballAuth: async () => ({ ok: false, code: backendCode }),
      });
      await handler.handle(player, "!vincular ABCD2345");
      assert.ok(announcements.some((item) => expected.test(item.msg)));
      assert.ok(announcements.every((item) => item.to === player.id));
    }
  });

  it("!buscarplayer permite Gerente buscar por auth ou nickname", async () => {
    const player = { id: 9, name: "Gerente", team: 0, auth: "admin-auth" };
    const announcements = [];
    let query;
    const room = {
      getPlayerList: () => [player],
      sendAnnouncement: (msg, to) => announcements.push({ msg, to }),
    };
    const handler = createCommandHandler(room, {
      admins: new Map([[player.id, { level: 3 }]]),
      mutes: new Map(),
      searchPlayers: async (value) => {
        query = value;
        return { rows: [{ nick: "Netto", auth: "auth-netto", join_count: 5 }] };
      },
    });

    assert.equal(await handler.handle(player, "!buscarplayer Netto"), true);
    assert.equal(query, "Netto");
    assert.ok(announcements.some((item) => item.to === player.id && item.msg.includes("auth-netto")));
  });
});

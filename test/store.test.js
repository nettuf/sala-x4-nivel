const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  storeRedeemUrl,
  normalizeStoreCode,
  liveStoreEffects,
  parseStoreColor,
  formatStoreTemplate,
  storeGoalPhrase,
  redeemStoreCode,
} = require("../src/haxbook/store");
const { createCommandHandler } = require("../src/commands");
const titles = require("../src/titles");
const { formatChatHead, chatColor, SITE_TITLES, SITE_ELO_TITLES, CHAT_COLOR_RED } = titles;

const STATS_URL = "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/stats";

describe("loja haxbooket", () => {
  it("monta o webhook de redeem a partir do /stats", () => {
    assert.equal(
      storeRedeemUrl(STATS_URL),
      "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/store/redeem"
    );
    assert.equal(normalizeStoreCode(" ab 12 xy 34 "), "AB12XY34");
  });

  it("corta efeito vencido e mantém o que ainda vale", () => {
    const now = Date.parse("2026-09-19T12:00:00.000Z");
    const live = liveStoreEffects({
      chatColor: "#FF7A00",
      chatColorUntil: "2026-09-20T12:00:00.000Z",
      emoji: "🔥",
      emojiUntil: "2026-09-18T12:00:00.000Z",
      joinTemplate: "o {nick} entrou!",
      joinUntil: "2026-09-20T12:00:00.000Z",
      goalTemplate: "o {nick} amassa",
      goalUntil: "2026-09-18T12:00:00.000Z",
    }, now);
    assert.equal(live.chatColor, "#FF7A00");
    assert.equal(live.joinTemplate, "o {nick} entrou!");
    assert.equal(live.emoji, null);
    assert.equal(live.goalTemplate, null);
    assert.equal(parseStoreColor("#FF7A00"), 0xff7a00);
    assert.equal(formatStoreTemplate("o majestoso {nick} entrou!", "Netto"), "o majestoso Netto entrou!");
    assert.equal(storeGoalPhrase("Netto", "o {nick} amassa"), "o Netto amassa");
    assert.equal(storeGoalPhrase("Netto", null), null);
  });

  it("chama redeem com code e auth e devolve os efeitos", async () => {
    const fetchImpl = async (url, opts) => {
      assert.match(String(url), /\/store\/redeem$/);
      assert.equal(opts.method, "POST");
      assert.equal(opts.headers["X-API-Key"], "key");
      assert.deepEqual(JSON.parse(opts.body), { code: "AB12XY34", auth: "auth-1" });
      return {
        ok: true,
        json: async () => ({
          ok: true,
          message: "Cor do chat ativo por 1 dia.",
          store: { chatColor: "#FF7A00", chatColorUntil: "2026-09-20T12:00:00.000Z" },
        }),
      };
    };
    const result = await redeemStoreCode({
      statsUrl: STATS_URL,
      apiKey: "key",
      code: "ab12xy34",
      auth: "auth-1",
      fetchImpl,
    });
    assert.equal(result.ok, true);
    assert.equal(result.store.chatColor, "#FF7A00");
  });

  it("repassa a mensagem do back e não inventa efeito", async () => {
    const result = await redeemStoreCode({
      statsUrl: STATS_URL,
      apiKey: "key",
      code: "AB12XY34",
      auth: "outra",
      fetchImpl: async () => ({
        ok: false,
        status: 400,
        json: async () => ({ message: "Esse código é de outra conta." }),
      }),
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /outra conta/);
  });

  it("!ativar recusa guest, pede código e aplica o efeito no chat", async () => {
    const player = { id: 7, name: "Jogador", team: 0, auth: "auth-1" };
    const guest = { id: 8, name: "Guest", team: 0 };
    const announcements = [];
    const room = {
      getPlayerList: () => [player, guest],
      sendAnnouncement: (msg, to, color) => announcements.push({ msg, to, color }),
    };
    let payload;
    const handler = createCommandHandler(room, {
      admins: new Map(),
      mutes: new Map(),
      redeemStoreCode: async (value) => {
        payload = value;
        return {
          ok: true,
          message: "Emoji ativo por 1 dia.",
          store: {
            emoji: "🔥",
            emojiUntil: "2099-01-01T00:00:00.000Z",
            chatColor: "#FF7A00",
            chatColorUntil: "2099-01-01T00:00:00.000Z",
            joinTemplate: "o majestoso {nick} entrou!",
            joinUntil: "2099-01-01T00:00:00.000Z",
          },
        };
      },
    });

    assert.equal(await handler.handle(guest, "!ativar AB12XY34"), true);
    assert.equal(payload, undefined);
    assert.ok(announcements.some((item) => /guest/i.test(item.msg)));

    announcements.length = 0;
    assert.equal(await handler.handle(player, "!ativar"), true);
    assert.ok(announcements.some((item) => /Uso: !ativar/.test(item.msg)));

    announcements.length = 0;
    assert.equal(await handler.handle(player, "!ativar ab12xy34"), true);
    assert.deepEqual(payload, { code: "AB12XY34", auth: "auth-1" });
    assert.ok(announcements.some((item) => item.msg.includes("Emoji ativo")));
    assert.ok(announcements.some((item) => item.msg.includes("o majestoso Jogador entrou!")));
    const chat = handler.formatPlayerChat(player, "fala");
    assert.match(chat.line, /\[🔥\]/);
    assert.equal(chat.color, 0xff7a00);
  });

  it("entrada da loja anuncia uma vez por sessão e gol contra não usa a frase", () => {
    const player = { id: 7, name: "Jogador", team: 1, auth: "auth-1" };
    const announcements = [];
    const room = {
      getPlayerList: () => [player],
      sendAnnouncement: (msg, to) => announcements.push({ msg, to }),
    };
    const handler = createCommandHandler(room, {
      admins: new Map(),
      mutes: new Map(),
      siteStatus: new Map([
        ["auth-1", {
          vip: false,
          booster: false,
          elo: null,
          rating: 70,
          store: {
            joinTemplate: "chegou o {nick}",
            joinUntil: "2099-01-01T00:00:00.000Z",
            goalTemplate: "o artilheiro {nick} amassa",
            goalUntil: "2099-01-01T00:00:00.000Z",
          },
        }],
      ]),
    });
    assert.equal(handler.announceStoreJoin(player), true);
    assert.equal(handler.announceStoreJoin(player), false);
    assert.equal(announcements.filter((item) => item.msg.includes("chegou o Jogador")).length, 1);
    assert.equal(storeGoalPhrase("Jogador", handler.storeEffectsFor(player).goalTemplate), "o artilheiro Jogador amassa");
    assert.equal(storeGoalPhrase("Jogador", null), null);
  });

  it("emoji da loja entra no prefixo e a cor não passa por cima do streak", () => {
    assert.equal(formatChatHead({ emblem: "🌱" }, SITE_TITLES.vip, SITE_ELO_TITLES.goat, "🔥"), "[🌱][🔥][🐐][🩷]");
    assert.equal(chatColor({ emblem: "🌱" }, 1, null, null, 0xff7a00), 0xff7a00);
    if (titles.STREAK_TITLE) {
      assert.equal(
        chatColor(titles.STREAK_TITLE, 1, SITE_TITLES.vip, SITE_ELO_TITLES.goat, 0xff7a00),
        titles.STREAK_TITLE.color
      );
    }
    assert.equal(CHAT_COLOR_RED, 0xff5c5c);
  });
});

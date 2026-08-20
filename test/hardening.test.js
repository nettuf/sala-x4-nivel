const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { guardRoomApi } = require("../src/room/safeApi");
const { createChooseController, TEAM } = require("../src/room/choose");
const { createAfkTracker } = require("../src/room/afk");
const { createCommandHandler } = require("../src/commands");
const { findPlayer } = require("../src/utils");

function p(id, team = TEAM.SPEC) {
  return { id, name: `P${id}`, auth: `a${id}`, team };
}

describe("guardRoomApi", () => {
  it("engole exceção do Haxball em vez de derrubar o handler", () => {
    const logs = [];
    const room = guardRoomApi(
      {
        setPlayerTeam() {
          throw new Error("player not found");
        },
        pauseGame() {
          throw new Error("no game");
        },
        getScores: () => null,
      },
      { log: (msg) => logs.push(msg) }
    );

    assert.equal(room.setPlayerTeam(9, 1), null);
    assert.equal(room.pauseGame(true), null);
    assert.equal(logs.length, 2);
    assert.match(logs[0], /setPlayerTeam/);
    // getScores não é blindado: leitura precisa continuar transparente.
    assert.equal(room.getScores(), null);
  });

  it("não blinda duas vezes o mesmo room", () => {
    const room = guardRoomApi({ kickPlayer: () => "ok" });
    const first = room.kickPlayer;
    guardRoomApi(room);
    assert.equal(room.kickPlayer, first);
  });
});

describe("choose sem candidatos não fica travado", () => {
  function setup(players, { excluded = new Set(), scores = null } = {}) {
    const announcements = [];
    const kicks = [];
    let aborted = 0;
    const room = {
      getPlayerList: () => players,
      getScores: () => scores,
      setPlayerTeam(id, team) {
        players.find((player) => player.id === id).team = team;
      },
      sendAnnouncement: (msg, to) => announcements.push({ msg, to }),
      kickPlayer: (id, reason) => kicks.push({ id, reason }),
    };
    const choose = createChooseController(room, {
      onReadyToStart: () => {},
      isExcluded: (player) => excluded.has(player.id),
      onAborted: () => {
        aborted += 1;
      },
    });
    return { choose, announcements, kicks, aborted: () => aborted };
  }

  it("choose normal com todos os specs AFK volta ao lobby", () => {
    const players = [
      p(1, TEAM.RED),
      p(2, TEAM.BLUE),
      p(3),
      p(4),
      p(5),
      p(6),
      p(7),
      p(8),
    ];
    const excluded = new Set([3, 4, 5, 6, 7, 8]);
    const { choose, aborted, announcements } = setup(players, { excluded });

    choose.promptCaptain();
    // Nada a fazer: o choose nem começa ativo.
    assert.equal(choose.isActive(), false);

    choose.tryStartChoose();
    assert.equal(choose.isActive(), false);
  });

  it("time sem capitão durante a reposição cancela em vez de esperar para sempre", () => {
    const players = [p(1, TEAM.RED), p(11, TEAM.RED), p(2, TEAM.BLUE), p(3), p(4)];
    const { choose } = setup(players);
    let result = null;
    choose.startReplacement(TEAM.BLUE, (payload) => {
      result = payload;
    });
    // O capitão azul sai da sala e o time fica sem ninguém para escolher.
    players.splice(2, 1);
    choose.promptCaptain();
    assert.equal(choose.isActive(), false);
    assert.deepEqual(result, { cancelled: true });
  });
});

describe("AFK voluntário em campo", () => {
  it("volta pro spec sem pausar/despausar o jogo a cada tick", () => {
    const players = [
      { id: 1, name: "A", team: 1 },
      { id: 2, name: "B", team: 2 },
    ];
    const pauses = [];
    const room = {
      getPlayerList: () => players,
      getScores: () => ({ red: 0, blue: 0, time: 30 }),
      getPlayerDiscProperties: () => ({ x: 0, y: 0 }),
      setPlayerTeam(id, team) {
        players.find((x) => x.id === id).team = team;
      },
      pauseGame: (on) => pauses.push(on),
      sendAnnouncement: () => {},
      kickPlayer: () => {},
    };
    const afk = createAfkTracker(room);
    afk.setAfk(players[0], true);
    assert.equal(players[0].team, 0);
    const pausesAfterCommand = pauses.length;

    // Admin devolveu o AFK para o time: o tick corrige sem mexer no relógio.
    players[0].team = 1;
    afk.tick();
    assert.equal(players[0].team, 0);
    assert.equal(pauses.length, pausesAfterCommand);
    afk.stop();
  });
});

describe("moderação", () => {
  function room(playersInit) {
    const players = playersInit;
    const announcements = [];
    const kicks = [];
    return {
      _players: players,
      announcements,
      kicks,
      getPlayerList: () => players,
      getScores: () => null,
      sendAnnouncement: (msg, to) => announcements.push({ msg, to }),
      kickPlayer: (id, reason) => kicks.push({ id, reason }),
      setPlayerTeam: () => {},
      setPlayerAdmin: () => {},
    };
  }

  it("staff não bane cargo igual ou superior", async () => {
    const r = room([
      { id: 1, name: "Estagiario", team: 0, auth: "a1" },
      { id: 2, name: "Chefe", team: 0, auth: "a2" },
    ]);
    const ctx = {
      admins: new Map([
        [1, { level: 1 }],
        [2, { level: 4 }],
      ]),
      mutes: new Map(),
      auths: new Map(),
      conns: new Map(),
      titles: new Map(),
    };
    const cmd = createCommandHandler(r, ctx);
    await cmd.handle(r._players[0], "!ban #2 30m tentando");
    assert.equal(r.kicks.length, 0);
    assert.ok(r.announcements.some((a) => /não pode banir/i.test(a.msg)));
  });

  it("ban sem banco kicka e avisa o admin que não persistiu", async () => {
    const r = room([
      { id: 1, name: "Chefe", team: 0, auth: "a1" },
      { id: 2, name: "Trollzao", team: 0, auth: "a2" },
    ]);
    const ctx = {
      admins: new Map([[1, { level: 4 }]]),
      mutes: new Map(),
      auths: new Map(),
      conns: new Map(),
      titles: new Map(),
    };
    const cmd = createCommandHandler(r, ctx);
    await cmd.handle(r._players[0], "!ban #2 30m spam");
    assert.equal(r.kicks.length, 1);
    assert.ok(r.announcements.some((a) => a.to === 1 && /não registrado/i.test(a.msg)));
  });

  it("!banauth sem admin é recusado", async () => {
    const r = room([{ id: 1, name: "Jogador", team: 0, auth: "a1" }]);
    const ctx = { admins: new Map(), mutes: new Map(), auths: new Map(), conns: new Map(), titles: new Map() };
    const cmd = createCommandHandler(r, ctx);
    await cmd.handle(r._players[0], "!banauth abc 30m x");
    assert.equal(r.kicks.length, 0);
    assert.ok(r.announcements.some((a) => /Sem permissão/i.test(a.msg)));
  });

  it("!banauth kicka quem está na sala com aquela auth", async () => {
    const r = room([
      { id: 1, name: "Chefe", team: 0, auth: "a1" },
      { id: 2, name: "Trollzao", team: 0, auth: "AUTH-TROLL" },
    ]);
    const ctx = {
      admins: new Map([[1, { level: 4 }]]),
      mutes: new Map(),
      auths: new Map(),
      conns: new Map(),
      titles: new Map(),
    };
    const cmd = createCommandHandler(r, ctx);
    await cmd.handle(r._players[0], "!banauth AUTH-TROLL 30m spam");
    assert.equal(r.kicks.length, 1);
    assert.equal(r.kicks[0].id, 2);
    assert.ok(!r.announcements.some((a) => a.to == null && String(a.msg).includes("AUTH-TROLL")));
  });

  it("!banauth não bane staff de cargo igual ou maior", async () => {
    const r = room([
      { id: 1, name: "Estagiario", team: 0, auth: "a1" },
      { id: 2, name: "Chefe", team: 0, auth: "CHEFE-AUTH" },
    ]);
    const ctx = {
      admins: new Map([
        [1, { level: 1 }],
        [2, { level: 4 }],
      ]),
      mutes: new Map(),
      auths: new Map(),
      conns: new Map(),
      titles: new Map(),
    };
    const cmd = createCommandHandler(r, ctx);
    await cmd.handle(r._players[0], "!banauth CHEFE-AUTH perm x");
    assert.equal(r.kicks.length, 0);
    assert.ok(r.announcements.some((a) => /não pode banir/i.test(a.msg)));
  });

  it("!unbanauth pede auth e não joga a chave no chat público", async () => {
    const r = room([{ id: 1, name: "Mod", team: 0, auth: "a1" }]);
    const ctx = {
      admins: new Map([[1, { level: 3 }]]),
      mutes: new Map(),
      auths: new Map(),
      conns: new Map(),
      titles: new Map(),
    };
    const cmd = createCommandHandler(r, ctx);
    await cmd.handle(r._players[0], "!unbanauth");
    assert.ok(r.announcements.some((a) => a.to === 1 && /Uso: !unbanauth/i.test(a.msg)));
    r.announcements.length = 0;
    await cmd.handle(r._players[0], "!unbanauth SEGREDO_AUTH");
    const publicMsgs = r.announcements.filter((a) => a.to == null);
    assert.ok(!publicMsgs.some((a) => a.msg.includes("SEGREDO_AUTH")));
    assert.ok(r.announcements.some((a) => a.to === 1 && /unban por auth|nenhum ban/i.test(a.msg)));
  });

  it("unmute por auth não expõe a auth no chat público", async () => {
    const r = room([{ id: 1, name: "Mod", team: 0, auth: "a1" }]);
    const ctx = {
      admins: new Map([[1, { level: 3 }]]),
      mutes: new Map([[7, { endsAt: Date.now() + 60000 }]]),
      auths: new Map([[7, "SEGREDO_AUTH"]]),
      conns: new Map(),
      titles: new Map(),
    };
    const cmd = createCommandHandler(r, ctx);
    await cmd.handle(r._players[0], "!unmute SEGREDO_AUTH");
    assert.equal(ctx.mutes.has(7), false);
    const publicMsgs = r.announcements.filter((a) => a.to == null);
    assert.ok(!publicMsgs.some((a) => a.msg.includes("SEGREDO_AUTH")));
  });

  it("!cargo responde só para quem pediu", async () => {
    const r = room([{ id: 1, name: "Jogador", team: 0, auth: "a1" }]);
    const ctx = {
      admins: new Map(),
      mutes: new Map(),
      auths: new Map(),
      conns: new Map(),
      titles: new Map(),
    };
    const cmd = createCommandHandler(r, ctx);
    await cmd.handle(r._players[0], "!cargo 1");
    assert.ok(r.announcements.every((a) => a.to === 1));
  });

  it("cooldown do !afk é esquecido quando o jogador sai", async () => {
    const r = room([{ id: 1, name: "Jogador", team: 0, auth: "a1" }]);
    const afkCalls = [];
    const ctx = {
      admins: new Map(),
      mutes: new Map(),
      auths: new Map(),
      conns: new Map(),
      titles: new Map(),
      afk: {
        isAfk: () => false,
        setAfk: (player, on) => afkCalls.push({ id: player.id, on }),
      },
    };
    const cmd = createCommandHandler(r, ctx);
    await cmd.handle(r._players[0], "!afk");
    await cmd.handle(r._players[0], "!afk");
    assert.equal(afkCalls.length, 1);

    cmd.forgetPlayer(1);
    await cmd.handle(r._players[0], "!afk");
    assert.equal(afkCalls.length, 2);
  });
});

describe("findPlayer", () => {
  const room = {
    getPlayerList: () => [
      { id: 1, name: "João" },
      { id: 2, name: "Joãozinho" },
      { id: 3, name: "Major" },
    ],
  };

  it("nome parcial ambíguo não resolve (evita punir o errado)", () => {
    assert.equal(findPlayer(room, "jo"), null);
  });

  it("nome exato ganha do parcial", () => {
    assert.equal(findPlayer(room, "joão").id, 1);
  });

  it("parcial único resolve", () => {
    assert.equal(findPlayer(room, "major").id, 3);
    assert.equal(findPlayer(room, "zinho").id, 2);
  });
});

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createCommandHandler } = require("../src/commands");
const { createAfkTracker } = require("../src/room/afk");
const { TEASE_LINES, PRAISE_LINES, pickTeaseLine, pickPraiseLine } = require("../src/room/bet");

function mockRoom() {
  const players = [
    { id: 1, name: "RedCap", team: 1, auth: "auth1" },
    { id: 2, name: "Blue1", team: 2, auth: "auth2" },
    { id: 3, name: "Spec", team: 0, auth: "auth3" },
  ];
  const announcements = [];
  const kicks = [];
  const adminFlags = [];
  return {
    announcements,
    getPlayerList: () => players,
    sendAnnouncement: (msg, to, color) => announcements.push({ msg, to, color }),
    setPlayerTeam: (id, team) => {
      const p = players.find((x) => x.id === id);
      if (p) p.team = team;
    },
    kickPlayer: (id, reason, ban) => kicks.push({ id, reason, ban }),
    setPlayerAdmin: (id, value) => adminFlags.push({ id, value }),
    _players: players,
    kicks,
    adminFlags,
  };
}

function withClock(ctx, start = 1_700_000_000_000) {
  let t = start;
  ctx.now = () => t;
  ctx.advance = (ms) => {
    t += ms;
  };
  return ctx;
}

describe("comandos (mock room)", () => {
  it("!ids lista jogadores", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk };
    const cmd = createCommandHandler(room, ctx);
    const ok = await cmd.handle(room._players[0], "!ids");
    assert.equal(ok, true);
    assert.ok(room.announcements.some((a) => a.msg.includes("#1")));
    afk.stop();
  });

  it("t <msg> envia só para o time; t sozinho é chat normal", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk };
    const cmd = createCommandHandler(room, ctx);
    assert.equal(cmd.handleTeamChat(room._players[0], "t bola"), true);
    const teamMsgs = room.announcements.filter((a) => String(a.msg).includes("[TEAM]"));
    assert.equal(teamMsgs.length, 1);
    assert.equal(teamMsgs[0].to, 1);
    assert.match(teamMsgs[0].msg, /bola/);
    room.announcements.length = 0;
    assert.equal(cmd.handleTeamChat(room._players[0], "tava ruim"), false);
    assert.equal(cmd.handleTeamChat(room._players[0], "t"), false);
    afk.stop();
  });

  it("% envia só para staff; jogador comum não vê", () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = {
      admins: new Map([
        [1, { level: 4, title: "Chefe" }],
        [2, { level: 2, title: "Mod" }],
      ]),
      mutes: new Map(),
      afk,
    };
    const cmd = createCommandHandler(room, ctx);
    assert.equal(cmd.handleStaffChat(room._players[2], "% oi"), true);
    assert.ok(room.announcements.some((a) => a.to === 3 && /só para staff/i.test(a.msg)));
    assert.equal(room.announcements.some((a) => /\[ADM\]/.test(a.msg)), false);
    room.announcements.length = 0;
    assert.equal(cmd.handleStaffChat(room._players[0], "% bora kick"), true);
    const staff = room.announcements.filter((a) => /\[ADM\]/.test(a.msg));
    assert.equal(staff.length, 2);
    assert.ok(staff.every((a) => a.to === 1 || a.to === 2));
    assert.equal(room.announcements.some((a) => a.to === 3), false);
    afk.stop();
  });

  it("@nick manda PV só para o destinatário e o remetente", () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = {
      admins: new Map(),
      mutes: new Map(),
      afk,
      titles: new Map([[1, { emblem: "🌱", name: "Novato", color: 0xbdc3c7 }]]),
    };
    const cmd = createCommandHandler(room, ctx);
    assert.equal(cmd.handleWhisper(room._players[0], "@Spec eae"), true);
    const toSpec = room.announcements.filter((a) => a.to === 3);
    const toSender = room.announcements.filter((a) => a.to === 1);
    const toOthers = room.announcements.filter((a) => a.to == null || a.to === 2);
    assert.equal(toSpec.length, 1);
    assert.equal(toSpec[0].msg, "📩 PV de @RedCap: eae");
    assert.equal(toSender.length, 1);
    assert.equal(toSender[0].msg, "📩 PV para @Spec: eae");
    assert.equal(toOthers.length, 0);
    afk.stop();
  });

  it("admin na sala também lê o PV", () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = {
      admins: new Map([[2, { level: 2, title: "Mod" }]]),
      mutes: new Map(),
      afk,
      titles: new Map(),
    };
    const cmd = createCommandHandler(room, ctx);
    assert.equal(cmd.handleWhisper(room._players[0], "@Spec eae"), true);
    const toAdmin = room.announcements.filter((a) => a.to === 2);
    assert.equal(toAdmin.length, 1);
    assert.match(toAdmin[0].msg, /@RedCap → @Spec: eae/);
    assert.equal(room.announcements.some((a) => a.to == null), false);
    afk.stop();
  });

  it("@#id funciona e nick inexistente avisa só no PV", () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk, titles: new Map() };
    const cmd = createCommandHandler(room, ctx);
    assert.equal(cmd.handleWhisper(room._players[0], "@#3 bora"), true);
    assert.ok(room.announcements.some((a) => a.to === 3 && /bora/.test(a.msg)));
    room.announcements.length = 0;
    assert.equal(cmd.handleWhisper(room._players[0], "@Ninguem oi"), true);
    assert.ok(room.announcements.every((a) => a.to === 1));
    assert.ok(room.announcements.some((a) => /não encontrado/i.test(a.msg)));
    assert.equal(cmd.handleWhisper(room._players[0], "oi @Spec"), false);
    afk.stop();
  });

  it("!afk no 4v4 ao vivo com spec é recusado", async () => {
    const room = mockRoom();
    room.getScores = () => ({ red: 0, blue: 0, time: 12, timeLimit: 180 });
    room.pauseGame = () => {};
    const afk = createAfkTracker(room);
    const ctx = {
      admins: new Map(),
      mutes: new Map(),
      afk,
      match: { isCompetitive: () => true },
    };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[0], "!afk");
    assert.equal(room._players[0].team, 1);
    assert.equal(afk.isAfk(1), false);
    assert.ok(room.announcements.some((a) => /não pode usar !afk no 4v4/i.test(a.msg)));
    afk.stop();
  });

  it("!afk no 4v4 ao vivo sem spec é recusado", async () => {
    const players = [];
    for (let i = 1; i <= 8; i++) {
      players.push({ id: i, name: `P${i}`, team: i <= 4 ? 1 : 2, auth: `a${i}` });
    }
    const announcements = [];
    const room = {
      announcements,
      getPlayerList: () => players,
      getScores: () => ({ red: 0, blue: 0, time: 12, timeLimit: 180 }),
      sendAnnouncement: (msg, to, color) => announcements.push({ msg, to, color }),
      setPlayerTeam: (id, team) => {
        const p = players.find((x) => x.id === id);
        if (p) p.team = team;
      },
    };
    const afk = createAfkTracker(room);
    const ctx = {
      admins: new Map(),
      mutes: new Map(),
      afk,
      match: { isCompetitive: () => true },
    };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(players[0], "!afk");
    assert.equal(players[0].team, 1);
    assert.equal(afk.isAfk(1), false);
    assert.ok(announcements.some((a) => /não pode usar !afk no 4v4/i.test(a.msg)));
    afk.stop();
  });

  it("!afk no 4v4 antes da partida começar é permitido", async () => {
    const room = mockRoom();
    room.getScores = () => null;
    room.pauseGame = () => {};
    const afk = createAfkTracker(room);
    const ctx = {
      admins: new Map(),
      mutes: new Map(),
      afk,
      match: { isCompetitive: () => true },
    };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[0], "!afk");
    assert.equal(room._players[0].team, 0);
    assert.equal(afk.isAfk(1), true);
    afk.stop();
  });

  it("!afk no 1v1/2v2 (warmup) manda para spec", async () => {
    const room = mockRoom();
    room.getScores = () => ({ red: 0, blue: 0, time: 12, timeLimit: 180 });
    room.pauseGame = () => {};
    const afk = createAfkTracker(room);
    const ctx = {
      admins: new Map(),
      mutes: new Map(),
      afk,
      match: { isCompetitive: () => false },
    };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[0], "!afk");
    assert.equal(room._players[0].team, 0);
    assert.equal(afk.isAfk(1), true);
    afk.stop();
  });

  it("!afk funciona no time entre jogos (choose/lobby)", async () => {
    const room = mockRoom();
    room.getScores = () => null;
    const afk = createAfkTracker(room);
    const ctx = {
      admins: new Map(),
      mutes: new Map(),
      afk,
      match: { isCompetitive: () => false },
    };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[0], "!afk");
    assert.equal(room._players[0].team, 0);
    assert.equal(afk.isAfk(1), true);
    afk.stop();
  });

  it("!afk funciona no spec", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[2], "!afk");
    assert.equal(afk.isAfk(3), true);
    await cmd.handle(room._players[2], "!afk");
    assert.equal(afk.isAfk(3), false);
    afk.stop();
  });

  it("!afk tem delay de 10s contra spam", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk };
    const cmd = createCommandHandler(room, ctx);
    const spec = room._players[2];

    await cmd.handle(spec, "!afk");
    assert.equal(afk.isAfk(3), true);
    await cmd.handle(spec, "!afk");
    assert.equal(afk.isAfk(3), false);

    await cmd.handle(spec, "!afk");
    assert.equal(afk.isAfk(3), false);
    assert.ok(room.announcements.some((a) => /espere \d+s para usar !afk/i.test(a.msg)));
    afk.stop();
  });

  it("!afk é permitido quando é o único jogador no treino", async () => {
    const room = mockRoom();
    room._players.splice(1); // só o RedCap
    const afk = createAfkTracker(room);
    const ctx = {
      admins: new Map(),
      mutes: new Map(),
      afk,
      match: { isCompetitive: () => false },
    };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[0], "!afk");
    assert.equal(room._players[0].team, 0);
    assert.equal(afk.isAfk(1), true);
    afk.stop();
  });

  it("!help responde", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk, titles: new Map() };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[2], "!help");
    assert.ok(room.announcements.some((a) => String(a.msg).includes("!status")));
    afk.stop();
  });

  it("!ajuda lista só comandos de jogador", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk, titles: new Map() };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[2], "!ajuda");
    const msg = room.announcements.find((a) => String(a.msg).includes("!afks"))?.msg || "";
    assert.match(msg, /!afk /);
    assert.match(msg, /!unis/);
    assert.match(msg, /@nick/);
    assert.match(msg, /!zoeira/);
    assert.match(msg, /!ranking/);
    assert.match(msg, /!listacargos/);
    assert.equal(msg.includes("!ban"), false);
    assert.equal(msg.includes("!ajudaadm"), false);
    assert.equal(msg.includes("!roleta"), false);
    assert.equal(msg.includes("!gordo"), false);
    assert.equal(/!uni /.test(msg), false);
    assert.equal(msg.includes("!t "), false);
    assert.equal(msg.includes("% <msg>"), false);
    afk.stop();
  });

  it("!zoeira lista as zoeiras", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk, titles: new Map() };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[2], "!zoeira");
    const msg = room.announcements.find((a) => String(a.msg).includes("!roleta"))?.msg || "";
    assert.match(msg, /!bet/);
    assert.match(msg, /!provocar/);
    assert.match(msg, /!gordo/);
    assert.match(msg, /!aura/);
    assert.equal(msg.includes("!ban"), false);
    afk.stop();
  });

  it("!ranking lista os tops", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk, titles: new Map() };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[2], "!ranking");
    const msg = room.announcements.find((a) => String(a.msg).includes("!gols"))?.msg || "";
    assert.match(msg, /!assists/);
    assert.match(msg, /!topstreak/);
    assert.equal(msg.includes("!roleta"), false);
    afk.stop();
  });

  it("!ajuda de admin inclui !ajudaadm", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = {
      admins: new Map([[1, { level: 2, title: "Mod" }]]),
      mutes: new Map(),
      afk,
      titles: new Map(),
    };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[0], "!ajuda");
    const msg = room.announcements.find((a) => String(a.msg).includes("!ajudaadm"))?.msg || "";
    assert.match(msg, /!ajudaadm/);
    assert.equal(msg.includes("!ban"), false);
    afk.stop();
  });

  it("!ajudaadm não responde nada se não for admin", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk, titles: new Map() };
    const cmd = createCommandHandler(room, ctx);
    const ok = await cmd.handle(room._players[2], "!ajudaadm");
    assert.equal(ok, true);
    assert.equal(room.announcements.length, 0);
    afk.stop();
  });

  it("!ajudaadm lista comandos de admin", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = {
      admins: new Map([[1, { level: 3, title: "Admin" }]]),
      mutes: new Map(),
      afk,
      titles: new Map(),
    };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[0], "!ajudaadm");
    const msg = room.announcements.find((a) => String(a.msg).includes("!ban"))?.msg || "";
    assert.match(msg, /!mute/);
    assert.match(msg, /!unban/);
    assert.match(msg, /!banauth/);
    assert.match(msg, /!unbanauth/);
    assert.match(msg, /!unmute/);
    assert.equal(msg.includes("!provocaradm"), false, "gerente não vê comando de Chefe");
    afk.stop();
  });

  it("!afks lista quem está AFK", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[0], "!afks");
    assert.ok(room.announcements.some((a) => /Ninguém está AFK/i.test(a.msg)));

    await cmd.handle(room._players[2], "!afk");
    room.announcements.length = 0;
    await cmd.handle(room._players[0], "!afks");
    const msg = room.announcements.find((a) => /AFKs/i.test(a.msg))?.msg || "";
    assert.match(msg, /Spec/);
    assert.equal(/#\d+/.test(msg), false, "não mostra #id");
    assert.equal(msg.includes("RedCap"), false);
    afk.stop();
  });

  it("!provocar tem 100+ zoações e !elogiar 100+ elogios", () => {
    assert.ok(TEASE_LINES.length >= 100, `provocar: ${TEASE_LINES.length}`);
    assert.ok(PRAISE_LINES.length >= 100, `elogiar: ${PRAISE_LINES.length}`);
    assert.match(pickTeaseLine("Netto", () => 0), /Netto/);
    assert.match(pickPraiseLine("Netto", () => 0), /Netto/);
    assert.match(pickPraiseLine("Netto", () => 0), /⭐/);
    const teases = TEASE_LINES.map((fn) => fn("Netto")).join("\n");
    const praises = PRAISE_LINES.map((fn) => fn("Netto")).join("\n");
    for (const name of ["Kyamo", "Jalin", "Didiey", "Copas"]) {
      assert.match(teases, new RegExp(name));
      assert.match(praises, new RegExp(name));
    }
  });

  it("!bet anuncia o contador em público e respeita cooldown", async () => {
    const room = mockRoom();
    let bets = 10;
    const ctx = withClock({
      admins: new Map(),
      mutes: new Map(),
      roomStats: {
        recordBet() {
          bets += 1;
          return { bets };
        },
      },
    });
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[0], "!bet");
    const msg = room.announcements.find((a) => a.to == null && /🎲/.test(a.msg))?.msg || "";
    assert.match(msg, /Haxbooket pela 11ª vez/);
    room.announcements.length = 0;
    await cmd.handle(room._players[0], "!bet");
    assert.ok(room.announcements.some((a) => a.to === room._players[0].id && /Espere/i.test(a.msg)));
    assert.equal(bets, 11);
  });

  it("!bet incrementa a cada jogador e não precisa de nick", async () => {
    const room = mockRoom();
    let bets = 0;
    const ctx = withClock({
      admins: new Map(),
      mutes: new Map(),
      roomStats: {
        recordBet() {
          bets += 1;
          return { bets };
        },
      },
    });
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[2], "!bet");
    ctx.advance(15_000);
    await cmd.handle(room._players[0], "!aposta");
    const msgs = room.announcements.filter((a) => a.to == null && /🎲/.test(a.msg)).map((a) => a.msg);
    assert.match(msgs[0], /pela 1ª vez/);
    assert.match(msgs[1], /pela 2ª vez/);
  });

  it("!viado anuncia o contador em público e respeita cooldown", async () => {
    const room = mockRoom();
    let viados = 4;
    const ctx = withClock({
      admins: new Map(),
      mutes: new Map(),
      roomStats: {
        recordViado() {
          viados += 1;
          return { viados };
        },
      },
    });
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[0], "!viado");
    const msg = room.announcements.find((a) => a.to == null && /🌈/.test(a.msg))?.msg || "";
    assert.match(msg, /Viraram viado pela 5ª vez/);
    room.announcements.length = 0;
    await cmd.handle(room._players[0], "!viado");
    assert.ok(room.announcements.some((a) => a.to === room._players[0].id && /Espere/i.test(a.msg)));
    assert.equal(viados, 5);
  });

  it("!viado incrementa a cada jogador", async () => {
    const room = mockRoom();
    let viados = 0;
    const ctx = withClock({
      admins: new Map(),
      mutes: new Map(),
      roomStats: {
        recordViado() {
          viados += 1;
          return { viados };
        },
      },
    });
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[2], "!viado");
    ctx.advance(15_000);
    await cmd.handle(room._players[0], "!viados");
    const msgs = room.announcements.filter((a) => a.to == null && /🌈/.test(a.msg)).map((a) => a.msg);
    assert.match(msgs[0], /pela 1ª vez/);
    assert.match(msgs[1], /pela 2ª vez/);
  });

  it("comandos públicos compartilham cooldown da sala — outro jogador não flooda !bet/!gols/!provocar", async () => {
    const room = mockRoom();
    let bets = 0;
    const ctx = withClock({
      admins: new Map(),
      mutes: new Map(),
      roomStats: {
        recordBet() {
          bets += 1;
          return { bets };
        },
      },
      getLeaderboard: async () => ({ unavailable: false, rows: [{ nick: "Netto", value: 12 }] }),
    });
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[0], "!bet");
    room.announcements.length = 0;
    await cmd.handle(room._players[2], "!aposta");
    assert.ok(room.announcements.some((a) => a.to === room._players[2].id && /Espere/i.test(a.msg)));
    assert.equal(bets, 1);
    room.announcements.length = 0;
    await cmd.handle(room._players[1], "!provocar Spec");
    assert.ok(room.announcements.some((a) => a.to === room._players[1].id && /Espere/i.test(a.msg)));
    assert.equal(room.announcements.some((a) => a.to == null), false);
    room.announcements.length = 0;
    await cmd.handle(room._players[2], "!gols");
    assert.ok(room.announcements.some((a) => /Top 5 gols/.test(a.msg)));
    room.announcements.length = 0;
    await cmd.handle(room._players[2], "!gols");
    assert.ok(room.announcements.some((a) => a.to === room._players[2].id && /Espere/i.test(a.msg)));
  });

  it("!provocar zoa o alvo em público e respeita cooldown", async () => {
    const room = mockRoom();
    const ctx = withClock({ admins: new Map(), mutes: new Map() });
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[0], "!provocar Spec");
    const msg = room.announcements.find((a) => a.to == null && /🎲/.test(a.msg))?.msg || "";
    assert.match(msg, /Spec/);
    room.announcements.length = 0;
    await cmd.handle(room._players[0], "!provocar Spec");
    assert.ok(room.announcements.some((a) => a.to === room._players[0].id && /Espere/i.test(a.msg)));
  });

  it("!provocar #id e sem alvo pega alguém da sala", async () => {
    const room = mockRoom();
    const ctx = withClock({ admins: new Map(), mutes: new Map() });
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[2], "!provocar #1");
    assert.ok(room.announcements.some((a) => a.to == null && /RedCap/.test(a.msg)));
    room.announcements.length = 0;
    ctx.advance(15_000);
    await cmd.handle(room._players[0], "!provocar");
    assert.ok(room.announcements.some((a) => a.to == null && /🎲/.test(a.msg)));
  });

  it("!roleta muta o alvo ou quem chamou e tem cooldown global de 15min", async () => {
    const room = mockRoom();
    const ctx = withClock({ admins: new Map(), mutes: new Map(), random: () => 0.9 });
    const cmd = createCommandHandler(room, ctx);

    await cmd.handle(room._players[0], "!roleta");
    assert.ok(room.announcements.some((a) => a.to === 1 && /Uso: !roleta/i.test(a.msg)));

    room.announcements.length = 0;
    await cmd.handle(room._players[0], "!roleta RedCap");
    assert.ok(room.announcements.some((a) => a.to === 1 && /Marca outra pessoa/i.test(a.msg)));

    room.announcements.length = 0;
    await cmd.handle(room._players[0], "!roleta Spec");
    const hit = room.announcements.find((a) => a.to == null && /Roleta/.test(a.msg))?.msg || "";
    assert.match(hit, /RedCap apontou pra Spec/);
    assert.match(hit, /Caiu em Spec/);
    const mute = ctx.mutes.get(3);
    assert.ok(mute);
    assert.equal(mute.reason, "roleta");
    assert.ok(mute.endsAt - Date.now() > 179_000);
    assert.ok(mute.endsAt - Date.now() <= 180_000);

    room.announcements.length = 0;
    await cmd.handle(room._players[1], "!roleta Spec");
    assert.ok(room.announcements.some((a) => a.to === 2 && /só gira de novo/i.test(a.msg)));
    assert.equal(ctx.mutes.has(2), false);

    ctx.advance(15 * 60 * 1000);
    ctx.random = () => 0;
    room.announcements.length = 0;
    await cmd.handle(room._players[1], "!roleta Spec");
    const second = room.announcements.find((a) => a.to == null && /Roleta/.test(a.msg))?.msg || "";
    assert.match(second, /Caiu em Blue1/);
    assert.ok(ctx.mutes.get(2)?.reason === "roleta");
  });

  it("!provocaradm manda texto livre só se for Chefe", async () => {
    const room = mockRoom();
    const ctx = withClock({
      admins: new Map([
        [1, { level: 4, title: "Chefe" }],
        [2, { level: 3, title: "Gerente" }],
      ]),
      mutes: new Map(),
    });
    const cmd = createCommandHandler(room, ctx);

    await cmd.handle(room._players[2], "!provocaradm o red entrega demais");
    assert.ok(room.announcements.some((a) => a.to === 3 && /Só o Chefe/i.test(a.msg)));
    assert.equal(room.announcements.some((a) => a.to == null), false);
    room.announcements.length = 0;

    await cmd.handle(room._players[1], "!provocaradm o red entrega demais");
    assert.ok(room.announcements.some((a) => a.to === 2 && /Só o Chefe/i.test(a.msg)));
    assert.equal(room.announcements.some((a) => a.to == null), false);
    room.announcements.length = 0;

    await cmd.handle(room._players[0], "!provocaradm");
    assert.ok(room.announcements.some((a) => a.to === 1 && /Uso: !provocaradm/i.test(a.msg)));
    room.announcements.length = 0;

    await cmd.handle(room._players[0], "!provocaradm o red entrega demais");
    const pub = room.announcements.find((a) => a.to == null);
    assert.equal(pub?.msg, "🎲 o red entrega demais");
    assert.equal(pub?.color, 0xe67e22);

    await cmd.handle(room._players[0], "!ajudaadm");
    assert.ok(room.announcements.some((a) => /!provocaradm/.test(a.msg)));
  });

  it("!elogiar elogia o alvo em público e respeita cooldown", async () => {
    const room = mockRoom();
    const ctx = withClock({ admins: new Map(), mutes: new Map() });
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[0], "!elogiar Spec");
    const msg = room.announcements.find((a) => a.to == null && /⭐/.test(a.msg))?.msg || "";
    assert.match(msg, /Spec/);
    room.announcements.length = 0;
    await cmd.handle(room._players[0], "!craque Spec");
    assert.ok(room.announcements.some((a) => a.to === room._players[0].id && /Espere/i.test(a.msg)));
  });

  it("!gordo e !aura duram 20min e o cooldown de 15min é da sala", async () => {
    const room = mockRoom();
    const ctx = withClock({
      admins: new Map(),
      mutes: new Map(),
      titles: new Map([
        [3, { id: "novato", emblem: "🌱", name: "Novato", color: 0xbdc3c7 }],
      ]),
    });
    const cmd = createCommandHandler(room, ctx);
    const red = room._players[0];
    const blue = room._players[1];
    const spec = room._players[2];

    await cmd.handle(red, "!gordo Spec");
    assert.ok(
      room.announcements.some(
        (a) =>
          a.to == null &&
          /RedCap invocou o CaçadorDeGordo 🍔 em Spec/.test(a.msg)
      )
    );
    assert.equal(ctx.titles.get(3).id, "gordo");
    assert.match(cmd.formatPlayerChat(spec, "oi").line, /^\[🍔\] Spec: /);

    room.announcements.length = 0;
    await cmd.handle(red, "!aura Spec");
    assert.ok(
      room.announcements.some((a) => a.to === red.id && /já está com 🍔 Gordo/.test(a.msg)),
      "!aura não sobrepõe !gordo"
    );
    assert.equal(ctx.titles.get(3).id, "gordo");

    room.announcements.length = 0;
    await cmd.handle(red, "!gordo Spec");
    assert.ok(
      room.announcements.some((a) => a.to === red.id && /já está com 🍔 Gordo/.test(a.msg)),
      "não reaplica o mesmo cargo no alvo"
    );

    room.announcements.length = 0;
    await cmd.handle(red, "!gordo Blue1");
    assert.ok(room.announcements.some((a) => a.to === red.id && /Espere/.test(a.msg) && /gordo/.test(a.msg)));

    room.announcements.length = 0;
    await cmd.handle(blue, "!gordo RedCap");
    assert.ok(
      room.announcements.some((a) => a.to === blue.id && /Espere/.test(a.msg)),
      "cooldown é da sala, não por jogador"
    );

    ctx.advance(15 * 60 * 1000);
    room.announcements.length = 0;
    await cmd.handle(red, "!gordo Spec");
    assert.ok(
      room.announcements.some((a) => a.to === red.id && /já está com 🍔 Gordo/.test(a.msg)),
      "cooldown passou mas o alvo ainda tem o cargo"
    );
    assert.equal(ctx.titles.get(3).id, "gordo");

    ctx.advance(5 * 60 * 1000);
    cmd.formatPlayerChat(spec, "oi");
    assert.match(cmd.formatPlayerChat(spec, "oi").line, /^\[🌱\] /);
    assert.equal(ctx.titles.get(3).id, "novato");

    room.announcements.length = 0;
    await cmd.handle(red, "!aura Spec");
    assert.ok(
      room.announcements.some(
        (a) =>
          a.to == null &&
          /RedCap deu a bênção do ProdLuz 🗿 para Spec/.test(a.msg)
      )
    );
    assert.equal(ctx.titles.get(3).id, "aura");
    assert.equal(cmd.formatPlayerChat(spec, "oi").line, "[🗿] Spec: oi");

    room.announcements.length = 0;
    await cmd.handle(blue, "!gordo Spec");
    assert.ok(
      room.announcements.some((a) => a.to === blue.id && /já está com 🗿 Aura/.test(a.msg)),
      "!gordo não sobrepõe !aura"
    );
    assert.equal(ctx.titles.get(3).id, "aura");

    room.announcements.length = 0;
    await cmd.handle(blue, "!ego Spec");
    assert.ok(
      room.announcements.some((a) => a.to === blue.id && /já está com 🗿 Aura/.test(a.msg)),
      "!ego não sobrepõe aura no mesmo alvo"
    );

    room.announcements.length = 0;
    await cmd.handle(blue, "!aura RedCap");
    assert.ok(room.announcements.some((a) => a.to === blue.id && /Espere/.test(a.msg) && /aura/.test(a.msg)));

    ctx.advance(20 * 60 * 1000);
    cmd.formatPlayerChat(spec, "oi");
    assert.match(cmd.formatPlayerChat(spec, "oi").line, /^\[🌱\] /);
    assert.equal(ctx.titles.get(3).id, "novato");

    room.announcements.length = 0;
    await cmd.handle(blue, "!gordo Spec");
    assert.ok(room.announcements.some((a) => a.to == null && /🍔/.test(a.msg)));
    assert.equal(ctx.titles.get(3).id, "gordo");
  });

  it("!gordo sobrevive reload de cargo e rejoin com a mesma auth", async () => {
    const room = mockRoom();
    const ctx = withClock({
      admins: new Map(),
      mutes: new Map(),
      titles: new Map(),
    });
    const cmd = createCommandHandler(room, ctx);
    const spec = room._players[2];

    await cmd.handle(room._players[0], "!gordo Spec");
    ctx.titles.set(3, { id: "novato", emblem: "🌱", name: "Novato", color: 0xbdc3c7 });
    await cmd.loadTitleForPlayer(spec);
    assert.equal(ctx.titles.get(3).id, "gordo");
  });

  it("chat usa só emoji + nick, sem escrever Novato", () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = {
      admins: new Map(),
      mutes: new Map(),
      afk,
      titles: new Map([[1, { emblem: "🌱", name: "Novato", color: 0xbdc3c7 }]]),
    };
    const cmd = createCommandHandler(room, ctx);
    const { line, color } = cmd.formatPlayerChat(room._players[0], "oi");
    assert.equal(line, "[🌱] RedCap: oi");
    assert.equal(color, 0xff5c5c, "vermelho no time vermelho");
    assert.equal(cmd.formatPlayerChat(room._players[1], "oi").color, 0x5aa7ff, "azul no time azul");
    assert.equal(cmd.formatPlayerChat(room._players[2], "oi").color, 0xcfd3d8, "spec neutro");
    afk.stop();
  });

  it("chat de Chefe usa só o cargo ativo", () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = {
      admins: new Map([[1, { level: 4, title: "Chefe" }]]),
      mutes: new Map(),
      afk,
      titles: new Map([[1, { emblem: "👑", name: "Chefe", color: 0xd4a017, id: "chefe", kind: "staff", level: 4 }]]),
    };
    const cmd = createCommandHandler(room, ctx);
    const { line, color } = cmd.formatPlayerChat(room._players[0], "s");
    assert.equal(line, "[👑] RedCap: s");
    assert.equal(color, 0xd4a017, "Chefe usa amarelo escuro, não a cor do time");
    afk.stop();
  });

  it("streak ≥ 3: vermelho no chat com 🔥 e vermelho destacado; AFK/spec perdem", () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const streak = { get: () => 3 };
    const ctx = {
      admins: new Map(),
      mutes: new Map(),
      afk,
      streak,
      titles: new Map([[1, { emblem: "🌱", name: "Novato", color: 0xbdc3c7 }]]),
    };
    const cmd = createCommandHandler(room, ctx);
    const red = cmd.formatPlayerChat(room._players[0], "oi");
    assert.equal(red.line, "[🔥] RedCap: oi");
    assert.equal(red.color, 0xff1a1a);
    assert.equal(cmd.formatPlayerChat(room._players[1], "oi").line, "Blue1: oi", "azul não pega");
    assert.equal(cmd.formatPlayerChat(room._players[2], "oi").line, "Spec: oi", "spec não pega");

    afk.setAfk(room._players[0], true);
    assert.match(cmd.formatPlayerChat(room._players[0], "oi").line, /^\[🌱\] /, "AFK perde o 🔥");
    afk.stop();
  });

  it("!bb kicka o jogador da sala", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[2], "!bb");
    assert.ok(room.kicks.some((k) => k.id === 3 && k.ban === false));
    assert.equal(room.announcements.some((a) => /saiu/i.test(a.msg)), false);
    afk.stop();
  });

  it("!discord anuncia o convite", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[0], "!discord");
    assert.ok(
      room.announcements.some((a) => /discord\.gg\/ZTu7zwgvhm/i.test(a.msg))
    );
    afk.stop();
  });

  it("!site anuncia o Haxbook", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[0], "!site");
    assert.ok(room.announcements.some((a) => /haxbook\.com\.br/i.test(a.msg)));
    afk.stop();
  });

  it("!listacargos mostra todos os emblemas e a condição, mesmo sem ter", async () => {
    const room = mockRoom();
    const ctx = withClock({ admins: new Map(), mutes: new Map() });
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[2], "!listacargos");
    const msg = room.announcements.find((a) => a.to === 3)?.msg || "";
    assert.match(msg, /Novato — livre/);
    assert.match(msg, /Lenda — 1600 jogos/);
    assert.match(msg, /Negativo — 10 jogos/);
    assert.equal(msg.includes("Gordo"), false);
    room.announcements.length = 0;
    await cmd.handle(room._players[2], "!listacargos");
    assert.ok(room.announcements.some((a) => a.to === 3 && /Espere/i.test(a.msg)));
  });

  it("!gols !assists !golcontra !cs mostram top 5", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const boards = {
      goals: [{ nick: "Netto", value: 12 }],
      assists: [{ nick: "Ana", value: 8 }],
      own_goals: [{ nick: "Caio", value: 3 }],
      cs: [{ nick: "Goleiro", value: 5 }],
    };
    const ctx = {
      admins: new Map(),
      mutes: new Map(),
      afk,
      getLeaderboard: async (stat) => ({ unavailable: false, rows: boards[stat] }),
    };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[0], "!gols");
    await cmd.handle(room._players[0], "!assists");
    await cmd.handle(room._players[0], "!golcontra");
    await cmd.handle(room._players[0], "!cs");
    const msg = room.announcements.map((a) => a.msg).join("\n");
    assert.match(msg, /Top 5 gols/);
    assert.match(msg, /1\. Netto — 12/);
    assert.match(msg, /Top 5 assistências/);
    assert.match(msg, /1\. Ana — 8/);
    assert.match(msg, /Top 5 gols contra/);
    assert.match(msg, /1\. Caio — 3/);
    assert.match(msg, /Top 5 clean sheets/);
    assert.match(msg, /1\. Goleiro — 5/);
    afk.stop();
  });

  it("!topstreak mostra recorde da sala", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = {
      admins: new Map(),
      mutes: new Map(),
      afk,
      streak: {
        get: () => 2,
        getBest: () => 9,
        getBestHolders: () => ["Netto", "Baleio", "Rato", "GH"],
      },
    };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[0], "!topstreak");
    assert.ok(
      room.announcements.some((a) =>
        /Maior streak da sala: 9 · Netto, Baleio, Rato, GH/.test(a.msg)
      )
    );
    afk.stop();
  });

  it("!stats usa auth em cache se o chat não manda", async () => {
    const room = mockRoom();
    const player = { id: 1, name: "RedCap", team: 1 };
    const ctx = {
      admins: new Map(),
      mutes: new Map(),
      auths: new Map([[1, "auth1"]]),
    };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(player, "!stats");
    assert.ok(!room.announcements.some((a) => /Sem auth/i.test(a.msg)));
    assert.ok(
      room.announcements.some((a) => /Jogos:|WR |logado no Haxball/i.test(a.msg))
    );
  });

  it("!status mostra jogos, gols, CS, MVP, assist, WR e cargo", async () => {
    const room = mockRoom();
    const player = room._players[0];
    const ctx = {
      admins: new Map([[1, { level: 4, title: "Chefe" }]]),
      mutes: new Map(),
      auths: new Map([[1, "auth1"]]),
      titles: new Map(),
    };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(player, "!status");
    const msg = room.announcements.map((a) => a.msg).join("\n");
    assert.match(msg, /Jogos:/);
    assert.match(msg, /Gols:/);
    assert.match(msg, /Assist:/);
    assert.match(msg, /CS:/);
    assert.match(msg, /MVP/);
    assert.match(msg, /WR /);
    assert.match(msg, /Chefe|Novato|🌱|👑/);
  });

  it("!stats sem auth nem cache avisa para logar", async () => {
    const room = mockRoom();
    room.getPlayerList = () => [{ id: 9, name: "Guest", team: 0 }];
    const player = { id: 9, name: "Guest", team: 0 };
    const ctx = { admins: new Map(), mutes: new Map(), auths: new Map() };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(player, "!stats");
    assert.ok(room.announcements.some((a) => /logado no Haxball/i.test(a.msg)));
  });

  it("os 4 cargos de staff recebem admin nativo do Haxball", () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk };
    const cmd = createCommandHandler(room, ctx);
    const player = room._players[0];
    for (const level of [1, 2, 3, 4]) {
      room.adminFlags.length = 0;
      cmd.applyAdminLook(player, { level, title: `nv${level}` });
      assert.deepEqual(room.adminFlags, [{ id: 1, value: true }], `nível ${level}`);
      assert.equal(
        room.announcements.some((a) => /entrou/.test(a.msg)),
        false,
        "não anuncia entrada de staff"
      );
    }
    afk.stop();
  });

  it("mutado usa !ids e não usa chat de time", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = {
      admins: new Map(),
      mutes: new Map([[1, { endsAt: Date.now() + 60_000 }]]),
      afk,
    };
    const cmd = createCommandHandler(room, ctx);
    assert.ok(cmd.peekMute(room._players[0]));
    await cmd.handle(room._players[0], "!ids");
    assert.ok(room.announcements.some((a) => /#1 RedCap/.test(a.msg)));
    room.announcements.length = 0;
    assert.equal(cmd.handleTeamChat(room._players[0], "t eae"), true);
    assert.ok(room.announcements.some((a) => /mutado/i.test(a.msg)));
    assert.equal(room.announcements.some((a) => /\[TEAM\]/.test(a.msg)), false);
    afk.stop();
  });
});

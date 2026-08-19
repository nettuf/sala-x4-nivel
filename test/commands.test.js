const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createCommandHandler } = require("../src/commands");
const { createAfkTracker } = require("../src/room/afk");

function mockRoom() {
  const players = [
    { id: 1, name: "RedCap", team: 1, auth: "auth1" },
    { id: 2, name: "Blue1", team: 2, auth: "auth2" },
    { id: 3, name: "Spec", team: 0, auth: "auth3" },
  ];
  const announcements = [];
  const kicks = [];
  return {
    announcements,
    getPlayerList: () => players,
    sendAnnouncement: (msg, to, color) => announcements.push({ msg, to, color }),
    setPlayerTeam: (id, team) => {
      const p = players.find((x) => x.id === id);
      if (p) p.team = team;
    },
    kickPlayer: (id, reason, ban) => kicks.push({ id, reason, ban }),
    _players: players,
    kicks,
  };
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

  it("!t envia só para o time", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[0], "!t bola");
    const teamMsgs = room.announcements.filter((a) => String(a.msg).includes("[TEAM]"));
    assert.equal(teamMsgs.length, 1);
    assert.equal(teamMsgs[0].to, 1);
    afk.stop();
  });

  it("!afk é bloqueado no 4v4 oficial", async () => {
    const room = mockRoom();
    room.getScores = () => ({ red: 0, blue: 0, time: 12, timeLimit: 180 });
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
    assert.equal(afk.isVoluntary(1), false);
    assert.ok(room.announcements.some((a) => /4v4/i.test(a.msg)));
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
    assert.equal(afk.isVoluntary(1), true);
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
    assert.equal(afk.isVoluntary(1), true);
    afk.stop();
  });

  it("!afk funciona no spec", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[2], "!afk");
    assert.equal(afk.isVoluntary(3), true);
    await cmd.handle(room._players[2], "!afk");
    assert.equal(afk.isVoluntary(3), false);
    afk.stop();
  });

  it("!afk tem delay de 10s contra spam", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk };
    const cmd = createCommandHandler(room, ctx);
    const spec = room._players[2];

    await cmd.handle(spec, "!afk");
    assert.equal(afk.isVoluntary(3), true);
    await cmd.handle(spec, "!afk");
    assert.equal(afk.isVoluntary(3), false);

    await cmd.handle(spec, "!afk");
    assert.equal(afk.isVoluntary(3), false);
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
    assert.equal(afk.isVoluntary(1), true);
    afk.stop();
  });

  it("!help responde", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk, titles: new Map() };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[2], "!help");
    assert.ok(room.announcements.some((a) => String(a.msg).includes("!stats")));
    afk.stop();
  });

  it("!ajuda lista comandos de jogador", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk, titles: new Map() };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[2], "!ajuda");
    const msg = room.announcements.find((a) => String(a.msg).includes("!afks"))?.msg || "";
    assert.match(msg, /!ajuda/);
    assert.match(msg, /!afk /);
    assert.equal(msg.includes("!ban"), false);
    afk.stop();
  });

  it("!ajudaadm é só para admin", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk, titles: new Map() };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[2], "!ajudaadm");
    assert.ok(room.announcements.some((a) => /Sem permissão/i.test(a.msg)));
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
    assert.match(msg, /!unmute/);
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
    assert.match(msg, /#3 Spec/);
    assert.equal(msg.includes("RedCap"), false);
    afk.stop();
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
    const { line } = cmd.formatPlayerChat(room._players[0], "oi");
    assert.equal(line, "🌱 RedCap: oi");
    afk.stop();
  });

  it("chat de Chefe usa só o cargo ativo", () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = {
      admins: new Map([[1, { level: 4, title: "Chefe" }]]),
      mutes: new Map(),
      afk,
      titles: new Map([[1, { emblem: "👑", name: "Chefe", color: 0xe74c3c, id: "chefe" }]]),
    };
    const cmd = createCommandHandler(room, ctx);
    const { line } = cmd.formatPlayerChat(room._players[0], "s");
    assert.equal(line, "👑 RedCap: s");
    afk.stop();
  });

  it("!bb kicka o jogador da sala", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[2], "!bb");
    assert.ok(room.kicks.some((k) => k.id === 3 && k.ban === false));
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
      room.announcements.some((a) => /partidas registradas|J .*V .*E|logado no Haxball/i.test(a.msg))
    );
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
});

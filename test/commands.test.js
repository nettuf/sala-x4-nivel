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
  return {
    announcements,
    getPlayerList: () => players,
    sendAnnouncement: (msg, to, color) => announcements.push({ msg, to, color }),
    setPlayerTeam: (id, team) => {
      const p = players.find((x) => x.id === id);
      if (p) p.team = team;
    },
    kickPlayer: () => {},
    _players: players,
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

  it("!afk move para spec", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[0], "!afk");
    assert.equal(room._players[0].team, 0);
    assert.equal(afk.isVoluntary(1), true);
    await cmd.handle(room._players[0], "!back");
    assert.equal(afk.isVoluntary(1), false);
    afk.stop();
  });

  it("!help responde", async () => {
    const room = mockRoom();
    const afk = createAfkTracker(room);
    const ctx = { admins: new Map(), mutes: new Map(), afk };
    const cmd = createCommandHandler(room, ctx);
    await cmd.handle(room._players[2], "!help");
    assert.ok(room.announcements.some((a) => String(a.msg).includes("!stats")));
    afk.stop();
  });
});

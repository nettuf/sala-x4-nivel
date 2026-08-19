const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  KITS,
  findKit,
  parseTeamRef,
  formatKickoffVs,
  validateChange,
  resolvePermission,
  createUniformManager,
} = require("../src/room/uniforms");
const { TEAM } = require("../src/room/choose");
const { createCommandHandler } = require("../src/commands");
const { createAfkTracker } = require("../src/room/afk");

function mockRoom(players) {
  const announcements = [];
  const colorCalls = [];
  return {
    announcements,
    colorCalls,
    getPlayerList: () => players,
    sendAnnouncement: (msg, to) => announcements.push({ msg, to }),
    setTeamColors: (team, angle, text, colors) =>
      colorCalls.push({ team, angle, text, colors }),
    setPlayerTeam: () => {},
    kickPlayer: () => {},
  };
}

function squad() {
  return [
    { id: 1, name: "RedCap", team: TEAM.RED, auth: "a1" },
    { id: 2, name: "Red2", team: TEAM.RED, auth: "a2" },
    { id: 3, name: "BlueCap", team: TEAM.BLUE, auth: "a3" },
    { id: 4, name: "Blue2", team: TEAM.BLUE, auth: "a4" },
    { id: 5, name: "Spec", team: TEAM.SPEC, auth: "a5" },
  ];
}

describe("uniformes: catálogo e regras puras", () => {
  it("kits têm id/cores e busca é case-insensitive", () => {
    assert.ok(KITS.length >= 10);
    for (const k of KITS) {
      assert.ok(k.id && k.name);
      assert.ok(Array.isArray(k.colors) && k.colors.length >= 1);
    }
    assert.equal(findKit("BRA").id, "bra");
    assert.equal(findKit("naoexiste"), null);
  });

  it("parseTeamRef aceita red/blue em pt e en", () => {
    assert.equal(parseTeamRef("red"), TEAM.RED);
    assert.equal(parseTeamRef("vermelho"), TEAM.RED);
    assert.equal(parseTeamRef("blue"), TEAM.BLUE);
    assert.equal(parseTeamRef("azul"), TEAM.BLUE);
    assert.equal(parseTeamRef("verde"), null);
  });

  it("kickoff formata Brasil vs França", () => {
    assert.equal(
      formatKickoffVs(findKit("bra"), findKit("fra")),
      "🔴 Brasil  vs  🔵 França"
    );
    assert.equal(
      formatKickoffVs(findKit("preto"), findKit("branco")),
      "🔴 Preto  vs  🔵 Branco"
    );
  });

  it("não deixa os dois times usarem o mesmo uniforme", () => {
    const current = { [TEAM.RED]: "bra", [TEAM.BLUE]: null };
    const r = validateChange({ team: TEAM.BLUE, kitId: "bra", current });
    assert.equal(r.ok, false);
    assert.match(r.error, /já está no time/i);
  });

  it("kit inexistente e kit repetido do próprio time são recusados", () => {
    const current = { [TEAM.RED]: "fla", [TEAM.BLUE]: null };
    assert.match(validateChange({ team: TEAM.RED, kitId: "xxx", current }).error, /inexistente/i);
    assert.match(validateChange({ team: TEAM.RED, kitId: "fla", current }).error, /já está com/i);
  });

  it("padrão pode ser usado pelos dois times", () => {
    const current = { [TEAM.RED]: "padrao", [TEAM.BLUE]: null };
    assert.equal(validateChange({ team: TEAM.BLUE, kitId: "padrao", current }).ok, true);
  });

  it("permissão: capitão sim, jogador comum não, spec não", () => {
    const captains = { [TEAM.RED]: 1, [TEAM.BLUE]: 3 };
    const cap = { id: 1, team: TEAM.RED };
    const comum = { id: 2, team: TEAM.RED };
    const spec = { id: 5, team: TEAM.SPEC };

    assert.equal(resolvePermission({ player: cap, isAdmin: false, captains }).ok, true);
    assert.match(
      resolvePermission({ player: comum, isAdmin: false, captains }).error,
      /capitão/i
    );
    assert.match(
      resolvePermission({ player: spec, isAdmin: false, captains }).error,
      /admin ou capitão/i
    );
  });

  it("capitão não troca o uniforme do time adversário", () => {
    const captains = { [TEAM.RED]: 1, [TEAM.BLUE]: 3 };
    const r = resolvePermission({
      player: { id: 1, team: TEAM.RED },
      isAdmin: false,
      requestedTeam: TEAM.BLUE,
      captains,
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /seu time/i);
  });

  it("admin troca qualquer time; no spec precisa dizer qual", () => {
    const captains = { [TEAM.RED]: 1, [TEAM.BLUE]: 3 };
    const adminNoTime = { id: 2, team: TEAM.RED };
    const adminSpec = { id: 5, team: TEAM.SPEC };

    assert.equal(
      resolvePermission({ player: adminNoTime, isAdmin: true, requestedTeam: TEAM.BLUE, captains }).team,
      TEAM.BLUE
    );
    assert.equal(
      resolvePermission({ player: adminNoTime, isAdmin: true, captains }).team,
      TEAM.RED
    );
    assert.match(
      resolvePermission({ player: adminSpec, isAdmin: true, captains }).error,
      /red|blue/i
    );
  });
});

describe("uniformes: manager na sala", () => {
  it("inicia vermelho tudo preto e azul tudo branco", () => {
    const room = mockRoom(squad());
    const uni = createUniformManager(room);
    assert.equal(uni.current()[TEAM.RED], "preto");
    assert.equal(uni.current()[TEAM.BLUE], "branco");
    assert.deepEqual(room.colorCalls[0].colors, [0x000000]);
    assert.equal(room.colorCalls[0].text, 0x000000);
    assert.deepEqual(room.colorCalls[1].colors, [0xffffff]);
    assert.equal(room.colorCalls[1].text, 0xffffff);
    assert.match(uni.describe(), /preto/i);
    assert.match(uni.describe(), /branco/i);
  });

  it("kickoffVs usa os kits atuais", () => {
    const players = squad();
    const room = mockRoom(players);
    const uni = createUniformManager(room);
    assert.equal(uni.kickoffVs(), "🔴 Preto  vs  🔵 Branco");
    uni.change({ player: players[0], isAdmin: false, kitId: "bra" });
    uni.change({ player: players[2], isAdmin: false, kitId: "fra" });
    assert.equal(uni.kickoffVs(), "🔴 Brasil  vs  🔵 França");
  });

  it("capitão troca e aplica setTeamColors", () => {
    const players = squad();
    const room = mockRoom(players);
    const uni = createUniformManager(room);

    const r = uni.change({ player: players[0], isAdmin: false, kitId: "bra" });
    assert.equal(r.ok, true);
    assert.equal(r.team, TEAM.RED);
    assert.equal(room.colorCalls.at(-1).team, TEAM.RED);
    assert.deepEqual(room.colorCalls.at(-1).colors, findKit("bra").colors);
    assert.equal(uni.current()[TEAM.RED], "bra");
  });

  it("azul não consegue copiar o kit do vermelho", () => {
    const players = squad();
    const room = mockRoom(players);
    const uni = createUniformManager(room);

    uni.change({ player: players[0], isAdmin: false, kitId: "fla" });
    const r = uni.change({ player: players[2], isAdmin: false, kitId: "fla" });

    assert.equal(r.ok, false);
    assert.match(r.error, /já está no time/i);
    assert.equal(uni.current()[TEAM.BLUE], "branco");
  });

  it("capitão é sempre o primeiro do time (muda quando o 1º sai)", () => {
    const players = squad();
    const room = mockRoom(players);
    const uni = createUniformManager(room);

    assert.equal(uni.captains()[TEAM.RED], 1);
    players.shift(); // RedCap saiu
    assert.equal(uni.captains()[TEAM.RED], 2);

    const r = uni.change({ player: players[0], isAdmin: false, kitId: "cru" });
    assert.equal(r.ok, true);
  });

  it("winner stays: azul vence e leva o uniforme pro vermelho", () => {
    const players = squad();
    const room = mockRoom(players);
    const uni = createUniformManager(room);

    uni.change({ player: players[0], isAdmin: false, kitId: "fla" });
    uni.change({ player: players[2], isAdmin: false, kitId: "cru" });

    uni.onWinnerStays(TEAM.BLUE);

    assert.equal(uni.current()[TEAM.RED], "cru");
    assert.equal(uni.current()[TEAM.BLUE], "branco");
  });

  it("reset volta os dois times ao padrão", () => {
    const players = squad();
    const room = mockRoom(players);
    const uni = createUniformManager(room);

    uni.change({ player: players[0], isAdmin: false, kitId: "bra" });
    uni.reset();

    assert.equal(uni.current()[TEAM.RED], "preto");
    assert.equal(uni.current()[TEAM.BLUE], "branco");
    assert.match(uni.describe(), /preto/i);
    assert.match(uni.describe(), /branco/i);
  });
});

describe("uniformes: comando !uni", () => {
  function setup() {
    const players = squad();
    const room = mockRoom(players);
    const afk = createAfkTracker(room);
    const uniforms = createUniformManager(room);
    const ctx = {
      admins: new Map(),
      mutes: new Map(),
      titles: new Map(),
      afk,
      uniforms,
    };
    const cmd = createCommandHandler(room, ctx);
    return { players, room, afk, uniforms, ctx, cmd };
  }

  it("!unis lista kits e uniforme atual", async () => {
    const { room, cmd, players, afk } = setup();
    await cmd.handle(players[4], "!unis");
    assert.ok(room.announcements.some((a) => /bra/.test(a.msg) && /Atual/.test(a.msg)));
    afk.stop();
  });

  it("!uni do capitão aplica; de jogador comum é negado", async () => {
    const { room, cmd, players, uniforms, afk } = setup();

    await cmd.handle(players[0], "!uni pal");
    assert.equal(uniforms.current()[TEAM.RED], "pal");
    assert.ok(room.announcements.some((a) => /vestiu Palmeiras/i.test(a.msg)));

    await cmd.handle(players[1], "!uni san");
    assert.ok(room.announcements.some((a) => /capitão/i.test(a.msg)));
    assert.equal(uniforms.current()[TEAM.RED], "pal");
    afk.stop();
  });

  it("!uni blue <kit> só funciona para admin", async () => {
    const { room, cmd, players, uniforms, ctx, afk } = setup();

    await cmd.handle(players[0], "!uni blue gre");
    assert.equal(uniforms.current()[TEAM.BLUE], "branco");

    ctx.admins.set(players[0].id, { level: 4 });
    await cmd.handle(players[0], "!uni blue gre");
    assert.equal(uniforms.current()[TEAM.BLUE], "gre");
    assert.ok(room.announcements.some((a) => /vestiu Grêmio/i.test(a.msg)));
    afk.stop();
  });

  it("!uni reset é só de admin", async () => {
    const { cmd, players, uniforms, ctx, afk } = setup();

    await cmd.handle(players[0], "!uni bra");
    await cmd.handle(players[0], "!uni reset");
    assert.equal(uniforms.current()[TEAM.RED], "bra");

    ctx.admins.set(players[0].id, { level: 3 });
    await cmd.handle(players[0], "!uni reset");
    assert.equal(uniforms.current()[TEAM.RED], "preto");
    assert.equal(uniforms.current()[TEAM.BLUE], "branco");
    afk.stop();
  });

  it("!uni sem argumento mostra ajuda", async () => {
    const { room, cmd, players, afk } = setup();
    await cmd.handle(players[0], "!uni");
    assert.ok(room.announcements.some((a) => /Uso: !uni/.test(a.msg)));
    afk.stop();
  });
});

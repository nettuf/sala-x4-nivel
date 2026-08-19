const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  KITS,
  findKit,
  isRandomKitArg,
  pickRandomKit,
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
    assert.equal(validateChange({ team: TEAM.RED, kitId: "zzz", current }).ok, false);
    assert.match(
      validateChange({ team: TEAM.RED, kitId: "fla", current }).error,
      /já está com/i
    );
  });

  it("pickRandomKit evita ids excluídos e isRandomKitArg reconhece aliases", () => {
    assert.equal(isRandomKitArg("random"), true);
    assert.equal(isRandomKitArg("ALEATORIO"), true);
    assert.equal(isRandomKitArg("fla"), false);
    const kit = pickRandomKit(["bra", "fra"], () => 0);
    assert.notEqual(kit.id, "bra");
    assert.notEqual(kit.id, "fra");
    const first = pickRandomKit([], () => 0);
    assert.equal(first.id, KITS[0].id);
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

describe("uniformes: sorteio no kickoff", () => {
  function seqRandom(values) {
    let i = 0;
    return () => {
      const v = values[Math.min(i, values.length - 1)];
      i += 1;
      return v;
    };
  }

  it("prepareKickoff sorteia dois kits distintos e não sorteia de novo", () => {
    const room = mockRoom(squad());
    const uni = createUniformManager(room, { random: seqRandom([0, 0.99]) });
    const first = uni.prepareKickoff();
    assert.equal(first.randomized, true);
    assert.equal(uni.current()[TEAM.RED], KITS[0].id);
    assert.equal(uni.current()[TEAM.BLUE], KITS[KITS.length - 1].id);
    assert.notEqual(uni.current()[TEAM.RED], uni.current()[TEAM.BLUE]);
    assert.equal(uni.pendingKickoffRandom(), false);

    const second = uni.prepareKickoff();
    assert.equal(second.randomized, false);
    assert.equal(uni.current()[TEAM.RED], KITS[0].id);
    assert.equal(uni.current()[TEAM.BLUE], KITS[KITS.length - 1].id);
  });

  it("troca no intervalo cancela o sorteio do kickoff", () => {
    const players = squad();
    const room = mockRoom(players);
    const uni = createUniformManager(room, { random: seqRandom([0.5, 0.2]) });
    uni.change({ player: players[0], isAdmin: false, kitId: "fla" });
    const r = uni.prepareKickoff();
    assert.equal(r.randomized, false);
    assert.equal(uni.current()[TEAM.RED], "fla");
    assert.equal(uni.current()[TEAM.BLUE], "branco");
  });

  it("fim da partida volta a sortear no próximo kickoff", () => {
    const players = squad();
    const room = mockRoom(players);
    const uni = createUniformManager(room, { random: seqRandom([0, 0.99, 0.4, 0.8]) });
    uni.change({ player: players[0], isAdmin: false, kitId: "fla" });
    uni.noteMatchEnd();
    const r = uni.prepareKickoff();
    assert.equal(r.randomized, true);
    assert.notEqual(uni.current()[TEAM.RED], "fla");
    assert.notEqual(uni.current()[TEAM.RED], uni.current()[TEAM.BLUE]);
  });
});

describe("uniformes: emoji do kit", () => {
  function roomWithAvatar(players) {
    const room = mockRoom(players);
    room.avatarCalls = [];
    room.setPlayerAvatar = (id, avatar) => room.avatarCalls.push({ id, avatar });
    return room;
  }

  it("kits com emoji fixo: baleio, rato, gordo, tigre e jalin", () => {
    const comEmoji = KITS.filter((k) => k.emoji).map((k) => k.id).sort();
    assert.deepEqual(comEmoji, ["baleio", "gordo", "jalin", "rato", "tigre"]);
    assert.equal(findKit("baleio").emoji, "🐋");
    assert.equal(findKit("rato").emoji, "🐀");
    assert.equal(findKit("gordo").emoji, "🍔");
    assert.equal(findKit("tigre").emoji, "👑");
    assert.equal(findKit("tigre").name, "Amigos do Rei Tigre");
    assert.equal(findKit("tigre").angle, 59);
    assert.equal(findKit("tigre").text, 0xfff5f5);
    assert.deepEqual(findKit("tigre").colors, [0xf1ff30, 0x000000, 0xf1ff30]);
    assert.equal(findKit("jalin").emoji, "🐒");
    assert.equal(findKit("jalin").name, "Amigos do Jalin");
    assert.equal(findKit("jalin").angle, 857);
    assert.equal(findKit("jalin").text, 0xe2ff26);
    assert.deepEqual(findKit("jalin").colors, [0xe2ff26, 0x770c69, 0x23cf29]);
  });

  it("kit com emoji marca o time inteiro e deixa o resto livre", () => {
    const players = squad();
    const room = roomWithAvatar(players);
    const uni = createUniformManager(room);
    room.avatarCalls.length = 0;

    uni.change({ player: players[0], isAdmin: false, kitId: "gordo" });

    assert.deepEqual(
      room.avatarCalls,
      [
        { id: 1, avatar: "🍔" },
        { id: 2, avatar: "🍔" },
      ],
      "só o vermelho é marcado; azul e spec seguem com o avatar deles"
    );
  });

  it("trocar para kit sem emoji devolve o avatar do jogador", () => {
    const players = squad();
    const room = roomWithAvatar(players);
    const uni = createUniformManager(room);

    uni.change({ player: players[0], isAdmin: false, kitId: "baleio" });
    room.avatarCalls.length = 0;
    uni.change({ player: players[0], isAdmin: false, kitId: "fla" });

    const vermelhos = room.avatarCalls.filter((c) => c.id === 1 || c.id === 2);
    assert.equal(vermelhos.length, 2);
    assert.ok(vermelhos.every((c) => c.avatar === null));
  });

  it("quem entra no time depois pega o emoji e não reenvia para os demais", () => {
    const players = squad();
    const room = roomWithAvatar(players);
    const uni = createUniformManager(room);
    uni.change({ player: players[2], isAdmin: false, kitId: "rato" });
    room.avatarCalls.length = 0;

    players[4].team = TEAM.BLUE;
    uni.syncAvatars();

    assert.deepEqual(room.avatarCalls, [{ id: 5, avatar: "🐀" }]);
  });

  it("host sem setPlayerAvatar não quebra a troca de uniforme", () => {
    const players = squad();
    const room = mockRoom(players);
    const uni = createUniformManager(room);
    const res = uni.change({ player: players[0], isAdmin: false, kitId: "baleio" });
    assert.equal(res.ok, true);
    assert.equal(uni.current()[TEAM.RED], "baleio");
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

  it("!uni random do capitão sorteia só o próprio time", async () => {
    const { room, cmd, players, uniforms, afk } = setup();
    const beforeBlue = uniforms.current()[TEAM.BLUE];
    await cmd.handle(players[0], "!uni random");
    assert.notEqual(uniforms.current()[TEAM.RED], "preto");
    assert.equal(uniforms.current()[TEAM.BLUE], beforeBlue);
    assert.ok(room.announcements.some((a) => /sorteou/.test(a.msg)));
    afk.stop();
  });

  it("!uni random do admin sorteia os dois lados", async () => {
    const { room, cmd, players, uniforms, ctx, afk } = setup();
    ctx.admins.set(players[4].id, { level: 4 });
    await cmd.handle(players[4], "!uni random");
    assert.notEqual(uniforms.current()[TEAM.RED], uniforms.current()[TEAM.BLUE]);
    assert.ok(room.announcements.some((a) => /sorteou:/.test(a.msg)));
    afk.stop();
  });

  it("admin escolhe um lado com !uni blue random", async () => {
    const { cmd, players, uniforms, ctx, afk } = setup();
    ctx.admins.set(players[4].id, { level: 4 });
    const beforeRed = uniforms.current()[TEAM.RED];
    await cmd.handle(players[4], "!uni blue random");
    assert.equal(uniforms.current()[TEAM.RED], beforeRed);
    assert.notEqual(uniforms.current()[TEAM.BLUE], "branco");
    afk.stop();
  });

  it("spec comum não sorteia uniforme", async () => {
    const { room, cmd, players, uniforms, afk } = setup();
    await cmd.handle(players[4], "!uni random");
    assert.equal(uniforms.current()[TEAM.RED], "preto");
    assert.equal(uniforms.current()[TEAM.BLUE], "branco");
    assert.ok(room.announcements.some((a) => /admin ou capitão/i.test(a.msg)));
    afk.stop();
  });
});

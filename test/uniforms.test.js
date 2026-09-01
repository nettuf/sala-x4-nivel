const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  KITS,
  findKit,
  isRandomKitArg,
  pickRandomKit,
  kitsTooSimilar,
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

  it("não deixa os dois times usarem uniforme igual ou parecido", () => {
    const current = { [TEAM.RED]: "bra", [TEAM.BLUE]: null };
    const r = validateChange({ team: TEAM.BLUE, kitId: "bra", current });
    assert.equal(r.ok, false);
    assert.match(r.error, /parecido demais/i);

    const dark = validateChange({
      team: TEAM.BLUE,
      kitId: "cor",
      current: { [TEAM.RED]: "preto", [TEAM.BLUE]: null },
    });
    assert.equal(dark.ok, false);
    assert.match(dark.error, /parecido demais/i);
  });

  it("kit inexistente e kit repetido do próprio time são recusados", () => {
    const current = { [TEAM.RED]: "fla", [TEAM.BLUE]: null };
    assert.equal(validateChange({ team: TEAM.RED, kitId: "zzz", current }).ok, false);
    assert.match(
      validateChange({ team: TEAM.RED, kitId: "fla", current }).error,
      /já está com/i
    );
  });

  it("pickRandomKit evita ids excluídos, cores parecidas e isRandomKitArg reconhece aliases", () => {
    assert.equal(isRandomKitArg("random"), true);
    assert.equal(isRandomKitArg("ALEATORIO"), true);
    assert.equal(isRandomKitArg("fla"), false);
    const kit = pickRandomKit(["bra", "fra"], () => 0);
    assert.notEqual(kit.id, "bra");
    assert.notEqual(kit.id, "fra");
    const first = pickRandomKit([], () => 0);
    assert.equal(first.id, KITS[0].id);
    const distinct = pickRandomKit([], () => 0, findKit("preto"));
    assert.notEqual(distinct.id, "preto");
    assert.notEqual(distinct.id, "cor");
  });

  it("kitsTooSimilar detecta vermelhos e pretos parecidos", () => {
    assert.equal(kitsTooSimilar(findKit("fla"), findKit("int")), true);
    assert.equal(kitsTooSimilar(findKit("preto"), findKit("cor")), true);
    assert.equal(kitsTooSimilar(findKit("preto"), findKit("bra")), false);
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
    assert.match(r.error, /parecido demais/i);
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

  it("winner stays: azul vence e o vermelho mantém o kit", () => {
    const players = squad();
    const room = mockRoom(players);
    const uni = createUniformManager(room);

    uni.change({ player: players[0], isAdmin: false, kitId: "fla" });
    uni.change({ player: players[2], isAdmin: false, kitId: "cru" });

    uni.onWinnerStays(TEAM.BLUE);

    assert.equal(uni.current()[TEAM.RED], "fla");
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

  it("prepareKickoff sorteia só o azul; o vermelho permanece", () => {
    const room = mockRoom(squad());
    const uni = createUniformManager(room, { random: seqRandom([0, 0.99]) });
    const redBefore = uni.current()[TEAM.RED];
    const first = uni.prepareKickoff();
    assert.equal(first.randomized, true);
    const redId = uni.current()[TEAM.RED];
    const blueId = uni.current()[TEAM.BLUE];
    assert.equal(redId, redBefore, "vermelho não sorteia");
    assert.notEqual(redId, blueId);
    assert.equal(kitsTooSimilar(findKit(redId), findKit(blueId)), false);
    assert.equal(uni.pendingKickoffRandom(), false);

    const second = uni.prepareKickoff();
    assert.equal(second.randomized, false);
    assert.equal(uni.current()[TEAM.RED], redId);
    assert.equal(uni.current()[TEAM.BLUE], blueId);
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

  it("fim da partida sorteia só o azul; o vermelho fica", () => {
    const players = squad();
    const room = mockRoom(players);
    const uni = createUniformManager(room, { random: seqRandom([0, 0.99, 0.4, 0.8]) });
    uni.change({ player: players[0], isAdmin: false, kitId: "fla" });
    uni.noteMatchEnd();
    const r = uni.prepareKickoff();
    assert.equal(r.randomized, true);
    assert.equal(uni.current()[TEAM.RED], "fla");
    assert.notEqual(uni.current()[TEAM.BLUE], "fla");
  });
});

describe("uniformes: emoji do kit", () => {
  function roomWithAvatar(players) {
    const room = mockRoom(players);
    room.avatarCalls = [];
    room.setPlayerAvatar = (id, avatar) => room.avatarCalls.push({ id, avatar });
    return room;
  }

  it("kits com emoji fixo: baleio, cacadores, copas, gh, gigachads, gordo, jalin, marconhados, mdr, moggadores, nickname, olympus guardians, palhacada, pedro, rafaela, rato, skdreams, tigre, tulio, zebra family e zebrados", () => {
    const comEmoji = KITS.filter((k) => k.emoji).map((k) => k.id).sort();
    assert.deepEqual(comEmoji, [
      "baleio",
      "cacadores",
      "copas",
      "gh",
      "gigachads",
      "gordo",
      "jalin",
      "marconhados",
      "mdr",
      "moggadores",
      "nickname",
      "olympusguardians",
      "palhacada",
      "pedro",
      "rafaela",
      "rato",
      "skdreams",
      "tigre",
      "tulio",
      "unimundial",
      "zebrados",
      "zebrafamily",
    ]);
    assert.equal(findKit("baleio").emoji, "🐋");
    assert.equal(findKit("artemis").name, "Artemis FC");
    assert.equal(findKit("artemis").angle, 90);
    assert.equal(findKit("artemis").text, 0x1f1f1f);
    assert.deepEqual(findKit("artemis").colors, [0x00764b, 0xffffff, 0x00764b]);
    assert.equal(findKit("unimundial").name, "Amigos do ✠");
    assert.equal(findKit("unimundial").angle, 38);
    assert.equal(findKit("unimundial").text, 0xffe0e0);
    assert.deepEqual(findKit("unimundial").colors, [0x000000, 0x000000, 0x000000]);
    assert.equal(findKit("unimundial").emoji, "✠");
    assert.equal(findKit("futx4").name, "Alanzoka & amigos");
    assert.equal(findKit("futx4").angle, 66);
    assert.equal(findKit("futx4").text, 0x283950);
    assert.deepEqual(findKit("futx4").colors, [0x8ac7f0]);
    assert.equal(findKit("rato").emoji, "🐀");
    assert.equal(findKit("gordo").emoji, "🍔");
    assert.equal(findKit("copas").emoji, "❤️");
    assert.equal(findKit("palhacada").emoji, "🤡");
    assert.equal(findKit("palhacada").name, "Palhaçada FC");
    assert.equal(findKit("palhacada").angle, 60);
    assert.equal(findKit("palhacada").text, 0xffffff);
    assert.deepEqual(findKit("palhacada").colors, [0x00ff6e, 0x0810ff, 0x002033]);
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
    assert.equal(findKit("vrum").name, "Amigos do Vrum");
    assert.equal(findKit("vrum").angle, 60);
    assert.equal(findKit("vrum").text, 0x5005ff);
    assert.deepEqual(findKit("vrum").colors, [0x000000]);
    assert.equal(findKit("vrum").emoji, undefined);
    assert.equal(findKit("gh").name, "GH FC");
    assert.equal(findKit("gh").angle, 80);
    assert.equal(findKit("gh").text, 0x03050a);
    assert.deepEqual(findKit("gh").colors, [0x757575, 0xf0f6ff, 0x7e8b8f]);
    assert.equal(findKit("gh").emoji, "><");
    assert.equal(findKit("cyq").name, "Amigos do Cyq");
    assert.equal(findKit("cyq").angle, 60);
    assert.equal(findKit("cyq").text, 0x02ccc5);
    assert.deepEqual(findKit("cyq").colors, [0x800066, 0x800066, 0x02a6a0]);
    assert.equal(findKit("cyq").emoji, undefined);
    assert.equal(findKit("cacadores").name, "Caçadores de Gordos");
    assert.equal(findKit("cacadores").angle, 63);
    assert.equal(findKit("cacadores").text, 0x27b050);
    assert.deepEqual(findKit("cacadores").colors, [0x043d00, 0x065206, 0x043b00]);
    assert.equal(findKit("cacadores").emoji, "🏹");
    assert.equal(findKit("zebrados").name, "Zebrados FC");
    assert.equal(findKit("zebrados").angle, 60);
    assert.equal(findKit("zebrados").text, 0x000000);
    assert.deepEqual(findKit("zebrados").colors, [0xffffff, 0x000000]);
    assert.equal(findKit("zebrados").emoji, "🦓");
    assert.equal(findKit("gigachads").name, "Gigachads");
    assert.equal(findKit("gigachads").angle, 60);
    assert.equal(findKit("gigachads").text, 0x000000);
    assert.deepEqual(findKit("gigachads").colors, [0xb8ff4d, 0xaeffab, 0x61ff30]);
    assert.equal(findKit("gigachads").emoji, "🗿");
    assert.equal(findKit("moggadores").name, "Moggadores");
    assert.equal(findKit("moggadores").angle, 601);
    assert.equal(findKit("moggadores").text, 0x2d0dff);
    assert.deepEqual(findKit("moggadores").colors, [0x4a6eff, 0x5ca8ff]);
    assert.equal(findKit("moggadores").emoji, "🤫");
    assert.equal(findKit("pedro").name, "Amigos do Pedro");
    assert.equal(findKit("pedro").angle, 32);
    assert.equal(findKit("pedro").text, 0xffffff);
    assert.deepEqual(findKit("pedro").colors, [0x221930, 0x32294f]);
    assert.equal(findKit("pedro").emoji, "🥀");
    assert.equal(findKit("tulio").name, "Amigos do Tulio");
    assert.equal(findKit("tulio").angle, 601);
    assert.equal(findKit("tulio").text, 0x851575);
    assert.deepEqual(findKit("tulio").colors, [0xc420ae, 0xff29e2]);
    assert.equal(findKit("tulio").emoji, "🏳️‍🌈");
    assert.equal(findKit("marconhados").name, "Marconhados");
    assert.equal(findKit("marconhados").angle, 33);
    assert.equal(findKit("marconhados").text, 0x1be329);
    assert.deepEqual(findKit("marconhados").colors, [0x108518, 0x14a81e]);
    assert.equal(findKit("marconhados").emoji, "☘️");
    assert.equal(findKit("rosinha").name, "Rosinha");
    assert.equal(findKit("rosinha").angle, 0);
    assert.equal(findKit("rosinha").text, 0xffffff);
    assert.deepEqual(findKit("rosinha").colors, [0xffbadd]);
    assert.equal(findKit("rosinha").emoji, undefined);
    assert.equal(findKit("zebrafamily").name, "Zebra Family");
    assert.equal(findKit("zebra family").name, "Zebra Family");
    assert.equal(findKit("zebrafamily").angle, 90);
    assert.equal(findKit("zebrafamily").text, 0xffffff);
    assert.deepEqual(findKit("zebrafamily").colors, [0x21d3ff, 0xff00cc, 0x21d3ff]);
    assert.equal(findKit("zebrafamily").emoji, "🦓");
    assert.equal(findKit("olympusguardians").name, "Olympus Guardians");
    assert.equal(findKit("olympus guardians").name, "Olympus Guardians");
    assert.equal(findKit("olympusguardians").angle, 120);
    assert.equal(findKit("olympusguardians").text, 0xe5ed00);
    assert.deepEqual(findKit("olympusguardians").colors, [0x080404, 0x141414]);
    assert.equal(findKit("olympusguardians").emoji, "⚡");
    assert.equal(findKit("mdr").name, "Bigodes do MDR");
    assert.equal(findKit("mdr").emoji, "﷼");
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

    await cmd.handle(players[0], "!uni blue fra");
    assert.equal(uniforms.current()[TEAM.BLUE], "branco");

    ctx.admins.set(players[0].id, { level: 4 });
    await cmd.handle(players[0], "!uni blue fra");
    assert.equal(uniforms.current()[TEAM.BLUE], "fra");
    assert.ok(room.announcements.some((a) => /vestiu França/i.test(a.msg)));
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

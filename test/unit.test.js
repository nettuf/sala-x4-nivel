const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");

const {
  connToIp,
  parseDurationToMs,
  formatDuration,
  findPlayer,
  parseWhisper,
} = require("../src/utils");
const {
  attributeGoal,
  isValidMatchScores,
  pickFromSpecList,
  isChooseToken,
  rememberedChooseMode,
  formatMatchClock,
  ballSpeedKmh,
  possessionPercents,
  canJoinMatchStats,
  detectRageQuit,
  isDecidedLosingScore,
  rageQuitMessages,
  targetTeamSize,
} = require("../src/gameLogic");
const {
  listUnlocked,
  isUnlocked,
  resolveTitle,
  pickMatchMvps,
  pickMatchWorst,
  formatChatPrefix,
  applyUnlockUpgrade,
  reqLabel,
} = require("../src/titles");
const { stadiumForPlayerCount, stadiumKindForCount, reloadMaps } = require("../src/room/maps");
const { buildSummary } = require("../src/discord/replay");
const { formatStatusCard, emptyPlayerStats, winratePct } = require("../src/db/stats");

describe("utils", () => {
  it("decodifica conn hex para IP", () => {
    const ip = "189.127.8.71";
    const conn = Buffer.from(ip, "utf8").toString("hex");
    assert.equal(connToIp(conn), ip);
  });

  it("parseDuration: 30m, 2h, perm", () => {
    assert.equal(parseDurationToMs("30m"), 30 * 60 * 1000);
    assert.equal(parseDurationToMs("2h"), 2 * 3600 * 1000);
    assert.equal(parseDurationToMs("perm"), null);
    assert.equal(parseDurationToMs("1d"), 86400000);
    assert.equal(formatDuration(60000), "1m");
    assert.equal(formatDuration(null), "permanente");
  });

  it("findPlayer por #id e nick", () => {
    const room = {
      getPlayerList: () => [
        { id: 0, name: "Host" },
        { id: 3, name: "Netto" },
        { id: 7, name: "Baleio" },
      ],
    };
    assert.equal(findPlayer(room, "#3").name, "Netto");
    assert.equal(findPlayer(room, "bale").name, "Baleio");
    assert.equal(findPlayer(room, "#99"), null);
  });

  it("parseWhisper só no começo da mensagem", () => {
    assert.deepEqual(parseWhisper("@Netto eae"), { mention: "Netto", body: "eae" });
    assert.deepEqual(parseWhisper("@#3 bora"), { mention: "#3", body: "bora" });
    assert.deepEqual(parseWhisper("@Netto"), { mention: "Netto", body: "" });
    assert.equal(parseWhisper("oi @Netto"), null);
    assert.equal(parseWhisper("!t bola"), null);
  });
});

describe("gameLogic", () => {
  it("attributeGoal: gol + assist", () => {
    const touches = [
      { name: "A", auth: "a", team: 1 },
      { name: "B", auth: "b", team: 1 },
    ];
    const g = attributeGoal(touches, 1);
    assert.equal(g.scorer.name, "A");
    assert.equal(g.assist.name, "B");
    assert.equal(g.isOwnGoal, false);
  });

  it("attributeGoal: gol contra", () => {
    const g = attributeGoal([{ name: "X", auth: "x", team: 2 }], 1);
    assert.equal(g.isOwnGoal, true);
    assert.equal(g.scorer.name, "X");
    assert.equal(g.assist, null);
  });

  it("isValidMatchScores por placar e por tempo", () => {
    assert.equal(isValidMatchScores({ red: 3, blue: 1, scoreLimit: 3, time: 10, timeLimit: 180 }), true);
    assert.equal(isValidMatchScores({ red: 1, blue: 1, scoreLimit: 3, time: 160, timeLimit: 180 }), false);
    assert.equal(isValidMatchScores({ red: 0, blue: 0, scoreLimit: 3, time: 10, timeLimit: 180 }), false);
    assert.equal(isValidMatchScores(null), false);
  });

  it("pickFromSpecList top/bottom/numero", () => {
    const spec = [{ name: "a" }, { name: "b" }, { name: "c" }];
    assert.equal(pickFromSpecList(spec, "top").name, "a");
    assert.equal(pickFromSpecList(spec, "auto").name, "a");
    assert.equal(pickFromSpecList(spec, "bottom").name, "c");
    assert.equal(pickFromSpecList(spec, "bot").name, "c");
    assert.equal(pickFromSpecList(spec, "2").name, "b");
    assert.equal(pickFromSpecList(spec, "!2").name, "b");
    assert.equal(pickFromSpecList(spec, "!top").name, "a");
    assert.equal(pickFromSpecList(spec, "TOP").name, "a");
    assert.equal(pickFromSpecList(spec, "  3  extra").name, "c");
    assert.equal(pickFromSpecList(spec, "0"), null);
    assert.equal(pickFromSpecList(spec, "9"), null);
    assert.equal(isChooseToken("top"), true);
    assert.equal(isChooseToken("!1"), true);
    assert.equal(isChooseToken("!top"), true);
    assert.equal(isChooseToken("!help"), false);
    assert.equal(isChooseToken("oi"), false);
  });

  it("targetTeamSize: 7→3v3, 5→2v2, 3→1v1, 8+→4v4", () => {
    assert.equal(targetTeamSize(7, 4), 3);
    assert.equal(targetTeamSize(6, 4), 3);
    assert.equal(targetTeamSize(5, 4), 2);
    assert.equal(targetTeamSize(4, 4), 2);
    assert.equal(targetTeamSize(3, 4), 1);
    assert.equal(targetTeamSize(8, 4), 4);
    assert.equal(targetTeamSize(12, 4), 4);
  });

  it("rememberedChooseMode só grava top/random/bottom", () => {
    assert.equal(rememberedChooseMode("auto"), "top");
    assert.equal(rememberedChooseMode("bot"), "bottom");
    assert.equal(rememberedChooseMode("rand"), "random");
    assert.equal(rememberedChooseMode("!top"), "top");
    assert.equal(rememberedChooseMode("2"), null);
    assert.equal(rememberedChooseMode("!2"), null);
  });

  it("formatMatchClock e posse", () => {
    assert.equal(formatMatchClock(125), "02:05");
    assert.equal(formatMatchClock(-1), "00:00");
    assert.deepEqual(possessionPercents(0, 0), { red: 50, blue: 50 });
    assert.deepEqual(possessionPercents(3, 1), { red: 75, blue: 25 });
  });

  it("ballSpeedKmh cresce com deslocamento", () => {
    const slow = ballSpeedKmh({ x: 0, y: 0 }, { x: 1, y: 0 });
    const fast = ballSpeedKmh({ x: 0, y: 0 }, { x: 4, y: 0 });
    assert.ok(fast > slow);
    assert.equal(ballSpeedKmh(null, { x: 1, y: 1 }), 0);
  });

  it("canJoinMatchStats recusa tarde ou goleada", () => {
    assert.equal(canJoinMatchStats(null), true);
    assert.equal(canJoinMatchStats({ time: 10, timeLimit: 180, red: 0, blue: 0 }), true);
    assert.equal(canJoinMatchStats({ time: 140, timeLimit: 180, red: 0, blue: 0 }), false);
    assert.equal(canJoinMatchStats({ time: 10, timeLimit: 180, red: 2, blue: 0 }), false);
  });

  it("detectRageQuit só no fim com diff 2+", () => {
    const scores = { red: 2, blue: 0, time: 160, timeLimit: 180 };
    assert.deepEqual(detectRageQuit({ redCount: 4, blueCount: 3, scores }), { winner: 1 });
    assert.deepEqual(
      detectRageQuit({ redCount: 4, blueCount: 3, scores: { ...scores, red: 3 } }),
      { winner: 1 }
    );
    assert.equal(detectRageQuit({ redCount: 4, blueCount: 4, scores }), null);
    assert.equal(
      detectRageQuit({ redCount: 4, blueCount: 3, scores: { ...scores, time: 10 } }),
      null
    );
  });

  it("isDecidedLosingScore: 2+ sempre; 1 gol só no último minuto", () => {
    assert.equal(isDecidedLosingScore({ red: 2, blue: 0, time: 10, timeLimit: 240 }), true);
    assert.equal(isDecidedLosingScore({ red: 3, blue: 1, time: 20, timeLimit: 240 }), true);
    assert.equal(isDecidedLosingScore({ red: 1, blue: 0, time: 40, timeLimit: 240 }), false);
    assert.equal(isDecidedLosingScore({ red: 1, blue: 0, time: 170, timeLimit: 240 }), false);
    assert.equal(isDecidedLosingScore({ red: 1, blue: 0, time: 185, timeLimit: 240 }), true);
    assert.equal(isDecidedLosingScore({ red: 1, blue: 1, time: 200, timeLimit: 240 }), false);
  });

  it("rageQuitMessages menciona o nick no público e no PV", () => {
    const msgs = rageQuitMessages("Netto", "abandonou perdendo 3x0");
    assert.equal(msgs.public, "🚨 Ragequit de @Netto: abandonou perdendo 3x0. Partida encerrada.");
    assert.equal(msgs.private, "@Netto você levou ragequit: abandonou perdendo 3x0.");
  });
});

describe("streak / winner stays", () => {
  const {
    createStreakTracker,
    applyWinnerStays,
  } = require("../src/room/streak");
  const { TEAM } = require("../src/room/choose");

  it("recordWin: red++, blue=1, empate=0", () => {
    const s = createStreakTracker();
    assert.equal(s.recordWin(TEAM.RED), 1);
    assert.equal(s.recordWin(TEAM.RED), 2);
    assert.equal(s.recordWin(TEAM.BLUE), 1);
    assert.equal(s.recordWin(0), 0);
  });

  it("guarda o maior streak e chama onBest", () => {
    const hits = [];
    const s = createStreakTracker({
      best: 2,
      onBest(n) {
        hits.push(n);
      },
    });
    assert.equal(s.getBest(), 2);
    s.recordWin(TEAM.RED);
    s.recordWin(TEAM.RED);
    assert.equal(s.getBest(), 2);
    assert.deepEqual(hits, []);
    s.recordWin(TEAM.RED);
    assert.equal(s.get(), 3);
    assert.equal(s.getBest(), 3);
    assert.deepEqual(hits, [3]);
    s.recordWin(TEAM.BLUE);
    assert.equal(s.get(), 1);
    assert.equal(s.getBest(), 3);
    s.hydrateBest(8);
    assert.equal(s.getBest(), 8);
  });

  it("azul vence → move para vermelho", () => {
    const players = [
      { id: 1, name: "R1", team: TEAM.RED },
      { id: 2, name: "R2", team: TEAM.RED },
      { id: 3, name: "B1", team: TEAM.BLUE },
      { id: 4, name: "B2", team: TEAM.BLUE },
      { id: 5, name: "S1", team: TEAM.SPEC },
    ];
    const room = {
      getPlayerList: () => players,
      setPlayerTeam: (id, team) => {
        const p = players.find((x) => x.id === id);
        if (p) p.team = team;
      },
      sendAnnouncement: () => {},
    };
    const streak = createStreakTracker();
    const r = applyWinnerStays(room, TEAM.BLUE, streak);
    assert.equal(r.mode, "choose");
    assert.equal(streak.get(), 1);
    assert.equal(players.find((p) => p.id === 3).team, TEAM.RED);
    assert.equal(players.find((p) => p.id === 4).team, TEAM.RED);
    // Quem já estava no spec vira capitão azul, não o 1º perdedor na ordem da sala
    assert.equal(players.find((p) => p.id === 5).team, TEAM.BLUE);
    assert.equal(players.find((p) => p.id === 1).team, TEAM.SPEC);
    assert.equal(players.find((p) => p.id === 2).team, TEAM.SPEC);
  });

  it("7 pessoas 3v3: quem já estava no spec vira capitão, mesmo se entrou primeiro", () => {
    const players = [
      { id: 7, name: "S1", team: TEAM.SPEC },
      { id: 1, name: "R1", team: TEAM.RED },
      { id: 2, name: "R2", team: TEAM.RED },
      { id: 3, name: "R3", team: TEAM.RED },
      { id: 4, name: "B1", team: TEAM.BLUE },
      { id: 5, name: "B2", team: TEAM.BLUE },
      { id: 6, name: "B3", team: TEAM.BLUE },
    ];
    const room = {
      getPlayerList: () => players,
      setPlayerTeam: (id, team) => {
        const p = players.find((x) => x.id === id);
        if (p) p.team = team;
      },
      sendAnnouncement: () => {},
    };
    const streak = createStreakTracker();
    applyWinnerStays(room, TEAM.RED, streak);
    assert.equal(players.find((p) => p.id === 1).team, TEAM.RED);
    assert.equal(players.find((p) => p.id === 2).team, TEAM.RED);
    assert.equal(players.find((p) => p.id === 3).team, TEAM.RED);
    assert.equal(players.find((p) => p.id === 7).team, TEAM.BLUE);
    assert.equal(players.find((p) => p.id === 4).team, TEAM.SPEC);
    assert.equal(players.find((p) => p.id === 5).team, TEAM.SPEC);
    assert.equal(players.find((p) => p.id === 6).team, TEAM.SPEC);
  });
});

describe("titles / cargos", () => {
  it("novato sempre liberado; artilheiro precisa gols", () => {
    assert.equal(isUnlocked({}, "novato"), true);
    assert.equal(isUnlocked({ goals: 0 }, "artilheiro"), false);
    assert.equal(isUnlocked({ goals: 200 }, "artilheiro"), true);
  });

  it("Negativo: 10 jogos e WR abaixo de 50%", () => {
    assert.equal(isUnlocked({ games: 9, wins: 0 }, "negativo"), false);
    assert.equal(isUnlocked({ games: 10, wins: 5 }, "negativo"), false);
    assert.equal(isUnlocked({ games: 10, wins: 4 }, "negativo"), true);
    assert.equal(isUnlocked({ games: 20, wins: 10 }, "negativo"), false);
    assert.match(reqLabel({ games: 10, maxWinrate: 50 }), /10J/);
    assert.match(reqLabel({ games: 10, maxWinrate: 50 }), /WR < 50%/);
    const t = resolveTitle({ games: 10, wins: 3 }, null);
    assert.equal(t.id, "negativo");
    assert.equal(t.emblem, "📉");
  });

  it("completo exige conjunto", () => {
    assert.equal(isUnlocked({ games: 400, goals: 300, assists: 5 }, "completo"), false);
    assert.equal(isUnlocked({ games: 400, goals: 300, assists: 200 }, "completo"), true);
  });

  it("resolveTitle respeita seleção se desbloqueada", () => {
    const stats = { games: 100, goals: 200, assists: 0, mvps: 0, selected_title: "artilheiro" };
    const t = resolveTitle(stats, "artilheiro");
    assert.equal(t.id, "artilheiro");
    assert.equal(t.emblem, "⚽");
  });

  it("listUnlocked cresce com stats", () => {
    assert.ok(listUnlocked({}).some((t) => t.id === "novato"));
    assert.ok(listUnlocked({ games: 100 }).some((t) => t.id === "estreante"));
  });

  it("pickMatchMvps por gols*2+assists", () => {
    const mvps = pickMatchMvps([
      { auth: "a", nick: "A", goals: 2, assists: 0 },
      { auth: "b", nick: "B", goals: 1, assists: 1 },
      { auth: "c", nick: "C", goals: 0, assists: 0 },
    ]);
    assert.equal(mvps.length, 1);
    assert.equal(mvps[0].auth, "a");
  });

  it("pickMatchMvps: empate de pontos escolhe só 1 (mais gols)", () => {
    const mvps = pickMatchMvps([
      { auth: "a", nick: "A", goals: 1, assists: 2 },
      { auth: "b", nick: "B", goals: 2, assists: 0 },
      { auth: "c", nick: "C", goals: 0, assists: 4 },
    ]);
    assert.equal(mvps.length, 1);
    assert.equal(mvps[0].auth, "b");
  });

  it("pickMatchWorst: menor contribuição e GC piora", () => {
    const worst = pickMatchWorst([
      { auth: "a", nick: "A", goals: 2, assists: 0, own_goals: 0 },
      { auth: "b", nick: "B", goals: 0, assists: 0, own_goals: 0 },
      { auth: "c", nick: "C", goals: 0, assists: 0, own_goals: 1 },
    ]);
    assert.equal(worst.length, 1);
    assert.equal(worst[0].auth, "c");
  });

  it("pickMatchWorst: empate total não anuncia; MVP não é pior", () => {
    assert.deepEqual(
      pickMatchWorst([
        { auth: "a", nick: "A", goals: 0, assists: 0 },
        { auth: "b", nick: "B", goals: 0, assists: 0 },
      ]),
      []
    );
    const worst = pickMatchWorst([
      { auth: "a", nick: "A", goals: 1, assists: 0 },
      { auth: "b", nick: "B", goals: 0, assists: 0 },
    ]);
    assert.equal(worst.length, 1);
    assert.equal(worst[0].auth, "b");
  });

  it("formatChatPrefix é um único emoji, sem nomes", () => {
    assert.equal(formatChatPrefix({ emblem: "👑", name: "Chefe" }), "👑 ");
    assert.equal(formatChatPrefix({ emblem: "🐉", name: "Lenda" }), "🐉 ");
    assert.equal(formatChatPrefix(null), "");
  });

  it("admin sem seleção usa cargo de staff", () => {
    const t = resolveTitle({ games: 0 }, null, 4);
    assert.equal(t.id, "chefe");
    assert.equal(t.emblem, "👑");
  });

  it("chefe pode escolher Lenda se desbloqueada", () => {
    const stats = { games: 1600, goals: 1200, assists: 800, mvps: 500 };
    const t = resolveTitle(stats, "lenda", 4);
    assert.equal(t.id, "lenda");
    assert.equal(t.emblem, "🐉");
  });

  it("desbloquear cargo superior atualiza seleção de jogador, não de staff", () => {
    const prev = { games: 599, goals: 500, assists: 400, mvps: 160 };
    const next = { games: 600, goals: 500, assists: 400, mvps: 160 };
    assert.equal(applyUnlockUpgrade("completo", prev, next), "craque");
    assert.equal(applyUnlockUpgrade("chefe", prev, next), "chefe");
    assert.equal(applyUnlockUpgrade(null, prev, next), null);
  });
});

describe("maps", () => {
  it("carrega maptraining, mapx3 e mapx4", () => {
    reloadMaps();
    const training = stadiumForPlayerCount(1);
    const x3 = stadiumForPlayerCount(2);
    const x4 = stadiumForPlayerCount(8);
    assert.ok(training && training.length > 100);
    assert.ok(x3 && x3.length > 100);
    assert.ok(x4 && x4.length > 100);
    assert.match(JSON.parse(training).name, /training|treino|ice bear/i);
    assert.match(JSON.parse(x3).name, /x3/i);
    assert.match(JSON.parse(x4).name, /x4/i);
    assert.notEqual(training, x3);
    assert.notEqual(x3, x4);
    assert.equal(stadiumForPlayerCount(6), x3);
    assert.equal(stadiumKindForCount(1), "training");
    assert.equal(stadiumKindForCount(7), "x3");
    assert.equal(stadiumKindForCount(8), "x4");
  });

  it("arquivos .hbs existem", () => {
    const root = path.join(__dirname, "..");
    assert.ok(fs.existsSync(path.join(root, "maps/mapx3.hbs")));
    assert.ok(fs.existsSync(path.join(root, "maps/mapx4.hbs")));
    assert.ok(fs.existsSync(path.join(root, "maps/maptraining.hbs")));
  });
});

describe("status", () => {
  it("formata jogos, gols, CS, MVP, assist, WR e cargo", () => {
    const stats = {
      ...emptyPlayerStats(),
      games: 10,
      wins: 6,
      draws: 1,
      losses: 3,
      goals: 12,
      assists: 7,
      cs: 4,
      mvps: 2,
    };
    const text = formatStatusCard("Netto", stats, { emblem: "👑", name: "Chefe" });
    assert.match(text, /👑 Netto/);
    assert.match(text, /Chefe/);
    assert.match(text, /Jogos: 10/);
    assert.match(text, /6V 1E 3D/);
    assert.match(text, /WR 60%/);
    assert.match(text, /Gols: 12/);
    assert.match(text, /Assist: 7/);
    assert.match(text, /CS: 4/);
    assert.match(text, /MVP: 2/);
    assert.equal(winratePct(stats), 60);
    assert.equal(winratePct(emptyPlayerStats()), 0);
  });
});

describe("replay summary", () => {
  it("monta resumo com gols", () => {
    const text = buildSummary({
      scoreRed: 2,
      scoreBlue: 1,
      redLineup: ["A", "B"],
      blueLineup: ["C", "D"],
      goals: [
        { time: 65, scorerNick: "A", assistNick: "B", isOwnGoal: false },
        { time: 120, scorerNick: "C", isOwnGoal: false },
      ],
    });
    assert.match(text, /2/);
    assert.match(text, /A/);
    assert.match(text, /assist B/i);
  });
});

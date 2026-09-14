const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  connToIp,
  parseDurationToMs,
  formatDuration,
  findPlayer,
  resolveWhisper,
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
  classifyTouchChange,
  shouldIgnoreClusteredReceive,
  applyPlayEvents,
  formatPlayChatLines,
  formatPlaySummaryLines,
  canJoinMatchStats,
  detectRageQuit,
  isDecidedLosingScore,
  rageQuitMessages,
  targetTeamSize,
  pickGoalkeeper,
} = require("../src/gameLogic");
const {
  listUnlocked,
  isUnlocked,
  resolveTitle,
  pickMatchMvps,
  pickMatchWorst,
  formatMvpAnnounce,
  formatWorstAnnounce,
  filterPlayersAtWhistle,
  formatChatPrefix,
  formatChatBody,
  replaceVowelsWithSnacks,
  SNACK_EMOJIS,
  chatColor,
  CHAT_COLOR_RED,
  CHAT_COLOR_BLUE,
  CHAT_COLOR_SPEC,
  CHAT_COLOR_CHEFE,
  applyUnlockUpgrade,
  reqLabel,
  formatTitleCatalog,
  getTitleById,
  JOKE_TITLES,
  STREAK_TITLE,
  STREAK_TITLE_MIN,
  wearsStreakTitle,
  SITE_TITLES,
  resolveSiteTitle,
  formatChatHead,
} = require("../src/titles");
const { stadiumForPlayerCount, stadiumKindForCount, needsTrainingX3Swap, reloadMaps, parseStadium } = require("../src/room/maps");
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

  it("resolveWhisper no começo, nick com espaço e @#id", () => {
    const room = {
      getPlayerList: () => [
        { id: 0, name: "Host" },
        { id: 3, name: "Netto" },
        { id: 7, name: "Baleio" },
        { id: 12, name: "Foo Bar" },
        { id: 99, name: "3" },
      ],
    };
    assert.equal(resolveWhisper(room, "@Netto eae").target.id, 3);
    assert.equal(resolveWhisper(room, "@Netto eae").body, "eae");
    assert.equal(resolveWhisper(room, "@#3 bora").target.id, 3);
    assert.equal(resolveWhisper(room, "@#3 bora").body, "bora");
    assert.equal(resolveWhisper(room, "@Foo Bar oi").target.id, 12);
    assert.equal(resolveWhisper(room, "@Foo Bar oi").body, "oi");
    assert.equal(resolveWhisper(room, "@3 msg").target.id, 99);
    assert.equal(resolveWhisper(room, "@3 msg").body, "msg");
    assert.equal(resolveWhisper(room, "@Netto").body, "");
    assert.equal(resolveWhisper(room, "oi @Netto"), null);
    assert.equal(resolveWhisper(room, "!t bola"), null);
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

  it("attributeGoal: assist é o último toque do time, mesmo com rival no meio", () => {
    const touches = [
      { id: 3, name: "C", auth: "c", team: 1 },
      { id: 9, name: "Rival", auth: "x", team: 2 },
      { id: 2, name: "B", auth: "b", team: 1 },
      { id: 1, name: "A", auth: "a", team: 1 },
    ];
    const g = attributeGoal(touches, 1);
    assert.equal(g.scorer.name, "C");
    assert.equal(g.assist.name, "B");
  });

  it("attributeGoal: dois toques do goleador não viram auto-assist", () => {
    const g = attributeGoal(
      [
        { id: 1, name: "A", auth: "a", team: 1 },
        { id: 1, name: "A", auth: "a", team: 1 },
        { id: 2, name: "B", auth: "b", team: 1 },
      ],
      1
    );
    assert.equal(g.scorer.name, "A");
    assert.equal(g.assist.name, "B");
  });

  it("attributeGoal: sem auth ainda casa assist por id", () => {
    const g = attributeGoal(
      [
        { id: 1, name: "A", team: 1 },
        { id: 2, name: "B", team: 1 },
      ],
      1
    );
    assert.equal(g.assist.name, "B");
  });

  it("attributeGoal: gol contra", () => {
    const g = attributeGoal([{ name: "X", auth: "x", team: 2 }], 1);
    assert.equal(g.isOwnGoal, true);
    assert.equal(g.scorer.name, "X");
    assert.equal(g.assist, null);
  });

  it("attributeGoal: zagueiro perto da bola não vira gol contra", () => {
    const g = attributeGoal(
      [
        { id: 9, name: "Zaga", auth: "z", team: 2, kind: "body" },
        { id: 1, name: "A", auth: "a", team: 1, kind: "kick" },
        { id: 2, name: "B", auth: "b", team: 1, kind: "kick" },
      ],
      1
    );
    assert.equal(g.isOwnGoal, false);
    assert.equal(g.scorer.name, "A");
    assert.equal(g.assist.name, "B");
  });

  it("attributeGoal: chute do rival na própria rede continua GC", () => {
    const g = attributeGoal(
      [
        { id: 9, name: "Zaga", auth: "z", team: 2, kind: "kick" },
        { id: 1, name: "A", auth: "a", team: 1, kind: "kick" },
      ],
      1
    );
    assert.equal(g.isOwnGoal, true);
    assert.equal(g.scorer.name, "Zaga");
  });

  it("attributeGoal: drible do companheiro leva o gol, passe vira assist", () => {
    const g = attributeGoal(
      [
        { id: 2, name: "Carrier", auth: "c", team: 1, kind: "body" },
        { id: 1, name: "Passer", auth: "p", team: 1, kind: "kick" },
      ],
      1
    );
    assert.equal(g.scorer.name, "Carrier");
    assert.equal(g.assist.name, "Passer");
    assert.equal(g.isOwnGoal, false);
  });

  it("attributeGoal: só corpo do zagueiro não inventa GC", () => {
    const g = attributeGoal([{ id: 9, name: "Zaga", team: 2, kind: "body" }], 1);
    assert.equal(g.isOwnGoal, false);
    assert.equal(g.scorer, null);
  });

  it("pickGoalkeeper: vermelho mais à esquerda, azul mais à direita", () => {
    const samples = [
      { id: 1, team: 1, xAvg: -40 },
      { id: 2, team: 1, xAvg: -180 },
      { id: 3, team: 2, xAvg: 30 },
      { id: 4, team: 2, xAvg: 200 },
    ];
    assert.equal(pickGoalkeeper(samples, 1).id, 2);
    assert.equal(pickGoalkeeper(samples, 2).id, 4);
    assert.equal(pickGoalkeeper([], 1), null);
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

  it("classifica passe, passe errado, recuperação e perda", () => {
    const a = { id: 1, name: "A", team: 1, kind: "kick" };
    const b = { id: 2, name: "B", team: 1, kind: "body" };
    const c = { id: 3, name: "C", team: 2, kind: "body" };
    const pass = classifyTouchChange(a, b, { pendingKick: a });
    assert.equal(pass.pass, a);
    assert.equal(pass.misplaced, null);
    assert.equal(pass.recovery, null);
    assert.equal(pass.nextPendingKick, null);

    const steal = classifyTouchChange(a, c, { pendingKick: a });
    assert.equal(steal.misplaced, a);
    assert.equal(steal.recovery, c);
    assert.equal(steal.pass, null);

    const gkClear = classifyTouchChange(a, c, { pendingKick: a, skipMisplacedForKicker: true });
    assert.equal(gkClear.misplaced, null);
    assert.equal(gkClear.recovery, c);

    const loose = classifyTouchChange(a, c, { pendingKick: null });
    assert.equal(loose.lost, a);
    assert.equal(loose.recovery, c);
    assert.equal(loose.misplaced, null);

    const stats = new Map();
    applyPlayEvents(stats, steal);
    assert.equal(stats.get(1).misplaced, 1);
    assert.equal(stats.get(3).recoveries, 1);

    assert.equal(
      shouldIgnoreClusteredReceive(a, b, { kind: "body", ballAtKicker: true }),
      true,
      "companheiro no bolo do chute não é passe"
    );
    assert.equal(
      shouldIgnoreClusteredReceive(a, b, { kind: "body", ballAtKicker: false }),
      false,
      "bola já saiu: corpo do companheiro é passe"
    );
    assert.equal(
      shouldIgnoreClusteredReceive(a, b, { kind: "kick", ballAtKicker: true }),
      false,
      "chute do companheiro conta"
    );
    assert.equal(
      shouldIgnoreClusteredReceive(a, c, { kind: "body", ballAtKicker: true }),
      true,
      "adversário no bolo do chute não é rec"
    );
    assert.equal(
      shouldIgnoreClusteredReceive(a, c, { kind: "body", ballAtKicker: false }),
      false,
      "bola já saiu: corpo do adversário é rec"
    );
    assert.equal(
      shouldIgnoreClusteredReceive(a, c, { kind: "kick", ballAtKicker: true }),
      false,
      "chute do adversário no pé conta como rec"
    );
  });

  it("monta líderes de passe/rec/posse no chat", () => {
    const map = new Map([
      [1, { id: 1, name: "João", passes: 5, misplaced: 2, recoveries: 1, lost: 0, possTicks: 40 }],
      [2, { id: 2, name: "Pedro", passes: 1, misplaced: 0, recoveries: 4, lost: 1, possTicks: 10 }],
    ]);
    const lines = formatPlayChatLines(map, { red: 60, blue: 40 });
    assert.match(lines[0], /60\.0%/);
    assert.match(lines.find((l) => l.includes("Passe")), /João 5\/7/);
    assert.match(lines.find((l) => l.includes("Rec")), /Pedro 4/);
    assert.match(lines.find((l) => l.includes("Posse jogador")), /João 80%/);
    const discord = formatPlaySummaryLines(map).join("\n");
    assert.match(discord, /João — 5\/7 passe/);
    assert.match(discord, /2 perda/);
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
    assert.equal(isDecidedLosingScore({ red: 3, blue: 2, time: 20, timeLimit: 240 }), true);
    assert.equal(isDecidedLosingScore({ red: 2, blue: 3, time: 30, timeLimit: 240 }), true);
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

  it("recordWin: red++, blue=1, empate não zera", () => {
    const s = createStreakTracker();
    assert.equal(s.recordWin(TEAM.RED), 1);
    assert.equal(s.recordWin(TEAM.RED), 2);
    assert.equal(s.recordWin(0), 2, "empate/abort não apaga a streak");
    assert.equal(s.recordWin(TEAM.BLUE), 1);
  });

  it("guarda o maior streak, os nomes e chama onBest", () => {
    const hits = [];
    const s = createStreakTracker({
      best: 2,
      onBest(n, holders) {
        hits.push({ n, holders });
      },
    });
    assert.equal(s.getBest(), 2);
    s.recordWin(TEAM.RED, ["A", "B"]);
    s.recordWin(TEAM.RED, ["A", "B"]);
    assert.equal(s.get(), 2);
    assert.equal(s.getBest(), 2, "igualar o recorde também atualiza");
    assert.deepEqual(s.getBestHolders(), ["A", "B"]);
    assert.deepEqual(hits, [{ n: 2, holders: ["A", "B"] }]);
    s.recordWin(TEAM.RED, ["A", "B", "C", "D"]);
    assert.equal(s.get(), 3);
    assert.equal(s.getBest(), 3);
    assert.deepEqual(s.getBestHolders(), ["A", "B", "C", "D"]);
    assert.deepEqual(hits, [
      { n: 2, holders: ["A", "B"] },
      { n: 3, holders: ["A", "B", "C", "D"] },
    ]);
    s.recordWin(TEAM.BLUE, ["X"]);
    assert.equal(s.get(), 1);
    assert.equal(s.getBest(), 3);
    assert.deepEqual(s.getBestHolders(), ["A", "B", "C", "D"]);
    s.hydrateBest(8, ["Z"]);
    assert.equal(s.getBest(), 8);
    assert.deepEqual(s.getBestHolders(), ["Z"]);
  });

  it("top 5: só entra com 3+, atualiza a campanha viva e congela quando cai", () => {
    const boards = [];
    const s = createStreakTracker({
      onBoard(board) {
        boards.push(board.map((e) => ({ n: e.n, live: !!e.live, holders: e.holders })));
      },
    });
    s.recordWin(TEAM.RED, ["A", "B"]);
    s.recordWin(TEAM.RED, ["A", "B"]);
    assert.deepEqual(s.getTopStreaks(), []);
    s.recordWin(TEAM.RED, ["A", "B"]);
    assert.deepEqual(s.getTopStreaks(), [{ n: 3, holders: ["A", "B"], live: true }]);
    s.recordWin(TEAM.RED, ["A", "B"]);
    assert.equal(s.getTopStreaks()[0].n, 4);
    assert.equal(s.getTopStreaks()[0].live, true);
    s.recordWin(TEAM.BLUE, ["X", "Y"]);
    assert.deepEqual(s.getTopStreaks(), [{ n: 4, holders: ["A", "B"], live: false }]);
    s.recordWin(TEAM.RED, ["X", "Y"]);
    s.recordWin(TEAM.RED, ["X", "Y"]);
    assert.equal(s.getTopStreaks().length, 2);
    assert.equal(s.getTopStreaks()[0].n, 4);
    assert.equal(s.getTopStreaks()[1].n, 3);
    assert.equal(s.getTopStreaks()[1].live, true);
    assert.ok(boards.length >= 3);
  });

  it("azul vence → move para vermelho", () => {
    const announcements = [];
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
      sendAnnouncement: (msg) => announcements.push(msg),
    };
    const streak = createStreakTracker();
    for (let i = 0; i < 5; i++) streak.recordWin(TEAM.RED, ["R1"]);
    const r = applyWinnerStays(room, TEAM.BLUE, streak);
    assert.equal(r.mode, "choose");
    assert.equal(streak.get(), 1);
    assert.ok(announcements.some((m) => /streak de 5|5 seguidas|QUEBROU/i.test(m)), announcements.join(" | "));
    assert.equal(players.find((p) => p.id === 3).team, TEAM.RED);
    assert.equal(players.find((p) => p.id === 4).team, TEAM.RED);
    // Quem já estava no spec vira capitão azul, não o 1º perdedor na ordem da sala
    assert.equal(players.find((p) => p.id === 5).team, TEAM.BLUE);
    assert.equal(players.find((p) => p.id === 1).team, TEAM.SPEC);
    assert.equal(players.find((p) => p.id === 2).team, TEAM.SPEC);
  });

  it("recordStreak false (3v3/RR) não mexe na sequência do 4v4", () => {
    const players = [
      { id: 1, name: "R1", team: TEAM.RED },
      { id: 2, name: "B1", team: TEAM.BLUE },
      { id: 3, name: "S1", team: TEAM.SPEC },
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
    streak.recordWin(TEAM.RED, ["A"]);
    streak.recordWin(TEAM.RED, ["A"]);
    applyWinnerStays(room, TEAM.BLUE, streak, { recordStreak: false });
    assert.equal(streak.get(), 2);
    assert.equal(players.find((p) => p.id === 2).team, TEAM.RED);
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

  it("1 vencedor só não inicia streak (precisa de 2 mantidos)", () => {
    const players = [
      { id: 1, name: "R1", team: TEAM.RED },
      { id: 2, name: "B1", team: TEAM.BLUE },
      { id: 3, name: "S1", team: TEAM.SPEC },
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
    assert.equal(streak.get(), 0);
  });

  it("2 vencedores mantidos começam e seguem a streak; 1 original restante zera", () => {
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
    applyWinnerStays(room, TEAM.RED, streak);
    assert.equal(streak.get(), 1);
    assert.deepEqual(streak.getHolderIds().sort(), [1, 2]);

    players.find((p) => p.id === 2).team = TEAM.SPEC;
    applyWinnerStays(room, TEAM.RED, streak);
    assert.equal(streak.get(), 0, "1 original no vermelho não mantém a streak");
  });
});

describe("titles / cargos", () => {
  it("gordo e aura são overlay de chat, não cargo desbloqueável", () => {
    assert.equal(JOKE_TITLES.gordo.emblem, "🍔");
    assert.equal(JOKE_TITLES.aura.emblem, "🗿");
    assert.equal(getTitleById("gordo"), null);
    assert.equal(getTitleById("aura"), null);
    assert.equal(
      listUnlocked({ games: 9999, goals: 9999, assists: 9999, mvps: 9999 }).some((t) => t.id === "gordo"),
      false
    );
  });

  it("novato sempre liberado; artilheiro precisa gols", () => {
    assert.equal(isUnlocked({}, "novato"), true);
    assert.equal(isUnlocked({ goals: 0 }, "artilheiro"), false);
    assert.equal(isUnlocked({ goals: 200 }, "artilheiro"), true);
  });

  it("cargos de CS: Catador / Muralha / Invencível", () => {
    assert.equal(isUnlocked({ cs: 99 }, "catador"), false);
    assert.equal(isUnlocked({ cs: 100 }, "catador"), true);
    assert.equal(isUnlocked({ cs: 299 }, "muralha"), false);
    assert.equal(isUnlocked({ cs: 300 }, "muralha"), true);
    assert.equal(isUnlocked({ cs: 999 }, "invencivel"), false);
    assert.equal(isUnlocked({ cs: 1000 }, "invencivel"), true);
    assert.match(reqLabel({ cs: 100 }), /100CS/);
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

  it("catálogo lista todos os cargos e a condição, mesmo bloqueados", () => {
    const text = formatTitleCatalog();
    assert.match(text, /Novato — livre/);
    assert.match(text, /Negativo — 10 jogos \+ WR < 50%/);
    assert.match(text, /Lenda — 1600 jogos \+ 1200 gols \+ 800 assists \+ 500 MVP/);
    assert.match(text, /Craque — 600 jogos/);
    assert.match(text, /Chefe/);
    assert.match(text, /Parça do Baleia/);
    assert.ok(!/Gordo/.test(text), "piada não entra no catálogo");
  });

  it("Parça do Baleia só com gift do Chefe", () => {
    assert.equal(isUnlocked({}, "parca"), false);
    assert.equal(isUnlocked({ gifted_titles: ["parca"] }, "parca"), true);
    assert.ok(listUnlocked({ gifted_titles: ["parca"] }).some((t) => t.id === "parca"));
    assert.equal(
      listUnlocked({}).some((t) => t.id === "parca"),
      false
    );
  });

  it("pickMatchMvps por gols*2+assists só no time que ganhou", () => {
    const mvps = pickMatchMvps([
      { auth: "a", nick: "A", goals: 2, assists: 0, result: "win" },
      { auth: "b", nick: "B", goals: 1, assists: 1, result: "win" },
      { auth: "c", nick: "C", goals: 5, assists: 0, result: "loss" },
    ]);
    assert.equal(mvps.length, 1);
    assert.equal(mvps[0].auth, "a");
  });

  it("pickMatchMvps: empate de pontos escolhe só 1 (mais gols); perdedor não entra", () => {
    const mvps = pickMatchMvps([
      { auth: "a", nick: "A", goals: 1, assists: 2, result: "win" },
      { auth: "b", nick: "B", goals: 2, assists: 0, result: "win" },
      { auth: "c", nick: "C", goals: 0, assists: 4, result: "loss" },
    ]);
    assert.equal(mvps.length, 1);
    assert.equal(mvps[0].auth, "b");
  });

  it("pickMatchMvps: empate no placar pode ser de qualquer time", () => {
    const mvps = pickMatchMvps([
      { auth: "a", nick: "A", goals: 1, assists: 0, result: "draw" },
      { auth: "b", nick: "B", goals: 2, assists: 0, result: "draw" },
    ]);
    assert.equal(mvps.length, 1);
    assert.equal(mvps[0].auth, "b");
  });

  it("pickMatchWorst: só do time que perdeu; sempre 1", () => {
    const worst = pickMatchWorst([
      { auth: "a", nick: "A", goals: 0, assists: 0, own_goals: 0, result: "win" },
      { auth: "b", nick: "B", goals: 0, assists: 0, own_goals: 0, result: "loss" },
      { auth: "c", nick: "C", goals: 0, assists: 0, own_goals: 1, result: "loss" },
    ]);
    assert.equal(worst.length, 1);
    assert.equal(worst[0].auth, "c");
  });

  it("pickMatchWorst: empate no placar pode ser de qualquer time (≠ MVP)", () => {
    const worst = pickMatchWorst([
      { auth: "a", nick: "A", goals: 2, assists: 0, own_goals: 0, result: "draw" },
      { auth: "b", nick: "B", goals: 0, assists: 0, own_goals: 1, result: "draw" },
    ]);
    assert.equal(worst.length, 1);
    assert.equal(worst[0].auth, "b");
  });

  it("pickMatchWorst: vencedor com GC não é pior se houve time perdedor", () => {
    const worst = pickMatchWorst([
      { auth: "a", nick: "A", goals: 1, assists: 0, own_goals: 2, result: "win" },
      { auth: "b", nick: "B", goals: 0, assists: 0, own_goals: 0, result: "loss" },
      { auth: "c", nick: "C", goals: 0, assists: 1, own_goals: 0, result: "loss" },
    ]);
    assert.equal(worst.length, 1);
    assert.equal(worst[0].auth, "b");
  });

  it("filterPlayersAtWhistle: quem saiu no meio não entra em MVP nem Pior", () => {
    const all = [
      { auth: "left", nick: "Saiu", goals: 5, assists: 0, own_goals: 0, result: "win" },
      { auth: "stay", nick: "Ficou", goals: 1, assists: 0, own_goals: 0, result: "win" },
      { auth: "lose", nick: "Perdeu", goals: 0, assists: 0, own_goals: 3, result: "loss" },
      { auth: "stay2", nick: "Ficou2", goals: 0, assists: 0, own_goals: 0, result: "loss" },
    ];
    const pool = filterPlayersAtWhistle(all, new Set(["stay", "stay2"]));
    const mvps = pickMatchMvps(pool);
    const worst = pickMatchWorst(pool);
    assert.equal(mvps[0].auth, "stay");
    assert.equal(worst[0].auth, "stay2");
  });

  it("GK com CS pode ser MVP; 2 gols ainda ganha do CS", () => {
    const gkMvp = pickMatchMvps([
      { auth: "gk", nick: "GK", goals: 0, assists: 0, goalkeeper: true, cleanSheet: true, result: "win" },
      { auth: "a", nick: "A", goals: 1, assists: 0, result: "win" },
      { auth: "b", nick: "B", goals: 0, assists: 0, result: "win" },
    ]);
    assert.equal(gkMvp[0].auth, "gk");

    const scorer = pickMatchMvps([
      { auth: "gk", nick: "GK", goals: 0, assists: 0, goalkeeper: true, cleanSheet: true, result: "win" },
      { auth: "a", nick: "A", goals: 2, assists: 0, result: "win" },
    ]);
    assert.equal(scorer[0].auth, "a");
  });

  it("GK sem GC não é automaticamente o pior; com GC pode ser", () => {
    const fieldWorst = pickMatchWorst([
      { auth: "gk", nick: "GK", goals: 0, assists: 0, own_goals: 0, goalkeeper: true, result: "loss" },
      { auth: "a", nick: "A", goals: 0, assists: 0, own_goals: 0, result: "loss" },
      { auth: "b", nick: "B", goals: 1, assists: 0, own_goals: 0, result: "loss" },
    ]);
    assert.equal(fieldWorst[0].auth, "a");

    const gkWorst = pickMatchWorst([
      { auth: "gk", nick: "GK", goals: 0, assists: 0, own_goals: 2, goalkeeper: true, result: "loss" },
      { auth: "a", nick: "A", goals: 0, assists: 0, own_goals: 0, result: "loss" },
    ]);
    assert.equal(gkWorst[0].auth, "gk");
  });

  it("pickMatchWorst: avançado zerado é o pior, não o volante", () => {
    const worst = pickMatchWorst([
      { auth: "gk", nick: "GK", team: 1, goals: 0, assists: 0, own_goals: 0, goalkeeper: true, result: "loss", xAvg: -80 },
      { auth: "vol", nick: "Vol", team: 1, goals: 0, assists: 0, own_goals: 0, result: "loss", xAvg: 0 },
      { auth: "fw", nick: "Fw", team: 1, goals: 0, assists: 0, own_goals: 0, result: "loss", xAvg: 90 },
    ]);
    assert.equal(worst.length, 1);
    assert.equal(worst[0].auth, "fw");
  });

  it("pickMatchWorst: volante com gol contra continua o pior", () => {
    const worst = pickMatchWorst([
      { auth: "gk", nick: "GK", team: 1, goals: 0, assists: 0, own_goals: 0, goalkeeper: true, result: "loss", xAvg: -80 },
      { auth: "vol", nick: "Vol", team: 1, goals: 0, assists: 0, own_goals: 1, result: "loss", xAvg: 0 },
      { auth: "fw", nick: "Fw", team: 1, goals: 0, assists: 0, own_goals: 0, result: "loss", xAvg: 90 },
    ]);
    assert.equal(worst.length, 1);
    assert.equal(worst[0].auth, "vol");
  });

  it("MVP anuncia stats boas; pior anuncia as ruins", () => {
    assert.match(
      formatMvpAnnounce({ nick: "João", goals: 2, assists: 1, cleanSheet: true, passes: 5, misplaced: 1, recoveries: 3 }),
      /⭐ MVP: João · 2G · 1A · CS · 5\/6 passe · 3 rec/
    );
    assert.match(
      formatWorstAnnounce({ nick: "Pedro", goals: 0, assists: 0, own_goals: 1, passes: 2, misplaced: 4, recoveries: 1 }),
      /💩 Pior: Pedro · 1 GC · 2\/6 passe · 1 rec/
    );
  });

  it("pickMatchWorst: empate no fundo não inventa um bode", () => {
    const worst = pickMatchWorst([
      { auth: "a", nick: "A", goals: 0, assists: 0, own_goals: 0, result: "loss" },
      { auth: "b", nick: "B", goals: 0, assists: 0, own_goals: 0, result: "loss" },
    ]);
    assert.equal(worst.length, 0);
  });

  it("formatChatPrefix coloca o emoji do cargo entre colchetes", () => {
    assert.equal(formatChatPrefix({ emblem: "👑", name: "Chefe" }), "[👑] ");
    assert.equal(formatChatPrefix({ emblem: "🐉", name: "Lenda" }), "[🐉] ");
    assert.equal(formatChatPrefix(null), "");
  });

  it("formatChatBody do gordo troca só uma vogal por lanche", () => {
    assert.equal(formatChatBody(JOKE_TITLES.gordo, "xyz"), "xyz");
    assert.equal(formatChatBody(JOKE_TITLES.aura, "oi"), "oi");
    assert.equal(replaceVowelsWithSnacks("oi", { pick: () => "🍔", random: () => 0 }), "🍔i");
    assert.equal(replaceVowelsWithSnacks("oi", { pick: () => "🍔", random: () => 0.99 }), "o🍔");
    assert.equal(replaceVowelsWithSnacks("xyz"), "xyz");
    const out = formatChatBody(JOKE_TITLES.gordo, "eae");
    const snacks = SNACK_EMOJIS.filter((e) => out.includes(e));
    assert.equal(snacks.length, 1, "uma vogal vira lanche");
    assert.equal(out.replace(snacks[0], "").length, 2, "as outras letras ficam");
  });

  it("chat: vermelho/azul/spec; Craque, Lenda, admins amarelo, Gordo e Aura pintam diferente", () => {
    const novato = { id: "novato", emblem: "🌱", color: 0xbdc3c7 };
    assert.equal(chatColor(novato, 1), CHAT_COLOR_RED);
    assert.equal(chatColor(novato, 2), CHAT_COLOR_BLUE);
    assert.equal(chatColor(novato, 0), CHAT_COLOR_SPEC);
    assert.equal(chatColor({ id: "mvp", color: 0xf1c40f }, 1), CHAT_COLOR_RED);
    assert.equal(chatColor(JOKE_TITLES.gordo, 2), JOKE_TITLES.gordo.color);
    assert.equal(chatColor(JOKE_TITLES.aura, 1), JOKE_TITLES.aura.color);
    assert.equal(chatColor({ id: "craque", chatHighlight: true, color: 0xd8a4ff }, 1), 0xd8a4ff);
    assert.equal(chatColor({ id: "lenda", chatHighlight: true, color: 0xffc04d }, 2), 0xffc04d);
    assert.equal(chatColor({ id: "chefe", kind: "staff", level: 4, color: 0xd4a017 }, 2), 0xd4a017);
    assert.equal(chatColor({ id: "gerente", kind: "staff", level: 3, color: 0xe8bc2c }, 1), 0xe8bc2c);
    assert.equal(chatColor({ id: "moderador", kind: "staff", level: 2, color: 0xffd54a }, 1), 0xffd54a);
    assert.equal(chatColor({ id: "estagiario", kind: "staff", level: 1, color: 0xffe99a }, 0), 0xffe99a);
    assert.equal(chatColor({ id: "chefe", kind: "staff", level: 4 }, 2), CHAT_COLOR_CHEFE);
    assert.equal(chatColor(STREAK_TITLE, 1), STREAK_TITLE.color);
    assert.ok(STREAK_TITLE.color !== CHAT_COLOR_RED, "streak é vermelho mais destacado");
  });

  it("VIP/Booster/Aurora ficam do lado do cargo e pintam por cima do staff", () => {
    assert.equal(resolveSiteTitle({ vip: true, booster: false }).id, "vip");
    assert.equal(resolveSiteTitle({ vip: false, booster: true }).id, "booster");
    assert.equal(resolveSiteTitle({ vip: true, booster: true }).id, "aurora");
    assert.equal(resolveSiteTitle({ vip: false, booster: false }), null);
    assert.equal(formatChatHead({ emblem: "👑" }, SITE_TITLES.vip), "[🩷][👑]");
    assert.equal(chatColor({ kind: "staff", color: 0xd4a017 }, 2, SITE_TITLES.vip), SITE_TITLES.vip.color);
    assert.equal(chatColor(STREAK_TITLE, 1, SITE_TITLES.aurora), STREAK_TITLE.color);
    assert.equal(SITE_TITLES.vip.emblem, "🩷");
    assert.equal(SITE_TITLES.vip.color, 0xff4fa8);
    assert.equal(SITE_TITLES.booster.color, 0x9bb0ff);
    assert.equal(SITE_TITLES.aurora.color, 0xff2ee8);
  });

  it("cargo Em Streak só no vermelho com streak ≥ 3 e sem AFK", () => {
    assert.equal(STREAK_TITLE_MIN, 3);
    assert.equal(wearsStreakTitle(2, 1, false), false);
    assert.equal(wearsStreakTitle(3, 1, false), true);
    assert.equal(wearsStreakTitle(10, 1, false), true);
    assert.equal(wearsStreakTitle(5, 2, false), false, "azul não");
    assert.equal(wearsStreakTitle(5, 0, false), false, "spec não");
    assert.equal(wearsStreakTitle(5, 1, true), false, "AFK perde");
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

  it("saiu do Negativo: perde o cargo e volta ao melhor ainda válido", () => {
    assert.equal(
      applyUnlockUpgrade("negativo", { games: 10, wins: 4 }, { games: 11, wins: 6 }),
      "novato"
    );
    assert.equal(
      applyUnlockUpgrade("negativo", { games: 99, wins: 49 }, { games: 100, wins: 50 }),
      "estreante"
    );
    assert.equal(
      applyUnlockUpgrade("negativo", { games: 19, wins: 9, goals: 200 }, { games: 20, wins: 11, goals: 200 }),
      "artilheiro"
    );
    assert.equal(
      applyUnlockUpgrade("negativo", { games: 10, wins: 4 }, { games: 11, wins: 4 }),
      "negativo"
    );
    assert.equal(applyUnlockUpgrade("chefe", { games: 10, wins: 4 }, { games: 11, wins: 6 }), "chefe");
    assert.equal(resolveTitle({ games: 12, wins: 6 }, "negativo").id, "novato");
    assert.equal(resolveTitle({ games: 100, wins: 50 }, "negativo").id, "estreante");
  });
});

describe("maps", () => {
  it("aceita .hbs com comentarios de indice", () => {
    const raw = `{
	"name" : "Ultimate Training",
	"vertexes" : [
		/* 0 */ { "x" : 1 }
	]
}`;
    assert.equal(parseStadium(raw).name, "Ultimate Training");
    assert.equal(parseStadium(raw).vertexes[0].x, 1);
  });

  it("carrega maptraining, haxbook-x3 e haxbook-x4", () => {
    reloadMaps();
    const training = stadiumForPlayerCount(1);
    const x3 = stadiumForPlayerCount(2);
    const x4 = stadiumForPlayerCount(8);
    assert.ok(training && training.length > 100);
    assert.ok(x3 && x3.length > 100);
    assert.ok(x4 && x4.length > 100);
    assert.match(parseStadium(training).name, /training|treino|ice bear/i);
    assert.match(parseStadium(x3).name, /x3/i);
    assert.match(parseStadium(x4).name, /x4/i);
    assert.notEqual(training, x3);
    assert.notEqual(x3, x4);
    assert.equal(stadiumForPlayerCount(6), x3);
    assert.equal(stadiumKindForCount(1), "training");
    assert.equal(stadiumKindForCount(7), "x3");
    assert.equal(stadiumKindForCount(8), "x4");
  });

  it("treino ↔ x3 precisa trocar de mapa; 2v2 → 1v1 no x3 não", () => {
    assert.equal(needsTrainingX3Swap("training", "x3"), true);
    assert.equal(needsTrainingX3Swap("x3", "training"), true);
    assert.equal(needsTrainingX3Swap("x4", "training"), true);
    assert.equal(needsTrainingX3Swap("x3", "x3"), false);
    assert.equal(needsTrainingX3Swap("x4", "x3"), false);
    assert.equal(needsTrainingX3Swap("training", "training"), false);
  });

  it("hardcode tem treino, x3 e x4", () => {
    const stadiums = require("../src/room/stadiums");
    assert.ok(stadiums.training && stadiums.training.length > 100);
    assert.ok(stadiums.x3 && stadiums.x3.length > 100);
    assert.ok(stadiums.x4 && stadiums.x4.length > 100);
    assert.match(parseStadium(stadiums.training).name, /training|treino|ice bear/i);
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
      woms: 1,
      hat_tricks: 2,
    };
    const text = formatStatusCard("Netto", stats, { emblem: "👑", name: "Chefe" });
    assert.match(text, /👑 Netto/);
    assert.match(text, /Chefe/);
    assert.match(text, /Jogos: 10/);
    assert.match(text, /Vitórias: 6/);
    assert.match(text, /Empates: 1/);
    assert.match(text, /Derrotas: 3/);
    assert.match(text, /WR 60%/);
    assert.match(text, /Gols: 12/);
    assert.match(text, /Assist: 7/);
    assert.match(text, /Hat-tricks: 2/);
    assert.match(text, /CS: 4/);
    assert.match(text, /MVP: 2/);
    assert.match(text, /WoM: 1/);
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

  it("inclui passe/rec/posse no resumo", () => {
    const text = buildSummary({
      scoreRed: 1,
      scoreBlue: 0,
      redLineup: ["A"],
      blueLineup: ["B"],
      goals: [],
      playLines: ["", "**Passe / rec / posse**", "· A — 3/4 passe · 1 rec · 1 perda · 55%"],
    });
    assert.match(text, /3\/4 passe/);
    assert.match(text, /1 rec/);
  });
});

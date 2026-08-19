const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");

const {
  connToIp,
  parseDurationToMs,
  formatDuration,
  findPlayer,
} = require("../src/utils");
const {
  attributeGoal,
  isValidMatchScores,
  pickFromSpecList,
  isChooseToken,
  detectRageQuit,
} = require("../src/gameLogic");
const {
  listUnlocked,
  isUnlocked,
  resolveTitle,
  pickMatchMvps,
  formatChatPrefix,
} = require("../src/titles");
const { stadiumForPlayerCount, reloadMaps } = require("../src/room/maps");
const { buildSummary } = require("../src/discord/replay");

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
    assert.equal(isValidMatchScores({ red: 1, blue: 1, scoreLimit: 3, time: 160, timeLimit: 180 }), true);
    assert.equal(isValidMatchScores({ red: 0, blue: 0, scoreLimit: 3, time: 10, timeLimit: 180 }), false);
    assert.equal(isValidMatchScores(null), false);
  });

  it("pickFromSpecList top/bottom/numero", () => {
    const spec = [{ name: "a" }, { name: "b" }, { name: "c" }];
    assert.equal(pickFromSpecList(spec, "top").name, "a");
    assert.equal(pickFromSpecList(spec, "bottom").name, "c");
    assert.equal(pickFromSpecList(spec, "2").name, "b");
    assert.equal(pickFromSpecList(spec, "9"), null);
    assert.equal(isChooseToken("top"), true);
    assert.equal(isChooseToken("!help"), false);
  });

  it("detectRageQuit só no fim com diff 2", () => {
    const scores = { red: 2, blue: 0, time: 160, timeLimit: 180 };
    assert.deepEqual(detectRageQuit({ redCount: 4, blueCount: 3, scores }), { winner: 1 });
    assert.equal(detectRageQuit({ redCount: 4, blueCount: 4, scores }), null);
    assert.equal(
      detectRageQuit({ redCount: 4, blueCount: 3, scores: { ...scores, time: 10 } }),
      null
    );
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
    // 1º do spec (ordem da sala = ex-vermelho) vira capitão azul
    assert.equal(players.find((p) => p.id === 1).team, TEAM.BLUE);
    assert.equal(players.find((p) => p.id === 2).team, TEAM.SPEC);
  });
});

describe("titles / cargos", () => {
  it("novato sempre liberado; artilheiro precisa gols", () => {
    assert.equal(isUnlocked({}, "novato"), true);
    assert.equal(isUnlocked({ goals: 0 }, "artilheiro"), false);
    assert.equal(isUnlocked({ goals: 200 }, "artilheiro"), true);
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

  it("formatChatPrefix junta staff + cargo", () => {
    const prefix = formatChatPrefix(
      { emblem: "⚽", name: "Artilheiro" },
      { title: "Chefe" }
    );
    assert.match(prefix, /Chefe/);
    assert.match(prefix, /Artilheiro/);
  });
});

describe("maps", () => {
  it("carrega maptraining e mapx4", () => {
    reloadMaps();
    const training = stadiumForPlayerCount(1);
    const x4 = stadiumForPlayerCount(8);
    assert.ok(training && training.length > 100);
    assert.ok(x4 && x4.length > 100);
    assert.match(JSON.parse(training).name, /training|treino|ice bear/i);
    assert.match(JSON.parse(x4).name, /x4|futsal/i);
    assert.notEqual(training, x4);
  });

  it("arquivos .hbs existem", () => {
    const root = path.join(__dirname, "..");
    assert.ok(fs.existsSync(path.join(root, "maps/mapx4.hbs")));
    assert.ok(fs.existsSync(path.join(root, "maps/maptraining.hbs")));
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

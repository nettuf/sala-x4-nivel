const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const report = require("../src/room/matchReport");
const { createMatchController } = require("../src/room/match");

function line(extra = {}) {
  return { team: 1, goalkeeper: false, goals: 0, assists: 0, ownGoals: 0, passes: 0, misplaced: 0, tackles: 0, interceptions: 0, saves: 0, clearances: 0, lost: 0, errors: 0, shotSaved: 0, ...extra };
}

describe("nota igual ao site", () => {
  it("linha parada fica na base", () => {
    assert.equal(report.siteRating(line(), { redScore: 0, blueScore: 0, winner: 0 }), 6.3);
  });

  it("linha com gol, assist, passes e desarme na vitória", () => {
    const row = line({ goals: 1, assists: 1, passes: 8, misplaced: 2, tackles: 2 });
    assert.equal(report.siteRating(row, { redScore: 2, blueScore: 1, winner: 1 }), 8.3);
  });

  it("GC e perda de bola na derrota derrubam", () => {
    const row = line({ team: 2, ownGoals: 1, lost: 3 });
    assert.equal(report.siteRating(row, { redScore: 2, blueScore: 1, winner: 1 }), 4.7);
  });

  it("goleiro usa defesas e gol sofrido, não gol marcado", () => {
    const gk = line({ goalkeeper: true, saves: 4, goals: 2, passes: 3 });
    assert.equal(report.siteRating(gk, { redScore: 0, blueScore: 1, winner: 2 }), 7.0);
    const clean = line({ goalkeeper: true, saves: 3 });
    assert.equal(report.siteRating(clean, { redScore: 0, blueScore: 0, winner: 1 }), 8.0);
  });

  it("nota fica entre 1 e 10", () => {
    assert.equal(report.siteRating(line({ ownGoals: 5, errors: 3 }), {}), 1);
    assert.equal(report.siteRating(line({ goals: 9, assists: 9, passes: 30, tackles: 9, interceptions: 9 }), { redScore: 9, winner: 1 }), 10);
  });
});

describe("MVP e pior pela regra do site", () => {
  it("maior nota é MVP, menor é pior; empate vai para gols", () => {
    const rows = [
      { ...line({ goals: 1 }), name: "a", rating: 7.5 },
      { ...line({ goals: 2 }), name: "b", rating: 7.5 },
      { ...line(), name: "c", rating: 5.1 },
    ];
    const titles = report.pickSiteTitles(rows);
    assert.equal(titles.mvp.name, "b");
    assert.equal(titles.worst.name, "c");
  });

  it("um jogador só não vira pior", () => {
    const titles = report.pickSiteTitles([{ ...line(), name: "a", rating: 6 }]);
    assert.equal(titles.mvp.name, "a");
    assert.equal(titles.worst, null);
  });
});

describe("parcial e fim de jogo na sala", () => {
  function fakeRoom() {
    const sent = [];
    const players = [
      { id: 1, name: "R1", auth: "r1", team: 1 },
      { id: 2, name: "R2", auth: "r2", team: 1 },
      { id: 3, name: "B1", auth: "b1", team: 2 },
      { id: 4, name: "B2", auth: "b2", team: 2 },
    ];
    let scores = { red: 0, blue: 0, time: 0, scoreLimit: 3, timeLimit: 180 };
    const room = {
      getPlayerList: () => players,
      getScores: () => scores,
      startRecording: () => {},
      stopRecording: () => new Uint8Array(),
      startGame: () => {},
      stopGame: () => {},
      setTimeLimit: () => {},
      sendAnnouncement: (text, to) => sent.push({ text, to }),
    };
    return { room, sent, setScores: (s) => { scores = { ...scores, ...s }; } };
  }

  it("a cada minuto manda os times para todos e a linha de cada um só para ele", () => {
    const { room, sent, setScores } = fakeRoom();
    const match = createMatchController(room);
    match.start({ competitive: true });
    setScores({ time: 30 });
    match.onTick();
    assert.equal(sent.length, 0);
    setScores({ time: 60.2, red: 1 });
    match.onTick();
    match.onTick();
    const open = sent.filter((m) => m.to == null).map((m) => m.text);
    assert.equal(open[0], "📊 Parcial 1' · 🔴 1 x 0 🔵");
    assert.equal(open.length, 3);
    const mine = sent.filter((m) => m.to != null);
    assert.deepEqual(mine.map((m) => m.to).sort(), [1, 2, 3, 4]);
    assert.match(mine[0].text, /^📍 Você aos 1' · nota ~\d+,\d/);
  });

  it("treino não recebe parcial", () => {
    const { room, sent, setScores } = fakeRoom();
    const match = createMatchController(room);
    match.start({ competitive: false });
    setScores({ time: 61 });
    match.onTick();
    assert.equal(sent.length, 0);
  });

  it("não manda parcial no último minuto do relógio", () => {
    const { room, sent, setScores } = fakeRoom();
    const match = createMatchController(room);
    match.start({ competitive: true });
    setScores({ time: 120.1, timeLimit: 180 });
    match.onTick();
    setScores({ time: 180, red: 1 });
    match.onTick();
    const partials = sent.filter((m) => /Parcial/.test(m.text)).map((m) => m.text);
    assert.deepEqual(partials, ["📊 Parcial 2' · 🔴 0 x 0 🔵"]);
  });

  it("no fim: times, MVP e pior com nota, e a partida de cada um em privado", async () => {
    const { room, sent, setScores } = fakeRoom();
    const match = createMatchController(room);
    match.start({ competitive: true });
    setScores({ red: 3, blue: 1, time: 150 });
    match.markVictory();
    const result = await match.finish({ red: 3, blue: 1, time: 150, scoreLimit: 3, timeLimit: 180 }, { persist: false });
    assert.equal(result.valid, true);
    const open = sent.filter((m) => m.to == null).map((m) => m.text);
    assert.equal(open[0], "🏁 Fim de jogo · 🔴 3 x 1 🔵");
    assert.ok(open.some((t) => /^⭐ MVP · R\d · nota \d+,\d/.test(t)));
    assert.ok(open.some((t) => /^💩 Pior · B\d · nota \d+,\d/.test(t)));
    assert.equal(open.some((t) => /Posse jogador|Passe:/.test(t)), false);
    const mine = sent.filter((m) => m.to != null);
    assert.equal(mine.length, 4);
    assert.ok(mine.every((m) => /^📋 Sua partida · nota \d+,\d \(\dº de 4\)/.test(m.text)));
  });
});

describe("estatísticas dos times e do jogador", () => {
  const playMap = new Map([
    [1, { id: 1, team: 1, passes: 10, misplaced: 2, tackles: 3, interceptions: 1, saves: 0 }],
    [2, { id: 2, team: 2, passes: 4, misplaced: 4, tackles: 1, interceptions: 2, saves: 2 }],
  ]);
  const kicks = [
    { type: "save", fromId: 1, fromTeam: 1 },
    { type: "block", fromId: 1, fromTeam: 1 },
    { type: "pass", fromId: 2, fromTeam: 2 },
  ];
  const goals = [
    { team: 1, scorerId: 1, isOwnGoal: false },
    { team: 1, scorerId: 2, isOwnGoal: true },
  ];

  it("chute conta gol, defesa e bloqueio; GC fica de fora", () => {
    const shots = report.countShots(kicks, goals);
    assert.deepEqual(shots.byTeam, { 1: 3, 2: 0 });
    assert.equal(shots.byId.get(1), 3);
    assert.equal(shots.byId.get(2), undefined);
  });

  it("parcial dos times em linhas curtas", () => {
    const totals = report.teamTotals(playMap, report.countShots(kicks, goals), { red: 57.6, blue: 42.4 });
    const lines = report.formatPartialTeams({ minute: 2, redScore: 2, blueScore: 0, totals });
    assert.deepEqual(lines, [
      "📊 Parcial 2' · 🔴 2 x 0 🔵",
      "⏱️ Posse 58% · 42%   🎯 Passes 10 · 4",
      "👟 Chutes 3 · 0   ⚔️ Desarmes 3 · 1",
    ]);
    const final = report.formatFinalTeams({ redScore: 2, blueScore: 0, totals });
    assert.equal(final[0], "🏁 Fim de jogo · 🔴 2 x 0 🔵");
    assert.equal(final[3], "✂️ Interceptações 1 · 2   🧤 Defesas 0 · 2");
  });

  it("linha do jogador mostra só o que ele fez", () => {
    const rows = report.buildRows({
      players: [{ id: 1, auth: "a", name: "Ana", team: 1 }, { id: 2, auth: "b", name: "Beto", team: 2 }],
      playMap,
      tally: (p) => (p.id === 1 ? { goals: 1, assists: 0, own_goals: 0 } : { goals: 0, assists: 0, own_goals: 1 }),
      gk: { redId: null, blueId: 2 },
      shots: report.countShots(kicks, goals),
      redScore: 2,
      blueScore: 0,
      winner: 1,
    });
    const ana = rows.find((r) => r.id === 1);
    const beto = rows.find((r) => r.id === 2);
    assert.equal(beto.goalkeeper, true);
    assert.equal(report.formatPartialPlayer(ana, 2), `📍 Você aos 2' · nota ~${report.decimal(ana.rating)} · 1G · 10/12 passes · 3 chutes · 3 desarmes · 1 interceptação`);
    assert.equal(report.formatFinalPlayer(beto, 2, 2), `📋 Sua partida · nota ${report.decimal(beto.rating)} (2º de 2) · 1 GC · 4/8 passes · 1 desarme · 2 interceptações · 2 defesas`);
    assert.match(report.formatTitleLine("mvp", ana), /^⭐ MVP · Ana · nota \d+,\d · 1G/);
  });
});

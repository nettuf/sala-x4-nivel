const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  detectRageQuit,
  isValidMatchScores,
  pickFromSpecList,
  isChooseToken,
  canJoinMatchStats,
  rageQuitMessages,
} = require("../src/gameLogic");
const { stadiumKindForCount } = require("../src/room/maps");
const { createChooseController, TEAM } = require("../src/room/choose");
const { createMatchController } = require("../src/room/match");
const { planWarmup } = require("../src/room/warmupFlow");
const { planCompetitiveRecovery, planExactFill } = require("../src/room/recovery");
const { createStreakTracker, applyWinnerStays, shouldUseWinnerStays } = require("../src/room/streak");
const { createUniformManager, formatKickoffVs, findKit } = require("../src/room/uniforms");
const { createCommandHandler } = require("../src/commands");
const { createAfkTracker } = require("../src/room/afk");
const { winratePct, formatStatusCard, emptyPlayerStats } = require("../src/db/stats");
const { isUnlocked } = require("../src/titles");
const config = require("../src/config");

function p(id, team = TEAM.SPEC) {
  return { id, name: `P${id}`, auth: `a${id}`, team };
}

function chooseRoom(players, extra = {}) {
  const announcements = [];
  const kicks = [];
  let started = 0;
  const room = {
    getPlayerList: () => players,
    getScores: () => extra.scores ?? null,
    setPlayerTeam(id, team) {
      const row = players.find((player) => player.id === id);
      if (row) row.team = team;
    },
    sendAnnouncement: (msg, to) => announcements.push({ msg, to }),
    kickPlayer: (id, reason) => kicks.push({ id, reason }),
  };
  const choose = createChooseController(room, {
    onReadyToStart: () => {
      started += 1;
    },
    isExcluded: extra.isExcluded || (() => false),
    getStreak: () => extra.streak || 0,
  });
  return { room, choose, announcements, kicks, started: () => started };
}

describe("mapas por quantidade", () => {
  it("1 = treino, 2–7 = x3, 8+ = x4", () => {
    assert.equal(stadiumKindForCount(0), "training");
    assert.equal(stadiumKindForCount(1), "training");
    assert.equal(stadiumKindForCount(2), "x3");
    assert.equal(stadiumKindForCount(7), "x3");
    assert.equal(stadiumKindForCount(8), "x4");
    assert.equal(stadiumKindForCount(16), "x4");
  });
});

describe("choose: quem picka", () => {
  it("3v4: só o vermelho (time com vaga) picka", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(12, TEAM.RED),
      p(2, TEAM.BLUE),
      p(22, TEAM.BLUE),
      p(23, TEAM.BLUE),
      p(24, TEAM.BLUE),
      p(4),
      p(5),
    ];
    const { choose } = chooseRoom(players);
    choose.continueFromField();
    assert.equal(choose.currentCaptain().id, 1);
    assert.equal(choose.handleCaptainChat(players.find((row) => row.id === 2), "1"), true);
    assert.equal(choose.handleCaptainChat(players[0], "1"), true);
    assert.equal(players.find((row) => row.id === 4).team, TEAM.RED);
  });

  it("bottom pega o último da lista", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(12, TEAM.RED),
      p(13, TEAM.RED),
      p(2, TEAM.BLUE),
      p(4),
      p(5),
      p(6),
      p(7),
    ];
    const { choose } = chooseRoom(players);
    choose.continueFromField();
    assert.equal(choose.isActive(), true);
    assert.equal(choose.handleCaptainChat(choose.currentCaptain(), "bottom"), true);
    assert.equal(players.find((row) => row.id === 7).team, TEAM.BLUE);
  });

  it("número inválido avisa e não move ninguém", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(12, TEAM.RED),
      p(13, TEAM.RED),
      p(2, TEAM.BLUE),
      p(4),
      p(5),
    ];
    const { choose, announcements } = chooseRoom(players);
    choose.continueFromField();
    const cap = choose.currentCaptain();
    assert.equal(choose.handleCaptainChat(cap, "99"), true);
    assert.ok(announcements.some((a) => /inválida/i.test(a.msg)));
    assert.equal(players.find((row) => row.id === 4).team, TEAM.SPEC);
  });

  it("spec e jogador comum não pickam", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(12, TEAM.RED),
      p(13, TEAM.RED),
      p(2, TEAM.BLUE),
      p(22, TEAM.BLUE),
      p(23, TEAM.BLUE),
      p(4),
      p(5),
    ];
    const { choose } = chooseRoom(players);
    choose.continueFromField();
    assert.equal(choose.handleCaptainChat(players.find((row) => row.id === 4), "1"), true);
    assert.equal(choose.handleCaptainChat(players.find((row) => row.id === 11), "1"), true);
    assert.equal(players.find((row) => row.id === 4).team, TEAM.SPEC);
  });

  it("4v4 completo no continueFromField inicia sem pick", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(12, TEAM.RED),
      p(13, TEAM.RED),
      p(2, TEAM.BLUE),
      p(22, TEAM.BLUE),
      p(23, TEAM.BLUE),
      p(24, TEAM.BLUE),
    ];
    const host = chooseRoom(players);
    host.choose.continueFromField();
    assert.equal(host.choose.isActive(), false);
    assert.equal(host.started(), 1);
  });

  it("token que não é pick passa adiante", () => {
    const players = [
      p(1, TEAM.RED),
      p(11, TEAM.RED),
      p(12, TEAM.RED),
      p(13, TEAM.RED),
      p(2, TEAM.BLUE),
      p(4),
      p(5),
      p(6),
      p(7),
    ];
    const { choose } = chooseRoom(players);
    choose.continueFromField();
    const cap = choose.currentCaptain();
    assert.equal(isChooseToken("oi"), false);
    assert.equal(choose.handleCaptainChat(cap, "oi"), false);
  });
});

describe("ragequit: placares", () => {
  function matchHost() {
    const players = [
      { id: 1, name: "R", auth: "r", team: TEAM.RED },
      { id: 2, name: "B", auth: "b", team: TEAM.BLUE },
    ];
    let scores = { red: 0, blue: 0, time: 20, scoreLimit: 3, timeLimit: 180 };
    const room = {
      getPlayerList: () => players,
      getScores: () => scores,
      startRecording: () => {},
      stopRecording: () => new Uint8Array(),
      startGame: () => {},
      sendAnnouncement: () => {},
    };
    const match = createMatchController(room);
    match.start({ competitive: true });
    return {
      players,
      match,
      setScores(next) {
        scores = { ...scores, ...next };
      },
    };
  }

  it("0x3 o azul vencedor sair não é ragequit; o vermelho sim", () => {
    const host = matchHost();
    host.setScores({ red: 0, blue: 3 });
    assert.equal(host.match.rageQuitReason(host.players[1]), null);
    assert.match(host.match.rageQuitReason(host.players[0]), /0x3/);
  });

  it("3x1 ainda conta (diff 2)", () => {
    const host = matchHost();
    host.setScores({ red: 3, blue: 1 });
    assert.match(host.match.rageQuitReason(host.players[1]), /3x1/);
  });

  it("3x1 ainda é ragequit se a partida deixou de ser competitive", () => {
    const host = matchHost();
    host.setScores({ red: 3, blue: 1 });
    host.match.setCompetitive(false);
    assert.match(host.match.rageQuitReason(host.players[1]), /3x1/);
  });

  it("empate 2x2 não é ragequit", () => {
    const host = matchHost();
    host.setScores({ red: 2, blue: 2 });
    assert.equal(host.match.rageQuitReason(host.players[0]), null);
    assert.equal(host.match.rageQuitReason(host.players[1]), null);
  });

  it("2x0 cedo no relógio ainda é ragequit no 4v4", () => {
    const host = matchHost();
    host.setScores({ red: 2, blue: 0, time: 15 });
    assert.match(host.match.rageQuitReason(host.players[1]), /2x0/);
  });

  it("detectRageQuit clássico: 0x3 no fim com time menor", () => {
    const scores = { red: 0, blue: 3, time: 160, timeLimit: 180 };
    assert.deepEqual(detectRageQuit({ redCount: 3, blueCount: 4, scores }), { winner: 2 });
    assert.equal(detectRageQuit({ redCount: 3, blueCount: 4, scores: { ...scores, blue: 1 } }), null);
  });

  it("partida válida por vitória marcada mesmo sem limite", () => {
    assert.equal(
      isValidMatchScores({ red: 1, blue: 0, time: 10, timeLimit: 180, scoreLimit: 3 }, { endByVictory: true }),
      true
    );
  });
});

describe("warmup e recuperação", () => {
  it("7 jogadores: 3v3 e 1 spec", () => {
    const players = [
      p(1, TEAM.RED), p(2, TEAM.RED), p(3, TEAM.RED),
      p(4, TEAM.BLUE), p(5, TEAM.BLUE), p(6, TEAM.BLUE),
      p(7),
    ];
    const plan = planWarmup(players);
    assert.equal(plan.eligibleCount, 7);
    assert.equal(plan.replacementTeam, null);
    assert.equal(plan.shouldStart, true);
  });

  it("4v2 ao vivo com spec → reposição, não RR", () => {
    const plan = planCompetitiveRecovery({
      redCount: 4,
      blueCount: 2,
      specCount: 1,
      teamSize: 4,
      live: true,
    });
    assert.equal(plan.action, "fill-one");
    assert.equal(
      planCompetitiveRecovery({
        redCount: 4,
        blueCount: 2,
        specCount: 3,
        teamSize: 4,
        live: true,
      }).action,
      "choose"
    );
  });

  it("pós-vitória 4v1 + 4 spec → choose", () => {
    assert.equal(
      planExactFill({ redCount: 4, blueCount: 1, specCount: 4, teamSize: 4 }).action,
      "choose"
    );
  });
});

describe("streak e winner stays", () => {
  it("vermelho ganha: azul vai spec e 1º spec vira capitão azul", () => {
    const players = [
      p(1, TEAM.RED), p(2, TEAM.RED),
      p(3, TEAM.BLUE), p(4, TEAM.BLUE),
      p(5),
    ];
    const room = {
      getPlayerList: () => players,
      setPlayerTeam(id, team) {
        players.find((row) => row.id === id).team = team;
      },
      sendAnnouncement: () => {},
    };
    const streak = createStreakTracker();
    const r = applyWinnerStays(room, TEAM.RED, streak);
    assert.equal(r.mode, "choose");
    assert.equal(streak.get(), 1);
    assert.equal(players.find((row) => row.id === 1).team, TEAM.RED);
    assert.equal(players.find((row) => row.id === 2).team, TEAM.RED);
    assert.equal(players.find((row) => row.id === 5).team, TEAM.BLUE);
    assert.equal(players.find((row) => row.id === 3).team, TEAM.SPEC);
    assert.equal(players.find((row) => row.id === 4).team, TEAM.SPEC);
  });

  it("empate não zera times nem streak (gol de ouro)", () => {
    const players = [p(1, TEAM.RED), p(2, TEAM.BLUE)];
    const room = {
      getPlayerList: () => players,
      setPlayerTeam(id, team) {
        players.find((row) => row.id === id).team = team;
      },
      sendAnnouncement: () => {},
    };
    const streak = createStreakTracker();
    streak.recordWin(TEAM.RED);
    const r = applyWinnerStays(room, 0, streak);
    assert.equal(r.mode, "keep");
    assert.equal(streak.get(), 1);
    assert.equal(players[0].team, TEAM.RED);
    assert.equal(players[1].team, TEAM.BLUE);
  });

  it("shouldUseWinnerStays no 3v3/2v2 mesmo sem stats; 4v4 só se válida", () => {
    assert.equal(shouldUseWinnerStays(8, true, TEAM.RED), true);
    assert.equal(shouldUseWinnerStays(7, false, TEAM.RED), true);
    assert.equal(shouldUseWinnerStays(5, false, TEAM.BLUE), true);
    assert.equal(shouldUseWinnerStays(3, false, TEAM.RED), true);
    assert.equal(shouldUseWinnerStays(8, false, TEAM.RED), false);
    assert.equal(shouldUseWinnerStays(7, false, 0), false);
    // 3v3 + 1 spec (+ AFK no spec não entram nesta conta)
    assert.equal(shouldUseWinnerStays(7, false, TEAM.RED), true);
  });
});

describe("comandos extras", () => {
  function mockCmd() {
    const players = [
      { id: 1, name: "RedCap", team: 1, auth: "auth1" },
      { id: 2, name: "Blue1", team: 2, auth: "auth2" },
      { id: 3, name: "Spec", team: 0, auth: "auth3" },
    ];
    const announcements = [];
    const room = {
      getPlayerList: () => players,
      sendAnnouncement: (msg, to) => announcements.push({ msg, to }),
      setPlayerTeam: (id, team) => {
        const row = players.find((x) => x.id === id);
        if (row) row.team = team;
      },
      kickPlayer: () => {},
      setPlayerAdmin: () => {},
      setTeamColors: () => {},
    };
    const afk = createAfkTracker(room);
    const uniforms = createUniformManager(room);
    const streak = createStreakTracker();
    const ctx = {
      admins: new Map(),
      mutes: new Map(),
      titles: new Map(),
      auths: new Map([[1, "auth1"], [2, "auth2"], [3, "auth3"]]),
      afk,
      uniforms,
      streak,
    };
    let now = 1_700_000_000_000;
    ctx.now = () => now;
    const cmd = createCommandHandler(room, ctx);
    return { room, players, announcements, afk, cmd, streak, ctx, advance: (ms) => { now += ms; } };
  }

  it("!streak vazio e com vitória", async () => {
    const host = mockCmd();
    await host.cmd.handle(host.players[0], "!streak");
    assert.ok(host.announcements.some((a) => /Sem streak/i.test(a.msg)));
    host.streak.recordWin(TEAM.RED);
    host.advance(10_000);
    await host.cmd.handle(host.players[0], "!streaks");
    assert.ok(host.announcements.some((a) => /Streak atual: 1/.test(a.msg)));
    host.afk.stop();
  });

  it("!topstreak mostra recorde", async () => {
    const host = mockCmd();
    await host.cmd.handle(host.players[0], "!topstreak");
    assert.ok(host.announcements.some((a) => /Sem recorde/i.test(a.msg)));
    host.streak.recordWin(TEAM.RED, ["A", "B"]);
    host.streak.recordWin(TEAM.RED, ["A", "B"]);
    host.streak.recordWin(TEAM.BLUE, ["C"]);
    host.advance(10_000);
    await host.cmd.handle(host.players[0], "!topstreak");
    assert.ok(host.announcements.some((a) => /Maior streak da sala: 2 · A, B/.test(a.msg)));
    host.afk.stop();
  });

  it("!unis lista kits e o atual", async () => {
    const host = mockCmd();
    await host.cmd.handle(host.players[0], "!unis");
    assert.ok(host.announcements.some((a) => /preto/i.test(a.msg) && /branco/i.test(a.msg)));
    host.afk.stop();
  });

  it("!t no spec é recusado; vazio pede uso", async () => {
    const host = mockCmd();
    await host.cmd.handle(host.players[2], "!t oi");
    assert.ok(host.announcements.some((a) => /só em campo/i.test(a.msg)));
    await host.cmd.handle(host.players[0], "!t");
    assert.ok(host.announcements.some((a) => /Uso: !t/.test(a.msg)));
    host.afk.stop();
  });

  it("!voltar sem estar AFK avisa", async () => {
    const host = mockCmd();
    await host.cmd.handle(host.players[0], "!voltar");
    assert.ok(host.announcements.some((a) => /não está AFK/i.test(a.msg)));
    host.afk.stop();
  });

  it("!cargos e !cargo sem auth pedem login", async () => {
    const host = mockCmd();
    host.players[0].auth = "";
    host.ctx.auths.delete(1);
    await host.cmd.handle(host.players[0], "!cargos");
    await host.cmd.handle(host.players[0], "!cargo negativo");
    const msgs = host.announcements.filter((a) => /logado no Haxball/i.test(a.msg));
    assert.ok(msgs.length >= 2);
    host.afk.stop();
  });

  it("!status nick inexistente avisa", async () => {
    const host = mockCmd();
    await host.cmd.handle(host.players[0], "!status Ninguem");
    assert.ok(host.announcements.some((a) => /não encontrado/i.test(a.msg)));
    host.afk.stop();
  });

  it("!ban sem admin é recusado; comando desconhecido não consome", async () => {
    const host = mockCmd();
    await host.cmd.handle(host.players[0], "!ban #2");
    assert.ok(host.announcements.some((a) => /Sem permissão/i.test(a.msg)));
    assert.equal(await host.cmd.handle(host.players[0], "!naoexiste"), false);
    host.afk.stop();
  });
});

describe("uniformes kickoff e winner stays", () => {
  it("padrão é Preto vs Branco", () => {
    const players = [p(1, TEAM.RED), p(2, TEAM.BLUE)];
    const room = {
      getPlayerList: () => players,
      setTeamColors: () => {},
      sendAnnouncement: () => {},
    };
    const u = createUniformManager(room);
    assert.match(u.kickoffVs(), /Preto/);
    assert.match(u.kickoffVs(), /Branco/);
    assert.equal(
      formatKickoffVs(findKit("preto"), findKit("branco")),
      "🔴 Preto  vs  🔵 Branco"
    );
  });

  it("azul vence: kit custom do azul vai para o vermelho", () => {
    const players = [p(1, TEAM.RED), p(2, TEAM.BLUE)];
    const room = {
      getPlayerList: () => players,
      setTeamColors: () => {},
      sendAnnouncement: () => {},
    };
    const u = createUniformManager(room);
    u.change({ player: players[1], isAdmin: true, teamRef: "blue", kitId: "fra" });
    u.onWinnerStays(TEAM.BLUE);
    assert.equal(u.current()[TEAM.RED], "fra");
    assert.equal(u.current()[TEAM.BLUE], "branco");
  });
});

describe("stats e cargos", () => {
  it("winrate e card de status", () => {
    assert.equal(winratePct({ games: 0, wins: 0 }), 0);
    assert.equal(winratePct({ games: 4, wins: 1 }), 25);
    const card = formatStatusCard("Netto", { games: 10, wins: 4, losses: 6, goals: 3, assists: 1, cs: 2, mvps: 1 }, { emblem: "📉", name: "Negativo", color: 1 });
    assert.match(card, /Netto/);
    assert.match(card, /Negativo/);
    assert.match(card, /4V 0E 6D/);
    assert.match(card, /CS: 2/);
  });

  it("emptyPlayerStats tem CS e selected_title", () => {
    const s = emptyPlayerStats();
    assert.equal(s.cs, 0);
    assert.equal(s.selected_title, null);
  });

  it("late joiner recusado em goleada 0x2", () => {
    assert.equal(canJoinMatchStats({ time: 20, timeLimit: 180, red: 0, blue: 2 }), false);
  });

  it("artilheiro e negativo não se confundem", () => {
    assert.equal(isUnlocked({ games: 10, wins: 4, goals: 0 }, "artilheiro"), false);
    assert.equal(isUnlocked({ games: 10, wins: 4, goals: 0 }, "negativo"), true);
  });
});

describe("mensagens de ragequit", () => {
  it("público e PV usam @nome", () => {
    const msgs = rageQuitMessages("Baleio", "abandonou perdendo 2x0");
    assert.match(msgs.public, /@Baleio/);
    assert.match(msgs.private, /@Baleio você levou ragequit/);
  });
});

describe("pickFromSpecList", () => {
  it("random escolhe alguém da lista", () => {
    const spec = [{ name: "a" }, { name: "b" }, { name: "c" }];
    const got = pickFromSpecList(spec, "random");
    assert.ok(spec.includes(got));
  });
});

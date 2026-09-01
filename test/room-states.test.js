const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  bootRoom,
  fill4v4,
  startChoose,
  settle,
  TEAM,
  config,
} = require("./helpers/roomHost");

describe("AFK do jogador parado", () => {
  it("parado em campo cai pro spec e fica AFK; quem andou continua jogando", () => {
    const host = bootRoom();
    const all = fill4v4(host);
    const parado = all[0];
    host.startMatch();

    host.idle(all, { moving: all.slice(1), idleMs: config.afkActionMs + 1000 });
    host.handles.afk.tick(Date.now());

    assert.equal(host.find(parado.id).team, TEAM.SPEC, "parado devia ir pro spec");
    assert.equal(host.handles.afk.isAfk(parado.id), true);
    assert.equal(host.handles.afk.isAfk(all[1].id), false, "quem andou continua ativo");
    assert.equal(host.kicks.length, 0, "sala com vaga não kicka por AFK");
    assert.ok(host.announcements.some((a) => /parado/i.test(a.msg)));
    host.cleanup();
  });

  it("dois parados na partida: o primeiro AFK não zera o timer do segundo", () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch();
    const a = all[0];
    const b = all[1];
    // Passa do kickoff: senão o 1º AFK vira RR e zera o idle de todo mundo.
    for (const p of all) host.activity(p);
    host.idle(all, { moving: all.slice(2), idleMs: config.afkActionMs + 1000 });

    const pausesBefore = host.pauses.length;
    host.handles.afk.tick(Date.now());

    assert.equal(host.find(a.id).team, TEAM.SPEC);
    assert.equal(host.handles.afk.isAfk(a.id), true);
    assert.equal(host.handles.afk.isAfk(b.id), false, "só 1 auto-AFK por tick");

    host.handles.afk.tick(Date.now() + 50);
    assert.equal(host.find(b.id).team, TEAM.SPEC);
    assert.equal(host.handles.afk.isAfk(b.id), true);
    assert.equal(host.pauses.length, pausesBefore, "auto-AFK não pode pausar e zerar os outros");
    host.cleanup();
  });

  it("sem reserva no spec, o 4v3 vira 3v3 e o jogo segue", () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch();

    host.handles.afk.setAfk(all[0], true);

    const red = host.players.filter((p) => p.team === TEAM.RED).length;
    const blue = host.players.filter((p) => p.team === TEAM.BLUE).length;
    assert.equal(red, 3);
    assert.equal(blue, 3, "o time maior devolve um jogador em vez de jogar 3v4");
    assert.ok(host.live(), "o jogo não é interrompido");
    assert.equal(host.kicks.length, 0);
    host.cleanup();
  });

  it("AFK some da lista do capitão sozinho e o número passa para o próximo", async () => {
    const host = bootRoom();
    const all = startChoose(host);
    const cap = host.handles.choose.currentCaptain();
    const specs = host.handles.choose.list().specReady;
    assert.match(host.lastSpecList().msg, new RegExp(`${specs[0].name}\\[1\\]`));

    host.handles.afk.setAfk(host.find(specs[0].id), true);
    await settle();

    const msg = host.lastSpecList().msg;
    assert.ok(!msg.includes(`${specs[0].name}[`), "AFK não pode aparecer na lista");
    assert.match(msg, new RegExp(`${specs[1].name}\\[1\\]`), "o próximo herda o número 1");
    assert.equal(host.lastSpecList().to, cap.id, "lista vai só para o capitão");
    assert.equal(all.length, 10);
    host.cleanup();
  });

  it("capitão não consegue escolher quem está AFK", async () => {
    const host = bootRoom();
    startChoose(host);
    const cap = host.handles.choose.currentCaptain();
    const specs = host.handles.choose.list().specReady;
    const afkOne = specs[0];
    const proximo = specs[1];

    host.handles.afk.setAfk(host.find(afkOne.id), true);
    await settle();
    host.handles.choose.handleCaptainChat(cap, "1");

    assert.equal(host.find(afkOne.id).team, TEAM.SPEC, "AFK não entra por pick");
    assert.equal(host.find(proximo.id).team, cap.team, "o número 1 é o primeiro não-AFK");
    host.cleanup();
  });

  it("!afk tira o AFK e ele volta para a fila do pick", async () => {
    const host = bootRoom();
    startChoose(host);
    const jogador = host.find(host.handles.choose.list().specReady[0].id);

    host.handles.afk.setAfk(jogador, true);
    await settle();
    assert.equal(host.handles.afk.isAfk(jogador.id), true);
    assert.ok(!host.lastSpecList().msg.includes(`${jogador.name}[`));

    await host.room.onPlayerChat(host.find(jogador.id), "!afk");
    await settle();

    assert.equal(host.handles.afk.isAfk(jogador.id), false);
    assert.ok(host.lastSpecList().msg.includes(`${jogador.name}[`), "volta para a lista");
    host.cleanup();
  });
});

describe("sala se destrava sem admin", () => {
  it("partida rodando com choose aberto: o capitão ainda consegue pickar", async () => {
    const host = bootRoom();
    startChoose(host);
    host.startMatch();
    assert.ok(host.live(), "cenário do bug: jogo rodando com choose aberto");

    const cap = host.handles.choose.currentCaptain();
    const antes = host.handles.choose.list().blue.length;
    await host.room.onPlayerChat(host.find(cap.id), "1");

    assert.equal(host.handles.choose.list().blue.length, antes + 1);
    host.cleanup();
  });

  it("watchdog encerra a partida que ficou rodando incompleta", () => {
    const host = bootRoom();
    startChoose(host);
    host.startMatch();

    assert.equal(host.handles.health.check(), null, "um sintoma só não age");
    const acted = host.handles.health.check();

    assert.equal(acted.action, "stop-game");
    assert.equal(host.live(), null, "jogo parado para o lobby remontar");
    assert.equal(host.handles.choose.isActive(), false);
    host.cleanup();
  });

  it("4v1 no campo nunca vira partida rodando", async () => {
    const host = bootRoom();
    for (let i = 0; i < 4; i++) host.addPlayer(TEAM.RED);
    host.addPlayer(TEAM.BLUE);
    host.handles.choose.deactivate();

    host.handles.health.check();
    host.handles.health.check();
    await new Promise((r) => setTimeout(r, 500));

    const red = host.players.filter((p) => p.team === TEAM.RED).length;
    const blue = host.players.filter((p) => p.team === TEAM.BLUE).length;
    if (host.live()) {
      assert.equal(red, blue, `partida começou desigual (${red}v${blue})`);
    }
    host.cleanup();
  });

  it("admin tirando um do 4v4 abre reposição na hora e despausa depois", async () => {
    const host = bootRoom();
    fill4v4(host);
    host.addPlayer(TEAM.SPEC);
    host.addPlayer(TEAM.SPEC);
    host.startMatch();

    const admin = host.players[0];
    const saiu = host.players.filter((p) => p.team === TEAM.RED)[1];
    host.adminMove(saiu, TEAM.SPEC, admin);

    assert.equal(host.handles.choose.isActive(), true);
    assert.equal(host.handles.choose.isReplacement(), true);

    const cap = host.handles.choose.currentCaptain();
    await host.room.onPlayerChat(host.find(cap.id), "1");
    await new Promise((r) => setTimeout(r, 200));

    assert.equal(host.players.filter((p) => p.team === TEAM.RED).length, 4);
    assert.equal(host.pauses[host.pauses.length - 1], false, "o jogo volta sozinho");
    host.cleanup();
  });

  it("pausa esquecida é desfeita pelo watchdog, mas não na hora", () => {
    const host = bootRoom();
    fill4v4(host);
    host.startMatch();
    host.adminPause(true);

    host.handles.health.check();
    host.handles.health.check();
    assert.equal(host.pauses[host.pauses.length - 1], true, "admin tem tempo de falar");

    for (let i = 0; i < 4; i++) host.handles.health.check();
    assert.equal(host.pauses[host.pauses.length - 1], false, "pausa longa é desfeita");
    host.cleanup();
  });

  it("1v0 no treino com flag competitive não fica em loop de stop-game", () => {
    const host = bootRoom();
    fill4v4(host);
    host.startMatch();
    for (const p of host.players.slice(1)) p.team = TEAM.SPEC;

    const acted = [];
    for (let i = 0; i < 6; i++) {
      const r = host.handles.health.check();
      if (r) acted.push(r.action);
    }

    assert.equal(
      acted.filter((a) => a === "stop-game").length,
      0,
      `treino 1v0 não pode RR (${acted.join(",")})`
    );
    assert.ok(host.live(), "o treino segue sem o watchdog derrubar");
    host.cleanup();
  });
});

describe("winner stays ignora AFK no spec", () => {
  it("3v3 + 1 spec ativo + 4 AFK: o spec vira capitão, os vencedores ficam", async () => {
    const host = bootRoom();
    const reds = [];
    const blues = [];
    for (let i = 0; i < 3; i++) reds.push(host.addPlayer(TEAM.RED));
    for (let i = 0; i < 3; i++) blues.push(host.addPlayer(TEAM.BLUE));
    const specAtivo = host.addPlayer(TEAM.SPEC);
    for (let i = 0; i < 4; i++) {
      const p = host.addPlayer(TEAM.SPEC);
      host.handles.afk.setAfk(p, true);
    }
    host.startMatch({ competitive: false });

    const scores = host.live();
    Object.assign(scores, { red: config.scoreLimit, blue: 0, time: 240 });
    host.handles.match.onTick();
    host.handles.match.markVictory();
    host.room.stopGame();
    await host.room.onGameStop();
    await new Promise((r) => setTimeout(r, 500));

    assert.equal(host.handles.choose.isActive(), true, "AFK no spec não pode remountar o mesmo 3v3");
    assert.equal(host.teamCount(TEAM.RED), 3);
    assert.equal(host.teamCount(TEAM.BLUE), 1);
    assert.equal(host.handles.choose.currentCaptain()?.id, specAtivo.id);
    for (const p of reds) {
      assert.equal(host.find(p.id).team, TEAM.RED);
    }
    host.cleanup();
  });

  it("4v4 + 2 spec ativos + 4 AFK: azul perde → spec vira capitão, perdedores saem", async () => {
    const host = bootRoom();
    const reds = [];
    const blues = [];
    for (let i = 0; i < 4; i++) reds.push(host.addPlayer(TEAM.RED));
    for (let i = 0; i < 4; i++) blues.push(host.addPlayer(TEAM.BLUE));
    const specCap = host.addPlayer(TEAM.SPEC, "CapSpec");
    host.addPlayer(TEAM.SPEC, "Reserva");
    for (let i = 0; i < 4; i++) {
      const p = host.addPlayer(TEAM.SPEC);
      host.handles.afk.setAfk(p, true);
    }
    host.startMatch({ competitive: true });

    const scores = host.live();
    Object.assign(scores, { red: config.scoreLimit, blue: 0, time: 240 });
    host.handles.match.onTick();
    host.handles.match.markVictory();
    host.room.stopGame();
    await host.room.onGameStop();
    await new Promise((r) => setTimeout(r, 500));

    assert.equal(host.handles.choose.isActive(), true);
    assert.equal(host.teamCount(TEAM.RED), 4);
    assert.equal(host.teamCount(TEAM.BLUE), 1, "só o capitão do spec no azul");
    assert.equal(host.handles.choose.currentCaptain()?.id, specCap.id);
    for (const p of blues) {
      assert.equal(host.find(p.id).team, TEAM.SPEC, `${p.name} perdedor no spec`);
    }
    host.cleanup();
  });

  it("4v4: perdedores ainda no azul (async) → choose manda pro spec e sobe capitão", async () => {
    const host = bootRoom();
    for (let i = 0; i < 4; i++) host.addPlayer(TEAM.RED);
    for (let i = 0; i < 3; i++) host.addPlayer(TEAM.BLUE);
    const specCap = host.addPlayer(TEAM.SPEC, "CapSpec");
    host.addPlayer(TEAM.SPEC, "Reserva");

    host.handles.choose.continueFromField({ winnerStays: true });
    await new Promise((r) => setTimeout(r, 200));

    assert.equal(host.teamCount(TEAM.RED), 4);
    assert.equal(host.teamCount(TEAM.BLUE), 1);
    assert.equal(host.handles.choose.currentCaptain()?.id, specCap.id);
    host.cleanup();
  });

  it("4v4 cheio no azul perdedor + spec: winner stays tira todos os azuis e sobe capitão", async () => {
    const host = bootRoom();
    for (let i = 0; i < 4; i++) host.addPlayer(TEAM.RED);
    const blues = [];
    for (let i = 0; i < 4; i++) blues.push(host.addPlayer(TEAM.BLUE));
    const specCap = host.addPlayer(TEAM.SPEC, "CapSpec");
    for (let i = 0; i < 3; i++) {
      const p = host.addPlayer(TEAM.SPEC);
      host.handles.afk.setAfk(p, true);
    }

    host.handles.choose.continueFromField({ winnerStays: true });
    await new Promise((r) => setTimeout(r, 200));

    assert.equal(host.teamCount(TEAM.RED), 4);
    assert.equal(host.teamCount(TEAM.BLUE), 1, "só o capitão do spec no azul");
    assert.equal(host.handles.choose.currentCaptain()?.id, specCap.id);
    for (const p of blues) {
      assert.equal(host.find(p.id).team, TEAM.SPEC, "perdedor azul no spec");
    }
    host.cleanup();
  });

  it("não inicia a próxima partida enquanto os perdedores ainda estão no campo", async () => {
    const host = bootRoom({ deferTeamChanges: true });
    fill4v4(host);
    host.addPlayer(TEAM.SPEC);
    host.addPlayer(TEAM.SPEC);
    host.startMatch();

    const scores = host.live();
    Object.assign(scores, { red: config.scoreLimit, blue: 0, time: 240 });
    host.handles.match.onTick();
    host.handles.match.markVictory();
    host.room.stopGame();

    const stopping = host.room.onGameStop();
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(host.live(), null, "não pode relançar o 4v4 fantasma");
    assert.equal(host.teamCount(TEAM.BLUE), 4, "perdedores ainda no campo");

    host.flushTeams();
    await stopping;
    host.applyTeamsLive();

    assert.equal(host.live(), null, "escolhe antes de começar");
    assert.equal(host.handles.choose.isActive(), true);
    assert.equal(host.teamCount(TEAM.RED), 4);
    assert.equal(host.teamCount(TEAM.BLUE), 1);
    const cap = host.handles.choose.currentCaptain();
    assert.ok(cap);
    await host.room.onPlayerChat(host.find(cap.id), "1");
    assert.equal(host.teamCount(TEAM.BLUE), 2);
    host.cleanup();
  });

  it("4v4 + spec: refreshLobby/health não relançam o mesmo confronto antes dos perdedores saírem", async () => {
    const host = bootRoom({ deferTeamChanges: true });
    fill4v4(host);
    const waiter = host.addPlayer(TEAM.SPEC, "Espera");
    host.startMatch();

    const scores = host.live();
    Object.assign(scores, { red: config.scoreLimit, blue: 0, time: 240 });
    host.handles.match.onTick();
    host.handles.match.markVictory();
    host.room.stopGame();
    await host.room.onGameStop();

    assert.equal(host.live(), null);
    assert.equal(host.teamCount(TEAM.BLUE), 4, "setPlayerTeam ainda na fila");
    assert.equal(host.handles.choose.isActive(), false);

    host.handles.refreshLobby();
    assert.equal(host.live(), null, "atalho 4v4 montado não pode pular o choose");
    assert.equal(host.handles.choose.isActive(), false);
    assert.equal(host.teamCount(TEAM.RED), 4);

    host.handles.health.check();
    host.handles.health.check();
    assert.equal(host.live(), null, "health também não relança");

    host.flushTeams();
    for (const p of [...host.players]) {
      host.room.onPlayerTeamChange({ ...p }, null);
    }

    assert.equal(host.handles.choose.isActive(), true);
    assert.equal(host.teamCount(TEAM.RED), 4);
    assert.equal(host.teamCount(TEAM.BLUE), 1);
    assert.equal(host.handles.choose.currentCaptain()?.id, waiter.id);
    host.cleanup();
  });

  it("!streak mostra a vitória; treino e segundo stop não apagam", async () => {
    const host = bootRoom();
    fill4v4(host);
    host.addPlayer(TEAM.SPEC);
    host.startMatch();

    const scores = host.live();
    Object.assign(scores, { red: config.scoreLimit, blue: 0, time: 240 });
    host.handles.match.onTick();
    host.handles.match.markVictory();
    host.room.stopGame();
    await host.room.onGameStop();

    assert.equal(host.handles.streak.get(), 1);
    const who = host.players[0];
    host.chat(who, "!streak");
    assert.ok(
      host.said(/Streak atual: 1/, who.id),
      `!streak devia mostrar 1, got ${JSON.stringify(host.announcements.slice(-4))}`
    );

    await host.room.onGameStop();
    assert.equal(host.handles.streak.get(), 1, "segundo onGameStop não zera");

    host.startMatch({ competitive: false });
    host.room.stopGame();
    await host.room.onGameStop();
    assert.equal(host.handles.streak.get(), 1, "parar o treino não zera o streak do 4v4");

    host.startMatch({ competitive: true });
    host.room.stopGame();
    await host.room.onGameStop();
    assert.equal(host.handles.streak.get(), 1, "admin parar o 4v4 no meio não zera o streak");

    host.cleanup();
  });
});

describe("ações de admin", () => {
  it("admin pausa: ninguém vira AFK nem toma kick enquanto está pausado", () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch();
    const now = Date.now();
    for (const p of all) host.handles.afk.touch(p.id, now);

    host.adminPause(true);
    host.handles.afk.tick(now + config.afkActionMs * 3);

    assert.ok(all.every((p) => host.find(p.id).team !== TEAM.SPEC), "pausado não gera AFK");
    assert.equal(host.kicks.length, 0);
    host.cleanup();
  });

  it("bot não desfaz a pausa do admin ao mandar um AFK para o spec", () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch();
    host.adminPause(true);
    const pausesBefore = host.pauses.length;

    host.handles.afk.setAfk(all[0], true);

    assert.equal(host.find(all[0].id).team, TEAM.SPEC);
    assert.equal(host.pauses.length, pausesBefore, "não pode pausar/despausar por cima do admin");
    host.cleanup();
  });

  it("admin puxando AFK para o time: o bot devolve e avisa o admin", () => {
    const host = bootRoom();
    const all = fill4v4(host);
    const admin = host.addPlayer();
    host.handles.match.start({ competitive: true });
    const afkOne = host.addPlayer();
    host.handles.afk.setAfk(afkOne, true);

    host.adminMove(afkOne, TEAM.RED, admin);

    assert.equal(host.find(afkOne.id).team, TEAM.SPEC, "AFK não vai pra partida");
    assert.ok(
      host.announcements.some((a) => a.to === admin.id && /AFK/.test(a.msg)),
      "admin recebe o aviso"
    );
    assert.equal(host.kicks.length, 0);
    assert.equal(all.length, 8);
    host.cleanup();
  });

  it("admin tirando jogador do time no 4v4 não vira ragequit nem kick", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    const admin = host.addPlayer();
    host.startMatch();

    host.adminMove(all[0], TEAM.SPEC, admin);
    await new Promise((r) => setTimeout(r, 150));

    assert.equal(host.kicks.length, 0);
    assert.ok(!host.announcements.some((a) => /abandon/i.test(a.msg)), "sem acusação de ragequit");
    host.cleanup();
  });

  it("admin stop + start no 4v4 mantém os times e não remonta o lobby", async () => {
    const host = bootRoom();
    const field = fill4v4(host);
    const spec = host.addPlayer(TEAM.SPEC);
    const admin = host.addPlayer(TEAM.SPEC);
    host.startMatch();

    const before = new Map(host.players.map((p) => [p.id, p.team]));
    await host.adminStop(admin);
    await new Promise((r) => setTimeout(r, 1400));
    for (const p of host.players) {
      assert.equal(p.team, before.get(p.id), `${p.name} não deveria trocar de time após stop do admin`);
    }

    host.adminStart(admin);
    assert.ok(host.live(), "jogo voltou ao vivo");
    assert.ok(host.handles.match.isRunning(), "controller sincronizado após start do admin");
    assert.ok(host.handles.match.isCompetitive(), "4v4 continua competitivo");
    for (const p of host.players) {
      assert.equal(p.team, before.get(p.id), `${p.name} não deveria trocar após restart do admin`);
    }

    host.handles.refreshLobby();
    for (const p of field) {
      assert.equal(p.team, before.get(p.id), "refreshLobby não remonta após restart manual");
    }
    assert.equal(spec.team, TEAM.SPEC, "spec continua no banco");
    host.cleanup();
  });

  it("4v3 com reposição: admin pausa e despausa sem o bot re-pausar", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.addPlayer(TEAM.SPEC);
    host.addPlayer(TEAM.SPEC);
    host.startMatch();

    host.quit(all[0]);
    await settle();
    assert.equal(host.handles.choose.isReplacement(), true);
    assert.equal(host.lastPause(), true);

    const admin = host.addPlayer();
    host.adminPause(true, admin);
    assert.equal(host.lastPause(), true);

    host.adminPause(false, admin);
    await settle();
    host.room.onGameTick();
    assert.equal(host.lastPause(), false, "bot não re-pausa após admin despausar");
    assert.equal(host.handles.choose.isReplacement(), true);
    host.cleanup();
  });

  it("admin expulsando jogador não conta ragequit", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    const admin = host.addPlayer();
    host.startMatch();

    host.adminKick(all[0], admin);
    await new Promise((r) => setTimeout(r, 150));

    assert.ok(!host.announcements.some((a) => /abandonou|ragequit/i.test(a.msg)));
    host.cleanup();
  });

  it("4v4 2x0: perdedor sair encerra a partida", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch();
    Object.assign(host.live(), { red: 2, blue: 0, time: 40 });
    host.handles.match.onTick();
    const blue = all.find((p) => p.team === TEAM.BLUE);
    host.quit(blue);
    await new Promise((r) => setTimeout(r, 250));
    assert.ok(
      host.announcements.some((a) => a.to == null && /Ragequit de @/.test(a.msg)),
      `devia anunciar ragequit, got ${JSON.stringify(host.announcements.map((a) => a.msg))}`
    );
    assert.equal(host.live(), null, "partida tem que parar");
    host.cleanup();
  });

  it("4v4 2x0 com spec: perdedor sair encerra, não repõe", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.addPlayer(TEAM.SPEC);
    host.startMatch();
    Object.assign(host.live(), { red: 2, blue: 0, time: 40 });
    host.handles.match.onTick();
    const blue = all.find((p) => p.team === TEAM.BLUE);
    host.quit(blue);
    await new Promise((r) => setTimeout(r, 250));
    assert.ok(host.announcements.some((a) => a.to == null && /Ragequit de @/.test(a.msg)));
    assert.equal(host.live(), null, "não pode seguir no 4v4 com reposição");
    host.cleanup();
  });

  it("4v4 2x0: leave com team=0 ainda é ragequit (lineup)", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch();
    Object.assign(host.live(), { red: 2, blue: 0, time: 40 });
    host.handles.match.onTick();
    const blue = all.find((p) => p.team === TEAM.BLUE);
    const i = host.players.findIndex((p) => p.id === blue.id);
    host.players.splice(i, 1);
    host.room.onPlayerLeave({ ...blue, team: TEAM.SPEC });
    await new Promise((r) => setTimeout(r, 250));
    assert.ok(
      host.announcements.some((a) => a.to == null && /Ragequit de @/.test(a.msg)),
      `devia anunciar ragequit mesmo com team spec, got ${JSON.stringify(host.announcements.map((a) => a.msg))}`
    );
    assert.equal(host.live(), null);
    host.cleanup();
  });

  it("4v4 2x0: !bb do perdedor encerra (kick sem admin)", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch();
    Object.assign(host.live(), { red: 2, blue: 0, time: 40 });
    host.handles.match.onTick();
    const blue = all.find((p) => p.team === TEAM.BLUE);
    host.haxballKick(blue, { reason: "Até mais!" });
    await new Promise((r) => setTimeout(r, 250));
    assert.ok(
      host.announcements.some((a) => a.to == null && /Ragequit de @/.test(a.msg)),
      `!bb devia ser ragequit, got ${JSON.stringify(host.announcements.map((a) => a.msg))}`
    );
    assert.equal(host.live(), null);
    host.cleanup();
  });

  it("4v4 2x0 faltando 20s: kick do perdedor sem admin ainda é ragequit", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch();
    Object.assign(host.live(), { red: 2, blue: 0, time: 220, timeLimit: 240 });
    host.handles.match.onTick();
    const blue = all.find((p) => p.team === TEAM.BLUE);
    host.haxballKick(blue, { reason: "" });
    await new Promise((r) => setTimeout(r, 250));
    assert.ok(
      host.announcements.some((a) => a.to == null && /Ragequit de @/.test(a.msg)),
      `kick sem admin devia ser ragequit, got ${JSON.stringify(host.announcements.map((a) => a.msg))}`
    );
    assert.equal(host.live(), null);
    host.cleanup();
  });

  it("4v4 2x0 faltando 4s: perdedor AFK no spec sai → ragequit", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch({ competitive: true });
    Object.assign(host.live(), { red: 2, blue: 0, time: 236, timeLimit: 240 });
    host.handles.match.onTick();
    const blue = all.find((p) => p.team === TEAM.BLUE);
    host.handles.afk.setAfk(blue, true);
    await new Promise((r) => setTimeout(r, 120));
    host.quit(blue);
    await new Promise((r) => setTimeout(r, 250));
    assert.ok(
      host.announcements.some((a) => a.to == null && /Ragequit de @/.test(a.msg)),
      `AFK no spec saindo devia ragequit, got ${JSON.stringify(host.announcements.map((a) => a.msg))}`
    );
    assert.equal(host.live(), null);
    host.cleanup();
  });

  it("4v4 2x0 faltando 4s: perdedor parado vira AFK → ragequit", async () => {
    const host = bootRoom();
    const config = require("../src/config");
    const all = fill4v4(host);
    host.startMatch({ competitive: true });
    for (const p of all) host.activity(p);
    Object.assign(host.live(), { red: 2, blue: 0, time: 236, timeLimit: 240 });
    host.handles.match.onTick();
    const blue = all.find((p) => p.team === TEAM.BLUE);
    const movers = all.filter((p) => p.id !== blue.id);
    host.idle(all, { moving: movers, idleMs: config.afkActionMs + 500 });
    host.handles.afk.tick(Date.now());
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(
      host.announcements.some((a) => a.to == null && /Ragequit de @/.test(a.msg)),
      `auto-AFK perdendo devia ragequit, got ${JSON.stringify(host.announcements.map((a) => a.msg))}`
    );
    assert.equal(host.live(), null);
    await host.room.onGameStop();
    assert.equal(host.handles.streak.get(), 1, "vitória 2x0 por ragequit conta streak");
    host.cleanup();
  });

  it("4v4 2x0: perdedor nunca mexeu → ragequit conta vitória (não RR sem stats)", async () => {
    const host = bootRoom();
    const config = require("../src/config");
    const all = fill4v4(host);
    host.startMatch({ competitive: true });
    const blue = all.find((p) => p.team === TEAM.BLUE);
    for (const p of all) {
      if (p.id !== blue.id) host.activity(p);
    }
    Object.assign(host.live(), { red: 2, blue: 0, time: 120, timeLimit: 240 });
    host.handles.match.onTick();
    const movers = all.filter((p) => p.id !== blue.id);
    host.idle(all, { moving: movers, idleMs: config.afkActionMs + 500 });
    host.handles.afk.tick(Date.now());
    await new Promise((r) => setTimeout(r, 250));
    assert.ok(
      host.announcements.some((a) => a.to == null && /Ragequit de @/.test(a.msg)),
      `2x0 sem movimento devia ragequit, got ${JSON.stringify(host.announcements.map((a) => a.msg))}`
    );
    assert.equal(host.said(/AFK no começo/i), false, "placar decidido: não é RR de kickoff");
    await host.room.onGameStop();
    assert.equal(host.handles.streak.get(), 1, "ragequit 2x0 sem movimento conta vitória");
    host.cleanup();
  });

  it("4v4 2x0: perdedor sair no meio da reposição encerra", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.addPlayer(TEAM.SPEC);
    host.addPlayer(TEAM.SPEC);
    host.startMatch();
    Object.assign(host.live(), { red: 2, blue: 0, time: 40 });
    host.handles.match.onTick();
    const red = all.find((p) => p.team === TEAM.RED);
    host.handles.afk.setAfk(red, true);
    assert.equal(host.handles.choose.isReplacement(), true, "reposição aberta com 2 specs");
    const blue = all.find((p) => p.team === TEAM.BLUE && host.find(p.id));
    host.quit(blue);
    await new Promise((r) => setTimeout(r, 250));
    assert.ok(
      host.announcements.some((a) => a.to == null && /Ragequit de @/.test(a.msg)),
      `devia encerrar mesmo com choose aberto, got ${JSON.stringify(host.announcements.map((a) => a.msg))}`
    );
    assert.equal(host.live(), null);
    host.cleanup();
  });

  it("saída de spec durante o choose só atualiza a lista do capitão", async () => {
    const host = bootRoom();
    startChoose(host);
    const cap = host.handles.choose.currentCaptain();
    const specs = host.handles.choose.list().specReady;
    const saiu = specs[0];
    const i = host.players.findIndex((p) => p.id === saiu.id);
    host.players.splice(i, 1);
    host.room.onPlayerLeave({ ...saiu });
    await new Promise((r) => setTimeout(r, 120));

    const msg = host.lastSpecList().msg;
    assert.ok(!msg.includes(`${saiu.name}[`), "quem saiu some da lista");
    assert.match(msg, new RegExp(`${specs[1].name}\\[1\\]`));
    assert.equal(host.lastSpecList().to, cap.id);
    host.cleanup();
  });
});

describe("mute no chat", () => {
  it("mutado: chat bloqueado, pick sem ! só na vez de capitão", async () => {
    const host = bootRoom();
    startChoose(host);
    const cap = host.handles.choose.currentCaptain();
    host.handles.mutes.set(cap.id, { endsAt: Date.now() + 60_000 });

    host.announcements.length = 0;
    await host.room.onPlayerChat(host.find(cap.id), "fala aí");
    assert.ok(host.announcements.some((a) => a.to === cap.id && /mutado/i.test(a.msg)));
    assert.equal(host.announcements.some((a) => /fala aí/.test(a.msg)), false);

    host.announcements.length = 0;
    await host.room.onPlayerChat(host.find(cap.id), "1");
    assert.equal(host.announcements.some((a) => a.to === cap.id && /mutado/i.test(a.msg)), false);
    assert.equal(host.handles.choose.list().blue.length, 2);

    host.announcements.length = 0;
    await host.room.onPlayerChat(host.find(cap.id), "!ids");
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(host.announcements.some((a) => a.to === cap.id && /#/.test(a.msg)));

    host.announcements.length = 0;
    await host.room.onPlayerChat(host.find(cap.id), "!1");
    assert.equal(host.handles.choose.list().blue.length, 3);
    host.cleanup();
  });

  it("4 msgs em 5s muta 30s e bloqueia a 4ª", async () => {
    const host = bootRoom();
    const p = host.addPlayer(TEAM.SPEC, "Flood");
    host.announcements.length = 0;
    for (let i = 1; i <= 3; i++) {
      await host.room.onPlayerChat(host.find(p.id), `msg${i}`);
    }
    assert.equal(host.handles.mutes.has(p.id), false);
    assert.equal(host.announcements.filter((a) => /msg[123]/.test(a.msg)).length, 3);

    host.announcements.length = 0;
    await host.room.onPlayerChat(host.find(p.id), "msg4");
    const mute = host.handles.mutes.get(p.id);
    assert.ok(mute);
    assert.ok(mute.endsAt - Date.now() > 25_000);
    assert.ok(host.announcements.some((a) => a.to == null && /flood/i.test(a.msg)));
    assert.equal(host.announcements.some((a) => /msg4/.test(a.msg) && a.to == null), false);

    host.announcements.length = 0;
    await host.room.onPlayerChat(host.find(p.id), "ainda fala");
    assert.ok(host.announcements.some((a) => a.to === p.id && /mutado/i.test(a.msg)));
    assert.equal(host.announcements.some((a) => /ainda fala/.test(a.msg)), false);
    host.cleanup();
  });
});

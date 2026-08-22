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
    host.idle(all, { moving: all.slice(2), idleMs: config.afkActionMs + 1000 });

    const pausesBefore = host.pauses.length;
    host.handles.afk.tick(Date.now());

    assert.equal(host.find(a.id).team, TEAM.SPEC);
    assert.equal(host.find(b.id).team, TEAM.SPEC);
    assert.equal(host.handles.afk.isAfk(a.id), true);
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
  it("mutado só usa comando com ! — fala e pick sem ! são bloqueados", async () => {
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
    assert.ok(host.announcements.some((a) => a.to === cap.id && /mutado/i.test(a.msg)));
    assert.equal(host.handles.choose.list().blue.length, 1);

    host.announcements.length = 0;
    await host.room.onPlayerChat(host.find(cap.id), "!ids");
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(host.announcements.some((a) => a.to === cap.id && /#/.test(a.msg)));

    host.announcements.length = 0;
    await host.room.onPlayerChat(host.find(cap.id), "!1");
    assert.equal(host.handles.choose.list().blue.length, 2);
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

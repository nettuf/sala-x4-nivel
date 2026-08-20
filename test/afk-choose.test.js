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

/**
 * AFK e choose ponta a ponta na sala real (createRoom), incluindo o que um
 * admin faz por fora: mover jogador, pausar, expulsar — e gente saindo no meio.
 */

describe("AFK: relógio, aviso e ação", () => {
  it("avisa no tempo do aviso e só manda pro spec no tempo da ação", () => {
    const host = bootRoom();
    const all = fill4v4(host);
    const parado = all[0];
    const ativos = all.slice(1);
    host.startMatch();

    host.idle(all, { moving: ativos, idleMs: config.afkWarnMs + 500 });
    host.handles.afk.tick(Date.now());
    assert.ok(host.said(/mexa-se/, parado.id), "o aviso é privado para quem está parado");
    assert.equal(host.find(parado.id).team, TEAM.RED, "aviso não tira ninguém do time");
    assert.equal(host.handles.afk.isAfk(parado.id), false);

    host.idle(all, { moving: ativos, idleMs: config.afkActionMs + 500 });
    host.handles.afk.tick(Date.now());
    assert.equal(host.find(parado.id).team, TEAM.SPEC, "passou do limite: vai pro spec");
    assert.equal(host.handles.afk.isAfk(parado.id), true);
    assert.equal(host.handles.afk.isAfk(ativos[0].id), false, "quem mexeu segue jogando");
    host.cleanup();
  });

  it("empurrão na posição não salva do AFK; tecla salva", () => {
    const host = bootRoom();
    const all = fill4v4(host);
    const empurrado = all[0];
    const ativo = all[1];
    host.startMatch();

    const past = Date.now() - config.afkActionMs - 1000;
    for (const p of all) host.handles.afk.touch(p.id, past);
    // Disco voa longe: isso não conta mais como atividade.
    const at = host.discs.get(empurrado.id);
    host.discs.set(empurrado.id, { x: at.x + 90, y: at.y + 40 });
    host.handles.afk.sampleMovement(Date.now());
    host.activity(ativo);
    host.handles.afk.tick(Date.now());

    assert.equal(host.handles.afk.isAfk(empurrado.id), true, "empurrão não conta");
    assert.equal(host.handles.afk.isAfk(ativo.id), false, "tecla conta");
    host.cleanup();
  });

  it("quem está no spec nunca vira AFK automático", () => {
    const host = bootRoom();
    const all = fill4v4(host);
    const espectador = host.addPlayer(TEAM.SPEC);
    host.startMatch();

    host.idle([...all, espectador], { moving: all, idleMs: config.afkActionMs * 3 });
    host.handles.afk.tick(Date.now());

    assert.equal(host.handles.afk.isAfk(espectador.id), false);
    assert.equal(host.kicks.length, 0);
    host.cleanup();
  });

  it("fora de partida (lobby/choose) ninguém vira AFK por estar parado", () => {
    const host = bootRoom();
    const all = startChoose(host);
    assert.equal(host.live(), null, "choose acontece com o jogo parado");

    host.idle(all, { idleMs: config.afkActionMs * 5 });
    host.handles.afk.tick(Date.now());

    assert.ok(all.every((p) => !host.handles.afk.isAfk(p.id)), "parado no choose não é AFK");
    assert.equal(host.kicks.length, 0);
    host.cleanup();
  });

  it("sala cheia: o parado é kickado em vez de ir pro spec", () => {
    const host = bootRoom();
    const all = fill4v4(host);
    for (let i = 0; i < config.afkFullThreshold - 8; i++) all.push(host.addPlayer(TEAM.SPEC));
    const parado = all[0];
    host.startMatch();

    host.idle(all, { moving: all.slice(1), idleMs: config.afkActionMs + 500 });
    host.handles.afk.tick(Date.now());

    assert.ok(host.kicks.some((k) => k.id === parado.id), "sem vaga o AFK é kickado");
    assert.match(host.kicks[0].reason, /AFK/i);
    host.cleanup();
  });
});

describe("AFK: pausa, gol e kickoff", () => {
  it("pausa congela o relógio do AFK; despausar continua de onde parou", () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch();

    const at = Date.now();
    for (const p of all) host.handles.afk.touch(p.id, at);
    host.handles.afk.tick(at + config.afkWarnMs + 500);
    assert.ok(host.said(/mexa-se/, all[0].id));
    assert.equal(host.teamCount(TEAM.SPEC), 0);

    // Timestamps sintéticos: o hold precisa usar o mesmo relógio do tick.
    host.handles.afk.setPaused(true, at + config.afkWarnMs + 500);
    host.handles.afk.tick(at + config.afkActionMs * 5);
    assert.equal(host.teamCount(TEAM.SPEC), 0, "pausado ninguém cai pro spec");
    assert.equal(host.kicks.length, 0);

    host.handles.afk.setPaused(false, at + config.afkActionMs * 5);
    host.handles.afk.tick(at + config.afkActionMs * 5);
    assert.equal(host.teamCount(TEAM.SPEC), 0, "despause mantém o progresso, não zera nem estoura");

    host.handles.afk.tick(at + config.afkActionMs * 5 + (config.afkActionMs - config.afkWarnMs));
    assert.equal(host.find(all[0].id).team, TEAM.SPEC, "depois do despause o tempo volta a correr");
    host.cleanup();
  });

  it("gol e kickoff não congelam o AFK: parado continua acumulando", () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch();

    const at = Date.now();
    for (const p of all) host.handles.afk.touch(p.id, at);
    host.handles.afk.tick(at + config.afkWarnMs + 500);
    assert.ok(host.said(/mexa-se/, all[0].id));

    host.room.onTeamGoal(TEAM.RED);
    host.handles.afk.tick(at + config.afkActionMs + 500);
    assert.equal(host.find(all[0].id).team, TEAM.SPEC, "comemoração não pausa o timer");
    assert.equal(host.handles.afk.isAfk(all[0].id), true);

    host.room.onPositionsReset();
    assert.equal(host.handles.afk.isAfk(all[0].id), true, "kickoff não perdoa quem já estava parado");
    host.cleanup();
  });

  it("gol pelos eventos da sala não zera quem já estava parado", () => {
    const host = bootRoom();
    const all = fill4v4(host);
    const parado = all[0];
    const ativo = all[1];
    host.startMatch();

    const at = Date.now();
    for (const p of all) host.handles.afk.touch(p.id, at);
    host.handles.afk.touch(parado.id, at - config.afkWarnMs - 1000);

    host.room.onTeamGoal(TEAM.RED);
    host.handles.afk.tick(Date.now());
    assert.equal(host.find(parado.id).team, TEAM.RED, "ainda não estourou o limite só com o gol");

    const restante = config.afkActionMs - config.afkWarnMs;
    host.handles.afk.tick(Date.now() + restante + 1000);

    assert.equal(host.handles.afk.isAfk(parado.id), true, "o gol não zerou o relógio");
    assert.equal(host.find(parado.id).team, TEAM.SPEC);
    assert.equal(host.handles.afk.isAfk(ativo.id), false, "quem estava ativo não é punido");
    host.cleanup();
  });

  it("auto-AFK em partida não pausa o jogo", () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch();
    const pausasAntes = host.pauses.length;

    host.idle(all, { moving: all.slice(1), idleMs: config.afkActionMs + 500 });
    host.handles.afk.tick(Date.now());

    assert.equal(host.handles.afk.isAfk(all[0].id), true);
    assert.equal(host.pauses.length, pausasAntes, "mandar AFK pro spec não pausa a partida");
    assert.ok(host.live(), "a partida continua rodando");
    host.cleanup();
  });
});

describe("AFK: interação com admin e com a saída de jogadores", () => {
  it("admin puxando AFK para o time é desfeito sem pausar o jogo", () => {
    const host = bootRoom();
    fill4v4(host);
    const admin = host.addPlayer(TEAM.SPEC, "ADM");
    const afkOne = host.addPlayer(TEAM.SPEC);
    host.startMatch();
    host.handles.afk.setAfk(afkOne, true);
    const pausasAntes = host.pauses.length;

    host.adminMove(afkOne, TEAM.BLUE, admin);

    assert.equal(host.find(afkOne.id).team, TEAM.SPEC, "AFK não entra em partida");
    assert.ok(host.said(/AFK/, admin.id), "o admin é avisado do motivo");
    assert.equal(host.pauses.length, pausasAntes);
    assert.equal(host.kicks.length, 0);
    host.cleanup();
  });

  it("!afk é recusado dentro do 4v4 oficial", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch();

    await host.chat(all[0], "!afk");
    await settle();

    assert.equal(host.handles.afk.isAfk(all[0].id), false, "não dá para abandonar o 4v4 no !afk");
    assert.equal(host.find(all[0].id).team, TEAM.RED);
    assert.ok(host.said(/Não pode usar !afk no 4v4/, all[0].id));
    host.cleanup();
  });

  it("auto-AFK no 4v4 com spec sobrando abre reposição e o jogo volta", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.addPlayer(TEAM.SPEC);
    host.addPlayer(TEAM.SPEC);
    host.startMatch();

    host.idle(all, { moving: all.slice(1), idleMs: config.afkActionMs + 500 });
    host.handles.afk.tick(Date.now());
    await settle();

    assert.equal(host.handles.afk.isAfk(all[0].id), true);
    assert.equal(host.handles.choose.isReplacement(), true, "o time desfalcado repõe");
    const cap = host.handles.choose.currentCaptain();
    assert.equal(host.find(cap.id).team, TEAM.RED);

    await host.chat(cap, "1");
    await settle();

    assert.equal(host.teamCount(TEAM.RED), 4, "vaga preenchida");
    assert.equal(host.lastPause(), false, "a partida volta a rodar");
    assert.ok(host.live());
    host.cleanup();
  });

  it("AFK que sai da sala não deixa rastro no estado", async () => {
    const host = bootRoom();
    startChoose(host);
    const alvo = host.find(host.handles.choose.list().specReady[0].id);
    host.handles.afk.setAfk(alvo, true);
    await settle();
    assert.equal(host.handles.afk.isAfk(alvo.id), true);

    host.quit(alvo);
    await settle();

    assert.equal(host.handles.afk.isAfk(alvo.id), false, "estado de AFK é limpo na saída");
    assert.ok(!host.lastSpecList().msg.includes(`${alvo.name}[`));
    host.cleanup();
  });

  it("AFK voluntário durante o choose não é escolhido nem some da sala", async () => {
    const host = bootRoom();
    const all = startChoose(host);
    const vermelho = host.find(all[0].id);

    host.handles.afk.setAfk(vermelho, true);
    await settle();

    assert.equal(host.teamCount(TEAM.RED), 3, "abriu vaga no time dele");
    assert.equal(host.handles.choose.isActive(), true, "o choose segue de pé");
    assert.ok(host.handles.choose.currentCaptain(), "e continua tendo capitão");
    assert.ok(
      !host.handles.choose.list().specReady.some((p) => p.id === vermelho.id),
      "AFK não entra na fila do pick"
    );
    host.cleanup();
  });
});

describe("choose: pick do capitão", () => {
  it("capitão completa o time por número e o 4v4 começa", async () => {
    const host = bootRoom();
    startChoose(host);

    for (let i = 0; i < 3; i++) {
      const cap = host.handles.choose.currentCaptain();
      assert.ok(cap, "sempre há um capitão enquanto falta gente");
      await host.chat(cap, "1");
      await settle();
    }

    assert.equal(host.teamCount(TEAM.BLUE), 4);
    assert.equal(host.teamCount(TEAM.RED), 4);
    assert.equal(host.handles.choose.isActive(), false, "choose encerra ao fechar o 4v4");
    assert.ok(host.live(), "e a partida começa");
    host.cleanup();
  });

  it("depois do pick a lista volta atualizada para o capitão", async () => {
    const host = bootRoom();
    for (let i = 0; i < 4; i++) host.addPlayer(TEAM.RED);
    host.addPlayer(TEAM.BLUE);
    for (let i = 0; i < 10; i++) host.addPlayer(TEAM.SPEC);
    host.handles.choose.continueFromField();

    const cap = host.handles.choose.currentCaptain();
    const before = host.lastSpecList();
    assert.ok(before);
    assert.equal(before.to, cap.id);
    assert.match(before.msg, /\[10\]/);
    const picked = host.handles.choose.list().specReady[0];

    host.announcements.length = 0;
    await host.chat(cap, "1");
    await settle();

    const after = host.lastSpecList();
    assert.ok(after, "depois do pick manda a lista de novo");
    assert.equal(after.to, host.handles.choose.currentCaptain().id);
    assert.ok(!after.msg.includes(`${picked.name}[`), "quem entrou sai da lista");
    assert.match(after.msg, /\[9\]/);
    assert.equal(host.find(picked.id).team, TEAM.BLUE);
    host.cleanup();
  });

  it("bottom/top/random valem como pick; com gente sobrando o capitão escolhe de novo", async () => {
    const host = bootRoom();
    startChoose(host);
    const specs = host.handles.choose.list().specReady;
    const ultimo = specs[specs.length - 1];
    const cap = host.handles.choose.currentCaptain();

    await host.chat(cap, "bottom");
    await settle();

    assert.equal(host.find(ultimo.id).team, TEAM.BLUE, "bottom pega o último da lista");
    assert.equal(host.teamCount(TEAM.BLUE), 2, "só um pick por vez");
    assert.equal(host.handles.choose.isActive(), true, "ainda tem vaga e sobra no spec → escolhe de novo");
    host.cleanup();
  });

  it("3 vagas e 7 specs: capitão escolhe; 3 vagas e 3 specs: completa sozinho", async () => {
    const host = bootRoom();
    for (let i = 0; i < 4; i++) host.addPlayer(TEAM.RED);
    host.addPlayer(TEAM.BLUE);
    for (let i = 0; i < 7; i++) host.addPlayer(TEAM.SPEC);
    host.handles.choose.continueFromField();

    assert.equal(host.handles.choose.isActive(), true);
    assert.equal(host.teamCount(TEAM.BLUE), 1, "não puxa os 3 primeiros com gente sobrando");
    assert.ok(host.lastSpecList(), "manda a lista para o capitão escolher");

    // Reduz para exatamente 3 specs → 3 vagas.
    const extras = host.handles.choose.list().specReady.slice(3);
    for (const s of extras) host.handles.afk.setAfk(host.find(s.id), true);
    await settle();

    assert.equal(host.teamCount(TEAM.BLUE), 4);
    assert.ok(host.said(/bot completou os times/i));
    host.cleanup();
  });

  it("número fora da lista devolve a lista em vez de escolher errado", async () => {
    const host = bootRoom();
    startChoose(host);
    const cap = host.handles.choose.currentCaptain();
    const antes = host.teamCount(TEAM.BLUE);

    await host.chat(cap, "99");

    assert.equal(host.teamCount(TEAM.BLUE), antes, "nada muda com número inválido");
    assert.ok(host.said(/Escolha inválida/, cap.id));
    assert.equal(host.lastSpecList().to, cap.id, "a lista é reenviada ao capitão");
    host.cleanup();
  });

  it("quem não é capitão da vez não consegue pickar", async () => {
    const host = bootRoom();
    startChoose(host);
    const cap = host.handles.choose.currentCaptain();
    const outro = host.handles.choose.list().red[1];
    const antes = host.teamCount(TEAM.BLUE);

    await host.chat(outro, "1");
    await settle();

    assert.equal(host.teamCount(TEAM.BLUE), antes, "pick de quem não é capitão é ignorado");
    assert.notEqual(cap.id, outro.id);
    assert.ok(host.said(/Só o capitão da vez escolhe/, outro.id));
    assert.equal(
      host.announcements.some((a) => a.to == null && /Só o capitão|^Specs:|^Escolha em/.test(a.msg)),
      false,
      "ordem de pick e recusa não vão para a sala"
    );
    assert.equal(
      host.announcements.some((a) => a.to == null && /: 1$/.test(String(a.msg))),
      false,
      "o 1 de quem não é capitão não vaza no chat"
    );
    host.cleanup();
  });

  it("specs fecham as vagas exatas: o bot completa sem pick", async () => {
    const host = bootRoom();
    for (let i = 0; i < 4; i++) host.addPlayer(TEAM.RED);
    host.addPlayer(TEAM.BLUE);
    for (let i = 0; i < 3; i++) host.addPlayer(TEAM.SPEC);

    host.handles.choose.continueFromField();
    await settle();

    assert.equal(host.teamCount(TEAM.BLUE), 4);
    assert.ok(host.said(/bot completou os times/i));
    assert.ok(host.live(), "times cheios já iniciam");
    host.cleanup();
  });

  it("com mais vagas que candidatos, o único spec entra sem pick", async () => {
    const host = bootRoom();
    for (let i = 0; i < 4; i++) host.addPlayer(TEAM.RED);
    host.addPlayer(TEAM.BLUE);
    host.addPlayer(TEAM.BLUE);
    const unico = host.addPlayer(TEAM.SPEC);

    host.handles.choose.continueFromField();
    await settle();

    assert.equal(host.find(unico.id).team, TEAM.BLUE, "entrou sem esperar pick");
    assert.ok(host.said(/única opção/i));
    host.cleanup();
  });

  it("AFK derrubando os specs até o número exato de vagas: o bot completa", async () => {
    const host = bootRoom();
    startChoose(host);
    const specs = host.handles.choose.list().specReady;

    // 3 vagas no azul e 5 specs: dois AFK deixam a conta exata.
    for (const s of specs.slice(0, 2)) host.handles.afk.setAfk(host.find(s.id), true);
    await settle();

    assert.equal(host.teamCount(TEAM.BLUE), 4);
    assert.ok(host.said(/bot completou os times/i));
    assert.equal(host.handles.choose.isActive(), false);
    host.cleanup();
  });

  it("capitão que não escolhe a tempo vai AFK e o próximo picka", async () => {
    const host = bootRoom();
    const anterior = config.chooseTimeSec;
    config.chooseTimeSec = 0.2;
    try {
      // 4v2 para o time que picka ter um 2º que herda o capitão.
      for (let i = 0; i < 4; i++) host.addPlayer(TEAM.RED);
      const cap = host.addPlayer(TEAM.BLUE);
      const segundo = host.addPlayer(TEAM.BLUE);
      for (let i = 0; i < 4; i++) host.addPlayer(TEAM.SPEC);
      host.handles.choose.continueFromField();

      assert.equal(host.handles.choose.currentCaptain().id, cap.id);
      await new Promise((r) => setTimeout(r, 250));

      assert.equal(host.kicks.length, 0, "não kicka mais por timeout no choose");
      assert.equal(host.handles.afk.isAfk(cap.id), true);
      assert.equal(host.find(cap.id).team, TEAM.SPEC, "foi pro fim da fila (spec AFK)");
      assert.ok(!host.handles.choose.list().specReady.some((p) => p.id === cap.id));
      assert.equal(host.handles.choose.isActive(), true);
      assert.equal(host.handles.choose.currentCaptain()?.id, segundo.id, "o 2º do time herda o pick");
    } finally {
      config.chooseTimeSec = anterior;
      host.cleanup();
    }
  });

  it("timeout no 4v3 com gente sobrando: próximo picka, não auto-completa", async () => {
    const host = bootRoom();
    const anterior = config.chooseTimeSec;
    config.chooseTimeSec = 0.2;
    try {
      for (let i = 0; i < 4; i++) host.addPlayer(TEAM.RED);
      host.addPlayer(TEAM.BLUE);
      host.addPlayer(TEAM.BLUE);
      host.addPlayer(TEAM.BLUE);
      const s1 = host.addPlayer(TEAM.SPEC);
      for (let i = 0; i < 4; i++) host.addPlayer(TEAM.SPEC); // sobra > vagas
      host.handles.choose.continueFromField();

      assert.equal(host.handles.choose.currentCaptain().team, TEAM.BLUE);
      await new Promise((r) => setTimeout(r, 250));

      assert.equal(host.find(s1.id).team, TEAM.SPEC, "com gente sobrando ninguém entra sozinho");
      assert.equal(host.teamCount(TEAM.BLUE), 2, "time azul perdeu o capitão AFK");
      assert.equal(host.handles.choose.isActive(), true);
      assert.equal(host.live(), null);
      assert.ok(host.handles.choose.currentCaptain(), "próximo capitão ainda picka");
    } finally {
      config.chooseTimeSec = anterior;
      host.cleanup();
    }
  });

  it("timeout que deixa vagas = specs completa sozinho", async () => {
    const host = bootRoom();
    const anterior = config.chooseTimeSec;
    config.chooseTimeSec = 0.2;
    try {
      for (let i = 0; i < 4; i++) host.addPlayer(TEAM.RED);
      host.addPlayer(TEAM.BLUE);
      host.addPlayer(TEAM.BLUE);
      host.addPlayer(TEAM.BLUE);
      host.addPlayer(TEAM.SPEC);
      host.addPlayer(TEAM.SPEC); // após AFK do cap: 2 vagas e 2 specs
      host.handles.choose.continueFromField();
      await new Promise((r) => setTimeout(r, 250));

      assert.equal(host.teamCount(TEAM.BLUE), 4);
      assert.ok(host.said(/bot completou os times|AFK no fim da fila/i));
      assert.equal(host.handles.choose.isActive(), false);
    } finally {
      config.chooseTimeSec = anterior;
      host.cleanup();
    }
  });

  it("4v4 ao vivo: quit + cap AFK, o próximo picka as duas vagas e não começa 3v4", async () => {
    const host = bootRoom();
    const anterior = config.chooseTimeSec;
    config.chooseTimeSec = 0.2;
    try {
      const reds = [];
      for (let i = 0; i < 4; i++) reds.push(host.addPlayer(TEAM.RED));
      for (let i = 0; i < 4; i++) host.addPlayer(TEAM.BLUE);
      for (let i = 0; i < 4; i++) host.addPlayer(TEAM.SPEC);
      host.startMatch({ competitive: true });
      assert.ok(host.live());

      host.quit(reds[3]);
      await new Promise((r) => setTimeout(r, 120));
      assert.equal(host.handles.choose.isReplacement(), true);
      assert.equal(host.teamCount(TEAM.RED), 3);
      assert.equal(host.handles.choose.currentCaptain()?.id, reds[0].id);

      await new Promise((r) => setTimeout(r, 250));
      assert.equal(host.handles.afk.isAfk(reds[0].id), true);
      assert.equal(host.find(reds[0].id).team, TEAM.SPEC);
      assert.equal(host.teamCount(TEAM.RED), 2);
      const cap2 = host.handles.choose.currentCaptain();
      assert.ok(cap2, "o 2º do vermelho herda o pick");
      assert.equal(cap2.id, reds[1].id);
      assert.ok(host.said(/novo capitão/i));

      host.chat(cap2, "1");
      await settle();
      assert.equal(host.teamCount(TEAM.RED), 3);
      assert.equal(host.handles.choose.isActive(), true, "ainda falta uma vaga");
      assert.ok(host.live(), "não reinicia a partida no 3v4");

      host.chat(cap2, "1");
      await settle();
      assert.equal(host.teamCount(TEAM.RED), 4);
      assert.equal(host.handles.choose.isActive(), false);
      assert.ok(host.live());
    } finally {
      config.chooseTimeSec = anterior;
      host.cleanup();
    }
  });

  it("saída que deixa a sala sem 8 elegíveis cancela o choose", async () => {
    const host = bootRoom();
    for (let i = 0; i < 4; i++) host.addPlayer(TEAM.RED);
    host.addPlayer(TEAM.BLUE);
    const a = host.addPlayer(TEAM.SPEC);
    host.addPlayer(TEAM.SPEC);
    const afkOne = host.addPlayer(TEAM.SPEC);
    host.handles.afk.setAfk(afkOne, true);

    host.handles.choose.continueFromField();
    assert.equal(host.handles.choose.isActive(), true);

    host.quit(a);
    await settle();

    assert.equal(host.handles.choose.isActive(), false);
    assert.ok(host.said(/poucos jogadores/i));
    host.cleanup();
  });

  it("sem spec elegível, o choose desiste e devolve o controle ao lobby", async () => {
    const host = bootRoom();
    for (let i = 0; i < 4; i++) host.addPlayer(TEAM.RED);
    host.addPlayer(TEAM.BLUE);
    const a = host.addPlayer(TEAM.SPEC);
    const b = host.addPlayer(TEAM.SPEC);

    host.handles.choose.continueFromField();
    assert.equal(host.handles.choose.isActive(), true);

    host.handles.afk.setAfk(a, true);
    await settle();

    assert.equal(host.handles.choose.isActive(), false, "choose não fica ativo para sempre");
    assert.ok(host.said(/voltando ao lobby/i));
    assert.equal(host.find(b.id).team, TEAM.BLUE, "o último elegível ainda foi aproveitado");
    host.cleanup();
  });
});

describe("choose: admin mexendo por fora", () => {
  it("admin completando o time durante o choose faz o jogo começar", async () => {
    const host = bootRoom();
    startChoose(host);
    const admin = host.addPlayer(TEAM.SPEC, "ADM");
    const specs = host.handles.choose.list().specReady.filter((p) => p.id !== admin.id);

    for (const s of specs.slice(0, 3)) host.adminMove(s, TEAM.BLUE, admin);
    await settle();

    assert.equal(host.teamCount(TEAM.BLUE), 4);
    assert.equal(host.handles.choose.isActive(), false);
    assert.ok(host.live(), "4v4 fechado pelo admin também inicia");
    host.cleanup();
  });

  it("admin tirando o capitão passa o pick para outro jogador", async () => {
    const host = bootRoom();
    startChoose(host);
    const admin = host.addPlayer(TEAM.SPEC, "ADM");
    const cap = host.handles.choose.currentCaptain();

    host.adminMove(cap, TEAM.SPEC, admin);
    await settle();

    const novo = host.handles.choose.currentCaptain();
    assert.ok(novo, "o choose não fica sem capitão");
    assert.notEqual(novo.id, cap.id, "o bot não devolve quem o admin acabou de tirar");
    assert.equal(host.find(novo.id).team, TEAM.BLUE);
    assert.ok(host.said(/virou capitão/i));
    host.cleanup();
  });

  it("admin devolvendo um escolhido pro spec reabre a vaga para o capitão", async () => {
    const host = bootRoom();
    startChoose(host);
    const admin = host.addPlayer(TEAM.SPEC, "ADM");
    const cap = host.handles.choose.currentCaptain();
    await host.chat(cap, "1");
    await settle();
    const escolhido = host.handles.choose.list().blue[1];
    assert.ok(escolhido, "o pick entrou no time");

    host.adminMove(escolhido, TEAM.SPEC, admin);
    await settle();

    assert.equal(host.teamCount(TEAM.BLUE), 1);
    assert.equal(host.handles.choose.isActive(), true, "o choose continua para refazer o time");
    assert.equal(host.handles.choose.currentCaptain().id, cap.id);
    host.cleanup();
  });

  it("admin expulsando um spec no meio do choose só renumera a lista", async () => {
    const host = bootRoom();
    startChoose(host);
    const admin = host.addPlayer(TEAM.SPEC, "ADM");
    const specs = host.handles.choose.list().specReady.filter((p) => p.id !== admin.id);
    const cap = host.handles.choose.currentCaptain();

    host.adminKick(specs[0], admin);
    await settle();

    const msg = host.lastSpecList().msg;
    assert.ok(!msg.includes(`${specs[0].name}[`), "quem foi expulso sai da lista");
    assert.match(msg, new RegExp(`${specs[1].name}\\[1\\]`), "o próximo herda o número 1");
    assert.equal(host.lastSpecList().to, cap.id);
    assert.equal(host.handles.choose.isActive(), true);
    host.cleanup();
  });
});

describe("choose: reposição em partida", () => {
  it("saída no 4v4 pausa, o capitão repõe e o jogo volta", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.addPlayer(TEAM.SPEC);
    host.addPlayer(TEAM.SPEC);
    host.startMatch();

    host.quit(all[0]);
    await settle();

    assert.equal(host.handles.choose.isReplacement(), true);
    assert.equal(host.lastPause(), true, "reposição acontece com o jogo pausado");
    const cap = host.handles.choose.currentCaptain();
    assert.equal(host.find(cap.id).team, TEAM.RED, "escolhe o capitão do time desfalcado");

    await host.chat(cap, "1");
    await settle();

    assert.equal(host.teamCount(TEAM.RED), 4);
    assert.equal(host.lastPause(), false, "o jogo despausa sozinho");
    assert.ok(host.live(), "a mesma partida continua");
    host.cleanup();
  });

  it("reposição funciona mesmo com pausa de admin por cima", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.addPlayer(TEAM.SPEC);
    host.addPlayer(TEAM.SPEC);
    host.startMatch();
    host.adminPause(true);

    host.quit(all[0]);
    await settle();

    assert.equal(host.handles.choose.isReplacement(), true, "pausa de admin não bloqueia o pick");
    const cap = host.handles.choose.currentCaptain();
    await host.chat(cap, "1");
    await settle();

    assert.equal(host.teamCount(TEAM.RED), 4);
    assert.equal(host.lastPause(), false, "pausa esquecida é desfeita ao repor");
    host.cleanup();
  });

  it("sem ninguém elegível para repor, o 4v3 vira 3v3 e o jogo segue", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch();

    host.quit(all[0]);
    await settle();

    assert.equal(host.teamCount(TEAM.RED), 3);
    assert.equal(host.teamCount(TEAM.BLUE), 3, "o time maior devolve um em vez de jogar 3v4");
    assert.ok(host.live());
    assert.equal(host.kicks.length, 0);
    host.cleanup();
  });

  it("segunda saída durante a reposição não trava o pick", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    const reservas = [host.addPlayer(TEAM.SPEC), host.addPlayer(TEAM.SPEC), host.addPlayer(TEAM.SPEC)];
    host.startMatch();

    host.quit(all[0]);
    await settle();
    assert.equal(host.handles.choose.isReplacement(), true);

    // Um dos candidatos desiste enquanto o capitão pensava.
    host.quit(reservas[0]);
    await settle();

    const cap = host.handles.choose.currentCaptain();
    assert.ok(cap, "ainda há capitão para escolher");
    await host.chat(cap, "1");
    await settle();

    assert.equal(host.teamCount(TEAM.RED), 4, "a vaga foi preenchida");
    assert.equal(host.lastPause(), false);
    host.cleanup();
  });
});

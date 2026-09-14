const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { bootRoom, fill4v4, settle, TEAM } = require("./helpers/roomHost");

/**
 * Mapa ponta a ponta da Futzera X4 (sala real via createRoom).
 *
 * Crescimento: 1 treino → 1v1 / 2v2 / 3v3 no x3 (par sobe sem RR) → 4v4 no x4 (RR).
 * No x3: 1 spec espera; 2º spec sobe o par; saída com spec puxa; sem spec desce o formato.
 * 1v1 vira 1 → RR treino. 4v4 com spec = pick pausado; sem spec = 3v3 no x4.
 */

const waitLobby = () => new Promise((r) => setTimeout(r, 350));

function field(host) {
  const elig = host.players.filter((p) => !host.handles.afk.isAfk(p.id));
  return {
    red: elig.filter((p) => p.team === TEAM.RED).length,
    blue: elig.filter((p) => p.team === TEAM.BLUE).length,
    spec: elig.filter((p) => p.team === TEAM.SPEC).length,
    n: elig.length,
  };
}

function enter(host) {
  const p = host.addPlayer(TEAM.SPEC);
  host.handles.refreshLobby();
  return p;
}

async function bootWith(n) {
  const host = bootRoom();
  for (let i = 0; i < n; i++) host.addPlayer(TEAM.SPEC);
  host.handles.refreshLobby();
  await waitLobby();
  return host;
}

async function bootOfficial4v4() {
  const host = await bootWith(6);
  enter(host);
  enter(host);
  await waitLobby();
  assertHealthy4v4(host);
  return host;
}

function assertNvN(host, n, extraSpec = 0, msg = "") {
  const f = field(host);
  const tag = msg || `${n}v${n}` + (extraSpec ? ` +${extraSpec} spec` : "");
  assert.equal(f.red, n, `${tag}: vermelho`);
  assert.equal(f.blue, n, `${tag}: azul`);
  assert.equal(f.spec, extraSpec, `${tag}: spec`);
}

function assertLegal(host, label) {
  const f = field(host);
  if (f.red + f.blue <= 1) return;
  if (host.handles.choose.isReplacement()) {
    assert.ok(
      f.red !== f.blue,
      `${label}: reposição precisa de buraco (${f.red}v${f.blue})`
    );
    return;
  }
  assert.equal(f.red, f.blue, `${label}: times desiguais ${f.red}v${f.blue}`);
  assert.ok(f.red <= 4, `${label}: time > 4`);
}

function assertHealthy4v4(host, label = "4v4") {
  assertNvN(host, 4, field(host).spec, label);
  assert.ok(host.live(), `${label}: jogo vivo`);
  assert.equal(host.handles.match.isCompetitive(), true, `${label}: competitivo`);
  assert.equal(host.handles.choose.isActive(), false, `${label}: sem choose`);
  assert.notEqual(host.lastPause(), true, `${label}: sem pausa presa`);
}

async function pickReplacement(host) {
  const cap = host.handles.choose.currentCaptain();
  assert.ok(cap, "capitão da reposição");
  await host.chat(cap, "1");
  await settle();
}

/** 4v4 oficial → NvN no x4 (extra do park vai embora). */
async function dropOfficialTo(host, size) {
  for (let i = 0; i < 12; i++) {
    const f = field(host);
    if (f.red === size && f.blue === size && f.spec === 0) return;
    if (f.spec > 0) {
      const spec = host.players.find((p) => p.team === TEAM.SPEC && !host.handles.afk.isAfk(p.id));
      if (spec) {
        host.quit(spec);
        await settle();
        continue;
      }
    }
    const victim = host.players.find(
      (p) => (p.team === TEAM.RED || p.team === TEAM.BLUE) && !host.handles.afk.isAfk(p.id)
    );
    if (!victim) return;
    host.quit(victim);
    await settle();
  }
  assert.fail(`não chegou em ${size}v${size} no x4: ${JSON.stringify(field(host))}`);
}

describe("x4 e2e: crescimento treino → 4v4", () => {
  it("treino: último sai, o jogo para; o próximo entra no vermelho", async () => {
    const host = await bootWith(1);
    assert.ok(host.live());
    host.quit(host.players[0]);
    await settle();
    assert.equal(host.players.length, 0);
    assert.equal(host.live(), null, "jogo fantasma tem que parar");
    const p = enter(host);
    await waitLobby();
    assert.equal(host.find(p.id).team, TEAM.RED);
    assert.ok(host.live(), "treino recomeça");
    host.cleanup();
  });

  it("1 = treino 1v0", async () => {
    const host = await bootWith(1);
    const f = field(host);
    assert.equal(f.red + f.blue, 1);
    assert.equal(f.spec, 0);
    assert.ok(host.live());
    assert.equal(host.handles.match.isCompetitive(), false);
    host.cleanup();
  });

  it("2 = 1v1 no x3", async () => {
    const host = await bootWith(2);
    assertNvN(host, 1);
    assert.ok(host.live());
    assert.equal(host.handles.match.isCompetitive(), false);
    host.cleanup();
  });

  it("3 = 1v1 + spec espera", async () => {
    const host = await bootWith(3);
    assertNvN(host, 1, 1);
    assert.ok(host.live());
    host.cleanup();
  });

  it("4 = 2v2 sem RR a partir do 1v1", async () => {
    const host = await bootWith(2);
    const scores = host.live();
    enter(host);
    assertNvN(host, 1, 1, "3º espera");
    enter(host);
    assertNvN(host, 2);
    assert.equal(host.live(), scores, "2v2 no mesmo jogo");
    host.cleanup();
  });

  it("5 = 2v2 + spec espera", async () => {
    const host = await bootWith(5);
    assertNvN(host, 2, 1);
    assert.ok(host.live());
    host.cleanup();
  });

  it("6 = 3v3 sem RR a partir do 2v2", async () => {
    const host = await bootWith(4);
    const scores = host.live();
    enter(host);
    assertNvN(host, 2, 1, "5º espera");
    enter(host);
    assertNvN(host, 3);
    assert.equal(host.live(), scores, "3v3 no mesmo jogo");
    host.cleanup();
  });

  it("7 = 3v3 + spec espera", async () => {
    const host = await bootWith(7);
    assertNvN(host, 3, 1);
    assert.ok(host.live());
    assert.equal(host.handles.match.isCompetitive(), false);
    host.cleanup();
  });

  it("8 = RR para 4v4 competitivo", async () => {
    const host = await bootWith(6);
    enter(host);
    assertNvN(host, 3, 1, "7º espera");
    enter(host);
    await waitLobby();
    assertHealthy4v4(host);
    host.cleanup();
  });
});

describe("x4 e2e: saída no x3", () => {
  it("1v1 alguém sai → treino", async () => {
    const host = await bootWith(2);
    host.quit(host.players.find((p) => p.team === TEAM.BLUE));
    await settle();
    await waitLobby();
    const f = field(host);
    assert.equal(f.red + f.blue, 1);
    assert.equal(f.spec, 0);
    assert.ok(host.live());
    host.cleanup();
  });

  it("1v1 + spec, sai do campo → puxa o spec, segue 1v1", async () => {
    const host = await bootWith(3);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const blue = host.players.find((p) => p.team === TEAM.BLUE);
    host.quit(blue);
    await settle();
    assert.equal(host.find(spec.id).team, TEAM.BLUE);
    assertNvN(host, 1);
    assert.ok(host.live());
    host.cleanup();
  });

  it("2v2 sem spec, sai → 1v1 + extra no spec", async () => {
    const host = await bootWith(4);
    const scores = host.live();
    host.quit(host.players.find((p) => p.team === TEAM.BLUE));
    await settle();
    assertNvN(host, 1, 1);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("2v2 + spec, sai → puxa o spec, segue 2v2", async () => {
    const host = await bootWith(5);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const scores = host.live();
    host.quit(host.players.find((p) => p.team === TEAM.RED));
    await settle();
    assert.equal(host.find(spec.id).team, TEAM.RED);
    assertNvN(host, 2);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("3v3 sem spec, sai → 2v2 + extra no spec", async () => {
    const host = await bootWith(6);
    const scores = host.live();
    host.quit(host.players.find((p) => p.team === TEAM.BLUE));
    await settle();
    assertNvN(host, 2, 1);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("3v3 + spec, sai → puxa o spec, segue 3v3", async () => {
    const host = await bootWith(7);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const scores = host.live();
    host.quit(host.players.find((p) => p.team === TEAM.RED));
    await settle();
    assert.equal(host.find(spec.id).team, TEAM.RED);
    assertNvN(host, 3);
    assert.equal(host.live(), scores);
    host.cleanup();
  });
});

describe("x4 e2e: AFK no x3", () => {
  it("1v1 sem spec: AFK deixa o outro no treino", async () => {
    const host = await bootWith(2);
    const blue = host.players.find((p) => p.team === TEAM.BLUE);
    host.handles.afk.setAfk(blue, true);
    await settle();
    await waitLobby();
    const f = field(host);
    assert.equal(f.red + f.blue, 1);
    assert.equal(f.spec, 0);
    assert.ok(host.live());
    host.cleanup();
  });

  it("1v1 + spec: AFK no campo puxa o spec", async () => {
    const host = await bootWith(3);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const blue = host.players.find((p) => p.team === TEAM.BLUE);
    host.handles.afk.setAfk(blue, true);
    await settle();
    assert.equal(host.find(blue.id).team, TEAM.SPEC);
    assert.equal(host.find(spec.id).team, TEAM.BLUE);
    assertNvN(host, 1);
    assert.ok(host.live());
    host.cleanup();
  });

  it("2v2 sem spec: AFK desce para 1v1", async () => {
    const host = await bootWith(4);
    const scores = host.live();
    const red = host.players.find((p) => p.team === TEAM.RED);
    host.handles.afk.setAfk(red, true);
    await settle();
    assertNvN(host, 1, 1);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("2v2 + spec: AFK puxa o spec, segue 2v2", async () => {
    const host = await bootWith(5);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const red = host.players.find((p) => p.team === TEAM.RED);
    host.handles.afk.setAfk(red, true);
    await settle();
    assert.equal(host.find(spec.id).team, TEAM.RED);
    assertNvN(host, 2);
    assert.ok(host.live());
    host.cleanup();
  });

  it("3v3 sem spec: AFK desce para 2v2", async () => {
    const host = await bootWith(6);
    const scores = host.live();
    const red = host.players.find((p) => p.team === TEAM.RED);
    host.handles.afk.setAfk(red, true);
    await settle();
    assertNvN(host, 2, 1);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("3v3 + spec: AFK puxa o spec, segue 3v3", async () => {
    const host = await bootWith(7);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const blue = host.players.find((p) => p.team === TEAM.BLUE);
    host.handles.afk.setAfk(blue, true);
    await settle();
    assert.equal(host.find(spec.id).team, TEAM.BLUE);
    assertNvN(host, 3);
    assert.ok(host.live());
    host.cleanup();
  });
});

describe("x4 e2e: 2v1 com opção extra = pick", () => {
  it("2v2 + spec, admin tira um: capitão do menor escolhe e o jogo despausa", async () => {
    const host = await bootWith(5);
    const specAdmin = host.players.find((p) => p.team === TEAM.SPEC);
    const red = host.players.find((p) => p.team === TEAM.RED);
    host.adminMove(red, TEAM.SPEC, specAdmin);
    await settle();

    assert.equal(host.handles.choose.isReplacement(), true, "mais specs que vagas");
    assert.equal(field(host).red, 1);
    assert.equal(field(host).blue, 2);
    await pickReplacement(host);
    assertNvN(host, 2, 1);
    assert.equal(host.handles.choose.isActive(), false);
    assert.ok(host.live());
    assert.notEqual(host.lastPause(), true, "pick solta a pausa do warmup");
    host.cleanup();
  });
});

describe("x4 e2e: 4v4 saída, AFK e pick", () => {
  it("sai com 2 specs: pausa, capitão picka, 4v4 volta sem RR", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.addPlayer(TEAM.SPEC);
    host.addPlayer(TEAM.SPEC);
    host.startMatch();
    const scores = host.live();

    host.quit(all[0]);
    await settle();
    assert.equal(host.handles.choose.isReplacement(), true);
    assert.equal(host.lastPause(), true);
    assert.equal(field(host).red, 3);
    assert.equal(field(host).blue, 4);

    await pickReplacement(host);
    assertHealthy4v4(host, "depois do pick");
    assert.equal(host.live(), scores, "mesma partida");
    host.cleanup();
  });

  it("sai sem spec: extra vai ao spec, 3v3 no x4 segue", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch();
    const scores = host.live();

    host.quit(all[0]);
    await settle();
    assertNvN(host, 3, 1);
    assert.equal(host.handles.choose.isActive(), false);
    assert.equal(host.live(), scores);
    assert.notEqual(host.lastPause(), true);
    assert.equal(host.handles.afk.isPaused(), false, "AFK/pausa de reposição solta");
    host.cleanup();
  });

  it("sai sem spec: countdown atrasado do Haxball não deixa 3v3 pausado", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch();
    const scores = host.live();

    host.muteEnginePauseEvents();
    host.quit(all[0]);
    await settle();
    assertNvN(host, 3, 1);
    assert.ok(host.pauses.includes(false), "release cancela o countdown");

    host.restoreEnginePauseEvents();
    host.fireDelayedPause();
    await settle();

    assert.equal(host.handles.afk.isPaused(), false);
    assert.notEqual(host.lastPause(), true);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("!afk no campo no 4v4 é recusado, mesmo com spec", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.addPlayer(TEAM.SPEC);
    host.startMatch();
    const scores = host.live();

    await host.chat(all[0], "!afk");
    await settle();
    assert.equal(host.handles.afk.isAfk(all[0].id), false);
    assert.equal(host.find(all[0].id).team, TEAM.RED);
    assert.ok(host.said(/não pode usar !afk no 4v4/i, all[0].id));
    assert.equal(host.handles.choose.isActive(), false);
    assert.equal(host.live(), scores);
    assertHealthy4v4(host);
    host.cleanup();
  });

  it("!afk no spec no meio do 4v4 não pausa", async () => {
    const host = bootRoom();
    fill4v4(host);
    const spec = host.addPlayer(TEAM.SPEC);
    host.startMatch();
    const scores = host.live();

    await host.chat(spec, "!afk");
    await settle();
    assertNvN(host, 4, 0);
    assert.equal(host.handles.afk.isAfk(spec.id), true);
    assert.equal(host.live(), scores);
    assert.equal(host.handles.choose.isActive(), false);
    assert.notEqual(host.lastPause(), true);
    host.cleanup();
  });

  it("AFK no 4v4 sem spec: vira 3v3 e o jogo segue", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch();
    const scores = host.live();
    host.handles.afk.setAfk(all[0], true);
    await settle();
    assertNvN(host, 3, 1);
    assert.equal(host.live(), scores);
    assert.equal(host.handles.choose.isActive(), false);
    host.cleanup();
  });

  it("entra spec no meio do 4v4: espera, jogo não pausa", async () => {
    const host = bootRoom();
    fill4v4(host);
    host.startMatch();
    const spec = enter(host);
    assert.equal(spec.team, TEAM.SPEC);
    assertHealthy4v4(host);
    assert.equal(field(host).spec, 1);
    host.cleanup();
  });

  it("admin já montou 4v4: competitivo, sem choose, sem pausa", async () => {
    const host = bootRoom();
    for (let i = 0; i < 4; i++) host.addPlayer(TEAM.RED);
    for (let i = 0; i < 4; i++) host.addPlayer(TEAM.BLUE);
    host.startMatch({ competitive: false });
    host.handles.refreshLobby();
    await waitLobby();
    assertHealthy4v4(host, "admin puxou");
    host.cleanup();
  });

  it("3v3 no x4 + 2 specs volta ao 4v4 sem RR", async () => {
    const host = await bootWith(6);
    enter(host);
    enter(host);
    await waitLobby();
    assertHealthy4v4(host);
    const scores = host.live();
    const red = host.players.find((p) => p.team === TEAM.RED);
    host.quit(red);
    await settle();
    assertNvN(host, 3, 1);

    enter(host);
    await settle();
    assertHealthy4v4(host, "par voltou ao 4v4");
    assert.equal(host.live(), scores, "mesmo jogo no x4");
    host.cleanup();
  });

  it("2v2 no x4 + 2 specs sobe 3v3 sem RR", async () => {
    const host = await bootOfficial4v4();
    const scores = host.live();
    await dropOfficialTo(host, 2);
    assertNvN(host, 2);
    assert.equal(host.live(), scores);

    enter(host);
    assertNvN(host, 2, 1, "5º espera no x4");
    enter(host);
    await settle();
    assertNvN(host, 3);
    assert.equal(host.live(), scores, "3v3 no mesmo jogo x4");
    assert.equal(host.handles.choose.isActive(), false);
    host.cleanup();
  });

  it("1v1 no x4 + 2 specs sobe 2v2 sem RR", async () => {
    const host = await bootOfficial4v4();
    const scores = host.live();
    await dropOfficialTo(host, 1);
    assertNvN(host, 1);
    assert.equal(host.live(), scores);

    enter(host);
    assertNvN(host, 1, 1, "3º espera no x4");
    enter(host);
    await settle();
    assertNvN(host, 2);
    assert.equal(host.live(), scores, "2v2 no mesmo jogo x4");
    host.cleanup();
  });

  it("2v2 no x4: dois AFK voltam e sobem o par", async () => {
    const host = await bootOfficial4v4();
    const scores = host.live();
    await dropOfficialTo(host, 2);

    const a = host.addPlayer(TEAM.SPEC);
    host.handles.afk.setAfk(a, true);
    const b = host.addPlayer(TEAM.SPEC);
    host.handles.afk.setAfk(b, true);
    host.handles.refreshLobby();
    await settle();
    assertNvN(host, 2, 0, "AFK no spec não sobe");

    host.handles.afk.setAfk(a, false);
    await settle();
    assertNvN(host, 2, 1, "1º que voltou espera");
    host.handles.afk.setAfk(b, false);
    await settle();
    assertNvN(host, 3);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("3v3 + 3º spec: 4v4 inicia e o extra espera", async () => {
    const host = await bootWith(6);
    enter(host);
    enter(host);
    enter(host);
    await waitLobby();
    assertHealthy4v4(host, "promo com sobra");
    assert.equal(field(host).spec, 1);
    host.cleanup();
  });
});

describe("x4 e2e: filme 1→4v4 com AFK, saída e pick", () => {
  it("uma sala só: cresce, AFK, desce, sobe, 4v4, pick, queda, volta", async () => {
    const host = bootRoom();

    enter(host);
    await waitLobby();
    assertLegal(host, "1 treino");
    assert.ok(host.live());

    enter(host);
    await waitLobby();
    assertNvN(host, 1);
    const game1v1 = host.live();

    const waiter = enter(host);
    assertNvN(host, 1, 1, "3º espera");
    assert.equal(host.live(), game1v1);

    const blue = host.players.find((p) => p.team === TEAM.BLUE);
    host.handles.afk.setAfk(blue, true);
    await settle();
    assert.equal(host.find(waiter.id).team !== TEAM.SPEC, true, "spec cobriu o AFK");
    assertNvN(host, 1);

    enter(host);
    assertNvN(host, 1, 1, "1v1 + spec (AFK não conta)");
    enter(host);
    assertNvN(host, 2);
    assert.ok(host.live());

    enter(host);
    assertNvN(host, 2, 1, "5º espera");
    enter(host);
    assertNvN(host, 3);
    assert.ok(host.live());

    enter(host);
    assertNvN(host, 3, 1, "7º espera");

    const leaving = host.players.find(
      (p) => p.team === TEAM.RED && !host.handles.afk.isAfk(p.id)
    );
    host.quit(leaving);
    await settle();
    assertNvN(host, 3, 0, "spec cobriu a saída no 3v3");
    assertLegal(host, "depois da saída 3v3");

    enter(host);
    assertNvN(host, 3, 1, "volta a esperar o par do x4");
    enter(host);
    await waitLobby();
    assertHealthy4v4(host, "8 elegíveis");
    const official = host.live();

    const specA = enter(host);
    const specB = enter(host);
    assert.equal(specA.team, TEAM.SPEC);
    assert.equal(specB.team, TEAM.SPEC);
    assertHealthy4v4(host, "specs no 4v4");

    const victim = host.players.find((p) => p.team === TEAM.BLUE);
    host.quit(victim);
    await settle();
    assert.equal(host.handles.choose.isReplacement(), true);
    assert.equal(host.lastPause(), true);
    await pickReplacement(host);
    assertHealthy4v4(host, "reposição");
    assert.equal(host.live(), official);

    for (const spec of host.players.filter((p) => p.team === TEAM.SPEC)) {
      if (!host.handles.afk.isAfk(spec.id)) host.quit(spec);
    }
    await settle();
    const fieldRed = host.players.find((p) => p.team === TEAM.RED);
    host.quit(fieldRed);
    await settle();
    assertNvN(host, 3, 1, "4v4 sem spec desce 3v3");
    assert.equal(host.live(), official);
    assert.equal(host.handles.choose.isActive(), false);

    enter(host);
    await settle();
    assertHealthy4v4(host, "3v3 no x4 + par");
    assert.equal(host.live(), official);

    host.cleanup();
  });
});

describe("x4 e2e: refreshLobby não aborta par/buraco", () => {
  it("4v4 oficial incompleto: segundo refreshLobby não abre warmup", async () => {
    const host = await bootOfficial4v4();
    const scores = host.live();
    host.quit(host.players.find((p) => p.team === TEAM.RED));
    await settle();
    assertNvN(host, 3, 1);
    assert.equal(host.handles.choose.isActive(), false);
    host.handles.refreshLobby();
    await settle();
    assertNvN(host, 3, 1, "continua 3v3 no x4");
    assert.equal(host.live(), scores, "mesmo jogo");
    assert.equal(host.handles.choose.isActive(), false);
    host.cleanup();
  });

  it("3v3 ao vivo + 2º spec ainda RR para o x4 (não early-abort)", async () => {
    const host = await bootWith(6);
    enter(host);
    assertNvN(host, 3, 1, "7º espera");
    assert.ok(host.live());
    enter(host);
    await waitLobby();
    assertHealthy4v4(host, "par do x4 mesmo ao vivo");
    host.cleanup();
  });
});

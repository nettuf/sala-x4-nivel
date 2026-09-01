const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const config = require("../src/config");
const {
  bootRoom,
  fill4v4,
  settle,
  endOfficialMatch,
  TEAM,
} = require("./helpers/roomHost");

/**
 * Suíte ponta a ponta da Futzera X4: entradas, saídas, inatividade, pick e auto-fill.
 * Usa createRoom real com Haxball mock (roomHost).
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

function assertNvN(host, n, extraSpec = 0, msg = "") {
  const f = field(host);
  const tag = msg || `${n}v${n}` + (extraSpec ? ` +${extraSpec} spec` : "");
  assert.equal(f.red, n, `${tag}: vermelho`);
  assert.equal(f.blue, n, `${tag}: azul`);
  assert.equal(f.spec, extraSpec, `${tag}: spec`);
}

function assertHealthy4v4(host, label = "4v4") {
  assertNvN(host, 4, field(host).spec, label);
  assert.ok(host.live(), `${label}: jogo vivo`);
  assert.equal(host.handles.match.isCompetitive(), true, `${label}: competitivo`);
  assert.equal(host.handles.choose.isActive(), false, `${label}: sem choose`);
  assert.notEqual(host.lastPause(), true, `${label}: sem pausa presa`);
}

async function pickReplacement(host, token = "1") {
  const cap = host.handles.choose.currentCaptain();
  assert.ok(cap, "capitão da reposição");
  await host.chat(cap, token);
  await settle();
}

async function boot4v4Live(extraSpec = 0) {
  const host = await bootWith(6);
  enter(host);
  enter(host);
  await waitLobby();
  assertHealthy4v4(host, "setup 4v4");
  if (extraSpec > 0) {
    for (let i = 0; i < extraSpec; i++) enter(host);
    assertHealthy4v4(host, `4v4 +${extraSpec} spec`);
  }
  return host;
}

describe("x4 completo: entradas", () => {
  it("1→8: treino, pares no x3 sem RR, RR só no 4v4", async () => {
    const host = bootRoom();
    const expect = [
      { n: 1, red: 1, blue: 0, spec: 0 },
      { n: 2, red: 1, blue: 1, spec: 0 },
      { n: 3, red: 1, blue: 1, spec: 1 },
      { n: 4, red: 2, blue: 2, spec: 0 },
      { n: 5, red: 2, blue: 2, spec: 1 },
      { n: 6, red: 3, blue: 3, spec: 0 },
      { n: 7, red: 3, blue: 3, spec: 1 },
    ];
    for (const step of expect) {
      enter(host);
      await waitLobby();
      const f = field(host);
      assert.equal(f.red, step.red, `n=${step.n} red`);
      assert.equal(f.blue, step.blue, `n=${step.n} blue`);
      assert.equal(f.spec, step.spec, `n=${step.n} spec`);
      assert.ok(host.live(), `n=${step.n} jogo vivo`);
    }
    enter(host);
    await waitLobby();
    assertHealthy4v4(host, "8º = 4v4");
    host.cleanup();
  });

  it("entra spec no 4v4 ao vivo: fica esperando, jogo não pausa", async () => {
    const host = await boot4v4Live();
    const scores = host.live();
    const spec = enter(host);
    assert.equal(spec.team, TEAM.SPEC);
    assertHealthy4v4(host);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("várias entradas seguidas no spec durante 4v4 não abrem choose", async () => {
    const host = await boot4v4Live();
    for (let i = 0; i < 3; i++) enter(host);
    assertHealthy4v4(host);
    assert.equal(field(host).spec, 3);
    host.cleanup();
  });
});

describe("x4 completo: saídas", () => {
  it("4v4 + 1 spec: sai do campo → auto-reposição → volta 4v4", async () => {
    const host = await boot4v4Live(1);
    const scores = host.live();
    const victim = host.players.find((p) => p.team === TEAM.RED);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    host.quit(victim);
    await settle();
    await waitLobby();
    assert.equal(host.handles.choose.isReplacement(), false, "1 vaga e 1 spec → auto");
    assert.equal(host.find(spec.id).team, TEAM.RED);
    assertNvN(host, 4, 0);
    assert.equal(host.handles.choose.isActive(), false);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("4v4 sem spec: sai → extra no spec, 3v3 segue no x4", async () => {
    const host = await boot4v4Live();
    const scores = host.live();
    const victim = host.players.find((p) => p.team === TEAM.RED);
    host.quit(victim);
    await settle();
    assertNvN(host, 3, 1);
    assert.equal(host.handles.choose.isActive(), false);
    assert.equal(host.live(), scores);
    assert.notEqual(host.lastPause(), true);
    host.cleanup();
  });

  it("3v3 + spec: sai → puxa spec, formato igual", async () => {
    const host = await bootWith(7);
    const scores = host.live();
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const leaving = host.players.find((p) => p.team === TEAM.BLUE);
    host.quit(leaving);
    await settle();
    assert.equal(host.find(spec.id).team, TEAM.BLUE);
    assertNvN(host, 3);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("1v1 fica 1 → treino", async () => {
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
});

describe("x4 completo: inatividade", () => {
  it("2v2 + spec: parado em campo vira AFK e o spec entra", async () => {
    const host = await bootWith(5);
    const scores = host.live();
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const red = host.players.find((p) => p.team === TEAM.RED);
    host.handles.afk.setAfk(red, true);
    await settle();
    assert.equal(host.find(red.id).team, TEAM.SPEC);
    assert.equal(host.find(spec.id).team, TEAM.RED);
    assertNvN(host, 2);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("ocioso em campo: idle() dispara auto-AFK e puxa spec no 2v2", async () => {
    const host = await bootWith(5);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const red = host.players.find((p) => p.team === TEAM.RED);
    const onField = host.players.filter((p) => p.team === TEAM.RED || p.team === TEAM.BLUE);
    for (const p of onField) host.activity(p);
    host.idle(host.players, {
      moving: host.players.filter((p) => p.id !== red.id),
      idleMs: config.afkActionMs + 500,
    });
    host.handles.afk.tick(Date.now());
    await settle();
    await waitLobby();
    assert.equal(host.handles.afk.isAfk(red.id), true, "auto-AFK");
    assert.equal(host.find(spec.id).team, TEAM.RED, "spec cobre");
    assertNvN(host, 2);
    assert.ok(host.live(), "jogo segue sem RR");
    host.cleanup();
  });

  it("spec parado não vira AFK automático", async () => {
    const host = await bootWith(5);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    host.idle(host.players, { idleMs: config.afkActionMs * 3 });
    await settle();
    assert.equal(host.handles.afk.isAfk(spec.id), false);
    assert.equal(host.find(spec.id).team, TEAM.SPEC);
    host.cleanup();
  });

  it("!afk voluntário no spec no 4v4 não pausa", async () => {
    const host = await boot4v4Live(1);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const scores = host.live();
    await host.chat(spec, "!afk");
    await settle();
    assert.equal(host.handles.afk.isAfk(spec.id), true);
    assertHealthy4v4(host);
    assert.equal(host.live(), scores);
    host.cleanup();
  });

  it("!afk no campo no 4v4 ao vivo é recusado", async () => {
    const host = await boot4v4Live(1);
    const fieldPlayer = host.players.find((p) => p.team === TEAM.RED);
    await host.chat(fieldPlayer, "!afk");
    await settle();
    assert.equal(host.handles.afk.isAfk(fieldPlayer.id), false);
    assert.ok(host.said(/não pode usar !afk/i, fieldPlayer.id));
    assertHealthy4v4(host);
    host.cleanup();
  });

  it("4v4 sem spec: ocioso em campo → 3v3, jogo segue", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch({ competitive: true });
    const scores = host.live();
    host.handles.afk.setAfk(all[0], true);
    await settle();
    assertNvN(host, 3, 1);
    assert.equal(host.live(), scores);
    assert.equal(host.handles.choose.isActive(), false);
    host.cleanup();
  });
});

describe("x4 completo: capitão e pick", () => {
  it("2v1 com 2 specs: capitão escolhe, não auto-preenche os dois", async () => {
    const host = await bootWith(5);
    const red = host.players.find((p) => p.team === TEAM.RED);
    host.adminMove(red, TEAM.SPEC, host.players[0]);
    await settle();
    assert.equal(host.handles.choose.isReplacement(), true);
    assert.equal(field(host).red, 1);
    assert.equal(field(host).blue, 2);
    assert.equal(field(host).spec, 2);
    await pickReplacement(host);
    assertNvN(host, 2, 1);
    assert.equal(host.handles.choose.isActive(), false);
    host.cleanup();
  });

  it("capitão escolhe pelo número do spec na lista", async () => {
    const host = await boot4v4Live(2);
    const victim = host.players.find((p) => p.team === TEAM.BLUE);
    host.quit(victim);
    await settle();
    const list = host.handles.choose.list().specReady;
    assert.ok(list.length >= 2);
    await pickReplacement(host, "2");
    const picked = host.players.find((p) => p.team === TEAM.BLUE && p.id !== victim.id);
    assert.ok(picked);
    assertHealthy4v4(host);
    host.cleanup();
  });

  it("spec AFK some da lista do pick", async () => {
    const host = await boot4v4Live(2);
    const specs = host.players.filter((p) => p.team === TEAM.SPEC);
    host.handles.afk.setAfk(specs[0], true);
    const victim = host.players.find((p) => p.team === TEAM.RED);
    host.quit(victim);
    await settle();
    await waitLobby();
    const ativo = specs[1];
    if (!host.handles.choose.isReplacement()) {
      assert.equal(host.find(ativo.id).team, TEAM.RED, "1 vaga e 1 ativo → auto");
    } else {
      const ready = host.handles.choose.list().specReady;
      assert.ok(ready.every((p) => p.id !== specs[0].id));
      await pickReplacement(host);
    }
    assert.equal(field(host).red, 4);
    assert.equal(field(host).blue, 4);
    assert.equal(host.find(specs[0].id).team, TEAM.SPEC);
    assert.equal(host.handles.afk.isAfk(specs[0].id), true);
    assert.equal(host.handles.choose.isActive(), false);
    host.cleanup();
  });
});

describe("x4 completo: bot preenche sozinho", () => {
  it("kickoff AFK no 4v4 com 1 spec: 1 vaga = 1 opção → entra automático", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.addPlayer(TEAM.SPEC);
    host.startMatch({ competitive: true });
    host.idle(all, { moving: all.slice(1), idleMs: config.afkActionMs + 500 });
    host.handles.afk.tick(Date.now());
    await new Promise((r) => setTimeout(r, 400));
    assert.ok(host.said(/1 vaga, 1 opção/i));
    assert.equal(host.handles.choose.isReplacement(), false);
    assert.equal(host.teamCount(TEAM.RED), 4);
    assert.equal(host.teamCount(TEAM.BLUE), 4);
    assert.ok(host.live());
    host.cleanup();
  });

  it("4v4 ao vivo + 1 spec: sai → puxa automático (1=1)", async () => {
    const host = await boot4v4Live(1);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    const victim = host.players.find((p) => p.team === TEAM.RED);
    host.quit(victim);
    await settle();
    await waitLobby();
    assert.equal(host.handles.choose.isReplacement(), false);
    assert.equal(host.find(spec.id).team, TEAM.RED);
    assertNvN(host, 4, 0);
    assert.equal(host.handles.choose.isActive(), false);
    host.cleanup();
  });

  it("4v4 + 3 specs: 1 vaga → capitão escolhe (não puxa 2 pro mesmo time)", async () => {
    const host = await boot4v4Live(3);
    const victim = host.players.find((p) => p.team === TEAM.BLUE);
    host.quit(victim);
    await settle();
    assert.equal(field(host).spec, 3);
    assert.equal(host.handles.choose.isReplacement(), true);
    const blueBefore = host.players.filter((p) => p.team === TEAM.BLUE).length;
    await pickReplacement(host);
    const blueAfter = host.players.filter((p) => p.team === TEAM.BLUE).length;
    assert.equal(blueAfter, blueBefore + 1, "só um entrou no azul");
    assertHealthy4v4(host);
    host.cleanup();
  });

  it("reposição parada: 2 vagas e 2 specs → puxa os dois sem pick", async () => {
    const host = bootRoom();
    for (let i = 0; i < 2; i++) host.addPlayer(TEAM.RED);
    for (let i = 0; i < 4; i++) host.addPlayer(TEAM.BLUE);
    host.addPlayer(TEAM.SPEC);
    host.addPlayer(TEAM.SPEC);
    let resolved = false;
    host.handles.choose.startReplacement(TEAM.RED, () => {
      resolved = true;
    });
    await settle();
    assert.equal(host.handles.choose.isActive(), false);
    assert.equal(host.players.filter((p) => p.team === TEAM.RED).length, 4);
    assert.ok(resolved);
    assert.ok(host.announcements.some((a) => /2 vagas, 2 opções/i.test(a.msg)));
    host.cleanup();
  });

  it("4v1 + 3 specs no azul → preenche os 3 sem pick (winner stays)", async () => {
    const host = bootRoom();
    for (let i = 0; i < 4; i++) host.addPlayer(TEAM.RED);
    host.addPlayer(TEAM.BLUE);
    for (let i = 0; i < 3; i++) host.addPlayer(TEAM.SPEC);
    host.handles.choose.continueFromField();
    await settle();
    assert.equal(host.players.filter((p) => p.team === TEAM.BLUE).length, 4);
    assert.equal(host.players.filter((p) => p.team === TEAM.RED).length, 4);
    assert.equal(host.handles.choose.isActive(), false);
    host.cleanup();
  });
});

describe("x4 completo: jornada integrada", () => {
  it("entra, sai, AFK, pick, auto-fill, desce e sobe de novo", async () => {
    const host = bootRoom();

    // treino → 1v1
    enter(host);
    await waitLobby();
    enter(host);
    await waitLobby();
    assertNvN(host, 1);

    // 1v1 + spec, AFK cobre
    const waiter = enter(host);
    const blue = host.players.find((p) => p.team === TEAM.BLUE);
    host.handles.afk.setAfk(blue, true);
    await settle();
    assert.equal(host.find(waiter.id).team, TEAM.BLUE);
    assertNvN(host, 1);

    // sobe até 4v4
    while (field(host).n < 8) {
      enter(host);
      await waitLobby();
    }
    assertHealthy4v4(host, "fechou 4v4");
    const official = host.live();

    // 2 specs + saída → pick
    enter(host);
    enter(host);
    const out = host.players.find((p) => p.team === TEAM.RED);
    host.quit(out);
    await settle();
    await pickReplacement(host);
    assertHealthy4v4(host, "pick");

    // sem spec, saída desce 3v3
    for (const s of host.players.filter((p) => p.team === TEAM.SPEC)) host.quit(s);
    await settle();
    host.quit(host.players.find((p) => p.team === TEAM.RED));
    await settle();
    assertNvN(host, 3, 1);
    assert.equal(host.live(), official);

    // par volta ao 4v4 no mesmo mapa
    enter(host);
    await settle();
    assertHealthy4v4(host, "subiu de novo");
    assert.equal(host.live(), official);

    host.cleanup();
  });

  it("4v4 oficial termina com MVP e payload haxbook", async () => {
    const host = await boot4v4Live();
    const scorer = host.players.find((p) => p.team === TEAM.RED);
    host.handles.match.onBallKick(scorer);
    host.handles.match.onTeamGoal(TEAM.RED);
    const scores = host.live();
    scores.red = 3;
    scores.blue = 1;
    host.handles.match.markVictory();
    const result = await host.handles.match.finish(scores, { persist: false });
    assert.equal(result.valid, true, "4v4 competitivo com 3 gols");
    assert.ok(result.persistPayload?.haxbook, "payload pro site");
    assert.equal(result.persistPayload.haxbook.participants.length, 8);
    assert.ok(
      host.announcements.some((a) => /MVP:/i.test(a.msg)),
      "anuncia MVP no chat"
    );
    host.cleanup();
  });
});

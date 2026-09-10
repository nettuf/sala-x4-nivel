const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { bootRoom } = require("./helpers/roomHost");
const {
  waitLobby,
  settle,
  field,
  enter,
  growTo,
  assertNvN,
  assertLegal,
  assertHealthy4v4,
  pickReplacement,
  idleToAfk,
  TEAM,
} = require("./helpers/lobbyAssert");

const TEAM_SIZE = 4;
const OFFICIAL_AT = TEAM_SIZE * 2;
const CAP = 30;

function expectedLineup(n) {
  if (n <= 0) return { red: 0, blue: 0, spec: 0 };
  if (n === 1) return { red: 1, blue: 0, spec: 0 };
  const size = Math.min(TEAM_SIZE, Math.floor(n / 2));
  return { red: size, blue: size, spec: n - size * 2 };
}

function waitFor(n) {
  if (n === OFFICIAL_AT) return waitLobby(1600);
  if (n < OFFICIAL_AT) return waitLobby(400);
  return settle();
}

function assertStage(host, n, label = `@${n}`) {
  const f = field(host);
  const e = expectedLineup(n);
  assert.equal(f.n, n, `${label}: elegíveis`);
  assert.equal(f.red, e.red, `${label}: red ${f.red}≠${e.red}`);
  assert.equal(f.blue, e.blue, `${label}: blue ${f.blue}≠${e.blue}`);
  assert.equal(f.spec, e.spec, `${label}: spec ${f.spec}≠${e.spec}`);
  assertLegal(host, label);
  if (n >= 2) assert.ok(host.live(), `${label}: jogo vivo`);
  if (n >= OFFICIAL_AT) {
    assert.equal(host.handles.match.isCompetitive(), true, `${label}: competitivo`);
    assert.equal(host.handles.choose.isActive(), false, `${label}: choose preso`);
    assert.notEqual(host.lastPause(), true, `${label}: pausa presa`);
  }
}

async function settleChoose(host) {
  let guard = 0;
  while (host.handles.choose.isActive() && guard++ < 12) {
    const cap = host.handles.choose.currentCaptain();
    if (!cap) break;
    await host.chat(cap, "1");
    await settle();
  }
}

describe("x4 jornada: 1 → 30 → 0", { timeout: 120000 }, () => {
  it("filme: sobe 1→30 numa sala só, formato legal em cada n", async () => {
    const host = bootRoom();
    for (let n = 1; n <= CAP; n++) {
      enter(host);
      await waitFor(n);
      assertStage(host, n);
    }
    assertHealthy4v4(host, "sala cheia");
    assert.equal(host.players.length, CAP);
    host.cleanup();
  });

  it("desce 30→0 um por um: specs primeiro, depois campo; sem 2v1", async () => {
    const host = bootRoom();
    await growTo(host, CAP);
    assertHealthy4v4(host, "cheia");

    const leaveOrder = [...host.players].reverse();
    for (const p of leaveOrder) {
      if (!host.find(p.id)) continue;
      host.quit(p);
      await settleChoose(host);
      await waitLobby(host.players.length >= OFFICIAL_AT ? 200 : 350);
      assertLegal(host, `restam ${host.players.length}`);
      if (host.players.length >= 2) assert.ok(host.live(), `vivo com ${host.players.length}`);
    }
    assert.equal(host.players.length, 0);
    assert.equal(host.live(), null, "sala vazia para o jogo fantasma");
    host.cleanup();
  });
});

describe("x4 jornada: AFK, ociosidade e entra/sai", { timeout: 120000 }, () => {
  it("treino: último sai para o jogo; o próximo recomeça no vermelho", async () => {
    const host = bootRoom();
    await growTo(host, 1);
    assertStage(host, 1, "treino");
    host.quit(host.players[0]);
    await settle();
    assert.equal(host.players.length, 0);
    assert.equal(host.live(), null);
    const next = enter(host);
    await waitLobby(400);
    assert.equal(host.find(next.id).team, TEAM.RED);
    assertStage(host, 1, "treino de novo");
    host.cleanup();
  });

  it("1v1: dois entram juntos e viram 2v2 sem 2v1 e sem RR", async () => {
    const host = bootRoom();
    await growTo(host, 2);
    const game = host.live();
    enter(host);
    enter(host);
    await waitLobby(400);
    assertStage(host, 4, "2v2");
    assert.equal(host.live(), game, "2v2 no mesmo jogo");
    host.cleanup();
  });

  it("warmup: spec !afk não sobe; !afk no campo cede a vaga", async () => {
    const host = bootRoom();
    await growTo(host, 3);
    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    await host.chat(spec, "!afk");
    await settle();
    enter(host);
    await waitLobby(400);
    assertNvN(host, 1, 1, "AFK não conta no par");
    assert.equal(host.handles.afk.isAfk(spec.id), true);

    await host.chat(spec, "!afk");
    await waitLobby(400);
    assert.equal(host.handles.afk.isAfk(spec.id), false);
    assertStage(host, 4, "voltar + 2 specs = 2v2");
    enter(host);
    await waitLobby(400);
    assertStage(host, 5, "2v2 + spec");

    const scores = host.live();
    const idle = host.players.find((p) => p.team === TEAM.RED);
    const waiting = host.players.find((p) => p.team === TEAM.SPEC);
    await host.chat(idle, "!afk");
    await waitLobby(400);
    assert.equal(host.handles.afk.isAfk(idle.id), true);
    assert.equal(host.find(waiting.id).team, TEAM.RED);
    assertNvN(host, 2);
    assert.equal(host.live(), scores, "sem RR");
    host.cleanup();
  });

  it("3v3: ímpar espera, par sobe; saída sem spec desce o formato", async () => {
    const host = bootRoom();
    await growTo(host, 6);
    const game = host.live();
    enter(host);
    await waitLobby(400);
    assertStage(host, 7, "3v3 + spec");
    assert.equal(host.live(), game);
    host.quit(host.players.find((p) => p.team === TEAM.SPEC));
    await waitLobby(400);
    host.quit(host.players.find((p) => p.team === TEAM.RED));
    await waitLobby(400);
    assertStage(host, 5, "desceu 2v2 + spec");
    assert.equal(host.live(), game, "desceu sem RR");
    host.cleanup();
  });

  it("cheia: 4v4 + 22 specs; AFK no banco; ocioso abre pick; spec entra e sai", async () => {
    const host = bootRoom();
    await growTo(host, CAP);
    assertHealthy4v4(host, "30");
    const game = host.live();

    const specs = host.players.filter((p) => p.team === TEAM.SPEC);
    await host.chat(specs[0], "!afk");
    await host.chat(specs[1], "!afk");
    await settle();
    assertHealthy4v4(host, "AFK no banco");
    assert.equal(host.live(), game);

    const idle = host.players.find((p) => p.team === TEAM.RED);
    await idleToAfk(host, idle);
    assert.equal(host.handles.choose.isReplacement(), true, "vários specs ativos → pick");
    await pickReplacement(host);
    assertHealthy4v4(host, "depois do pick");
    assert.equal(host.find(idle.id).team, TEAM.SPEC);
    assert.equal(host.handles.afk.isAfk(idle.id), true);

    const late = enter(host);
    await settle();
    assert.equal(host.find(late.id).team, TEAM.SPEC);
    assertHealthy4v4(host, "31º no spec");
    host.quit(late);
    await settle();
    assertHealthy4v4(host, "saiu o extra");
    assert.equal(host.live(), game);
    host.cleanup();
  });

  it("4v4 ao vivo: !afk no campo é recusado; no spec vale", async () => {
    const host = bootRoom();
    await growTo(host, 9);
    assertHealthy4v4(host);
    const fieldP = host.players.find((p) => p.team === TEAM.RED);
    await host.chat(fieldP, "!afk");
    await settle();
    assert.equal(host.handles.afk.isAfk(fieldP.id), false, "campo no 4v4 não manda !afk");
    assert.equal(host.find(fieldP.id).team, TEAM.RED);

    const spec = host.players.find((p) => p.team === TEAM.SPEC);
    await host.chat(spec, "!afk");
    await settle();
    assert.equal(host.handles.afk.isAfk(spec.id), true);
    assertHealthy4v4(host);
    host.cleanup();
  });
});

const assert = require("node:assert/strict");
const config = require("../../src/config");
const { TEAM } = require("../../src/room/choose");

const waitLobby = (ms = 1400) => new Promise((r) => setTimeout(r, ms));
const settle = () => new Promise((r) => setTimeout(r, 150));

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

async function growTo(host, n, { wait = true } = {}) {
  while (host.players.length < n) {
    enter(host);
    if (wait && host.players.length === 8) await waitLobby(1600);
  }
  if (wait) await waitLobby(host.players.length >= 8 ? 1600 : undefined);
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
    assert.ok(f.red !== f.blue, `${label}: reposição precisa de buraco (${f.red}v${f.blue})`);
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

async function pickReplacement(host, token = "1") {
  const cap = host.handles.choose.currentCaptain();
  assert.ok(cap, "capitão da reposição");
  await host.chat(cap, token);
  await settle();
}

function finishWithRedWin(host) {
  const scores = host.live();
  assert.ok(scores, "partida ao vivo");
  scores.red = config.scoreLimit;
  scores.blue = 1;
  host.handles.match.markVictory();
}

function specCountAll(host) {
  return host.players.filter((p) => p.team === TEAM.SPEC).length;
}

/** Marca atividade em quem está em campo antes de simular ociosidade. */
function touchField(host) {
  for (const p of host.players) {
    if (p.team === TEAM.RED || p.team === TEAM.BLUE) host.activity(p);
  }
}

/** Auto-AFK por ociosidade (só movimento zera o relógio). */
async function idleToAfk(host, target, { moving = null, idleMs } = {}) {
  touchField(host);
  const movers =
    moving ||
    host.players.filter(
      (p) => p.id !== target.id && (p.team === TEAM.RED || p.team === TEAM.BLUE)
    );
  host.idle(host.players, {
    moving: movers,
    idleMs: idleMs || config.afkActionMs + 500,
  });
  for (let i = 0; i < 8; i++) {
    host.handles.afk.tick(Date.now());
    if (host.handles.afk.isAfk(target.id)) break;
  }
  await settle();
  await waitLobby(400);
}

function assertNotStuckWinnerStays(host, size, msg = "") {
  const f = field(host);
  const tag = msg || `${size}v${size}`;
  assert.ok(
    !(f.red >= size && f.blue === 0 && f.spec >= size),
    `${tag}: winner stays travou (${f.red} red · ${f.blue} blue · ${f.spec} spec)`
  );
}

module.exports = {
  waitLobby,
  settle,
  field,
  enter,
  growTo,
  assertNvN,
  assertLegal,
  assertHealthy4v4,
  pickReplacement,
  finishWithRedWin,
  specCountAll,
  touchField,
  idleToAfk,
  assertNotStuckWinnerStays,
  TEAM,
};

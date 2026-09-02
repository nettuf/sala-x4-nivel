const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const config = require("../src/config");
const {
  bootRoom,
  endMatchLingeringScores,
  clearLingeringScores,
  TEAM,
} = require("./helpers/roomHost");
const {
  waitLobby,
  settle,
  field,
  growTo,
  assertNvN,
  finishWithRedWin,
  touchField,
  assertNotStuckWinnerStays,
} = require("./helpers/lobbyAssert");

const FORMATS = [
  { n: 2, size: 1, label: "1v1" },
  { n: 4, size: 2, label: "2v2" },
  { n: 6, size: 3, label: "3v3" },
  { n: 8, size: 4, label: "4v4", competitive: true },
];

async function bootFormat(n) {
  const host = bootRoom();
  await growTo(host, n);
  assert.ok(host.live(), `${n} jogadores: partida ao vivo`);
  return host;
}

async function endWithLingeringScores(host) {
  touchField(host);
  await endMatchLingeringScores(host);
  await waitLobby(2200);
}

function assertRemounted(host, size, { competitive = false, extraSpec = 0 } = {}) {
  assertNotStuckWinnerStays(host, size);
  assertNvN(host, size, extraSpec);
  assert.ok(host.live(), `${size}v${size}: próximo jogo iniciou`);
  if (competitive) {
    assert.equal(host.handles.match.isCompetitive(), true, "4v4 competitivo");
  } else {
    assert.equal(host.handles.match.isCompetitive(), false, "warmup não competitivo");
  }
}

describe("winner stays: placar residual pós-stop (Haxball real)", () => {
  for (const fmt of FORMATS) {
    it(`${fmt.label} sem spec — remonta após vitória vermelha`, async () => {
      const host = await bootFormat(fmt.n);
      assert.equal(field(host).spec, 0);

      await endWithLingeringScores(host);

      assertRemounted(host, fmt.size, { competitive: !!fmt.competitive });
      host.cleanup();
    });

    it(`${fmt.label} + 1 spec ativo — remonta ou abre choose`, async () => {
      const host = await bootFormat(fmt.n);
      host.addPlayer(TEAM.SPEC);
      host.handles.refreshLobby();
      await settle();

      await endWithLingeringScores(host);

      assertNotStuckWinnerStays(host, fmt.size);
      const f = field(host);
      assert.equal(f.red, fmt.size, "vencedores no vermelho");
      assert.ok(f.blue >= 1, "capitão no azul");
      if (fmt.competitive) {
        assert.ok(
          host.handles.choose.isActive() || (f.red === 4 && f.blue === 4),
          "4v4: choose ou campo completo"
        );
      } else {
        assert.ok(
          host.handles.choose.isActive() || host.live(),
          "warmup: choose ou jogo remontado"
        );
      }
      host.cleanup();
    });
  }

  it("3v3 sem spec — reproduz bug 3 red · 3 spec (placar residual)", async () => {
    const host = await bootFormat(6);
    const redIds = host.players.filter((p) => p.team === TEAM.RED).map((p) => p.id);

    await endWithLingeringScores(host);

    for (const id of redIds) {
      assert.equal(host.find(id).team, TEAM.RED, "vermelho ficou");
    }
    assertRemounted(host, 3);
    host.cleanup();
  });

  it("3v3 + 1 spec: spec vira capitão (placar residual)", async () => {
    const host = await bootFormat(6);
    const specId = host.addPlayer(TEAM.SPEC).id;
    host.handles.refreshLobby();
    await settle();

    await endWithLingeringScores(host);

    assertNotStuckWinnerStays(host, 3);
    assert.equal(field(host).red, 3);
    assert.equal(field(host).blue, 1);
    assert.equal(host.handles.choose.currentCaptain()?.id, specId);
    assert.equal(host.handles.choose.isActive(), true);
    host.cleanup();
  });
});

describe("winner stays: specs AFK não travam remontagem", () => {
  async function markVoluntaryAfk(host, player) {
    await host.chat(player, "!afk");
    await settle();
  }

  it("3v3 + 1 spec ativo e 4 !afk: winner stays com placar residual", async () => {
    const host = await bootFormat(6);
    const activeSpec = host.addPlayer(TEAM.SPEC);
    host.handles.refreshLobby();
    await settle();

    for (let i = 0; i < 4; i++) {
      const p = host.addPlayer(TEAM.SPEC);
      await markVoluntaryAfk(host, p);
    }
    assert.equal(field(host).red, 3);
    assert.equal(field(host).blue, 3);

    await endWithLingeringScores(host);

    assertNotStuckWinnerStays(host, 3);
    assert.equal(field(host).red, 3);
    assert.equal(host.handles.choose.currentCaptain()?.id, activeSpec.id);
    assert.equal(host.handles.choose.isActive(), true);
    host.cleanup();
  });

  it("4v4 + 2 !afk no spec — remonta 4v4 (AFK não entra na conta)", async () => {
    const host = await bootFormat(8);
    for (let i = 0; i < 2; i++) {
      const p = host.addPlayer(TEAM.SPEC);
      await markVoluntaryAfk(host, p);
    }
    assert.equal(field(host).red, 4);
    assert.equal(field(host).blue, 4);

    finishWithRedWin(host);
    await endMatchLingeringScores(host);
    await waitLobby(2200);

    assertNotStuckWinnerStays(host, 4);
    assertNvN(host, 4, 0);
    assert.ok(host.live());
    assert.equal(host.handles.match.isCompetitive(), true);
    host.cleanup();
  });

  it("2v2 + 2 !afk no spec — remonta 2v2 sem promover formato", async () => {
    const host = await bootFormat(4);
    for (let i = 0; i < 2; i++) {
      const p = host.addPlayer(TEAM.SPEC);
      await markVoluntaryAfk(host, p);
    }
    assert.equal(field(host).red, 2);
    assert.equal(field(host).blue, 2);

    await endWithLingeringScores(host);

    assertNotStuckWinnerStays(host, 2);
    assertRemounted(host, 2);
    host.cleanup();
  });
});

describe("winner stays: placar residual some depois", () => {
  it("3v3 remonta mesmo se getScores demora a zerar", async () => {
    const host = await bootFormat(6);

    await endWithLingeringScores(host);
    assert.ok(host.live(), "jogo remontou com placar fantasma");

    clearLingeringScores(host);
    assert.equal(host.live(), null, "placar zerou depois");
    assertNvN(host, 3, 0);
    host.cleanup();
  });
});

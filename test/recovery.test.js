const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { planCompetitiveRecovery, planExactFill } = require("../src/room/recovery");
const { TEAM } = require("../src/room/choose");

function plan(partial) {
  return planCompetitiveRecovery({ teamSize: 4, live: true, ...partial });
}

describe("recuperação do 4v4 competitivo", () => {
  it("4v4 completo → não mexe", () => {
    assert.equal(plan({ redCount: 4, blueCount: 4, specCount: 2 }).action, "none");
  });

  it("3v3 + 4 specs durante o jogo → sobe um par e reinicia 4v4 (+ 2 spec)", () => {
    assert.deepEqual(plan({ redCount: 3, blueCount: 3, specCount: 4 }), {
      action: "fill-pairs",
      targetTeam: TEAM.BLUE,
      pairs: 1,
      restart: true,
    });
  });

  it("sai 1 no 4v4 + 1 spec → preenche o time desfalcado", () => {
    assert.deepEqual(plan({ redCount: 3, blueCount: 4, specCount: 1 }), {
      action: "fill-one",
      targetTeam: TEAM.RED,
    });
    assert.deepEqual(plan({ redCount: 4, blueCount: 3, specCount: 1 }), {
      action: "fill-one",
      targetTeam: TEAM.BLUE,
    });
  });

  it("sai 1 no 4v4 + 2 ou mais specs → capitão restante escolhe", () => {
    assert.deepEqual(plan({ redCount: 3, blueCount: 4, specCount: 2 }), {
      action: "choose",
      targetTeam: TEAM.RED,
    });
    assert.deepEqual(plan({ redCount: 4, blueCount: 3, specCount: 5 }), {
      action: "choose",
      targetTeam: TEAM.BLUE,
    });
  });

  it("sai 1 no 4v4 sem spec → o extra vai spec e o 3v3 segue", () => {
    assert.deepEqual(plan({ redCount: 3, blueCount: 4, specCount: 0 }), {
      action: "park-larger",
      targetTeam: TEAM.BLUE,
    });
    assert.deepEqual(plan({ redCount: 4, blueCount: 3, specCount: 0 }), {
      action: "park-larger",
      targetTeam: TEAM.RED,
    });
  });

  it("3v3 + 2 specs durante o jogo → sobe o par e reinicia 4v4", () => {
    assert.deepEqual(plan({ redCount: 3, blueCount: 3, specCount: 2 }), {
      action: "fill-pairs",
      targetTeam: TEAM.BLUE,
      pairs: 1,
      restart: true,
    });
  });

  it("3v3 + 1 spec durante o jogo → segue 3v3 sem reiniciar", () => {
    assert.equal(plan({ redCount: 3, blueCount: 3, specCount: 1 }).action, "keep-play");
    assert.equal(plan({ redCount: 3, blueCount: 3, specCount: 0 }).action, "keep-play");
  });

  it("buraco de 2 no mesmo time: 2 specs puxa auto; 1 spec preenche um; 3 specs o capitão escolhe", () => {
    assert.deepEqual(plan({ redCount: 2, blueCount: 4, specCount: 2 }), {
      action: "fill-exact",
      targetTeam: TEAM.RED,
      count: 2,
    });
    assert.deepEqual(plan({ redCount: 2, blueCount: 4, specCount: 1 }), {
      action: "fill-one",
      targetTeam: TEAM.RED,
    });
    assert.deepEqual(plan({ redCount: 2, blueCount: 4, specCount: 3 }), {
      action: "choose",
      targetTeam: TEAM.RED,
    });
  });

  it("jogo já parado + 1 spec → preenche e reinicia", () => {
    assert.deepEqual(
      plan({ redCount: 3, blueCount: 4, specCount: 1, live: false }),
      { action: "fill-one", targetTeam: TEAM.RED, restart: true }
    );
  });

  it("jogo já parado + 2 specs → capitão escolhe e reinicia", () => {
    assert.deepEqual(
      plan({ redCount: 3, blueCount: 4, specCount: 2, live: false }),
      { action: "choose", targetTeam: TEAM.RED, restart: true }
    );
  });

  it("4 vermelho + 0 azul + 3 spec ao vivo → sobe os 3 e depois desce 3v3", () => {
    assert.deepEqual(plan({ redCount: 4, blueCount: 0, specCount: 3 }), {
      action: "fill-partial",
      targetTeam: TEAM.BLUE,
      count: 3,
    });
    assert.deepEqual(plan({ redCount: 4, blueCount: 3, specCount: 0 }), {
      action: "park-larger",
      targetTeam: TEAM.RED,
    });
  });

  it("jogo já parado com menos de 8 → rebalanceia", () => {
    assert.equal(
      plan({ redCount: 3, blueCount: 4, specCount: 0, live: false }).action,
      "rebalance"
    );
  });

  it("jogo já parado 3v3 + exatamente 2 specs → preenche o par e reinicia", () => {
    assert.deepEqual(
      plan({ redCount: 3, blueCount: 3, specCount: 2, live: false }),
      { action: "fill-pairs", targetTeam: TEAM.BLUE, pairs: 1, restart: true }
    );
  });

  it("jogo já parado 3v3 + 4 specs → rebalanceia (par extra não entra no x4)", () => {
    assert.equal(
      plan({ redCount: 3, blueCount: 3, specCount: 4, live: false }).action,
      "rebalance"
    );
  });
});

describe("AFK no começo da partida", () => {
  it("auto-AFK sem ter mexido é kickoff; teclou nesta partida não é", () => {
    const { isKickoffIdleAfk } = require("../src/room/recovery");
    const moved = new Set([2]);
    const kickoff = new Set([1, 2, 3]);
    assert.equal(isKickoffIdleAfk("auto-afk", 1, moved, kickoff), true);
    assert.equal(isKickoffIdleAfk("auto-afk", 2, moved, kickoff), false);
    assert.equal(isKickoffIdleAfk("voluntary-afk", 1, moved, kickoff), false);
    assert.equal(isKickoffIdleAfk("kick", 1, moved, kickoff), false);
  });

  it("pick/reposição no meio da partida não conta como kickoff", () => {
    const { isKickoffIdleAfk } = require("../src/room/recovery");
    const moved = new Set();
    const kickoff = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(isKickoffIdleAfk("auto-afk", 9, moved, kickoff), false);
  });

  it("vagas = opções no spec puxa auto; sobra gente o capitão escolhe", () => {
    const { planKickoffAfkRecovery } = require("../src/room/recovery");
    assert.deepEqual(planKickoffAfkRecovery({ redCount: 1, blueCount: 2, specCount: 2 }), {
      action: "choose",
      targetTeam: TEAM.RED,
      teamSize: 2,
    });
    assert.deepEqual(planKickoffAfkRecovery({ redCount: 3, blueCount: 4, specCount: 1 }), {
      action: "fill",
      targetTeam: TEAM.RED,
      teamSize: 4,
      count: 1,
    });
    assert.deepEqual(planKickoffAfkRecovery({ redCount: 2, blueCount: 4, specCount: 2 }), {
      action: "fill",
      targetTeam: TEAM.RED,
      teamSize: 4,
      count: 2,
    });
    assert.deepEqual(planKickoffAfkRecovery({ redCount: 1, blueCount: 4, specCount: 3 }), {
      action: "fill",
      targetTeam: TEAM.RED,
      teamSize: 4,
      count: 3,
    });
    assert.deepEqual(planKickoffAfkRecovery({ redCount: 2, blueCount: 3, specCount: 2 }), {
      action: "choose",
      targetTeam: TEAM.RED,
      teamSize: 3,
    });
    assert.deepEqual(planKickoffAfkRecovery({ redCount: 3, blueCount: 4, specCount: 2 }), {
      action: "choose",
      targetTeam: TEAM.RED,
      teamSize: 4,
    });
    assert.deepEqual(planKickoffAfkRecovery({ redCount: 0, blueCount: 1, specCount: 2 }), {
      action: "choose",
      targetTeam: TEAM.RED,
      teamSize: 1,
    });
    assert.equal(
      planKickoffAfkRecovery({ redCount: 3, blueCount: 4, specCount: 0 }).action,
      "refresh"
    );
  });
});

describe("pós-vitória: preencher sem sobra ou pickar", () => {
  it("effectiveTeamSize mantém 4v4 com vermelho cheio e 5 elegíveis (AFK no spec)", () => {
    const { effectiveTeamSize } = require("../src/room/recovery");
    const size = effectiveTeamSize({ redCount: 4, blueCount: 3, eligibleCount: 5, maxSize: 4 });
    assert.equal(size, 4);
    assert.deepEqual(
      planExactFill({ redCount: 4, blueCount: 3, specCount: 1, teamSize: size }),
      { action: "fill-all", redNeed: 0, blueNeed: 1 }
    );
  });

  it("4 vermelho + 1 azul + 3 spec (exatos 8) → preenche na ordem, sem pick", () => {
    assert.deepEqual(
      planExactFill({ redCount: 4, blueCount: 1, specCount: 3, teamSize: 4 }),
      { action: "fill-all", redNeed: 0, blueNeed: 3 }
    );
  });

  it("4 vermelho + 0 azul + 3 spec → sobe os 3 azuis sem pick impossível", () => {
    assert.deepEqual(
      planExactFill({ redCount: 4, blueCount: 0, specCount: 3, teamSize: 4 }),
      { action: "fill-partial", redNeed: 0, blueNeed: 3 }
    );
  });

  it("4 vermelho + 0 azul + 4 spec → preenche o azul na ordem, sem pick", () => {
    assert.deepEqual(
      planExactFill({ redCount: 4, blueCount: 0, specCount: 4, teamSize: 4 }),
      { action: "fill-all", redNeed: 0, blueNeed: 4 }
    );
  });

  it("4 vermelho + 1 azul + 4 spec (sobra) → capitão escolhe", () => {
    assert.equal(
      planExactFill({ redCount: 4, blueCount: 1, specCount: 4, teamSize: 4 }).action,
      "choose"
    );
  });

  it("dois capitães + 6 specs não completa os dois times sozinho", () => {
    assert.equal(
      planExactFill({ redCount: 1, blueCount: 1, specCount: 6, teamSize: 4 }).action,
      "choose"
    );
  });

  it("4v4 já completo → só inicia", () => {
    assert.equal(
      planExactFill({ redCount: 4, blueCount: 4, specCount: 2, teamSize: 4 }).action,
      "start"
    );
  });

  it("só os 4 vencedores → ficam, sem pick", () => {
    assert.equal(
      planExactFill({ redCount: 4, blueCount: 0, specCount: 0, teamSize: 4 }).action,
      "keep"
    );
  });

  it("3v3 + 1 spec após vitória: 3 red 1 blue 3 spec → capitão escolhe 2", () => {
    assert.equal(
      planExactFill({ redCount: 3, blueCount: 1, specCount: 3, teamSize: 3 }).action,
      "choose"
    );
  });

  it("2v2 + 1 spec após vitória: 2 red 1 blue 2 spec → capitão escolhe 1", () => {
    assert.equal(
      planExactFill({ redCount: 2, blueCount: 1, specCount: 2, teamSize: 2 }).action,
      "choose"
    );
  });

  it("1v1 + 1 spec após vitória: já está 1v1 → inicia", () => {
    assert.equal(
      planExactFill({ redCount: 1, blueCount: 1, specCount: 1, teamSize: 1 }).action,
      "start"
    );
  });
});

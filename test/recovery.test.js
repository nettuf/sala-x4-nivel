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

  it("buraco de 2 no mesmo time → rebalanceia mesmo com spec", () => {
    assert.equal(plan({ redCount: 2, blueCount: 4, specCount: 2 }).action, "rebalance");
    assert.equal(plan({ redCount: 2, blueCount: 4, specCount: 1 }).action, "rebalance");
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

describe("pós-vitória: preencher sem sobra ou pickar", () => {
  it("4 vermelho + 1 azul + 3 spec (exatos 8) → preenche na ordem, sem pick", () => {
    assert.deepEqual(
      planExactFill({ redCount: 4, blueCount: 1, specCount: 3, teamSize: 4 }),
      { action: "fill-all", redNeed: 0, blueNeed: 3 }
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
});

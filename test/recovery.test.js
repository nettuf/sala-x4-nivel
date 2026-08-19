const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { planCompetitiveRecovery } = require("../src/room/recovery");
const { TEAM } = require("../src/room/choose");

function plan(partial) {
  return planCompetitiveRecovery({ teamSize: 4, live: true, ...partial });
}

describe("recuperação do 4v4 competitivo", () => {
  it("4v4 completo → não mexe", () => {
    assert.equal(plan({ redCount: 4, blueCount: 4, specCount: 2 }).action, "none");
  });

  it("3v3 + 4 specs durante o jogo → sobe só um par (fica 4v4 + 2 spec)", () => {
    assert.deepEqual(plan({ redCount: 3, blueCount: 3, specCount: 4 }), {
      action: "fill-pairs",
      targetTeam: TEAM.BLUE,
      pairs: 1,
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

  it("sai 1 no 4v4 sem spec → rebalanceia (volta warmup)", () => {
    assert.equal(plan({ redCount: 3, blueCount: 4, specCount: 0 }).action, "rebalance");
    assert.equal(plan({ redCount: 4, blueCount: 3, specCount: 0 }).action, "rebalance");
  });

  it("3v3 + 2 specs durante o jogo → sobe o par e segue 4v4", () => {
    assert.deepEqual(plan({ redCount: 3, blueCount: 3, specCount: 2 }), {
      action: "fill-pairs",
      targetTeam: TEAM.BLUE,
      pairs: 1,
    });
  });

  it("3v3 + 1 spec durante o jogo → rebalanceia (não dá para completar os dois lados)", () => {
    assert.equal(plan({ redCount: 3, blueCount: 3, specCount: 1 }).action, "rebalance");
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

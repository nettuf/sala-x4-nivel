const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { diagnoseRoom, createHealthMonitor } = require("../src/room/health");

describe("diagnóstico da sala", () => {
  it("4v4 rolando está saudável", () => {
    const d = diagnoseRoom({
      live: true,
      competitive: true,
      redCount: 4,
      blueCount: 4,
      specReadyCount: 3,
    });
    assert.equal(d.action, "none");
  });

  it("choose aberto com jogo rolando para o jogo", () => {
    const d = diagnoseRoom({
      live: true,
      competitive: true,
      chooseActive: true,
      redCount: 4,
      blueCount: 1,
      specReadyCount: 3,
    });
    assert.equal(d.action, "stop-game");
  });

  it("choose pausado pós-vitória (sem reposição) deixa o capitão pickar", () => {
    const d = diagnoseRoom({
      live: true,
      competitive: true,
      paused: true,
      chooseActive: true,
      replacement: false,
      hasCaptain: true,
      redCount: 4,
      blueCount: 1,
      specReadyCount: 3,
    });
    assert.equal(d.action, "none");
  });

  it("reposição com jogo pausado é estado normal", () => {
    const d = diagnoseRoom({
      live: true,
      competitive: true,
      paused: true,
      chooseActive: true,
      replacement: true,
      hasCaptain: true,
      redCount: 3,
      blueCount: 4,
      specReadyCount: 2,
    });
    assert.equal(d.action, "none");
  });

  it("time vazio / desigual só importa no 4v4 oficial", () => {
    assert.equal(
      diagnoseRoom({ live: true, competitive: true, redCount: 4, blueCount: 0, specReadyCount: 4 }).action,
      "stop-game"
    );
    assert.equal(
      diagnoseRoom({ live: true, competitive: true, redCount: 3, blueCount: 4, specReadyCount: 2 }).action,
      "recover"
    );
  });

  it("treino/warmup com 1 no vermelho ou 2v1 não pede RR", () => {
    assert.equal(
      diagnoseRoom({ live: true, competitive: false, redCount: 1, blueCount: 0 }).action,
      "none"
    );
    assert.equal(
      diagnoseRoom({ live: true, competitive: false, redCount: 2, blueCount: 1 }).action,
      "none"
    );
    assert.equal(
      diagnoseRoom({ live: true, competitive: false, paused: true, redCount: 1, blueCount: 1 }).action,
      "none"
    );
  });

  it("competitive preso no treino 1v0/2v1 não RR", () => {
    assert.equal(
      diagnoseRoom({ live: true, competitive: true, redCount: 1, blueCount: 0 }).action,
      "none"
    );
    assert.equal(
      diagnoseRoom({ live: true, competitive: true, redCount: 2, blueCount: 1 }).action,
      "none"
    );
    assert.equal(
      diagnoseRoom({
        live: true,
        competitive: true,
        chooseActive: true,
        redCount: 1,
        blueCount: 0,
      }).action,
      "none"
    );
  });

  it("3v4 oficial rolando sem choose pede reposição", () => {
    const d = diagnoseRoom({
      live: true,
      competitive: true,
      redCount: 3,
      blueCount: 4,
      specReadyCount: 2,
    });
    assert.equal(d.action, "recover");
  });

  it("pausado com times iguais e sem reposição despausa no oficial", () => {
    const d = diagnoseRoom({
      live: true,
      competitive: true,
      paused: true,
      redCount: 4,
      blueCount: 4,
    });
    assert.equal(d.action, "unpause");
  });

  it("reposição pausada 3v4 não é liberada pelo watchdog", () => {
    const d = diagnoseRoom({
      live: true,
      competitive: true,
      paused: true,
      chooseActive: true,
      replacement: true,
      holdingPause: true,
      redCount: 3,
      blueCount: 4,
      specReadyCount: 2,
    });
    assert.equal(d.action, "none");
  });

  it("reposição despausada 3v4 pede pausa de novo", () => {
    const d = diagnoseRoom({
      live: true,
      competitive: true,
      paused: false,
      chooseActive: true,
      replacement: true,
      holdingPause: true,
      redCount: 3,
      blueCount: 4,
      specReadyCount: 2,
    });
    assert.equal(d.action, "pause");
  });

  it("reposição despausada não libera mesmo se os counts parecem 4v4", () => {
    const d = diagnoseRoom({
      live: true,
      competitive: true,
      paused: false,
      chooseActive: true,
      replacement: true,
      holdingPause: true,
      redCount: 4,
      blueCount: 4,
      specReadyCount: 1,
    });
    assert.equal(d.action, "pause");
  });

  it("pausa com holdingPause não despausa mesmo sem choose ativo", () => {
    const d = diagnoseRoom({
      live: true,
      competitive: true,
      paused: true,
      chooseActive: false,
      replacement: false,
      holdingPause: true,
      redCount: 3,
      blueCount: 4,
      specReadyCount: 2,
    });
    assert.equal(d.action, "recover");
  });

  it("choose sem capitão é reavaliado; com capitão fica quieto", () => {
    assert.equal(
      diagnoseRoom({ chooseActive: true, hasCaptain: false, redCount: 4, specReadyCount: 2 }).action,
      "prompt-choose"
    );
    assert.equal(
      diagnoseRoom({ chooseActive: true, hasCaptain: true, redCount: 4, blueCount: 1, specReadyCount: 2 }).action,
      "none"
    );
  });

  it("sem jogo e sem choose com gente suficiente volta ao lobby", () => {
    assert.equal(diagnoseRoom({ specReadyCount: 4 }).action, "refresh-lobby");
    assert.equal(diagnoseRoom({ specReadyCount: 1 }).action, "none");
  });
});

describe("monitor de saúde", () => {
  it("só age depois de duas checagens com o mesmo problema", () => {
    const applied = [];
    let state = { action: "recover", reason: "teste" };
    const monitor = createHealthMonitor({
      diagnose: () => state,
      apply: (r) => applied.push(r.action),
    });

    assert.equal(monitor.check(), null);
    assert.deepEqual(applied, []);
    assert.equal(monitor.check().action, "recover");
    assert.deepEqual(applied, ["recover"]);

    // Depois de agir, o contador zera.
    assert.equal(monitor.check(), null);

    state = { action: "none" };
    assert.equal(monitor.check(), null);
    assert.deepEqual(applied, ["recover"]);
  });

  it("pausa exige mais checagens do que os outros problemas", () => {
    const applied = [];
    const monitor = createHealthMonitor({
      diagnose: () => ({ action: "unpause", reason: "pausa" }),
      apply: (r) => applied.push(r.action),
    });
    for (let i = 0; i < 5; i++) monitor.check();
    assert.deepEqual(applied, []);
    monitor.check();
    assert.deepEqual(applied, ["unpause"]);
  });

  it("problema que muda no meio não dispara", () => {
    const applied = [];
    const seq = [
      { action: "recover", reason: "a" },
      { action: "unpause", reason: "b" },
      { action: "recover", reason: "c" },
    ];
    let i = 0;
    const monitor = createHealthMonitor({
      diagnose: () => seq[i++] || { action: "none" },
      apply: (r) => applied.push(r.action),
    });
    monitor.check();
    monitor.check();
    monitor.check();
    assert.deepEqual(applied, []);
  });
});

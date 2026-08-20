/**
 * Diagnóstico da sala: estados que antes só um admin destravava.
 *
 * Casos reais:
 * - partida oficial rodando 4v1 com o choose aberto
 * - jogo pausado no 3v4 sem reposição em andamento
 * - lobby sem jogo e sem choose com gente suficiente para jogar
 *
 * Treino/warmup NÃO entra nas regras de time vazio/desigual: 1 no vermelho
 * ou 2v1 é estado normal — o watchdog antigo RR a cada ~10s no mapa de treino.
 */

const HEALTH_CHECK_MS = 5000;
const HEALTH_STRIKES = 2;
/** Pausa de admin tem corda longa: só é desfeita depois de ~30s esquecida. */
const HEALTH_ACTION_STRIKES = { unpause: 6 };

function diagnoseRoom({
  live = false,
  paused = false,
  chooseActive = false,
  replacement = false,
  hasCaptain = false,
  competitive = false,
  redCount = 0,
  blueCount = 0,
  specReadyCount = 0,
  teamSize = 4,
} = {}) {
  const onField = redCount + blueCount;
  const eligible = onField + specReadyCount;

  if (live) {
    // Choose normal nunca convive com jogo rolando: um dos dois está órfão.
    if (chooseActive && !replacement) {
      return { action: "stop-game", reason: "choose aberto com jogo rolando" };
    }

    // Warmup/treino: não para por time vazio nem reequilibra por desigualdade.
    if (!competitive) {
      return { action: "none" };
    }

    if (!chooseActive && (redCount === 0 || blueCount === 0)) {
      return { action: "stop-game", reason: "time vazio com jogo rolando" };
    }
    if (!chooseActive && redCount !== blueCount) {
      return { action: "recover", reason: `times desiguais (${redCount}v${blueCount})` };
    }
    if (paused && !chooseActive) {
      return { action: "unpause", reason: "pausa sem reposição pendente" };
    }
    return { action: "none" };
  }

  if (chooseActive) {
    if (!hasCaptain) {
      return { action: "prompt-choose", reason: "choose sem capitão" };
    }
    return { action: "none" };
  }

  if (eligible >= 2) {
    return { action: "refresh-lobby", reason: "sem jogo e sem choose" };
  }

  return { action: "none" };
}

/**
 * Só age quando o mesmo problema aparece em checagens seguidas: evita brigar
 * com os timers curtos do lobby (250ms–1.2s) durante uma troca normal.
 */
function createHealthMonitor({
  diagnose,
  apply,
  strikes = HEALTH_STRIKES,
  actionStrikes = HEALTH_ACTION_STRIKES,
} = {}) {
  let lastAction = "";
  let repeats = 0;

  function needed(action) {
    const n = Number(actionStrikes?.[action]);
    return Number.isFinite(n) && n > 0 ? n : strikes;
  }

  function check() {
    const result = (typeof diagnose === "function" && diagnose()) || { action: "none" };
    if (result.action === "none") {
      lastAction = "";
      repeats = 0;
      return null;
    }
    if (result.action === lastAction) repeats += 1;
    else {
      lastAction = result.action;
      repeats = 1;
    }
    if (repeats < needed(result.action)) return null;
    lastAction = "";
    repeats = 0;
    if (typeof apply === "function") apply(result);
    return result;
  }

  function start(intervalMs = HEALTH_CHECK_MS) {
    const timer = setInterval(check, intervalMs);
    if (typeof timer.unref === "function") timer.unref();
    return {
      stop() {
        clearInterval(timer);
      },
    };
  }

  return { check, start };
}

module.exports = {
  diagnoseRoom,
  createHealthMonitor,
  HEALTH_CHECK_MS,
  HEALTH_STRIKES,
  HEALTH_ACTION_STRIKES,
};

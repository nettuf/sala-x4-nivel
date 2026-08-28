/**
 * Diagnóstico da sala: estados que antes só um admin destravava.
 *
 * Casos reais:
 * - partida oficial rodando 4v1 com o choose aberto
 * - jogo pausado no 3v4 sem reposição em andamento
 * - lobby sem jogo e sem choose com gente suficiente para jogar
 *
 * Treino/warmup NÃO entra nas regras de time vazio/desigual: 1 no vermelho
 * ou 2v1 é estado normal — inclusive se o flag competitive ficou preso
 * depois de um 4v4 (o watchdog antigo RR a cada ~10s no mapa de treino).
 */

const HEALTH_CHECK_MS = 5000;
const HEALTH_STRIKES = 2;
/** Pausa de admin tem corda longa: só é desfeita depois de ~30s esquecida. */
const HEALTH_ACTION_STRIKES = { unpause: 6, pause: 1 };

function diagnoseRoom({
  live = false,
  paused = false,
  chooseActive = false,
  replacement = false,
  holdingPause = false,
  hasCaptain = false,
  competitive = false,
  winnerStaysPending = false,
  redCount = 0,
  blueCount = 0,
  specReadyCount = 0,
  teamSize = 4,
} = {}) {
  const eligible = redCount + blueCount + specReadyCount;
  // 1v0/2v1 no treino não é 4v4: o flag competitive às vezes fica preso
  // depois de um x4 e o watchdog antigo RR a cada 10s.
  const official = !!competitive && Math.max(redCount, blueCount) >= teamSize - 1;
  const waitingOnPick = !!(replacement || holdingPause);

  if (live) {
    if (official && chooseActive && !replacement && !paused) {
      return { action: "stop-game", reason: "choose aberto com jogo rolando" };
    }

    if (!official) {
      return { action: "none" };
    }

    // Reposição: o Haxball despausa no setPlayerTeam. Segura a pausa até o
    // pick — mesmo se os counts “parecem” 4v4 (AFK ainda listado no time).
    if (waitingOnPick) {
      if (official && redCount >= teamSize && blueCount >= teamSize && !chooseActive) {
        return paused
          ? { action: "unpause", reason: "4v4 completo com reposição órfã" }
          : { action: "none" };
      }
      if (!chooseActive) {
        return { action: "recover", reason: `reposição caiu (${redCount}v${blueCount})` };
      }
      if (!paused) {
        return { action: "pause", reason: "reposição despausou cedo" };
      }
      return { action: "none" };
    }

    if (!chooseActive && (redCount === 0 || blueCount === 0)) {
      return { action: "stop-game", reason: "time vazio com jogo rolando" };
    }
    if (!chooseActive && redCount !== blueCount) {
      return { action: "recover", reason: `times desiguais (${redCount}v${blueCount})` };
    }
    if (paused && !chooseActive && !waitingOnPick) {
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

  // Perdedores ainda no campo: não relança o mesmo 4v4 pelo atalho do lobby.
  if (winnerStaysPending) {
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

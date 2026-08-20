const config = require("../config");
const { kickReason } = require("../utils");

function fieldPlayerCount(players) {
  return (players || []).filter((p) => p.id !== 0 && p.team !== 0).length;
}

/** Treino solo (1 em campo) não pune; 1v1, 2v2, 3v3 e 4v4 sim. */
function shouldCountAutoAfk(players) {
  return fieldPlayerCount(players) >= 2;
}

/** Distância mínima (legado/testes). AFK real usa tecla (onPlayerActivity). */
const MOVE_EPS = 8;

function hasMoved(prev, next, eps = MOVE_EPS) {
  if (!prev || !next) return false;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  return dx * dx + dy * dy >= eps * eps;
}

function afkRemainSec() {
  const remain = Number(config.afkActionMs) - Number(config.afkWarnMs);
  return Math.max(1, Math.ceil(remain / 1000));
}

/** Se onPositionsReset não vier após o gol, o relógio não pode ficar morto pra sempre. */
const COUNTING_STALL_MS = 8000;

/**
 * AFK é um estado só, venha do !afk ou de ficar parado em campo:
 * sai da fila do pick, ninguém escolhe, admin não consegue colocar em campo.
 * Só sai com !afk do próprio jogador — ou kick, se a sala encher.
 *
 * Atividade = tecla (onPlayerActivity) / chute / entrar em time.
 *
 * Pausa e comemoração de gol CONGELAM o relógio (não zeram). Zerar em todo
 * kickoff/despause fazia o AFK nunca chegar aos 12s se tivesse gol ou pause.
 */
function createAfkTracker(room, opts = {}) {
  /** @type {Map<number, { lastActive: number, warned: boolean }>} lastActive = relógio efetivo */
  const state = new Map();
  /** @type {Map<number, number>} id → AFK desde quando (para kickar o mais antigo) */
  const afks = new Map();
  let paused = false;
  let counting = true;
  let countingOffAt = 0;
  /** Tempo de parede acumulado em hold (pausa + pós-gol). */
  let holdAccumMs = 0;
  /** Se > 0, hold aberto desde esse Date.now(). */
  let holdStartedAt = 0;
  let onStateChange = null;
  const shouldAutoAfk = typeof opts.shouldAutoAfk === "function" ? opts.shouldAutoAfk : () => true;

  function effectiveNow(wallNow = Date.now()) {
    const open = holdStartedAt > 0 ? wallNow - holdStartedAt : 0;
    return wallNow - holdAccumMs - open;
  }

  function beginHold(wallNow = Date.now()) {
    if (holdStartedAt > 0) return;
    holdStartedAt = wallNow;
  }

  function endHold(wallNow = Date.now()) {
    if (holdStartedAt <= 0) return;
    holdAccumMs += wallNow - holdStartedAt;
    holdStartedAt = 0;
  }

  function syncHold(wallNow = Date.now()) {
    const shouldHold = paused || !counting;
    if (shouldHold) beginHold(wallNow);
    else endHold(wallNow);
  }

  function touch(playerId, wallNow = Date.now()) {
    if (afks.has(playerId)) return;
    const now = effectiveNow(wallNow);
    const cur = state.get(playerId) || { lastActive: now, warned: false };
    cur.lastActive = now;
    cur.warned = false;
    state.set(playerId, cur);
  }

  function remove(playerId) {
    state.delete(playerId);
    afks.delete(playerId);
  }

  function isAfk(playerId) {
    return afks.has(playerId);
  }

  function markAfk(playerId) {
    if (!afks.has(playerId)) afks.set(playerId, Date.now());
  }

  /**
   * `pause: false` para correções de rotina (ex.: AFK que reapareceu num time):
   * pausar/despausar a cada segundo trava o jogo piscando.
   */
  function sendToSpec(playerId, { pause = true } = {}) {
    const inGame =
      pause && !paused && typeof room.getScores === "function" && !!room.getScores();
    if (inGame && typeof room.pauseGame === "function") {
      try {
        room.pauseGame(true);
      } catch {
        /* ignore */
      }
    }
    try {
      room.setPlayerTeam(playerId, 0);
    } finally {
      if (inGame && typeof room.pauseGame === "function") {
        try {
          room.pauseGame(false);
        } catch {
          /* ignore */
        }
      }
    }
  }

  function humans() {
    return room.getPlayerList().filter((p) => p.id !== 0);
  }

  function oldestAfkPlayer() {
    let best = null;
    let bestSince = Infinity;
    for (const p of humans()) {
      const since = afks.get(p.id);
      if (since == null || since >= bestSince) continue;
      best = p;
      bestSince = since;
    }
    return best;
  }

  function ensureReserveSlots() {
    const reserve = Number(config.afkReserveSlots) || 5;
    const maxPlayers = Number(config.maxPlayers) || 30;
    for (let i = 0; i < 32; i++) {
      const free = maxPlayers - humans().length;
      if (free > reserve) return;
      const p = oldestAfkPlayer();
      if (!p) return;
      onStateChange?.({ type: "kick", player: p, previousTeam: p.team });
      room.sendAnnouncement(
        `${p.name} foi kickado por AFK (sala com poucas vagas).`,
        null,
        0xe67e22,
        "normal",
        1
      );
      room.kickPlayer(p.id, kickReason("AFK (sala quase cheia)"), false);
      remove(p.id);
    }
  }

  function setAfk(player, on) {
    const previousTeam = player.team;
    if (on) {
      markAfk(player.id);
      if (player.team !== 0) sendToSpec(player.id, { pause: false });
      room.sendAnnouncement(`${player.name} está AFK (!afk)`, null, 0xbdc3c7, "normal", 1);
    } else {
      afks.delete(player.id);
      touch(player.id);
      room.sendAnnouncement(`${player.name} voltou do AFK`, null, 0x2ecc71, "normal", 1);
    }
    onStateChange?.({
      type: on ? "voluntary-afk" : "back",
      player,
      previousTeam,
    });
    if (on) ensureReserveSlots();
  }

  function playingCount() {
    return humans().length;
  }

  /** Só no início de partida: todo mundo começa o relógio do zero. */
  function resetClocks(wallNow = Date.now()) {
    holdAccumMs = 0;
    holdStartedAt = 0;
    const now = effectiveNow(wallNow);
    for (const p of room.getPlayerList()) {
      if (p.id === 0 || afks.has(p.id)) continue;
      state.set(p.id, { lastActive: now, warned: false });
    }
  }

  function setPaused(on, wallNow = Date.now()) {
    paused = !!on;
    syncHold(wallNow);
  }

  function setCounting(on, wallNow = Date.now()) {
    counting = !!on;
    if (counting) countingOffAt = 0;
    else countingOffAt = wallNow;
    syncHold(wallNow);
  }

  function tick(wallNow = Date.now()) {
    // onPositionsReset às vezes falha: sem isso o AFK morre pra sempre após um gol.
    if (
      !counting &&
      !paused &&
      countingOffAt > 0 &&
      wallNow - countingOffAt >= COUNTING_STALL_MS &&
      typeof room.getScores === "function" &&
      room.getScores()
    ) {
      setCounting(true, wallNow);
    }

    syncHold(wallNow);

    if (paused || !counting) {
      ensureReserveSlots();
      return;
    }
    if (!shouldAutoAfk()) {
      ensureReserveSlots();
      return;
    }
    if (typeof room.getScores === "function" && !room.getScores()) {
      ensureReserveSlots();
      return;
    }

    const now = effectiveNow(wallNow);
    const full = playingCount() >= config.afkFullThreshold;
    for (const p of room.getPlayerList()) {
      if (p.id === 0) continue;
      if (afks.has(p.id)) {
        if (p.team !== 0) sendToSpec(p.id, { pause: false });
        continue;
      }
      if (p.team === 0) continue;
      if (!state.has(p.id)) touch(p.id, wallNow);
      const st = state.get(p.id);
      const idleMs = now - st.lastActive;

      if (idleMs >= config.afkWarnMs && !st.warned) {
        st.warned = true;
        room.sendAnnouncement(
          `⚠️ ${p.name}, mexa-se — faltam ${afkRemainSec()}s para AFK.`,
          p.id,
          0xf1c40f,
          "bold",
          2
        );
      }

      if (idleMs < config.afkActionMs) continue;

      if (full) {
        onStateChange?.({ type: "kick", player: p, previousTeam: p.team });
        room.kickPlayer(p.id, kickReason("AFK (sala cheia)"), false);
        remove(p.id);
      } else if (p.team !== 0) {
        const previousTeam = p.team;
        markAfk(p.id);
        sendToSpec(p.id, { pause: false });
        room.sendAnnouncement(
          `${p.name} parado — está AFK no spec (!afk para voltar).`,
          null,
          0xe67e22,
          "normal",
          1
        );
        onStateChange?.({ type: "auto-afk", player: p, previousTeam });
      }
    }
    ensureReserveSlots();
  }

  const interval = setInterval(tick, 1000);
  if (typeof interval.unref === "function") interval.unref();

  return {
    touch,
    remove,
    isAfk,
    noteAfk(playerId) {
      markAfk(playerId);
    },
    setAfk,
    ensureReserveSlots,
    sampleMovement() {},
    resetClocks,
    setOnStateChange(handler) {
      onStateChange = typeof handler === "function" ? handler : null;
    },
    setPaused,
    setCounting,
    isPaused: () => paused,
    isCounting: () => counting,
    /** Exposto para testes do relógio congelado. */
    effectiveNow,
    tick,
    stop() {
      clearInterval(interval);
    },
  };
}

module.exports = {
  createAfkTracker,
  fieldPlayerCount,
  shouldCountAutoAfk,
  hasMoved,
  MOVE_EPS,
  COUNTING_STALL_MS,
};

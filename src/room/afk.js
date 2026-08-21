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
/** Haxball: onGameTick = 60 Hz. Apex incrementa ACT nesse loop. */
const TICK_HZ = 60;
const MS_PER_TICK = 1000 / TICK_HZ;

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

/**
 * AFK é um estado só, venha do !afk ou de ficar parado em campo.
 *
 * Apex (sala parceira): onGameTick incrementa um contador; onPlayerActivity
 * zera. onGameTick NÃO dispara com o jogo pausado — a pausa congela sozinha.
 * Não usam flag `paused` à parte: se o bot pausa pro choose e o unpause não
 * dispara, o relógio antigo ficava morto pra sempre.
 *
 * Aqui: o loop do jogo (noteGameTick) é a fonte da verdade. A flag paused só
 * congela o fallback do setInterval, não o tick da física.
 */
function createAfkTracker(room, opts = {}) {
  /** @type {Map<number, { lastActive: number, warned: boolean, idleTicks: number }>} */
  const state = new Map();
  /** @type {Map<number, number>} id → AFK desde quando (para kickar o mais antigo) */
  const afks = new Map();
  let paused = false;
  /** Tempo de parede acumulado em pausa (só o fallback do setInterval). */
  let holdAccumMs = 0;
  let holdStartedAt = 0;
  /** Último onGameTick — se recente, o setInterval não conta de novo. */
  let lastSimTickAt = 0;
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
    if (paused) beginHold(wallNow);
    else endHold(wallNow);
  }

  function blankState(now) {
    return { lastActive: now, warned: false, idleTicks: 0 };
  }

  function touch(playerId, wallNow = Date.now()) {
    if (afks.has(playerId)) return;
    const now = effectiveNow(wallNow);
    const cur = state.get(playerId) || blankState(now);
    cur.lastActive = now;
    cur.warned = false;
    cur.idleTicks = 0;
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

  function punishIdle(p, idleMs, full) {
    const st = state.get(p.id);
    if (!st) return;
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
    if (idleMs < config.afkActionMs) return false;

    if (full) {
      onStateChange?.({ type: "kick", player: p, previousTeam: p.team });
      room.kickPlayer(p.id, kickReason("AFK (sala cheia)"), false);
      remove(p.id);
      return true;
    }
    if (p.team !== 0) {
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
    return true;
  }

  function forEachFieldPlayer(wallNow, onEach) {
    const full = playingCount() >= config.afkFullThreshold;
    for (const p of room.getPlayerList()) {
      if (p.id === 0) continue;
      if (afks.has(p.id)) {
        if (p.team !== 0) sendToSpec(p.id, { pause: false });
        continue;
      }
      if (p.team === 0) continue;
      if (!state.has(p.id)) touch(p.id, wallNow);
      onEach(p, state.get(p.id), full);
    }
  }

  /** Só no início de partida: todo mundo começa o relógio do zero. */
  function resetClocks(wallNow = Date.now()) {
    holdAccumMs = 0;
    holdStartedAt = 0;
    lastSimTickAt = 0;
    const now = effectiveNow(wallNow);
    for (const p of room.getPlayerList()) {
      if (p.id === 0 || afks.has(p.id)) continue;
      state.set(p.id, blankState(now));
    }
  }

  function setPaused(on, wallNow = Date.now()) {
    paused = !!on;
    syncHold(wallNow);
  }

  /**
   * Apex: chamado 60x/s enquanto a física roda. Ignora a flag paused —
   * onGameTick só existe com o jogo despausado. Se a flag ficar presa depois
   * do choose, o parado ainda cai.
   */
  function noteGameTick(wallNow = Date.now()) {
    lastSimTickAt = wallNow;
    if (!shouldAutoAfk()) {
      ensureReserveSlots();
      return;
    }
    if (typeof room.getScores === "function" && !room.getScores()) {
      ensureReserveSlots();
      return;
    }
    forEachFieldPlayer(wallNow, (p, st, full) => {
      st.idleTicks = (Number(st.idleTicks) || 0) + 1;
      punishIdle(p, st.idleTicks * MS_PER_TICK, full);
    });
    ensureReserveSlots();
  }

  function tick(wallNow = Date.now()) {
    syncHold(wallNow);

    // O loop do jogo está no controle: não contar duas vezes.
    if (lastSimTickAt > 0 && wallNow - lastSimTickAt < 1500) {
      ensureReserveSlots();
      return;
    }

    if (paused) {
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
    forEachFieldPlayer(wallNow, (p, st, full) => {
      punishIdle(p, now - st.lastActive, full);
    });
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
    isPaused: () => paused,
    /** Exposto para testes do relógio congelado na pausa. */
    effectiveNow,
    tick,
    noteGameTick,
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
  TICK_HZ,
};

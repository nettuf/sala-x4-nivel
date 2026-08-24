const config = require("../config");
const { kickReason } = require("../utils");

function fieldPlayerCount(players) {
  return (players || []).filter((p) => p.id !== 0 && p.team !== 0).length;
}

/** Treino solo (1 em campo) não pune; 1v1, 2v2, 3v3 e 4v4 sim. */
function shouldCountAutoAfk(players) {
  return fieldPlayerCount(players) >= 2;
}

/** Salto grande neste tick (empurrão / corrida). Jitter acumulado NÃO conta. */
const MOVE_EPS = 1.5;
/** Velocidade de andar de verdade. Residual da física (~0) não zera o AFK. */
const SPEED_EPS = 0.25;
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
 * Relógio = parede (8s aviso, 12s spec). Só zera se o disco ANDAR no tick
 * da física (delta de posição). Velocidade do host e o setInterval de 1s
 * NÃO zeram — 1s de deriva passava de 1.5 e o AFK nunca estourava.
 * Tecla no lugar não conta.
 */
function createAfkTracker(room, opts = {}) {
  /** @type {Map<number, { lastActive: number, warned: boolean, idleTicks: number, lastPos: {x:number,y:number}|null }>} */
  const state = new Map();
  /** @type {Map<number, number>} id → AFK desde quando (para kickar o mais antigo) */
  const afks = new Map();
  let paused = false;
  /** Início da pausa atual (relógio de parede). */
  let pauseAt = 0;
  /** Último onGameTick — se recente, o setInterval não conta de novo. */
  let lastSimTickAt = 0;
  /** Kick de AFK por vaga não precisa de 60 Hz. */
  let reserveCheckTicks = 0;
  let onStateChange = null;
  const shouldAutoAfk = typeof opts.shouldAutoAfk === "function" ? opts.shouldAutoAfk : () => true;
  const onFieldMove = typeof opts.onFieldMove === "function" ? opts.onFieldMove : null;

  function effectiveNow(wallNow = Date.now()) {
    if (paused && pauseAt) return pauseAt;
    return wallNow;
  }

  function blankState(now) {
    return { lastActive: now, warned: false, idleTicks: 0, lastPos: null };
  }

  function touch(playerId, wallNow = Date.now()) {
    if (afks.has(playerId)) return;
    const cur = state.get(playerId) || blankState(wallNow);
    cur.lastActive = wallNow;
    cur.warned = false;
    cur.idleTicks = 0;
    cur.lastPos = null;
    state.set(playerId, cur);
  }

  function readDisc(p) {
    try {
      if (typeof room.getPlayerDiscProperties !== "function") return null;
      return room.getPlayerDiscProperties(p.id) || null;
    } catch {
      return null;
    }
  }

  function playerPos(p) {
    const disc = readDisc(p);
    if (disc && Number.isFinite(disc.x) && Number.isFinite(disc.y)) {
      return { x: disc.x, y: disc.y, xspeed: disc.xspeed, yspeed: disc.yspeed };
    }
    const pos = p.position;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      return { x: pos.x, y: pos.y };
    }
    return null;
  }

  /**
   * Andou NESTE frame da física? Só posição, como o map.txt.
   * Velocidade do haxball.js vem suja e zerava o relógio o tempo todo.
   * lastPos atualiza sempre, para jitter de 0.3/tick não somar até 1.5.
   */
  function applyMotion(p, st, wallNow) {
    const pos = playerPos(p);
    if (!pos) return false;
    const moved = !!(st.lastPos && hasMoved(st.lastPos, pos, MOVE_EPS));
    st.lastPos = { x: pos.x, y: pos.y };
    if (!moved) return false;
    st.lastActive = wallNow;
    st.warned = false;
    st.idleTicks = 0;
    onFieldMove?.(p.id);
    return true;
  }

  function remove(playerId) {
    state.delete(playerId);
    afks.delete(playerId);
  }

  function isAfk(playerId) {
    return afks.has(playerId);
  }

  function markAfk(playerId, at = Date.now()) {
    if (!afks.has(playerId)) afks.set(playerId, at);
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

  function oldestEligibleAfk(wallNow) {
    const grace = Number(config.afkSpecGraceMs) || 5 * 60 * 1000;
    let best = null;
    let bestSince = Infinity;
    for (const p of humans()) {
      const since = afks.get(p.id);
      if (since == null) continue;
      if (wallNow - since < grace) continue;
      if (since >= bestSince) continue;
      best = p;
      bestSince = since;
    }
    return best;
  }

  function ensureReserveSlots(wallNow = Date.now()) {
    const kickAt = Number(config.afkSpecKickAt) || 28;
    for (let i = 0; i < 32; i++) {
      if (humans().length < kickAt) return;
      const p = oldestEligibleAfk(wallNow);
      if (!p) return;
      onStateChange?.({ type: "kick", player: p, previousTeam: p.team });
      room.sendAnnouncement(
        `${p.name} foi kickado por AFK (sala com ${kickAt}+).`,
        null,
        0xe67e22,
        "normal",
        1
      );
      room.kickPlayer(p.id, kickReason("AFK (sala cheia)"), false);
      remove(p.id);
    }
  }

  function setAfk(player, on, at = Date.now()) {
    const previousTeam = player.team;
    if (on) {
      markAfk(player.id, at);
      if (player.team !== 0) sendToSpec(player.id, { pause: false });
      room.sendAnnouncement(`${player.name} está AFK (!afk)`, null, 0xbdc3c7, "normal", 1);
    } else {
      afks.delete(player.id);
      touch(player.id, at);
      room.sendAnnouncement(`${player.name} voltou do AFK`, null, 0x2ecc71, "normal", 1);
    }
    onStateChange?.({
      type: on ? "voluntary-afk" : "back",
      player,
      previousTeam,
    });
    if (on) ensureReserveSlots(at);
  }

  function punishIdle(p, idleMs) {
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
    for (const p of room.getPlayerList()) {
      if (p.id === 0) continue;
      if (afks.has(p.id)) {
        if (p.team !== 0) sendToSpec(p.id, { pause: false });
        continue;
      }
      if (p.team === 0) continue;
      if (!state.has(p.id)) touch(p.id, wallNow);
      try {
        onEach(p, state.get(p.id));
      } catch {
        const st = state.get(p.id);
        if (st) punishIdle(p, idleMs(st, wallNow));
      }
    }
  }

  /** Só no início de partida: todo mundo começa o relógio do zero. */
  function resetClocks(wallNow = Date.now()) {
    pauseAt = 0;
    lastSimTickAt = 0;
    for (const p of room.getPlayerList()) {
      if (p.id === 0 || afks.has(p.id)) continue;
      state.set(p.id, blankState(wallNow));
    }
  }

  function setPaused(on, wallNow = Date.now()) {
    if (on) {
      if (!paused) pauseAt = wallNow;
      paused = true;
      return;
    }
    if (paused && pauseAt) {
      const held = Math.max(0, wallNow - pauseAt);
      for (const st of state.values()) {
        st.lastActive += held;
      }
    }
    paused = false;
    pauseAt = 0;
  }

  function maybeReserveSlots(wallNow = Date.now()) {
    reserveCheckTicks += 1;
    if (reserveCheckTicks < 60) return;
    reserveCheckTicks = 0;
    ensureReserveSlots(wallNow);
  }

  function scoresLive() {
    return typeof room.getScores !== "function" || !!room.getScores();
  }

  function idleMs(st, wallNow) {
    const tickIdle = (Number(st.idleTicks) || 0) * MS_PER_TICK;
    const wallIdle = wallNow - st.lastActive;
    return Math.max(tickIdle, wallIdle);
  }

  /**
   * Física rodando. Inatividade = disco parado neste tick.
   * Conta ticks E relógio de parede — o host não entrega 60 Hz estável.
   * Ignora a flag paused: se a física está no ar, o parado cai.
   */
  function noteGameTick(wallNow = Date.now()) {
    lastSimTickAt = wallNow;
    if (!shouldAutoAfk() || !scoresLive()) {
      maybeReserveSlots(wallNow);
      return;
    }
    forEachFieldPlayer(wallNow, (p, st) => {
      if (applyMotion(p, st, wallNow)) return;
      st.idleTicks = (Number(st.idleTicks) || 0) + 1;
      punishIdle(p, idleMs(st, wallNow));
    });
    maybeReserveSlots(wallNow);
  }

  /**
   * Fallback de 1s: só olha o relógio. NÃO compara posição —
   * 1s de deriva do disco passava de 1.5 e zerava o AFK na VM.
   */
  function tick(wallNow = Date.now()) {
    if (paused) {
      ensureReserveSlots(wallNow);
      return;
    }
    if (!shouldAutoAfk() || !scoresLive()) {
      ensureReserveSlots(wallNow);
      return;
    }

    forEachFieldPlayer(wallNow, (p, st) => {
      punishIdle(p, idleMs(st, wallNow));
    });
    ensureReserveSlots(wallNow);
  }

  function sampleMovement(wallNow = Date.now()) {
    forEachFieldPlayer(wallNow, (p, st) => {
      applyMotion(p, st, wallNow);
    });
  }

  /** Gol/kickoff teleporta o disco: não conta como ter andado. */
  function notePositionsReset() {
    for (const st of state.values()) {
      st.lastPos = null;
    }
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
    sampleMovement,
    notePositionsReset,
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
  SPEED_EPS,
  TICK_HZ,
};

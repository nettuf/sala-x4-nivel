const config = require("../config");
const { kickReason } = require("../utils");

function fieldPlayerCount(players) {
  return (players || []).filter((p) => p.id !== 0 && p.team !== 0).length;
}

/** Treino solo (1 em campo) não pune; 1v1, 2v2, 3v3 e 4v4 sim. */
function shouldCountAutoAfk(players) {
  return fieldPlayerCount(players) >= 2;
}

/** Salto grande num tick (empurrão) — não zera AFK nem conta movimento na partida. */
const BUMP_EPS = 1.5;
/** Andar de verdade (linha reta conta). Residual da física (~0) não zera. */
const SPEED_EPS = 0.4;
const SPEED_EPS_SQ = SPEED_EPS * SPEED_EPS;
/** Deslocamento mínimo junto da velocidade: xspeed sujo com disco parado não conta. */
const WALK_DELTA_EPS = 0.35;
/** Tecla recente: empurrão com xspeed fantasma não zera AFK de quem estava parado. */
const INPUT_WINDOW_MS = 2000;
/** Parado há isso + deslize sem tecla = empurrão gradual. */
const IDLE_BEFORE_PUSH_MS = 500;
/** Haxball: onGameTick = 60 Hz. Apex incrementa ACT nesse loop. */
const TICK_HZ = 60;
const MS_PER_TICK = 1000 / TICK_HZ;

function hasMoved(prev, next, eps = BUMP_EPS) {
  if (!prev || !next) return false;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  return dx * dx + dy * dy >= eps * eps;
}

function isWalkingSpeed(pos) {
  if (!pos) return false;
  const xs = Number(pos.xspeed);
  const ys = Number(pos.yspeed);
  if (!Number.isFinite(xs) && !Number.isFinite(ys)) return false;
  return (xs || 0) ** 2 + (ys || 0) ** 2 >= SPEED_EPS_SQ;
}

function afkRemainSec() {
  const remain = Number(config.afkActionMs) - Number(config.afkWarnMs);
  return Math.max(1, Math.ceil(remain / 1000));
}

/**
 * AFK é um estado só, venha do !afk ou de ficar parado em campo.
 *
 * Relógio = parede (12s aviso, 16s spec). Zera se o disco ANDAR no tick
 * (velocidade de corrida + deslocamento — linha reta conta).
 * Empurrão, xspeed fantasma em parado e deriva de 1s NÃO zeram.
 */
function createAfkTracker(room, opts = {}) {
  /** @type {Map<number, { lastActive: number, warned: boolean, idleTicks: number, lastPos: {x:number,y:number}|null }>} */
  const state = new Map();
  /** @type {Map<number, { since: number, fieldTeam: number }>} */
  const afks = new Map();
  let paused = false;
  /** Início da pausa atual (relógio de parede). */
  let pauseAt = 0;
  /** Depois de despausar: não pune até o jogo “aquecer” de novo. */
  let unpauseGraceUntil = 0;
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
    return { lastActive: now, warned: false, idleTicks: 0, lastPos: null, walkStreak: 0, lastInputAt: 0 };
  }

  function touch(playerId, wallNow = Date.now()) {
    if (afks.has(playerId)) return;
    const cur = state.get(playerId) || blankState(wallNow);
    cur.lastActive = wallNow;
    cur.warned = false;
    cur.idleTicks = 0;
    cur.lastPos = null;
    cur.walkStreak = 0;
    cur.lastInputAt = 0;
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

  function hadRecentInput(st, wallNow) {
    return !!(st.lastInputAt && wallNow - st.lastInputAt < INPUT_WINDOW_MS);
  }

  function idleForPush(st, wallNow) {
    const tickIdle = (Number(st.idleTicks) || 0) * MS_PER_TICK;
    const wallIdle = wallNow - st.lastActive;
    return Math.max(tickIdle, wallIdle);
  }

  /**
   * Salto grande ou empurrão gradual em quem estava parado (sem tecla).
   * Corrida própria em linha reta não entra aqui.
   */
  function isExternalPush(prev, pos, st, wallNow) {
    const dx = pos.x - prev.x;
    const dy = pos.y - prev.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < WALK_DELTA_EPS * WALK_DELTA_EPS) return false;
    if (distSq >= BUMP_EPS * BUMP_EPS) return true;
    if (!isWalkingSpeed(pos)) return false;
    const streak = Number(st.walkStreak) || 0;
    if (streak >= 2) return false;
    const dist = Math.sqrt(distSq);
    // Empurrão gradual: passo ≥1.0 sem tecla em quem já estava parado (corrida ~0.8/tick não entra).
    return (
      dist >= 1.0 &&
      idleForPush(st, wallNow) >= IDLE_BEFORE_PUSH_MS &&
      !hadRecentInput(st, wallNow)
    );
  }

  /**
   * Andou NESTE frame? Corrida (xspeed/yspeed + deslocamento contínuo).
   * Empurrão não zera AFK nem movedThisMatch; linha reta conta.
   */
  function applyMotion(p, st, wallNow) {
    const pos = playerPos(p);
    if (!pos) return false;
    const prev = st.lastPos;
    const external = !!(prev && isExternalPush(prev, pos, st, wallNow));
    const slid = !!(prev && hasMoved(prev, pos, WALK_DELTA_EPS));
    const hasSpeed = isWalkingSpeed(pos);

    if (!external && slid) {
      st.walkStreak = (Number(st.walkStreak) || 0) + 1;
    } else if (external || !slid) {
      st.walkStreak = 0;
    }

    st.lastPos = { x: pos.x, y: pos.y };

    const walking =
      !external &&
      slid &&
      ((hasSpeed && (Number(st.walkStreak) || 0) >= 1) || (Number(st.walkStreak) || 0) >= 2);

    if (!walking) return false;
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

  function markAfk(playerId, at = Date.now(), fieldTeam = 0) {
    if (!afks.has(playerId)) {
      afks.set(playerId, { since: at, fieldTeam: fieldTeam || 0 });
    }
  }

  function fieldTeam(playerId) {
    return afks.get(playerId)?.fieldTeam || 0;
  }

  /**
   * Não pausa/despausa o jogo: o wrap antigo soltava a pausa da reposição.
   */
  function sendToSpec(playerId) {
    try {
      room.setPlayerTeam(playerId, 0);
    } catch {
      /* ignore */
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
      const entry = afks.get(p.id);
      if (!entry) continue;
      const since = entry.since;
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
      markAfk(player.id, at, previousTeam);
      if (player.team !== 0) sendToSpec(player.id);
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
      markAfk(p.id, undefined, previousTeam);
      sendToSpec(p.id);
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
        if (p.team !== 0) sendToSpec(p.id);
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

  function softResetIdle(wallNow = Date.now()) {
    for (const st of state.values()) {
      st.lastActive = wallNow;
      st.idleTicks = 0;
      st.lastPos = null;
      st.warned = false;
      st.walkStreak = 0;
    }
  }

  /** Só no início de partida: todo mundo começa o relógio do zero. */
  function resetClocks(wallNow = Date.now()) {
    pauseAt = 0;
    lastSimTickAt = 0;
    unpauseGraceUntil = 0;
    for (const p of room.getPlayerList()) {
      if (p.id === 0 || afks.has(p.id)) continue;
      state.set(p.id, blankState(wallNow));
    }
  }

  function setPaused(on, wallNow = Date.now()) {
    if (on) {
      if (!paused) {
        pauseAt = wallNow;
        // Descarta idle acumulado com o jogo já parado (flag atrasada / dessync).
        for (const st of state.values()) {
          st.idleTicks = 0;
          st.lastPos = null;
        }
      }
      paused = true;
      return;
    }
    // Só zera/graça se realmente estava pausado. setPaused(false) no onGameStart
    // (já despausado) não pode apagar idle nem criar grace de 2.5s.
    if (paused) {
      softResetIdle(wallNow);
      unpauseGraceUntil = wallNow + 2500;
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
   * Respeita paused (reposição/choose/admin): senão todo mundo cai AFK junto.
   * No máx. 1 auto-AFK por frame: o 1º pausa a reposição e zera o idle dos outros.
   */
  function noteGameTick(wallNow = Date.now()) {
    lastSimTickAt = wallNow;
    if (!shouldAutoAfk() || !scoresLive()) {
      maybeReserveSlots(wallNow);
      return;
    }
    if (paused) {
      maybeReserveSlots(wallNow);
      return;
    }
    if (wallNow < unpauseGraceUntil) {
      forEachFieldPlayer(wallNow, (p, st) => {
        applyMotion(p, st, wallNow);
      });
      maybeReserveSlots(wallNow);
      return;
    }
    let punished = false;
    forEachFieldPlayer(wallNow, (p, st) => {
      if (applyMotion(p, st, wallNow)) return;
      st.idleTicks = (Number(st.idleTicks) || 0) + 1;
      const idle = idleMs(st, wallNow);
      if (punished) {
        if (idle >= config.afkWarnMs && !st.warned) {
          st.warned = true;
          room.sendAnnouncement(
            `⚠️ ${p.name}, mexa-se — faltam ${afkRemainSec()}s para AFK.`,
            p.id,
            0xf1c40f,
            "bold",
            2
          );
        }
        return;
      }
      if (punishIdle(p, idle)) punished = true;
    });
    maybeReserveSlots(wallNow);
  }

  /**
   * Fallback de 1s: só olha o relógio. NÃO compara posição —
   * 1s de deriva do disco passava de 1.5 e zerava o AFK na VM.
   * No máx. 1 auto-AFK por chamada (evita cascata).
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
    if (wallNow < unpauseGraceUntil) {
      ensureReserveSlots(wallNow);
      return;
    }

    let punished = false;
    forEachFieldPlayer(wallNow, (p, st) => {
      const idle = idleMs(st, wallNow);
      if (punished) {
        if (idle >= config.afkWarnMs && !st.warned) {
          st.warned = true;
          room.sendAnnouncement(
            `⚠️ ${p.name}, mexa-se — faltam ${afkRemainSec()}s para AFK.`,
            p.id,
            0xf1c40f,
            "bold",
            2
          );
        }
        return;
      }
      if (punishIdle(p, idle)) punished = true;
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
    fieldTeam,
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
    /** Tecla: só zera AFK se o disco estiver andando (linha reta conta). */
    noteActivity(player, wallNow = Date.now()) {
      if (!player?.id || afks.has(player.id)) return;
      if (!state.has(player.id)) touch(player.id, wallNow);
      const st = state.get(player.id);
      st.lastInputAt = wallNow;
      applyMotion(player, st, wallNow);
    },
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
  isWalkingSpeed,
  INPUT_WINDOW_MS,
  IDLE_BEFORE_PUSH_MS,
  MOVE_EPS: BUMP_EPS,
  BUMP_EPS,
  SPEED_EPS,
  WALK_DELTA_EPS,
  TICK_HZ,
};

const config = require("../config");
const { kickReason } = require("../utils");

function fieldPlayerCount(players) {
  return (players || []).filter((p) => p.id !== 0 && p.team !== 0).length;
}

/** Treino solo (1 em campo) não pune; 1v1, 2v2, 3v3 e 4v4 sim. */
function shouldCountAutoAfk(players) {
  return fieldPlayerCount(players) >= 2;
}

/** Haxball: onGameTick = 60 Hz. */
const TICK_HZ = 60;
const MS_PER_TICK = 1000 / TICK_HZ;

function afkRemainSec() {
  const remain = Number(config.afkActionMs) - Number(config.afkWarnMs);
  return Math.max(1, Math.ceil(remain / 1000));
}

/**
 * AFK: estilo haxballx7 — incrementa no tick, zera só com onPlayerActivity (tecla).
 * 11s aviso, 15s spec. Pausa congela; spec não auto-AFK; !afk voluntário.
 */
function createAfkTracker(room, opts = {}) {
  /** @type {Map<number, { lastActive: number, warned: boolean, idleTicks: number }>} */
  const state = new Map();
  /** @type {Map<number, { since: number, fieldTeam: number }>} */
  const afks = new Map();
  let paused = false;
  let pauseAt = 0;
  let unpauseGraceUntil = 0;
  let reserveCheckTicks = 0;
  let onStateChange = null;
  const shouldAutoAfk = typeof opts.shouldAutoAfk === "function" ? opts.shouldAutoAfk : () => true;
  const onFieldMove = typeof opts.onFieldMove === "function" ? opts.onFieldMove : null;

  function effectiveNow(wallNow = Date.now()) {
    if (paused && pauseAt) return pauseAt;
    return wallNow;
  }

  function blankState(now) {
    return { lastActive: now, warned: false, idleTicks: 0 };
  }

  function touch(playerId, wallNow = Date.now()) {
    if (afks.has(playerId)) return;
    const cur = state.get(playerId) || blankState(wallNow);
    cur.lastActive = wallNow;
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

  function markAfk(playerId, at = Date.now(), fieldTeam = 0) {
    if (!afks.has(playerId)) {
      afks.set(playerId, { since: at, fieldTeam: fieldTeam || 0 });
    }
  }

  function fieldTeam(playerId) {
    return afks.get(playerId)?.fieldTeam || 0;
  }

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
      onEach(p, state.get(p.id));
    }
  }

  function softResetIdle(wallNow = Date.now()) {
    for (const st of state.values()) {
      st.lastActive = wallNow;
      st.idleTicks = 0;
      st.warned = false;
    }
  }

  function resetClocks(wallNow = Date.now()) {
    pauseAt = 0;
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
        for (const st of state.values()) {
          st.idleTicks = 0;
        }
      }
      paused = true;
      return;
    }
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

  function idleMsFromTicks(st) {
    return (Number(st.idleTicks) || 0) * MS_PER_TICK;
  }

  function idleMsFromWall(st, wallNow) {
    return wallNow - st.lastActive;
  }

  function idleMsForGameTick(st, wallNow) {
    return Math.max(idleMsFromTicks(st), idleMsFromWall(st, wallNow));
  }

  function processFieldIdle(wallNow) {
    let punished = false;
    forEachFieldPlayer(wallNow, (p, st) => {
      st.idleTicks = (Number(st.idleTicks) || 0) + 1;
      const idle = idleMsForGameTick(st, wallNow);
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
  }

  function noteGameTick(wallNow = Date.now()) {
    if (!shouldAutoAfk() || !scoresLive()) {
      maybeReserveSlots(wallNow);
      return;
    }
    if (paused) {
      maybeReserveSlots(wallNow);
      return;
    }
    if (wallNow < unpauseGraceUntil) {
      maybeReserveSlots(wallNow);
      return;
    }
    processFieldIdle(wallNow);
    maybeReserveSlots(wallNow);
  }

  /** Fallback de 1s quando o host não entrega ticks estáveis. */
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
      const idle = idleMsFromWall(st, wallNow);
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

  function notePositionsReset() {}

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
    sampleMovement() {},
    notePositionsReset,
    resetClocks,
    setOnStateChange(handler) {
      onStateChange = typeof handler === "function" ? handler : null;
    },
    setPaused,
    isPaused: () => paused,
    effectiveNow,
    tick,
    noteGameTick,
    noteActivity(player, wallNow = Date.now()) {
      if (!player?.id || afks.has(player.id)) return;
      if (!state.has(player.id)) touch(player.id, wallNow);
      else touch(player.id, wallNow);
      if (player.team !== 0) onFieldMove?.(player.id);
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
  TICK_HZ,
};

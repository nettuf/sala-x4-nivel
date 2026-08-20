const config = require("../config");
const { kickReason } = require("../utils");

function fieldPlayerCount(players) {
  return (players || []).filter((p) => p.id !== 0 && p.team !== 0).length;
}

/** Treino solo (1 em campo) não pune; 1v1, 2v2, 3v3 e 4v4 sim. */
function shouldCountAutoAfk(players) {
  return fieldPlayerCount(players) >= 2;
}

/** Distância mínima (unidades do mapa) para contar como o jogador andando, não empurrão. */
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

/**
 * AFK é um estado só, venha do !afk ou de ficar parado em campo:
 * sai da fila do pick, ninguém escolhe, admin não consegue colocar em campo.
 * Só sai com !afk do próprio jogador — ou kick, se a sala encher.
 */
function createAfkTracker(room, opts = {}) {
  /** @type {Map<number, { lastActive: number, warned: boolean }>} */
  const state = new Map();
  /** @type {Map<number, number>} id → AFK desde quando (para kickar o mais antigo) */
  const afks = new Map();
  /** @type {Map<number, { x: number, y: number }>} última posição do boneco */
  const positions = new Map();
  let paused = false;
  let counting = true;
  let onStateChange = null;
  const shouldAutoAfk = typeof opts.shouldAutoAfk === "function" ? opts.shouldAutoAfk : () => true;

  function touch(playerId, now = Date.now()) {
    if (afks.has(playerId)) return;
    const cur = state.get(playerId) || { lastActive: now, warned: false };
    cur.lastActive = now;
    cur.warned = false;
    state.set(playerId, cur);
  }

  function remove(playerId) {
    state.delete(playerId);
    afks.delete(playerId);
    positions.delete(playerId);
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
    // Se um admin pausou o jogo, o bot não pode despausar por conta própria.
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

  function discOf(playerId) {
    try {
      return typeof room.getPlayerDiscProperties === "function"
        ? room.getPlayerDiscProperties(playerId)
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Quem move o boneco está ativo. Só teclar (chat, mira) não conta:
   * é isso que faz o "parado em campo" virar AFK de verdade.
   */
  function sampleMovement(now = Date.now()) {
    if (paused || !counting) return;
    for (const p of humans()) {
      if (p.team === 0 || afks.has(p.id)) {
        positions.delete(p.id);
        continue;
      }
      const disc = discOf(p.id);
      if (!disc || typeof disc.x !== "number") continue;
      const next = { x: disc.x, y: disc.y };
      const prev = positions.get(p.id);
      if (!prev) {
        positions.set(p.id, next);
        continue;
      }
      if (hasMoved(prev, next)) {
        positions.set(p.id, next);
        touch(p.id, now);
      }
    }
  }

  /** O AFK que está esperando há mais tempo. */
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

  /**
   * Se faltam 5 vagas (ou menos), kicka o AFK mais antigo até sobrar espaço.
   * AFKs extras ficam.
   */
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

  /** Jogo pausado não conta como inatividade (evita kick injusto). */
  function setPaused(on) {
    paused = !!on;
    if (!paused) {
      positions.clear();
      for (const p of room.getPlayerList()) {
        if (p.id !== 0) touch(p.id);
      }
    }
  }

  /** Após gol, até o kickoff: não incrementa AFK (FC countAFK). */
  function setCounting(on) {
    counting = !!on;
    if (counting) {
      positions.clear();
      for (const p of room.getPlayerList()) {
        if (p.id !== 0) touch(p.id);
      }
    }
  }

  function tick(now = Date.now()) {
    if (paused || !counting) {
      ensureReserveSlots();
      return;
    }
    if (!shouldAutoAfk()) {
      ensureReserveSlots();
      return;
    }
    // Só em partida: no choose/lobby parado não conta.
    if (typeof room.getScores === "function" && !room.getScores()) {
      ensureReserveSlots();
      return;
    }
    const full = playingCount() >= config.afkFullThreshold;
    for (const p of room.getPlayerList()) {
      if (p.id === 0) continue;
      if (afks.has(p.id)) {
        if (p.team !== 0) sendToSpec(p.id, { pause: false });
        continue;
      }
      // Spec não ocupa uma vaga em jogo e não recebe punição automática.
      if (p.team === 0) continue;
      if (!state.has(p.id)) touch(p.id);
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
        // Sem pausar: pause/unpause dispara setPaused(false) e zera o timer de todo mundo.
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
  // Não impede o processo de encerrar (testes / PM2 restart limpo)
  if (typeof interval.unref === "function") interval.unref();

  return {
    touch,
    remove,
    isAfk,
    setAfk,
    ensureReserveSlots,
    sampleMovement,
    setOnStateChange(handler) {
      onStateChange = typeof handler === "function" ? handler : null;
    },
    setPaused,
    setCounting,
    isPaused: () => paused,
    isCounting: () => counting,
    tick,
    stop() {
      clearInterval(interval);
    },
  };
}

module.exports = { createAfkTracker, fieldPlayerCount, shouldCountAutoAfk, hasMoved, MOVE_EPS };

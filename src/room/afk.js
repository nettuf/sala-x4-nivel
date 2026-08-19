const config = require("../config");

function fieldPlayerCount(players) {
  return (players || []).filter((p) => p.id !== 0 && p.team !== 0).length;
}

/** Treino solo (1 em campo) não pune; 1v1+ e 4v4 sim. */
function shouldCountAutoAfk(players) {
  return fieldPlayerCount(players) >= 2;
}

function hasMoved(prev, next, eps = 0.5) {
  if (!prev || !next) return false;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  return dx * dx + dy * dy >= eps * eps;
}

/**
 * AFK automático + AFK voluntário (!afk para entrar e sair).
 */
function createAfkTracker(room, opts = {}) {
  /** @type {Map<number, { lastActive: number, warned: boolean }>} */
  const state = new Map();
  /** @type {Set<number>} */
  const voluntary = new Set();
  let paused = false;
  let counting = true;
  let onStateChange = null;
  const shouldAutoAfk = typeof opts.shouldAutoAfk === "function" ? opts.shouldAutoAfk : () => true;

  function touch(playerId) {
    if (voluntary.has(playerId)) return;
    const cur = state.get(playerId) || { lastActive: Date.now(), warned: false };
    cur.lastActive = Date.now();
    cur.warned = false;
    state.set(playerId, cur);
  }

  function remove(playerId) {
    state.delete(playerId);
    voluntary.delete(playerId);
  }

  function isVoluntary(playerId) {
    return voluntary.has(playerId);
  }

  function sendToSpec(playerId) {
    const inGame = typeof room.getScores === "function" && !!room.getScores();
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

  function setVoluntary(player, on) {
    const previousTeam = player.team;
    if (on) {
      voluntary.add(player.id);
      if (player.team !== 0) sendToSpec(player.id);
      room.sendAnnouncement(`${player.name} está AFK (!afk para voltar)`, null, 0xbdc3c7, "normal", 1);
    } else {
      voluntary.delete(player.id);
      touch(player.id);
      room.sendAnnouncement(`${player.name} voltou do AFK`, null, 0x2ecc71, "normal", 1);
    }
    onStateChange?.({
      type: on ? "voluntary-afk" : "back",
      player,
      previousTeam,
    });
  }

  function clearVoluntary(playerId) {
    voluntary.delete(playerId);
    touch(playerId);
  }

  function playingCount() {
    return room.getPlayerList().filter((p) => p.id !== 0).length;
  }

  /** Jogo pausado não conta como inatividade (evita kick injusto). */
  function setPaused(on) {
    paused = !!on;
    if (!paused) {
      for (const p of room.getPlayerList()) {
        if (p.id !== 0) touch(p.id);
      }
    }
  }

  /** Após gol, até o kickoff: não incrementa AFK (FC countAFK). */
  function setCounting(on) {
    counting = !!on;
    if (counting) {
      for (const p of room.getPlayerList()) {
        if (p.id !== 0) touch(p.id);
      }
    }
  }

  function tick(now = Date.now()) {
    if (paused || !counting) return;
    if (!shouldAutoAfk()) return;
    const full = playingCount() >= config.afkFullThreshold;
    for (const p of room.getPlayerList()) {
      if (p.id === 0) continue;
      if (voluntary.has(p.id)) {
        if (p.team !== 0) sendToSpec(p.id);
        continue;
      }
      // Spec não ocupa uma vaga em jogo e não recebe punição automática.
      if (p.team === 0) continue;
      if (!state.has(p.id)) touch(p.id);
      const st = state.get(p.id);
      const idle = now - st.lastActive;

      if (idle >= config.afkWarnMs && !st.warned) {
        st.warned = true;
        room.sendAnnouncement(
          `⚠️ ${p.name}, mexa-se — faltam 5s para AFK.`,
          p.id,
          0xf1c40f,
          "bold",
          2
        );
      }

      if (idle < config.afkActionMs) continue;

      if (full) {
        onStateChange?.({ type: "kick", player: p, previousTeam: p.team });
        room.kickPlayer(p.id, "AFK (sala cheia)", false);
        remove(p.id);
      } else if (p.team !== 0) {
        const previousTeam = p.team;
        voluntary.add(p.id);
        sendToSpec(p.id);
        room.sendAnnouncement(
          `${p.name} movido para spect por AFK. Use !afk para voltar à fila.`,
          null,
          0xe67e22,
          "normal",
          1
        );
        onStateChange?.({ type: "auto-afk", player: p, previousTeam });
      }
    }
  }

  const interval = setInterval(tick, 1000);
  // Não impede o processo de encerrar (testes / PM2 restart limpo)
  if (typeof interval.unref === "function") interval.unref();

  return {
    touch,
    remove,
    isVoluntary,
    clearVoluntary,
    setVoluntary,
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

module.exports = { createAfkTracker, fieldPlayerCount, shouldCountAutoAfk, hasMoved };

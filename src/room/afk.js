const config = require("../config");

/**
 * AFK automático + AFK voluntário (!afk / !back).
 */
function createAfkTracker(room) {
  /** @type {Map<number, { lastActive: number, warned: boolean }>} */
  const state = new Map();
  /** @type {Set<number>} */
  const voluntary = new Set();
  let paused = false;
  let counting = true;
  let onStateChange = null;

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

  function setVoluntary(player, on) {
    const previousTeam = player.team;
    if (on) {
      voluntary.add(player.id);
      if (player.team !== 0) room.setPlayerTeam(player.id, 0);
      room.sendAnnouncement(`${player.name} está AFK (!back para voltar)`, null, 0xbdc3c7, "normal", 1);
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

  function tick() {
    if (paused || !counting) return;
    const now = Date.now();
    const full = playingCount() >= config.afkFullThreshold;
    for (const p of room.getPlayerList()) {
      if (p.id === 0) continue;
      if (voluntary.has(p.id)) {
        if (p.team !== 0) room.setPlayerTeam(p.id, 0);
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
          `⚠️ ${p.name}, mexa-se ou será tratado como AFK.`,
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
        room.setPlayerTeam(p.id, 0);
        room.sendAnnouncement(
          `${p.name} movido para spect por AFK. Use !back para voltar à fila.`,
          null,
          0xe67e22,
          "normal",
          1
        );
        onStateChange?.({ type: "auto-afk", player: p, previousTeam });
      }
    }
  }

  const interval = setInterval(tick, 5000);
  // Não impede o processo de encerrar (testes / PM2 restart limpo)
  if (typeof interval.unref === "function") interval.unref();

  return {
    touch,
    remove,
    isVoluntary,
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

module.exports = { createAfkTracker };

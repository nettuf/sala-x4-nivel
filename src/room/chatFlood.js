/**
 * Flood no chat: 4 mensagens públicas em 5s → mute 30s.
 */

function createChatFloodGuard({
  limit = 4,
  windowMs = 5000,
  muteMs = 30000,
} = {}) {
  /** @type {Map<number, number[]>} */
  const stamps = new Map();

  function forget(playerId) {
    stamps.delete(playerId);
  }

  /**
   * Registra uma mensagem pública.
   * @returns {{ muted: true, endsAt: number } | null}
   */
  function note(playerId, now = Date.now()) {
    const cut = now - windowMs;
    const prev = (stamps.get(playerId) || []).filter((t) => t > cut);
    prev.push(now);
    if (prev.length < limit) {
      stamps.set(playerId, prev);
      return null;
    }
    stamps.delete(playerId);
    return { muted: true, endsAt: now + muteMs };
  }

  return { note, forget };
}

module.exports = { createChatFloodGuard };

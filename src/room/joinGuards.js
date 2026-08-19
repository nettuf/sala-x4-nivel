const config = require("../config");
const { kickReason } = require("../utils");

/**
 * Proteções de entrada usadas pelos bots headless de referência:
 * - ghost kick: mesma `auth` já na sala (reconexão / aba duplicada)
 * - limite de conexões por `conn` (mesma máquina/IP)
 *
 * Funções puras para poder testar sem haxball.js.
 */

/** @returns {object[]} jogadores antigos com a mesma auth */
function duplicateAuthPlayers(players, player) {
  if (!player?.auth) return [];
  return players.filter((p) => p.id !== player.id && p.id !== 0 && p.auth === player.auth);
}

/** @returns {object[]} jogadores antigos com a mesma conn (inclui o novo) */
function sameConnPlayers(players, player) {
  if (!player?.conn) return [];
  return players.filter((p) => p.id !== 0 && p.conn === player.conn);
}

/**
 * @returns {{ action: "ghost-kick"|"conn-limit"|"ok", ghosts: object[], reason?: string }}
 */
function evaluateJoin(players, player, { maxPerConn = config.maxPerConn, ghostKick = config.ghostKick } = {}) {
  const ghosts = duplicateAuthPlayers(players, player);
  if (ghostKick && ghosts.length) {
    return { action: "ghost-kick", ghosts, reason: "Ghost kick (reconexão)" };
  }

  const sameConn = sameConnPlayers(players, player);
  if (maxPerConn > 0 && sameConn.length > maxPerConn) {
    return {
      action: "conn-limit",
      ghosts: [],
      reason: `Limite de ${maxPerConn} jogadores por conexão`,
    };
  }

  return { action: "ok", ghosts: [] };
}

/**
 * Aplica as proteções na sala. O novo jogador herda o time do ghost
 * para não quebrar times no meio da partida.
 * @returns {"ghost-kick"|"conn-limit"|"ok"}
 */
function applyJoinGuards(room, player, opts = {}) {
  const players = room.getPlayerList();
  const result = evaluateJoin(players, player, opts);

  if (result.action === "ghost-kick") {
    for (const ghost of result.ghosts) {
      room.kickPlayer(ghost.id, kickReason(result.reason), false);
      if (ghost.team && ghost.team !== 0) {
        room.setPlayerTeam(player.id, ghost.team);
      }
    }
    return "ghost-kick";
  }

  if (result.action === "conn-limit") {
    room.kickPlayer(player.id, kickReason(result.reason), false);
    return "conn-limit";
  }

  return "ok";
}

module.exports = {
  duplicateAuthPlayers,
  sameConnPlayers,
  evaluateJoin,
  applyJoinGuards,
};

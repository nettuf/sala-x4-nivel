const { kickReason } = require("../utils");

const DUPLICATE_REASON = "Você já está na sala (uma conexão por vez)";

/** @returns {object[]} jogadores antigos com a mesma auth */
function duplicateAuthPlayers(players, player) {
  if (!player?.auth) return [];
  return players.filter((p) => p.id !== player.id && p.id !== 0 && p.auth === player.auth);
}

/** @returns {object[]} jogadores antigos com a mesma conn */
function duplicateConnPlayers(players, player) {
  if (!player?.conn) return [];
  return players.filter((p) => p.id !== player.id && p.id !== 0 && p.conn === player.conn);
}

/** @returns {object[]} jogadores com a mesma conn (inclui o novo) */
function sameConnPlayers(players, player) {
  if (!player?.conn) return [];
  return players.filter((p) => p.id !== 0 && p.conn === player.conn);
}

/** @returns {{ action: "duplicate"|"ok", reason?: string }} */
function evaluateJoin(players, player) {
  if (duplicateAuthPlayers(players, player).length) {
    return { action: "duplicate", reason: DUPLICATE_REASON };
  }
  if (duplicateConnPlayers(players, player).length) {
    return { action: "duplicate", reason: DUPLICATE_REASON };
  }
  return { action: "ok" };
}

/** @returns {"duplicate"|"ok"} */
function applyJoinGuards(room, player) {
  const result = evaluateJoin(room.getPlayerList(), player);
  if (result.action === "duplicate") {
    room.kickPlayer(player.id, kickReason(result.reason), false);
    return "duplicate";
  }
  return "ok";
}

module.exports = {
  duplicateAuthPlayers,
  duplicateConnPlayers,
  sameConnPlayers,
  evaluateJoin,
  applyJoinGuards,
};

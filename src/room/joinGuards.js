const { connToIp, kickReason } = require("../utils");

const DUPLICATE_AUTH_REASON = "Esta autenticação já está na sala";
const IP_LIMIT_REASON = "Limite de 2 jogadores por IP atingido";

/** @returns {object[]} jogadores antigos com a mesma auth */
function duplicateAuthPlayers(players, player) {
  if (!player?.auth) return [];
  return players.filter((p) => p.id !== player.id && p.id !== 0 && p.auth === player.auth);
}

/** @returns {object[]} jogadores com o mesmo IP (inclui o novo) */
function sameIpPlayers(players, player) {
  const ip = connToIp(player?.conn);
  if (!ip) return [];
  return players.filter((p) => p.id !== 0 && connToIp(p.conn) === ip);
}

/** @returns {{ action: "duplicate"|"ok", reason?: string }} */
function evaluateJoin(players, player) {
  if (duplicateAuthPlayers(players, player).length) {
    return { action: "duplicate", reason: DUPLICATE_AUTH_REASON };
  }
  if (sameIpPlayers(players, player).length > 2) {
    return { action: "duplicate", reason: IP_LIMIT_REASON };
  }
  return { action: "ok" };
}

/** @returns {"duplicate"|"ok"} */
function applyJoinGuards(room, player, identify = (p) => p, onReject = null) {
  const players = room.getPlayerList().map((p) => identify(p) || p);
  const result = evaluateJoin(players, player);
  if (result.action === "duplicate") {
    if (typeof onReject === "function") onReject(result);
    room.kickPlayer(player.id, kickReason(result.reason), false);
    return "duplicate";
  }
  return "ok";
}

module.exports = {
  duplicateAuthPlayers,
  sameIpPlayers,
  evaluateJoin,
  applyJoinGuards,
};

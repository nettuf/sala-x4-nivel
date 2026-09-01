const { TEAM } = require("./choose");

/**
 * Meio do próprio lado: entre o gol e a linha de centro (Haxbook x3/x4).
 * Vermelho = x negativo; azul = x positivo.
 */
const HALF_FIELD_X = {
  x4: 350,
  x3: 268,
  training: 175,
};

function halfFieldX(stadiumKind, team) {
  const half = HALF_FIELD_X[stadiumKind] || HALF_FIELD_X.x4;
  return team === TEAM.BLUE ? half : -half;
}

function spawnProps(stadiumKind, team) {
  return { x: halfFieldX(stadiumKind, team), y: 0, xspeed: 0, yspeed: 0 };
}

/** Spec sem time: lado com menos gente em campo (mais provável de repor). */
function preferredSpecSide(room) {
  if (!room || typeof room.getPlayerList !== "function") return TEAM.RED;
  const players = room.getPlayerList().filter((p) => p.id !== 0);
  const red = players.filter((p) => p.team === TEAM.RED).length;
  const blue = players.filter((p) => p.team === TEAM.BLUE).length;
  if (red < blue) return TEAM.RED;
  if (blue < red) return TEAM.BLUE;
  return TEAM.RED;
}

function placementTeam(player, room) {
  if (!player) return null;
  if (player.team === TEAM.RED || player.team === TEAM.BLUE) return player.team;
  if (player.team === TEAM.SPEC) return preferredSpecSide(room);
  return null;
}

function placeMidgameDisc(room, playerId, stadiumKind = "x4") {
  if (!room || playerId == null) return false;
  if (typeof room.setPlayerDiscProperties !== "function") return false;
  try {
    const p = typeof room.getPlayer === "function" ? room.getPlayer(playerId) : null;
    const team = placementTeam(p, room);
    if (!team) return false;
    room.setPlayerDiscProperties(playerId, spawnProps(stadiumKind, team));
    return true;
  } catch {
    return false;
  }
}

/** Haxball posiciona o disco depois do join — um tick evita sobrescrever e perder. */
function scheduleMidgameDisc(room, playerId, stadiumKind = "x4", delayMs = 50) {
  const timer = setTimeout(() => placeMidgameDisc(room, playerId, stadiumKind), delayMs);
  if (typeof timer.unref === "function") timer.unref();
}

module.exports = {
  placeMidgameDisc,
  scheduleMidgameDisc,
  halfFieldX,
  spawnProps,
  preferredSpecSide,
  HALF_FIELD_X,
};

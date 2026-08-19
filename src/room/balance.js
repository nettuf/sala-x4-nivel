const config = require("../config");
const { TEAM } = require("./choose");

/**
 * Warmup: com 2–7 jogadores, balanceia e joga sem choose.
 * Com 8+, o choose cuida.
 */
function warmupBalanceAndStart(room, match) {
  if (room.getScores()) return;
  if (match.isRunning()) return;

  const players = room.getPlayerList().filter((p) => p.id !== 0);
  const need = config.teamSize * 2;
  if (players.length >= need) return; // choose mode
  if (players.length < 2) {
    if (room.getScores()) room.stopGame();
    return;
  }

  const red = players.filter((p) => p.team === TEAM.RED);
  const blue = players.filter((p) => p.team === TEAM.BLUE);
  const specs = players.filter((p) => p.team === TEAM.SPEC);

  while (specs.length) {
    const next = specs.shift();
    if (red.length <= blue.length) {
      room.setPlayerTeam(next.id, TEAM.RED);
      red.push(next);
    } else {
      room.setPlayerTeam(next.id, TEAM.BLUE);
      blue.push(next);
    }
  }

  const r = room.getPlayerList().filter((p) => p.team === TEAM.RED).length;
  const b = room.getPlayerList().filter((p) => p.team === TEAM.BLUE).length;
  if (r >= 1 && b >= 1) {
    match.start();
  }
}

module.exports = { warmupBalanceAndStart };

const { TEAM } = require("./choose");
const config = require("../config");

/**
 * Streak + winner stays (Wazarr/Fazendão):
 * - Vermelho ganha → streak++ e azul vai pro spec
 * - Azul ganha → vencedores vão pro vermelho, streak = 1
 * - Empate → zera streak e reseta times
 */

function createStreakTracker() {
  let streak = 0;

  function get() {
    return streak;
  }

  function reset() {
    streak = 0;
  }

  /**
   * @param {1|2|0} winner
   * @returns {number} streak atual após update
   */
  function recordWin(winner) {
    if (winner === TEAM.RED) {
      streak += 1;
    } else if (winner === TEAM.BLUE) {
      streak = 1;
    } else {
      streak = 0;
    }
    return streak;
  }

  function label() {
    if (streak <= 0) return "sem streak";
    return `streak ${streak}`;
  }

  return { get, reset, recordWin, label };
}

/**
 * Monta o campo pós-partida para choose: vencedores no vermelho + 1º spec no azul.
 * @returns {{ mode: "choose"|"reset", streak: number }}
 */
function applyWinnerStays(room, winner, streakTracker, { isExcluded } = {}) {
  const players = room.getPlayerList().filter((p) => p.id !== 0);
  const red = players.filter((p) => p.team === TEAM.RED);
  const blue = players.filter((p) => p.team === TEAM.BLUE);

  const nextStreak = streakTracker.recordWin(winner);

  if (winner === TEAM.RED) {
    for (const p of blue) room.setPlayerTeam(p.id, TEAM.SPEC);
    room.sendAnnouncement(
      `✨ Vermelho venceu! Ficam no campo · ${streakTracker.label()}`,
      null,
      0xe74c3c,
      "bold",
      2
    );
  } else if (winner === TEAM.BLUE) {
    for (const p of red) room.setPlayerTeam(p.id, TEAM.SPEC);
    const bluesNow = room.getPlayerList().filter((p) => p.team === TEAM.BLUE);
    for (const p of bluesNow) room.setPlayerTeam(p.id, TEAM.RED);
    room.sendAnnouncement(
      `✨ Azul venceu! Vão para o vermelho · ${streakTracker.label()}`,
      null,
      0x3498db,
      "bold",
      2
    );
  } else {
    for (const p of players) room.setPlayerTeam(p.id, TEAM.SPEC);
    room.sendAnnouncement("💤 Empate — times resetados.", null, 0xbdc3c7, "bold", 2);
    return { mode: "reset", streak: nextStreak };
  }

  // Capitao adversário: 1º elegível do spec → azul
  const specs = room
    .getPlayerList()
    .filter((p) => p.team === TEAM.SPEC && p.id !== 0 && !(typeof isExcluded === "function" && isExcluded(p)));
  if (specs.length) {
    room.setPlayerTeam(specs[0].id, TEAM.BLUE);
  }

  return { mode: "choose", streak: nextStreak };
}

function shouldUseWinnerStays(playerCount, valid, winner) {
  if (!valid) return false;
  if (playerCount < config.teamSize * 2) return false;
  // empate também usa apply (reset); winner 0 ok
  return winner === 0 || winner === 1 || winner === 2;
}

module.exports = {
  createStreakTracker,
  applyWinnerStays,
  shouldUseWinnerStays,
};

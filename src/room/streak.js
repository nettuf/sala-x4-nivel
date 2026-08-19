const { TEAM } = require("./choose");
const config = require("../config");

/**
 * Streak + winner stays:
 * - Vermelho ganha → streak++ e azul vai pro spec
 * - Azul ganha → vencedores vão pro vermelho, streak = 1
 * - Empate não existe no 4v4 (gol de ouro); os times nunca zeram.
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
 * @returns {{ mode: "choose"|"keep", streak: number }}
 */
function applyWinnerStays(room, winner, streakTracker, { isExcluded } = {}) {
  const players = room.getPlayerList().filter((p) => p.id !== 0);
  const eligible = (p) =>
    p && p.id !== 0 && !(typeof isExcluded === "function" && isExcluded(p));

  // Quem já estava no spec (1º da fila) vira capitão — não o 1º perdedor na ordem da sala.
  const waitingSpecs = players.filter((p) => p.team === TEAM.SPEC && eligible(p));
  const red = players.filter((p) => p.team === TEAM.RED);
  const blue = players.filter((p) => p.team === TEAM.BLUE);

  if (winner !== TEAM.RED && winner !== TEAM.BLUE) {
    return { mode: "keep", streak: streakTracker.get() };
  }

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
  }

  const specsNow = room
    .getPlayerList()
    .filter((p) => p.team === TEAM.SPEC && eligible(p));
  const captain = waitingSpecs[0] || specsNow[0];
  if (captain) room.setPlayerTeam(captain.id, TEAM.BLUE);

  return { mode: "choose", streak: nextStreak };
}

function shouldUseWinnerStays(playerCount, valid, winner) {
  if (winner !== TEAM.RED && winner !== TEAM.BLUE) return false;
  if (playerCount < 2) return false;
  // 4v4 oficial: só depois de partida válida. 1v1/2v2/3v3 (warmup) rotaciona mesmo sem stats.
  if (playerCount >= config.teamSize * 2) return !!valid;
  return true;
}

module.exports = {
  createStreakTracker,
  applyWinnerStays,
  shouldUseWinnerStays,
};

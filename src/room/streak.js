const { TEAM } = require("./choose");
const config = require("../config");

/**
 * Streak + winner stays:
 * - Vermelho ganha → streak++ e azul vai pro spec
 * - Azul ganha → vencedores vão pro vermelho, streak = 1
 * - Empate não existe no 4v4 (gol de ouro); os times nunca zeram.
 */

function createStreakTracker({ best = 0, onBest } = {}) {
  let streak = 0;
  let bestStreak = Math.max(0, Math.floor(Number(best) || 0));

  function get() {
    return streak;
  }

  function getBest() {
    return bestStreak;
  }

  function hydrateBest(n) {
    const v = Math.max(0, Math.floor(Number(n) || 0));
    if (v > bestStreak) bestStreak = v;
  }

  function reset() {
    streak = 0;
  }

  function maybeRecordBest() {
    if (streak <= bestStreak) return;
    bestStreak = streak;
    if (typeof onBest === "function") onBest(bestStreak);
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
    maybeRecordBest();
    return streak;
  }

  function label() {
    if (streak <= 0) return "sem streak";
    return `streak ${streak}`;
  }

  return { get, getBest, hydrateBest, reset, recordWin, label };
}

function formatCurrentStreak(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return v > 0 ? `🔁 Streak atual: ${v} (vencedores no vermelho)` : "🔁 Sem streak no momento.";
}

function formatBestStreak(best, current = 0) {
  const rec = Math.max(0, Math.floor(Number(best) || 0));
  const now = Math.max(0, Math.floor(Number(current) || 0));
  if (rec <= 0) return "🏆 Sem recorde de streak ainda.";
  const live = now > 0 && now >= rec ? " (em andamento)" : "";
  return `🏆 Maior streak da sala: ${rec}${live}`;
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
  formatCurrentStreak,
  formatBestStreak,
};

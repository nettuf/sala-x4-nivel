const config = require("../config");
const { planWarmup, applyWarmupMoves } = require("./warmupFlow");

/**
 * Compatibilidade/testes: aplica o mesmo plano incremental do lobby real.
 * Com 8+, o choose cuida.
 */
function warmupBalanceAndStart(room, match) {
  if (room.getScores()) return;
  if (match.isRunning()) return;

  const players = room.getPlayerList().filter((p) => p.id !== 0);
  const need = config.teamSize * 2;
  if (players.length >= need) return; // choose mode
  const plan = planWarmup(players);
  if (!plan.eligibleCount || plan.replacementTeam) return;
  applyWarmupMoves(room, plan);
  if (plan.shouldStart) match.start({ competitive: false });
}

module.exports = { warmupBalanceAndStart };

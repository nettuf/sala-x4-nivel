const { TEAM } = require("./choose");

function planCompetitiveRecovery({
  redCount,
  blueCount,
  specCount,
  teamSize = 4,
  live = true,
} = {}) {
  if (redCount === teamSize && blueCount === teamSize) {
    return { action: "none" };
  }

  const targetTeam = redCount < blueCount ? TEAM.RED : TEAM.BLUE;
  const deficit = Math.abs(redCount - blueCount);

  if (live) {
    if (redCount === blueCount) {
      const missingPerTeam = teamSize - redCount;
      if (missingPerTeam > 0 && specCount >= missingPerTeam * 2) {
        return {
          action: "fill-pairs",
          targetTeam,
          pairs: missingPerTeam,
          restart: true,
        };
      }
      // 3v3 (ou 2v2) com 0–1 spec: o jogo segue sem reiniciar.
      if (redCount > 0 && redCount < teamSize) {
        return { action: "keep-play" };
      }
      return { action: "rebalance" };
    }

    // Time menor ainda tem gente em campo: repor do spec (1 pick ou vários,
    // se o capitão também caiu AFK e o buraco ficou maior que 1).
    if (Math.min(redCount, blueCount) > 0) {
      if (specCount === 1) {
        return { action: "fill-one", targetTeam };
      }
      if (specCount > 1) {
        return { action: "choose", targetTeam };
      }
    }

    // 4v3 sem spec: o extra do time maior vai ao spec e o 3v3 segue.
    if (
      specCount === 0 &&
      deficit === 1 &&
      Math.min(redCount, blueCount) >= teamSize - 1
    ) {
      return {
        action: "park-larger",
        targetTeam: redCount > blueCount ? TEAM.RED : TEAM.BLUE,
      };
    }

    return { action: "rebalance" };
  }

  const eligible = redCount + blueCount + specCount;
  if (eligible < teamSize * 2) {
    return { action: "rebalance" };
  }

  if (redCount === blueCount) {
    const missingPerTeam = teamSize - redCount;
    if (missingPerTeam > 0 && specCount === missingPerTeam * 2) {
      return {
        action: "fill-pairs",
        targetTeam,
        pairs: missingPerTeam,
        restart: true,
      };
    }
    return { action: "rebalance" };
  }

  if (specCount === 1) {
    return { action: "fill-one", targetTeam, restart: true };
  }

  if (specCount > 1) {
    return { action: "choose", targetTeam, restart: true };
  }

  return { action: "rebalance" };
}

/**
 * Pós-vitória: vencedores ficam.
 * Sem opção extra (spec == vagas) preenche na ordem, sem pick.
 * Se sobra gente, o capitão escolhe. Sem 8 elegíveis, os 4 ficam.
 */
function planExactFill({ redCount, blueCount, specCount, teamSize = 4 } = {}) {
  const redNeed = Math.max(0, teamSize - (Number(redCount) || 0));
  const blueNeed = Math.max(0, teamSize - (Number(blueCount) || 0));
  const need = redNeed + blueNeed;
  if (need === 0) return { action: "start" };
  const eligible =
    (Number(redCount) || 0) + (Number(blueCount) || 0) + (Number(specCount) || 0);
  if (eligible < teamSize * 2) return { action: "keep" };
  if (specCount === need) return { action: "fill-all", redNeed, blueNeed };
  if (specCount > need) return { action: "choose" };
  return { action: "choose" };
}

function applyExactFill(room, specs, { redNeed = 0, blueNeed = 0 } = {}) {
  let i = 0;
  for (let n = 0; n < redNeed; n++) {
    const p = specs[i++];
    if (p) room.setPlayerTeam(p.id, TEAM.RED);
  }
  for (let n = 0; n < blueNeed; n++) {
    const p = specs[i++];
    if (p) room.setPlayerTeam(p.id, TEAM.BLUE);
  }
}

module.exports = { planCompetitiveRecovery, planExactFill, applyExactFill };

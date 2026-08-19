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
        return { action: "fill-pairs", targetTeam, pairs: missingPerTeam };
      }
      return { action: "rebalance" };
    }

    if (specCount === 1 && deficit === 1) {
      return { action: "fill-one", targetTeam };
    }

    if (specCount > 1 && deficit === 1) {
      return { action: "choose", targetTeam };
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

module.exports = { planCompetitiveRecovery };

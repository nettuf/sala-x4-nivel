const { TEAM } = require("./choose");
const { targetTeamSize } = require("../gameLogic");

/** Mesma lógica do choose: não desce 4v4→3v3 no pós-vitória se o time cheio já está em campo. */
function effectiveTeamSize({ redCount = 0, blueCount = 0, eligibleCount = 0, maxSize = 4 } = {}) {
  const cap = Math.max(1, Number(maxSize) || 4);
  const held = Math.max(Number(redCount) || 0, Number(blueCount) || 0, 1);
  const byCount = targetTeamSize(Number(eligibleCount) || 0, cap);
  return Math.min(cap, Math.max(byCount, held));
}

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

    // Time menor ainda tem gente em campo: vagas = opções → auto;
    // mais gente no spec que vagas → capitão escolhe.
    if (Math.min(redCount, blueCount) > 0) {
      const fill = planSpecFill(targetTeam, deficit, specCount);
      if (fill) return fill;
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

  const stopped = planSpecFill(targetTeam, deficit, specCount, { restart: true });
  if (stopped) return stopped;

  return { action: "rebalance" };
}

/**
 * Pós-vitória: vencedores ficam.
 * Só preenche na ordem quando UM time precisa de gente e o spec tem exatamente
 * essas vagas (3 faltando e 3 no spec). Se os dois times ainda têm buraco,
 * os capitães escolhem — nunca auto nos dois lados.
 * Sem 8 elegíveis, os 4 ficam.
 */
function planExactFill({ redCount, blueCount, specCount, teamSize = 4 } = {}) {
  const redNeed = Math.max(0, teamSize - (Number(redCount) || 0));
  const blueNeed = Math.max(0, teamSize - (Number(blueCount) || 0));
  const need = redNeed + blueNeed;
  if (need === 0) return { action: "start" };
  const eligible =
    (Number(redCount) || 0) + (Number(blueCount) || 0) + (Number(specCount) || 0);
  if (eligible < teamSize * 2) return { action: "keep" };
  if (redNeed > 0 && blueNeed > 0) return { action: "choose" };
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

/**
 * Auto-AFK de quem nunca teclou nesta partida (relógio zerado no onGameStart).
 * Vale para treino 1v1–3v3 e 4v4: RR sem stats, depois o capitão escolhe.
 * Empurrão e chute mexem o disco e zeram; tecla no lugar e chat não.
 */
function isKickoffIdleAfk(type, playerId, movedIds, kickoffFieldIds) {
  if (type !== "auto-afk" || playerId == null || movedIds.has(playerId)) return false;
  // Só quem estava em campo no apito: pick/reposição no meio da partida nunca RR.
  if (kickoffFieldIds && kickoffFieldIds.size > 0 && !kickoffFieldIds.has(playerId)) return false;
  return true;
}

/**
 * 1 vaga e 1 no spec → auto. 2 vagas e 2 no spec → auto. Sobra opção → pick.
 */
function planSpecFill(targetTeam, need, specCount, extra = {}) {
  const holes = Number(need) || 0;
  const specs = Number(specCount) || 0;
  if (holes <= 0 || specs <= 0) return null;
  if (specs === holes) {
    return holes === 1
      ? { action: "fill-one", targetTeam, ...extra }
      : { action: "fill-exact", targetTeam, count: holes, ...extra };
  }
  if (specs > holes) return { action: "choose", targetTeam, ...extra };
  return specs === 1
    ? { action: "fill-one", targetTeam, ...extra }
    : { action: "fill-exact", targetTeam, count: specs, ...extra };
}

/**
 * Depois do RR no começo: mantém o formato (2v2 fica 2v2).
 * Vagas = opções no spec → puxa auto. Sobra gente → capitão escolhe.
 * Sem spec, o lobby desce de formato (4v4→3v3).
 */
function planKickoffAfkRecovery({ redCount = 0, blueCount = 0, specCount = 0 } = {}) {
  const formatSize = Math.max(Number(redCount) || 0, Number(blueCount) || 0);
  if (formatSize <= 0) return { action: "refresh" };
  if (redCount === blueCount) {
    return { action: "start", teamSize: formatSize };
  }
  const targetTeam = redCount < blueCount ? TEAM.RED : TEAM.BLUE;
  const need = formatSize - Math.min(Number(redCount) || 0, Number(blueCount) || 0);
  const fill = planSpecFill(targetTeam, need, specCount, { teamSize: formatSize });
  if (!fill) return { action: "refresh" };
  if (fill.action === "choose") {
    return { action: "choose", targetTeam, teamSize: formatSize };
  }
  return {
    action: "fill",
    targetTeam,
    teamSize: formatSize,
    count: fill.count || 1,
  };
}

module.exports = {
  planCompetitiveRecovery,
  planExactFill,
  applyExactFill,
  effectiveTeamSize,
  isKickoffIdleAfk,
  planKickoffAfkRecovery,
  planSpecFill,
};

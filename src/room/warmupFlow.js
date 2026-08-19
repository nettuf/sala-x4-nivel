const { TEAM } = require("./choose");

/**
 * Planeja o lobby de 1–7 jogadores sem alterar a sala.
 *
 * Regras:
 * - 1 elegível: treino no vermelho.
 * - Times iguais + 1 spec: aguarda.
 * - Times iguais + 2+ specs: sobe pares automaticamente.
 * - Time menor + 1 spec: preenche automaticamente.
 * - Time menor + 2+ specs: capitão do time menor escolhe.
 * - Sem spec para preencher: último do time maior desce.
 */
function planWarmup(players, { isExcluded } = {}) {
  const eligible = players
    .filter((p) => p.id !== 0 && !(typeof isExcluded === "function" && isExcluded(p)))
    .map((p) => ({ ...p }));
  const moves = [];

  function move(player, team) {
    if (!player || player.team === team) return;
    player.team = team;
    moves.push({ id: player.id, team });
  }

  function list(team) {
    return eligible.filter((p) => p.team === team);
  }

  if (!eligible.length) {
    return { eligibleCount: 0, moves, replacementTeam: null, shouldStart: false };
  }

  if (eligible.length === 1) {
    move(eligible[0], TEAM.RED);
    return {
      eligibleCount: 1,
      moves,
      replacementTeam: null,
      shouldStart: true,
    };
  }

  // Recupera estados incompletos (ex.: todos no spec após stop/admin).
  if (!list(TEAM.RED).length) {
    move(list(TEAM.SPEC)[0] || list(TEAM.BLUE)[0], TEAM.RED);
  }
  if (!list(TEAM.BLUE).length) {
    move(list(TEAM.SPEC)[0] || list(TEAM.RED).at(-1), TEAM.BLUE);
  }

  // Diferenças maiores que 1: os últimos do time maior descem.
  while (Math.abs(list(TEAM.RED).length - list(TEAM.BLUE).length) > 1) {
    const larger =
      list(TEAM.RED).length > list(TEAM.BLUE).length ? TEAM.RED : TEAM.BLUE;
    move(list(larger).at(-1), TEAM.SPEC);
  }

  let red = list(TEAM.RED);
  let blue = list(TEAM.BLUE);
  let specs = list(TEAM.SPEC);

  if (red.length !== blue.length) {
    const smaller = red.length < blue.length ? TEAM.RED : TEAM.BLUE;

    if (specs.length === 0) {
      const larger = smaller === TEAM.RED ? TEAM.BLUE : TEAM.RED;
      move(list(larger).at(-1), TEAM.SPEC);
    } else if (specs.length === 1) {
      move(specs[0], smaller);
    } else {
      return {
        eligibleCount: eligible.length,
        moves,
        replacementTeam: smaller,
        shouldStart: false,
      };
    }
  }

  // Com times iguais, cada novo par sobe automaticamente.
  red = list(TEAM.RED);
  blue = list(TEAM.BLUE);
  specs = list(TEAM.SPEC);
  while (red.length === blue.length && specs.length >= 2) {
    move(specs[0], TEAM.RED);
    move(specs[1], TEAM.BLUE);
    red = list(TEAM.RED);
    blue = list(TEAM.BLUE);
    specs = list(TEAM.SPEC);
  }

  return {
    eligibleCount: eligible.length,
    moves,
    replacementTeam: null,
    shouldStart:
      eligible.length === 1 ||
      (list(TEAM.RED).length > 0 &&
        list(TEAM.RED).length === list(TEAM.BLUE).length),
  };
}

function applyWarmupMoves(room, plan) {
  for (const move of plan.moves) {
    room.setPlayerTeam(move.id, move.team);
  }
}

module.exports = { planWarmup, applyWarmupMoves };

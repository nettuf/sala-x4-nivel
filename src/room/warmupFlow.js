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
function planWarmup(players, { isExcluded, teamSize = 4 } = {}) {
  const human = (players || []).filter((p) => p.id !== 0);
  const excluded = human.filter((p) => typeof isExcluded === "function" && isExcluded(p));
  const eligible = human
    .filter((p) => !(typeof isExcluded === "function" && isExcluded(p)))
    .map((p) => ({ ...p }));
  const moves = [];

  for (const p of excluded) {
    if (p.team !== TEAM.SPEC) moves.push({ id: p.id, team: TEAM.SPEC });
  }

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

  // Time vencedor completo (4) e o outro não está montado: não desmonta para 2v2/3v3.
  const redN = list(TEAM.RED).length;
  const blueN = list(TEAM.BLUE).length;
  if (eligible.length < teamSize * 2) {
    if (redN >= teamSize && blueN <= 1) {
      for (const p of [...list(TEAM.BLUE)]) move(p, TEAM.SPEC);
      while (list(TEAM.RED).length > teamSize) move(list(TEAM.RED).at(-1), TEAM.SPEC);
      return {
        eligibleCount: eligible.length,
        moves,
        replacementTeam: null,
        shouldStart: false,
      };
    }
    if (blueN >= teamSize && redN <= 1) {
      for (const p of [...list(TEAM.RED)]) move(p, TEAM.SPEC);
      while (list(TEAM.BLUE).length > teamSize) move(list(TEAM.BLUE).at(-1), TEAM.SPEC);
      return {
        eligibleCount: eligible.length,
        moves,
        replacementTeam: null,
        shouldStart: false,
      };
    }
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
  for (const move of plan.moves || []) {
    room.setPlayerTeam(move.id, move.team);
  }
}

/**
 * Primeiro 4v4 a partir de um warmup equilibrado (ex.: 3v3 + specs):
 * só acrescenta nos times, sem resetar para choose.
 */
function planPromoteToX4(players, { isExcluded, teamSize = 4 } = {}) {
  const eligible = (players || [])
    .filter((p) => p.id !== 0 && !(typeof isExcluded === "function" && isExcluded(p)))
    .map((p) => ({ ...p }));
  const red = eligible.filter((p) => p.team === TEAM.RED);
  const blue = eligible.filter((p) => p.team === TEAM.BLUE);
  const spec = eligible.filter((p) => p.team === TEAM.SPEC);

  if (red.length !== blue.length) return null;
  if (red.length <= 0 || red.length >= teamSize) return null;

  const holesPerTeam = teamSize - red.length;
  if (spec.length < holesPerTeam * 2) return null;

  const moves = [];
  for (let i = 0; i < holesPerTeam; i++) {
    moves.push({ id: spec[i * 2].id, team: TEAM.RED });
    moves.push({ id: spec[i * 2 + 1].id, team: TEAM.BLUE });
  }
  return { moves, leftoverSpec: spec.length - holesPerTeam * 2 };
}

/**
 * Vencedores ainda no campo (4v0 + specs): se o spec fecha o 4v4
 * sem sobra, preenche na ordem; se tem opção extra, o 1º spec vira
 * capitão azul e o resto picka.
 */
function planHeldWinnersToChoose(players, { isExcluded, teamSize = 4 } = {}) {
  const eligible = (players || [])
    .filter((p) => p.id !== 0 && !(typeof isExcluded === "function" && isExcluded(p)))
    .map((p) => ({ ...p }));
  const red = eligible.filter((p) => p.team === TEAM.RED);
  const blue = eligible.filter((p) => p.team === TEAM.BLUE);
  const spec = eligible.filter((p) => p.team === TEAM.SPEC);

  if (eligible.length < teamSize * 2) return null;

  function fill(targetTeam, currentCount) {
    const need = teamSize - currentCount;
    if (spec.length < need) return null;
    if (spec.length === need) {
      return {
        moves: spec.slice(0, need).map((p) => ({ id: p.id, team: targetTeam })),
        start: true,
      };
    }
    const moves = [];
    if (!currentCount && spec.length) {
      moves.push({ id: spec[0].id, team: targetTeam });
    }
    return { moves, start: false };
  }

  if (red.length === teamSize && blue.length < teamSize) {
    return fill(TEAM.BLUE, blue.length);
  }
  if (blue.length === teamSize && red.length < teamSize) {
    return fill(TEAM.RED, red.length);
  }
  return null;
}

module.exports = { planWarmup, applyWarmupMoves, planPromoteToX4, planHeldWinnersToChoose };

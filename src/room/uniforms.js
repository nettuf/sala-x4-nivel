const { TEAM } = require("./choose");

/**
 * Uniformes: [angle, textColor, colors[]] no formato do room.setTeamColors.
 * Padrão inicial: vermelho tudo preto, azul tudo branco.
 */
const KIT_PRETO = { id: "preto", name: "Preto", angle: 0, text: 0x000000, colors: [0x000000] };
const KIT_BRANCO = { id: "branco", name: "Branco", angle: 0, text: 0xffffff, colors: [0xffffff] };

const KITS = [
  KIT_PRETO,
  KIT_BRANCO,
  { id: "padrao", name: "Padrão Hax", angle: 0, text: 0xffffff, colors: [0xe56e56] },
  { id: "bra", name: "Brasil", angle: 90, text: 0x40bfff, colors: [0xffe600] },
  { id: "arg", name: "Argentina", angle: 90, text: 0x1c3f94, colors: [0x75aadb, 0xffffff] },
  { id: "ale", name: "Alemanha", angle: 90, text: 0xffffff, colors: [0x000000, 0xff1212, 0xffdd00] },
  { id: "ita", name: "Itália", angle: 90, text: 0xffffff, colors: [0x0066b3] },
  { id: "fra", name: "França", angle: 90, text: 0xffffff, colors: [0x1f3d99] },
  { id: "por", name: "Portugal", angle: 90, text: 0xffe600, colors: [0xc60c30, 0x006233] },
  { id: "fla", name: "Flamengo", angle: 90, text: 0xffffff, colors: [0xc52613, 0x000000] },
  { id: "pal", name: "Palmeiras", angle: 90, text: 0xffffff, colors: [0x006437] },
  { id: "cor", name: "Corinthians", angle: 90, text: 0xffffff, colors: [0x000000] },
  { id: "sao", name: "São Paulo", angle: 90, text: 0xd4212b, colors: [0xffffff, 0x000000] },
  { id: "vas", name: "Vasco", angle: 45, text: 0xffffff, colors: [0x000000, 0xffffff] },
  { id: "cru", name: "Cruzeiro", angle: 90, text: 0xffffff, colors: [0x1b3f8b] },
  { id: "gre", name: "Grêmio", angle: 90, text: 0xffffff, colors: [0x0d80bf, 0x000000] },
  { id: "int", name: "Internacional", angle: 90, text: 0xffffff, colors: [0xd4212b] },
  { id: "san", name: "Santos", angle: 90, text: 0x000000, colors: [0xffffff] },
  { id: "roxo", name: "Roxo", angle: 90, text: 0xffffff, colors: [0x8e44ad] },
  { id: "verde", name: "Verde neon", angle: 90, text: 0x1c1c1c, colors: [0x2ecc71] },
];

function defaultKit(team) {
  return team === TEAM.RED ? KIT_PRETO : KIT_BRANCO;
}

function findKit(id) {
  const key = String(id || "").trim().toLowerCase();
  if (!key) return null;
  return KITS.find((k) => k.id === key) || null;
}

function parseTeamRef(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (["red", "vermelho", "1"].includes(key)) return TEAM.RED;
  if (["blue", "azul", "2"].includes(key)) return TEAM.BLUE;
  return null;
}

function teamLabel(team) {
  return team === TEAM.RED ? "🔴 vermelho" : "🔵 azul";
}

function kitName(kit) {
  return kit?.name || "—";
}

/** Texto do kickoff. Depois pode incluir dono do uniforme personalizado. */
function formatKickoffVs(redKit, blueKit) {
  return `🔴 ${kitName(redKit)}  vs  🔵 ${kitName(blueKit)}`;
}

/**
 * Regras puras de troca de uniforme.
 * @param {{ team: number, kitId: string, current: Record<number, string|null> }} input
 * @returns {{ ok: true, kit: object } | { ok: false, error: string }}
 */
function validateChange({ team, kitId, current }) {
  if (team !== TEAM.RED && team !== TEAM.BLUE) {
    return { ok: false, error: "Time inválido. Use red ou blue." };
  }
  const kit = findKit(kitId);
  if (!kit) {
    return { ok: false, error: "Uniforme inexistente. Veja !unis" };
  }
  const other = team === TEAM.RED ? TEAM.BLUE : TEAM.RED;
  if (kit.id !== "padrao" && current[other] === kit.id) {
    return { ok: false, error: `${kit.name} já está no time ${teamLabel(other)}. Escolha outro.` };
  }
  if (current[team] === kit.id) {
    return { ok: false, error: `Seu time já está com ${kit.name}.` };
  }
  return { ok: true, kit };
}

/**
 * Só admin (cargo) ou capitão (1º jogador do time) troca o uniforme.
 * @returns {{ ok: true, team: number } | { ok: false, error: string }}
 */
function resolvePermission({ player, isAdmin, requestedTeam, captains }) {
  if (isAdmin) {
    const team = requestedTeam || (player.team !== TEAM.SPEC ? player.team : null);
    if (!team) {
      return { ok: false, error: "Admin no spec: use !uni red <kit> ou !uni blue <kit>" };
    }
    return { ok: true, team };
  }

  if (player.team === TEAM.SPEC) {
    return { ok: false, error: "Só admin ou capitão troca uniforme." };
  }
  if (requestedTeam && requestedTeam !== player.team) {
    return { ok: false, error: "Você só troca o uniforme do seu time." };
  }
  if (captains[player.team] !== player.id) {
    return { ok: false, error: "Só o capitão (1º do time) ou um admin troca o uniforme." };
  }
  return { ok: true, team: player.team };
}

function createUniformManager(room) {
  /** @type {Record<number, string|null>} */
  const current = { [TEAM.RED]: KIT_PRETO.id, [TEAM.BLUE]: KIT_BRANCO.id };

  function captains() {
    const players = room.getPlayerList().filter((p) => p.id !== 0);
    const red = players.find((p) => p.team === TEAM.RED);
    const blue = players.find((p) => p.team === TEAM.BLUE);
    return { [TEAM.RED]: red?.id ?? null, [TEAM.BLUE]: blue?.id ?? null };
  }

  function apply(team, kit) {
    try {
      room.setTeamColors(team, kit.angle, kit.text, kit.colors);
    } catch (err) {
      console.warn("[uniformes] setTeamColors", err.message);
      return false;
    }
    current[team] = kit.id;
    return true;
  }

  function kitFor(team) {
    return findKit(current[team]) || defaultKit(team);
  }

  function isCustom(team) {
    return current[team] && current[team] !== defaultKit(team).id;
  }

  /** Reaplica as cores atuais (o mapa zera o uniforme no setCustomStadium). */
  function reapply() {
    apply(TEAM.RED, kitFor(TEAM.RED));
    apply(TEAM.BLUE, kitFor(TEAM.BLUE));
  }

  /**
   * @returns {{ ok: true, kit: object, team: number } | { ok: false, error: string }}
   */
  function change({ player, isAdmin, teamRef, kitId }) {
    const requestedTeam = teamRef ? parseTeamRef(teamRef) : null;
    if (teamRef && !requestedTeam) {
      return { ok: false, error: "Time inválido. Use red ou blue." };
    }

    const perm = resolvePermission({
      player,
      isAdmin,
      requestedTeam,
      captains: captains(),
    });
    if (!perm.ok) return perm;

    const valid = validateChange({ team: perm.team, kitId, current });
    if (!valid.ok) return valid;

    if (!apply(perm.team, valid.kit)) {
      return { ok: false, error: "Falha ao aplicar uniforme." };
    }
    return { ok: true, kit: valid.kit, team: perm.team };
  }

  /** Winner stays: quem venceu leva o uniforme customizado para o vermelho. */
  function onWinnerStays(winner) {
    if (winner === TEAM.BLUE) {
      const blueKit = isCustom(TEAM.BLUE) ? findKit(current[TEAM.BLUE]) : null;
      apply(TEAM.BLUE, KIT_BRANCO);
      if (blueKit) apply(TEAM.RED, blueKit);
      return;
    }
    if (winner === TEAM.RED) return;
    reset();
  }

  function reset() {
    apply(TEAM.RED, KIT_PRETO);
    apply(TEAM.BLUE, KIT_BRANCO);
  }

  function describe() {
    const red = findKit(current[TEAM.RED])?.name || KIT_PRETO.name;
    const blue = findKit(current[TEAM.BLUE])?.name || KIT_BRANCO.name;
    return `🔴 ${red} · 🔵 ${blue}`;
  }

  function kickoffVs() {
    return formatKickoffVs(kitFor(TEAM.RED), kitFor(TEAM.BLUE));
  }

  function listText() {
    return KITS.map((k) => k.id).join(", ");
  }

  reset();

  return {
    change,
    reset,
    reapply,
    onWinnerStays,
    describe,
    kickoffVs,
    listText,
    captains,
    current: () => ({ ...current }),
  };
}

module.exports = {
  KITS,
  KIT_PRETO,
  KIT_BRANCO,
  findKit,
  parseTeamRef,
  formatKickoffVs,
  validateChange,
  resolvePermission,
  createUniformManager,
};

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
  { id: "baleio", name: "Amigos do Baleio", angle: 60, text: 0xffffff, colors: [0x0080ff, 0x004077, 0xc720ab], emoji: "🐋" },
  { id: "rato", name: "Amigos do Rato", angle: 12, text: 0xff6929, colors: [0x707715, 0xff6929], emoji: "🐀" },
  { id: "rasta", name: "Amigos do Rastão", angle: 60, text: 0xffffff, colors: [0xff0aff] },
  { id: "dnzin", name: "Amigos do Dnzinmuller", angle: 60, text: 0x000000, colors: [0xffffff, 0xffffff, 0x9e0000] },
  { id: "gordo", name: "Gordões FC", angle: 22, text: 0xffffff, colors: [0xff4de7, 0x000000, 0xff4de7], emoji: "🍔" },
  { id: "copas", name: "Copudo FC", angle: 0, text: 0xffa649, colors: [0xfa0006] },
  { id: "zrx", name: "Amigos do zrx", angle: 0, text: 0xf58300, colors: [0x292929] },
  { id: "tigre", name: "Amigos do Rei Tigre", angle: 59, text: 0xfff5f5, colors: [0xf1ff30, 0x000000, 0xf1ff30], emoji: "👑" },
  { id: "jalin", name: "Amigos do Jalin", angle: 857, text: 0xe2ff26, colors: [0xe2ff26, 0x770c69, 0x23cf29], emoji: "🐒" },
  { id: "vrum", name: "Amigos do Vrum", angle: 60, text: 0x5005ff, colors: [0x000000] },
];

function defaultKit(team) {
  return team === TEAM.RED ? KIT_PRETO : KIT_BRANCO;
}

function findKit(id) {
  const key = String(id || "").trim().toLowerCase();
  if (!key) return null;
  return KITS.find((k) => k.id === key) || null;
}

function isRandomKitArg(raw) {
  const key = String(raw || "").trim().toLowerCase();
  return ["random", "rand", "sortear", "aleatorio", "aleatório"].includes(key);
}

/**
 * Sorteia um kit, evitando os ids informados quando ainda houver opções.
 * @param {string[]|string|null} exceptIds
 * @param {() => number} [rng]
 */
function pickRandomKit(exceptIds = [], rng = Math.random) {
  const except = new Set(
    (Array.isArray(exceptIds) ? exceptIds : [exceptIds]).filter(Boolean).map(String)
  );
  const pool = KITS.filter((k) => !except.has(k.id));
  const source = pool.length ? pool : KITS;
  const idx = Math.min(source.length - 1, Math.floor(rng() * source.length));
  return source[Math.max(0, idx)];
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

function createUniformManager(room, opts = {}) {
  const rng = typeof opts.random === "function" ? opts.random : Math.random;
  /** @type {Record<number, string|null>} */
  const current = { [TEAM.RED]: KIT_PRETO.id, [TEAM.BLUE]: KIT_BRANCO.id };
  /** Último avatar aplicado por jogador, para não reenviar o mesmo. */
  const avatars = new Map();
  /** Próximo kickoff sorteia, a menos que alguém já tenha escolhido no intervalo. */
  let pendingRandom = true;

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
    syncAvatars();
    return true;
  }

  function kitFor(team) {
    return findKit(current[team]) || defaultKit(team);
  }

  /** Kit com emoji marca o time inteiro; sem emoji o avatar volta a ser do jogador. */
  function avatarFor(team) {
    if (team !== TEAM.RED && team !== TEAM.BLUE) return null;
    return kitFor(team).emoji || null;
  }

  function syncAvatars() {
    if (typeof room.setPlayerAvatar !== "function") return;
    const players = room.getPlayerList().filter((p) => p.id !== 0);
    const present = new Set();
    for (const player of players) {
      present.add(player.id);
      const wanted = avatarFor(player.team);
      if (avatars.has(player.id) && avatars.get(player.id) === wanted) continue;
      try {
        room.setPlayerAvatar(player.id, wanted);
        avatars.set(player.id, wanted);
      } catch (err) {
        console.warn("[uniformes] setPlayerAvatar", err.message);
      }
    }
    for (const id of [...avatars.keys()]) {
      if (!present.has(id)) avatars.delete(id);
    }
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

    pendingRandom = false;
    if (!apply(perm.team, valid.kit)) {
      return { ok: false, error: "Falha ao aplicar uniforme." };
    }
    return { ok: true, kit: valid.kit, team: perm.team };
  }

  /**
   * Sorteia um lado, ou os dois se `team` for omitido.
   * Os dois times nunca ficam com o mesmo kit.
   */
  function randomize(team) {
    pendingRandom = false;
    if (team === TEAM.RED || team === TEAM.BLUE) {
      const other = team === TEAM.RED ? TEAM.BLUE : TEAM.RED;
      const kit = pickRandomKit([current[other], current[team]], rng);
      apply(team, kit);
      return { ok: true, mode: "one", team, kit };
    }
    const redKit = pickRandomKit([], rng);
    const blueKit = pickRandomKit([redKit.id], rng);
    apply(TEAM.RED, redKit);
    apply(TEAM.BLUE, blueKit);
    return { ok: true, mode: "both", red: redKit, blue: blueKit };
  }

  /**
   * Admin sem lado: os dois times. Capitão / admin com lado: só aquele time.
   */
  function randomizeRequest({ player, isAdmin, teamRef }) {
    const requestedTeam = teamRef ? parseTeamRef(teamRef) : null;
    if (teamRef && !requestedTeam) {
      return { ok: false, error: "Time inválido. Use red ou blue." };
    }

    if (isAdmin && !requestedTeam) {
      return randomize();
    }

    const perm = resolvePermission({
      player,
      isAdmin,
      requestedTeam,
      captains: captains(),
    });
    if (!perm.ok) return perm;
    return randomize(perm.team);
  }

  /** Kickoff sorteia só se ninguém trocou no intervalo. */
  function prepareKickoff() {
    if (!pendingRandom) return { randomized: false };
    const result = randomize();
    return { randomized: true, red: result.red, blue: result.blue };
  }

  function noteMatchEnd() {
    pendingRandom = true;
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
    reset({ preserveKickoffRandom: true });
  }

  function reset({ preserveKickoffRandom = false } = {}) {
    apply(TEAM.RED, KIT_PRETO);
    apply(TEAM.BLUE, KIT_BRANCO);
    if (!preserveKickoffRandom) pendingRandom = false;
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

  reset({ preserveKickoffRandom: true });

  return {
    change,
    reset,
    randomize,
    randomizeRequest,
    prepareKickoff,
    noteMatchEnd,
    reapply,
    syncAvatars,
    onWinnerStays,
    describe,
    kickoffVs,
    listText,
    captains,
    current: () => ({ ...current }),
    pendingKickoffRandom: () => pendingRandom,
  };
}

module.exports = {
  KITS,
  KIT_PRETO,
  KIT_BRANCO,
  findKit,
  isRandomKitArg,
  pickRandomKit,
  parseTeamRef,
  formatKickoffVs,
  validateChange,
  resolvePermission,
  createUniformManager,
};

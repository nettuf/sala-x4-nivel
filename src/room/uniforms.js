const { TEAM } = require("./choose");

/**
 * Uniformes: [angle, textColor, colors[]] no formato do room.setTeamColors.
 * Padrão inicial: vermelho tudo preto, azul tudo branco.
 */
const COLOR_KITS = [
  { id: "preto", name: "Preto", angle: 0, text: 0xffffff, colors: [0x000000] },
  { id: "branco", name: "Branco", angle: 0, text: 0x000000, colors: [0xffffff] },
  { id: "amarelo", name: "Amarelo", angle: 90, text: 0x000000, colors: [0xffd700] },
  { id: "vermelho", name: "Vermelho", angle: 90, text: 0xffffff, colors: [0xff0000] },
  { id: "azul", name: "Azul", angle: 90, text: 0xffffff, colors: [0x0055ff] },
  { id: "verde", name: "Verde", angle: 90, text: 0xffffff, colors: [0x00aa00] },
  { id: "laranja", name: "Laranja", angle: 90, text: 0x000000, colors: [0xff8800] },
  { id: "rosa", name: "Rosa", angle: 90, text: 0xffffff, colors: [0xff69b4] },
  { id: "roxo", name: "Roxo", angle: 90, text: 0xffffff, colors: [0x8e44ad] },
  { id: "cinza", name: "Cinza", angle: 90, text: 0xffffff, colors: [0x808080] },
  { id: "marrom", name: "Marrom", angle: 90, text: 0xffffff, colors: [0x8b4513] },
  { id: "ciano", name: "Ciano", angle: 90, text: 0x000000, colors: [0x00ffff] },
  { id: "magenta", name: "Magenta", angle: 90, text: 0xffffff, colors: [0xff00ff] },
  { id: "vinho", name: "Vinho", angle: 90, text: 0xffffff, colors: [0x800020] },
  { id: "dourado", name: "Dourado", angle: 90, text: 0x000000, colors: [0xffc800] },
  { id: "prata", name: "Prata", angle: 90, text: 0x000000, colors: [0xc0c0c0] },
  { id: "bege", name: "Bege", angle: 90, text: 0x000000, colors: [0xf5f5dc] },
  { id: "turquesa", name: "Turquesa", angle: 90, text: 0x000000, colors: [0x40e0d0] },
  { id: "lima", name: "Lima", angle: 90, text: 0x000000, colors: [0xccff00] },
  { id: "neon", name: "Neon", angle: 90, text: 0x000000, colors: [0x39ff14] },
];

const COLOR_KIT_IDS = new Set(COLOR_KITS.map((k) => k.id));
const COLOR_PAGES = [COLOR_KITS.slice(0, 10), COLOR_KITS.slice(10, 20)];

const KIT_PRETO = COLOR_KITS[0];
const KIT_BRANCO = COLOR_KITS[1];

const COMMUNITY_KITS = [
  { id: "baleio", name: "Amigos do Baleio", angle: 60, text: 0xffffff, colors: [0x0080ff, 0x004077, 0xc720ab], emoji: "🐋" },
  { id: "rato", name: "Amigos do Rato", angle: 12, text: 0xff6929, colors: [0x707715, 0xff6929], emoji: "🐀" },
  { id: "rasta", name: "Amigos do Rastão", angle: 60, text: 0xffffff, colors: [0xff0aff] },
  { id: "dnzin", name: "Amigos do Dnzinmuller", angle: 60, text: 0x000000, colors: [0xffffff, 0xffffff, 0x9e0000] },
  { id: "gordo", name: "Gordões FC", angle: 22, text: 0xffffff, colors: [0xff4de7, 0x000000, 0xff4de7], emoji: "🍔" },
  { id: "copas", name: "Copudo FC", angle: 0, text: 0xffa649, colors: [0xfa0006], emoji: "❤️" },
  { id: "palhacada", name: "Palhaçada FC", angle: 60, text: 0xffffff, colors: [0x00ff6e, 0x0810ff, 0x002033], emoji: "🤡" },
  { id: "zrx", name: "Amigos do zrx", angle: 0, text: 0xf58300, colors: [0x292929] },
  { id: "tigre", name: "Amigos do Rei Tigre", angle: 59, text: 0xfff5f5, colors: [0xf1ff30, 0x000000, 0xf1ff30], emoji: "👑" },
  { id: "jalin", name: "Amigos do Jalin", angle: 857, text: 0xe2ff26, colors: [0xe2ff26, 0x770c69, 0x23cf29], emoji: "🐒" },
  { id: "vrum", name: "Amigos do Vrum", angle: 60, text: 0x5005ff, colors: [0x000000] },
  { id: "gh", name: "GH FC", angle: 80, text: 0x03050a, colors: [0x757575, 0xf0f6ff, 0x7e8b8f], emoji: "><" },
  { id: "cyq", name: "Amigos do Cyq", angle: 60, text: 0x02ccc5, colors: [0x800066, 0x800066, 0x02a6a0] },
  { id: "cacadores", name: "Caçadores de Gordos", angle: 63, text: 0x27b050, colors: [0x043d00, 0x065206, 0x043b00], emoji: "🏹" },
  { id: "zebrados", name: "Zebrados FC", angle: 60, text: 0x000000, colors: [0xffffff, 0x000000], emoji: "🦓" },
  { id: "gigachads", name: "Gigachads", angle: 60, text: 0x000000, colors: [0xb8ff4d, 0xaeffab, 0x61ff30], emoji: "🗿" },
  { id: "moggadores", name: "Moggadores", angle: 601, text: 0x2d0dff, colors: [0x4a6eff, 0x5ca8ff], emoji: "🤫" },
  { id: "pedro", name: "Amigos do Pedro", angle: 32, text: 0xffffff, colors: [0x221930, 0x32294f], emoji: "🥀" },
  { id: "tulio", name: "Amigos do Tulio", angle: 601, text: 0x851575, colors: [0xc420ae, 0xff29e2], emoji: "🏳️‍🌈" },
  { id: "marconhados", name: "Marconhados", angle: 33, text: 0x1be329, colors: [0x108518, 0x14a81e], emoji: "☘️" },
  { id: "rosinha", name: "Rosinha", angle: 0, text: 0xffffff, colors: [0xffbadd] },
  {
    id: "zebrafamily",
    name: "Zebra Family",
    angle: 90,
    text: 0xffffff,
    colors: [0x21d3ff, 0xff00cc, 0x21d3ff],
    emoji: "🦓",
  },
  {
    id: "olympusguardians",
    name: "Olympus Guardians",
    angle: 120,
    text: 0xe5ed00,
    colors: [0x080404, 0x141414],
    emoji: "⚡",
  },
  {
    id: "rafaela",
    name: "Amigos da Raffaella",
    angle: 60,
    text: 0xffffff,
    colors: [0xffcff7, 0xffa8f1, 0xffc7fd],
    emoji: "><",
  },
  {
    id: "mdr",
    name: "Bigodes do MDR",
    angle: 60,
    text: 0xffffff,
    colors: [0x73ff98, 0x27752c, 0x000000],
    emoji: "﷼",
  },
  {
    id: "dezena",
    name: "Dezena Impopular",
    angle: 60,
    text: 0xfcfcfc,
    colors: [0xf0303d, 0xe32d3a, 0xcf2935],
  },
  {
    id: "nickname",
    name: "Amigos do Nickname",
    angle: 45,
    text: 0xffffff,
    colors: [0xff6a00, 0xc24100, 0x1a0800],
    emoji: "𝒩",
  },
  {
    id: "skdreams",
    name: "SK Dream's",
    angle: 60,
    text: 0xffffff,
    colors: [0x000000],
    emoji: "👀",
  },
  {
    id: "busqueta",
    name: "Busqueta FC",
    angle: 90,
    text: 0xffffff,
    colors: [0x006fff, 0x2e9dff, 0x70b3ff],
  },
  {
    id: "artemis",
    name: "Artemis FC",
    angle: 90,
    text: 0x1f1f1f,
    colors: [0x00764b, 0xffffff, 0x00764b],
  },
  {
    id: "amigosvasco",
    name: "Amigos do ✠",
    angle: 38,
    text: 0xffe0e0,
    colors: [0x000000, 0x000000, 0x000000],
    emoji: "✠",
  },
  {
    id: "duki",
    name: "Amigos do Duki",
    angle: 42,
    text: 0xffffff,
    colors: [0xc2ffe7, 0xffffff, 0xfbd9ff],
  },
  {
    id: "leao",
    name: "Leões da Jamaica",
    angle: 90,
    text: 0xffffff,
    colors: [0x009b3a, 0x000000, 0xfed100],
    emoji: "🦁",
  },
  {
    id: "alanzoka",
    name: "Alanzoka & amigos",
    angle: 66,
    text: 0x283950,
    colors: [0x8ac7f0],
  },
  {
    id: "pau",
    name: "Amigos de Pau",
    angle: 360,
    text: 0xffa649,
    colors: [0x0f0f0f, 0xffffff, 0x000000],
    emoji: "🪵",
  },
];

const KITS = [...COLOR_KITS, ...COMMUNITY_KITS];

function defaultKit(team) {
  return team === TEAM.RED ? KIT_PRETO : KIT_BRANCO;
}

function kitKey(id) {
  return String(id || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function rgbFromHex(hex) {
  const n = Number(hex) || 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function colorDistance(a, b) {
  const ca = rgbFromHex(a);
  const cb = rgbFromHex(b);
  const dr = ca.r - cb.r;
  const dg = ca.g - cb.g;
  const db = ca.b - cb.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function kitPalette(kit) {
  return (kit?.colors || []).filter((c) => Number.isFinite(c));
}

function kitLuminance(kit) {
  const palette = kitPalette(kit);
  if (!palette.length) return 128;
  const sum = palette.reduce((acc, c) => {
    const { r, g, b } = rgbFromHex(c);
    return acc + 0.299 * r + 0.587 * g + 0.114 * b;
  }, 0);
  return sum / palette.length;
}

/** Evita kits iguais ou com faixas/cores muito parecidas entre os times. */
function kitsTooSimilar(a, b, threshold = 60) {
  if (!a || !b) return false;
  if (a.id === b.id) return true;
  const pa = kitPalette(a);
  const pb = kitPalette(b);
  if (!pa.length || !pb.length) return false;
  for (const ca of pa) {
    for (const cb of pb) {
      if (colorDistance(ca, cb) < threshold) return true;
    }
  }
  const lumA = kitLuminance(a);
  const lumB = kitLuminance(b);
  if (lumA < 35 && lumB < 35) return true;
  if (lumA > 220 && lumB > 220) return true;
  return false;
}

function isColorKit(id) {
  return COLOR_KIT_IDS.has(kitKey(id));
}

function listColorPage(page) {
  const list = COLOR_PAGES[page - 1];
  if (!list) return null;
  return list.map((k) => `!${k.id}`).join(" ");
}

function listCommunityText() {
  return COMMUNITY_KITS.map((k) => k.id).join(", ");
}

function findKit(id) {
  const key = kitKey(id);
  if (!key) return null;
  return KITS.find((k) => kitKey(k.id) === key) || null;
}

function isRandomKitArg(raw) {
  const key = String(raw || "").trim().toLowerCase();
  return ["random", "rand", "sortear", "aleatorio", "aleatório"].includes(key);
}

/**
 * Sorteia um kit, evitando ids e cores parecidas com o adversário.
 * @param {string[]|string|null} exceptIds
 * @param {() => number} [rng]
 * @param {object|string|null} [avoidSimilarTo]
 */
function pickRandomKit(exceptIds = [], rng = Math.random, avoidSimilarTo = null) {
  const except = new Set(
    (Array.isArray(exceptIds) ? exceptIds : [exceptIds]).filter(Boolean).map(String)
  );
  const reference =
    typeof avoidSimilarTo === "string" ? findKit(avoidSimilarTo) : avoidSimilarTo || null;

  let pool = KITS.filter((k) => !except.has(k.id));
  if (reference) {
    const distinct = pool.filter((k) => !kitsTooSimilar(k, reference));
    if (distinct.length) pool = distinct;
  }
  const source = pool.length ? pool : KITS.filter((k) => !except.has(k.id));
  const fallback = source.length ? source : KITS;
  const idx = Math.min(fallback.length - 1, Math.floor(rng() * fallback.length));
  return fallback[Math.max(0, idx)];
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
    return { ok: false, error: "Uniforme inexistente. Veja !unis ou !cores1" };
  }
  const other = team === TEAM.RED ? TEAM.BLUE : TEAM.RED;
  const otherKit = findKit(current[other]);
  if (otherKit && kitsTooSimilar(kit, otherKit)) {
    return {
      ok: false,
      error: `${kit.name} fica parecido demais com ${otherKit.name} (${teamLabel(other)}). Escolha outro.`,
    };
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
  /** Próximo kickoff sorteia o azul; o vermelho permanece. */
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
      const kit = pickRandomKit([current[other], current[team]], rng, kitFor(other));
      apply(team, kit);
      return { ok: true, mode: "one", team, kit };
    }
    const redKit = pickRandomKit([], rng);
    const blueKit = pickRandomKit([redKit.id], rng, redKit);
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

  /** Kickoff sorteia só o azul. O vermelho mantém o kit partida a partida. */
  function prepareKickoff() {
    if (!pendingRandom) return { randomized: false };
    const result = randomize(TEAM.BLUE);
    return { randomized: true, red: kitFor(TEAM.RED), blue: result.kit };
  }

  function noteMatchEnd() {
    pendingRandom = true;
  }

  /** Winner stays: o vermelho mantém o kit. Azul volta ao padrão (o kickoff sorteia de novo). */
  function onWinnerStays(winner) {
    if (winner === TEAM.BLUE) {
      apply(TEAM.BLUE, KIT_BRANCO);
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
    return listCommunityText();
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
  COLOR_KITS,
  COLOR_PAGES,
  COMMUNITY_KITS,
  KIT_PRETO,
  KIT_BRANCO,
  findKit,
  isColorKit,
  listColorPage,
  listCommunityText,
  isRandomKitArg,
  pickRandomKit,
  kitsTooSimilar,
  colorDistance,
  parseTeamRef,
  formatKickoffVs,
  validateChange,
  resolvePermission,
  createUniformManager,
};

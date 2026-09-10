/**
 * Cargos/emblemas desbloqueáveis por stats + cargos de staff.
 * Só um cargo ativo por vez. req: { games?, goals?, assists?, mvps?, cs?, maxWinrate? }.
 */
const config = require("./config");

const TITLES = [
  {
    id: "novato",
    name: "Novato",
    emblem: "🌱",
    color: 0xbdc3c7,
    req: {},
  },
  {
    id: "negativo",
    name: "Negativo",
    emblem: "📉",
    color: 0x7f8c8d,
    req: { games: 10, maxWinrate: 50 },
  },
  {
    id: "estreante",
    name: "Estreante",
    emblem: "🎮",
    color: 0x95a5a6,
    req: { games: 100 },
  },
  {
    id: "veterano",
    name: "Veterano",
    emblem: "🛡️",
    color: 0x7f8c8d,
    req: { games: 500 },
  },
  {
    id: "titular",
    name: "Titular",
    emblem: "🏟️",
    color: 0x34495e,
    req: { games: 1000 },
  },
  {
    id: "artilheiro",
    name: "Artilheiro",
    emblem: "⚽",
    color: 0xe74c3c,
    req: { goals: 200 },
  },
  {
    id: "matador",
    name: "Matador",
    emblem: "🔥",
    color: 0xc0392b,
    req: { goals: 800 },
  },
  {
    id: "garcom",
    name: "Garçom",
    emblem: "🎯",
    color: 0x3498db,
    req: { assists: 200 },
  },
  {
    id: "maestro",
    name: "Maestro",
    emblem: "🎼",
    color: 0x2980b9,
    req: { assists: 800 },
  },
  {
    id: "mvp",
    name: "MVP",
    emblem: "⭐",
    color: 0xf1c40f,
    req: { mvps: 100 },
  },
  {
    id: "estrela",
    name: "Estrela",
    emblem: "🌟",
    color: 0xf39c12,
    req: { mvps: 400 },
  },
  {
    id: "catador",
    name: "Catador",
    emblem: "🧤",
    color: 0x1abc9c,
    req: { cs: 100 },
  },
  {
    id: "muralha",
    name: "Muralha",
    emblem: "🧱",
    color: 0x16a085,
    req: { cs: 300 },
  },
  {
    id: "invencivel",
    name: "Invencível",
    emblem: "🧿",
    color: 0x0e6655,
    chatHighlight: true,
    req: { cs: 1000 },
  },
  {
    id: "dupla",
    name: "Dupla Letal",
    emblem: "⚔️",
    color: 0x1abc9c,
    req: { goals: 300, assists: 300 },
  },
  {
    id: "completo",
    name: "Completo",
    emblem: "💎",
    color: 0x9b59b6,
    req: { games: 400, goals: 300, assists: 200 },
  },
  {
    id: "craque",
    name: "Craque",
    emblem: "🏆",
    color: 0xd8a4ff,
    chatHighlight: true,
    req: { games: 600, goals: 500, assists: 400, mvps: 160 },
  },
  {
    id: "lenda",
    name: "Lenda",
    emblem: "🐉",
    color: 0xffc04d,
    chatHighlight: true,
    req: { games: 1600, goals: 1200, assists: 800, mvps: 500 },
  },
];

function statsBag(stats) {
  const games = Number(stats?.games) || 0;
  const wins = Number(stats?.wins) || 0;
  return {
    games,
    wins,
    losses: Number(stats?.losses) || 0,
    goals: Number(stats?.goals) || 0,
    assists: Number(stats?.assists) || 0,
    mvps: Number(stats?.mvps) || 0,
    cs: Number(stats?.cs) || 0,
    winrate: games > 0 ? (wins / games) * 100 : 0,
  };
}

function meetsReq(stats, req = {}) {
  const s = statsBag(stats);
  for (const [key, value] of Object.entries(req)) {
    if (key === "maxWinrate") {
      if (s.winrate >= Number(value)) return false;
      continue;
    }
    if ((s[key] || 0) < value) return false;
  }
  return true;
}

/** Cargos-piada (!gordo / !aura): só overlay no chat. Não entram em !cargos. */
const JOKE_TITLES = {
  gordo: {
    id: "gordo",
    name: "Gordo",
    emblem: "🍔",
    color: 0xffb347,
    chatHighlight: true,
    kind: "joke",
  },
  aura: {
    id: "aura",
    name: "Aura",
    emblem: "🗿",
    color: 0xd4a5ff,
    chatHighlight: true,
    kind: "joke",
  },
};

/** Overlay no chat enquanto o vermelho segura streak ≥ 3 (x4). */
const STREAK_TITLE_MIN = 3;
const STREAK_TITLE = {
  id: "streak",
  name: "Em Streak",
  emblem: "🔥",
  /** Vermelho mais forte que o chat normal do time. */
  color: 0xff1a1a,
  chatHighlight: true,
  kind: "streak",
};

/** Cargo fixo concedido pelo Chefe (nível 4). A pessoa escolhe se quer usar. */
const GIFT_TITLES = [
  {
    id: "parca",
    name: "Parça do Baleia",
    emblem: "🐋",
    color: 0x5dade2,
    kind: "gift",
    req: {},
  },
];

/**
 * Cargo temporário de streak: só no vermelho, streak ≥ 3, sem AFK.
 * Spec / azul / sair / AFK / streak quebrada → perde.
 */
function wearsStreakTitle(streak, team, isAfk = false) {
  if (isAfk) return false;
  if (Number(team) !== 1) return false;
  return Math.floor(Number(streak) || 0) >= STREAK_TITLE_MIN;
}

const STAFF_TITLES = Object.entries(config.adminLevels)
  .map(([lvl, meta]) => ({
    id: meta.id,
    name: meta.title,
    emblem: meta.emblem,
    color: meta.color,
    kind: "staff",
    level: Number(lvl),
  }))
  .sort((a, b) => a.level - b.level);

function getStaffTitleByLevel(level) {
  return STAFF_TITLES.find((t) => t.level === Number(level)) || null;
}

function isStaffTitle(titleOrId) {
  const id = typeof titleOrId === "string" ? titleOrId : titleOrId?.id;
  return STAFF_TITLES.some((t) => t.id === id);
}

function getTitleById(id) {
  if (!id) return null;
  return (
    TITLES.find((t) => t.id === id) ||
    STAFF_TITLES.find((t) => t.id === id) ||
    GIFT_TITLES.find((t) => t.id === id) ||
    null
  );
}

function giftedTitleIds(stats) {
  const raw = stats?.gifted_titles;
  if (!Array.isArray(raw)) return [];
  return raw.map((id) => String(id || "").trim()).filter(Boolean);
}

function hasGiftedTitle(stats, titleId) {
  return giftedTitleIds(stats).includes(String(titleId));
}

function isGiftTitle(titleOrId) {
  const id = typeof titleOrId === "string" ? titleOrId : titleOrId?.id;
  return GIFT_TITLES.some((t) => t.id === id);
}

function listUnlockedGift(stats) {
  const ids = new Set(giftedTitleIds(stats));
  return GIFT_TITLES.filter((t) => ids.has(t.id));
}

function listUnlockedPlayer(stats) {
  return TITLES.filter((t) => meetsReq(stats, t.req));
}

function listUnlockedStaff(adminLevel = 0) {
  const level = Number(adminLevel) || 0;
  return STAFF_TITLES.filter((t) => level >= t.level);
}

function listUnlocked(stats, adminLevel = 0) {
  return [...listUnlockedStaff(adminLevel), ...listUnlockedGift(stats), ...listUnlockedPlayer(stats)];
}

function isUnlocked(stats, titleId, adminLevel = 0) {
  const t = getTitleById(titleId);
  if (!t) return false;
  if (t.kind === "staff") return (Number(adminLevel) || 0) >= t.level;
  if (t.kind === "gift") return hasGiftedTitle(stats, t.id);
  return meetsReq(stats, t.req);
}

function bestPlayerTitle(stats) {
  const unlocked = listUnlockedPlayer(stats);
  return unlocked[unlocked.length - 1] || TITLES[0];
}

function resolveTitle(stats, selectedId, adminLevel = 0) {
  if (selectedId && isUnlocked(stats, selectedId, adminLevel)) {
    return getTitleById(selectedId);
  }
  if (adminLevel) {
    return getStaffTitleByLevel(adminLevel) || bestPlayerTitle(stats);
  }
  return bestPlayerTitle(stats);
}

function playerTitleIndex(id) {
  return TITLES.findIndex((t) => t.id === id);
}

function newlyUnlockedPlayerTitles(prevStats, nextStats) {
  const prevIds = new Set(listUnlockedPlayer(prevStats).map((t) => t.id));
  return listUnlockedPlayer(nextStats).filter((t) => !prevIds.has(t.id));
}

/**
 * Se desbloqueou um cargo de jogador superior ao selecionado, equipa o novo.
 * Se o selecionado não vale mais (ex.: Negativo com WR ≥ 50%), volta ao melhor ainda válido.
 * Cargos de staff escolhidos não são trocados.
 */
function applyUnlockUpgrade(selectedId, prevStats, nextStats) {
  if (selectedId && isStaffTitle(selectedId)) return selectedId;
  if (selectedId && isGiftTitle(selectedId)) {
    return hasGiftedTitle(nextStats, selectedId) ? selectedId : bestPlayerTitle(nextStats).id;
  }
  if (selectedId && !isUnlocked(nextStats, selectedId)) {
    return bestPlayerTitle(nextStats).id;
  }
  const newly = newlyUnlockedPlayerTitles(prevStats, nextStats);
  if (!newly.length) return selectedId || null;
  if (!selectedId) return null;
  const bestNew = newly[newly.length - 1];
  const selIdx = playerTitleIndex(selectedId);
  const newIdx = playerTitleIndex(bestNew.id);
  if (selIdx >= 0 && newIdx > selIdx) return bestNew.id;
  return selectedId;
}

function formatChatPrefix(title) {
  const emblem = title?.emblem || "";
  return emblem ? `[${emblem}] ` : "";
}

/** Lanches usados no lugar de UMA vogal quando o alvo está com !gordo. */
const SNACK_EMOJIS = ["🍔", "🍟", "🌭", "🍕", "🌮", "🥪", "🍗", "🥓", "🧀", "🍿"];

const VOWEL_RE = /[aeiouáàâãéêíóôõúüýAEIOUÁÀÂÃÉÊÍÓÔÕÚÜÝ]/g;

/**
 * Troca uma vogal aleatória. Trocar todas poluía o chat.
 * `replacement` pode ser string ou () => string.
 */
function replaceOneVowel(text, replacement, { random } = {}) {
  const str = String(text ?? "");
  const matches = [...str.matchAll(VOWEL_RE)];
  if (!matches.length) return str;
  const rng = typeof random === "function" ? random : Math.random;
  const i = Math.min(matches.length - 1, Math.floor(rng() * matches.length));
  const m = matches[i];
  const insert = typeof replacement === "function" ? replacement(m[0], i) : String(replacement);
  return str.slice(0, m.index) + insert + str.slice(m.index + m[0].length);
}

function replaceVowelsWithSnacks(text, { pick, random } = {}) {
  const rng = typeof random === "function" ? random : Math.random;
  return replaceOneVowel(
    text,
    () => {
      if (typeof pick === "function") return pick();
      const idx = Math.min(SNACK_EMOJIS.length - 1, Math.floor(rng() * SNACK_EMOJIS.length));
      return SNACK_EMOJIS[idx];
    },
    { random: rng }
  );
}

/** Mensagem do chat: !gordo troca uma vogal por emoji de lanche. */
function formatChatBody(title, message) {
  if (title?.id === "gordo") return replaceVowelsWithSnacks(message);
  return message;
}

/** Vermelho/azul bem visíveis no fundo escuro; spec cinza-claro. */
const CHAT_COLOR_RED = 0xff5c5c;
const CHAT_COLOR_BLUE = 0x5aa7ff;
const CHAT_COLOR_SPEC = 0xcfd3d8;
/** Fallback staff (Chefe): amarelo escuro. */
const CHAT_COLOR_CHEFE = 0xd4a017;

function isTopChatTitle(title) {
  if (!title) return false;
  if (title.kind === "staff") return true;
  return !!title.chatHighlight;
}

/**
 * Cor da linha do chat: time (vermelho / azul / spec).
 * Staff (todos amarelo), Craque, Lenda, Gordo, Aura e Em Streak pintam diferente.
 */
function chatColor(title, team) {
  if (isTopChatTitle(title)) {
    return title.color || (title.kind === "staff" ? CHAT_COLOR_CHEFE : CHAT_COLOR_SPEC);
  }
  if (Number(team) === 1) return CHAT_COLOR_RED;
  if (Number(team) === 2) return CHAT_COLOR_BLUE;
  return CHAT_COLOR_SPEC;
}

/** Contribuição (pior): gols*2 + assists − GC*2; GK sem GC ganha piso pra não ser sempre o pior. */
function matchContribution(p) {
  const goals = Number(p.goals) || 0;
  const assists = Number(p.assists) || 0;
  const own = Number(p.own_goals) || 0;
  let s = goals * 2 + assists - own * 2;
  if (p.goalkeeper && own === 0) s += 2;
  return s;
}

/** Score de MVP: gols*2 + assists; GK com CS +3 (compete com artilheiro de 1 gol). */
function matchMvpScore(p) {
  const goals = Number(p.goals) || 0;
  const assists = Number(p.assists) || 0;
  let s = goals * 2 + assists;
  if (p.goalkeeper && p.cleanSheet) s += 3;
  else if (p.goalkeeper) s += 1;
  return s;
}

function withMatchStats(p) {
  return {
    ...p,
    goals: Math.max(0, Math.floor(Number(p.goals) || 0)),
    assists: Math.max(0, Math.floor(Number(p.assists) || 0)),
    own_goals: Math.max(0, Math.floor(Number(p.own_goals) || 0)),
    goalkeeper: !!p.goalkeeper,
    cleanSheet: !!p.cleanSheet,
  };
}

function byAuthNick(a, b) {
  return String(a.auth || a.nick || "").localeCompare(String(b.auth || b.nick || ""));
}

/** MVP/Pior: só quem estava em campo no apito (não spec, não quem saiu). */
function filterPlayersAtWhistle(players, finishedAuths) {
  if (!finishedAuths?.size) return players || [];
  return (players || []).filter((p) => p.auth && finishedAuths.has(p.auth));
}

/**
 * MVP da partida: sempre 1.
 * Com vencedor → só no time que ganhou; empate → qualquer time.
 * Critério: gols*2 + assists (+3 CS / +1 GK); mín. 1 pt;
 * empate → mais gols → assists → CS → menos GC.
 */
function pickMatchMvps(players) {
  const list = players || [];
  const winners = list.filter((p) => p.result === "win").map(withMatchStats);
  const pool = winners.length ? winners : list.map(withMatchStats);
  if (!pool.length) return [];
  const scored = pool.map((p) => ({
    ...p,
    score: matchMvpScore(p),
  }));
  const max = Math.max(0, ...scored.map((p) => p.score));
  if (max < 1) return [];
  const tied = scored.filter((p) => p.score === max);
  tied.sort((a, b) => {
    if (b.goals !== a.goals) return b.goals - a.goals;
    if (b.assists !== a.assists) return b.assists - a.assists;
    if (Number(b.cleanSheet) !== Number(a.cleanSheet)) return Number(b.cleanSheet) - Number(a.cleanSheet);
    if (a.own_goals !== b.own_goals) return a.own_goals - b.own_goals;
    return byAuthNick(a, b);
  });
  return [tied[0]];
}

/**
 * Pior da partida: sempre 1.
 * Com perdedor → só no time que perdeu; empate → qualquer time.
 * Critério: menor contribuição (gols*2 + assists − GC*2; GK sem GC +2);
 * empate → mais GC → menos gols → menos assists.
 */
function pickMatchWorst(players) {
  const list = players || [];
  const losers = list.filter((p) => p.result === "loss").map(withMatchStats);
  const pool = losers.length ? losers : list.map(withMatchStats);
  if (!pool.length) return [];
  const scored = pool.map((p) => ({ ...p, score: matchContribution(p) }));
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (b.own_goals !== a.own_goals) return b.own_goals - a.own_goals;
    if (a.goals !== b.goals) return a.goals - b.goals;
    if (a.assists !== b.assists) return a.assists - b.assists;
    // Empate total: prefere marcar linha de campo, não o GK.
    if (Number(a.goalkeeper) !== Number(b.goalkeeper)) return Number(a.goalkeeper) - Number(b.goalkeeper);
    return byAuthNick(a, b);
  });
  // Em empate de placar, evita MVP e pior serem a mesma pessoa quando dá.
  if (!losers.length) {
    const mvpAuth = pickMatchMvps(list)[0]?.auth;
    if (mvpAuth && scored.length > 1) {
      const notMvp = scored.find((p) => p.auth !== mvpAuth);
      if (notMvp) return [notMvp];
    }
  }
  return [scored[0]];
}

function reqLabel(req, title) {
  if (title?.kind === "staff") return `adm nv.${title.level}`;
  if (title?.kind === "gift") return "Chefe";
  if (!req || !Object.keys(req).length) return "livre";
  const map = { games: "J", goals: "G", assists: "A", mvps: "MVP", cs: "CS" };
  return Object.entries(req)
    .map(([k, v]) => (k === "maxWinrate" ? `WR < ${v}%` : `${v}${map[k] || k}`))
    .join(" + ");
}

function reqLabelLong(req, title) {
  if (title?.kind === "staff") return "só staff";
  if (title?.kind === "gift") return "Chefe concede (!parca)";
  if (!req || !Object.keys(req).length) return "livre";
  const map = {
    games: (v) => `${v} jogos`,
    goals: (v) => `${v} gols`,
    assists: (v) => `${v} assists`,
    mvps: (v) => `${v} MVP`,
    cs: (v) => `${v} CS`,
  };
  return Object.entries(req)
    .map(([k, v]) => (k === "maxWinrate" ? `WR < ${v}%` : map[k] ? map[k](v) : `${v}${k}`))
    .join(" + ");
}

/** Catálogo completo (mesmo os bloqueados) + condição. Cabe em 1–2 anúncios. */
function formatTitleCatalog() {
  const playerLines = TITLES.map((t) => `${t.emblem} ${t.name} — ${reqLabelLong(t.req, t)}`);
  const gifts = GIFT_TITLES.map((t) => `${t.emblem} ${t.name} — ${reqLabelLong(t.req, t)}`);
  const staff = STAFF_TITLES.map((t) => `${t.emblem} ${t.name}`).join(" · ");
  return [`Cargos e como desbloquear:`, ...playerLines, ...gifts, `Staff (não se desbloqueia): ${staff}`].join("\n");
}

module.exports = {
  TITLES,
  STAFF_TITLES,
  GIFT_TITLES,
  JOKE_TITLES,
  STREAK_TITLE,
  STREAK_TITLE_MIN,
  wearsStreakTitle,
  statsBag,
  meetsReq,
  getTitleById,
  getStaffTitleByLevel,
  isStaffTitle,
  listUnlockedPlayer,
  listUnlockedStaff,
  listUnlockedGift,
  listUnlocked,
  isUnlocked,
  hasGiftedTitle,
  isGiftTitle,
  giftedTitleIds,
  resolveTitle,
  newlyUnlockedPlayerTitles,
  applyUnlockUpgrade,
  formatChatPrefix,
  formatChatBody,
  replaceOneVowel,
  replaceVowelsWithSnacks,
  SNACK_EMOJIS,
  chatColor,
  isTopChatTitle,
  CHAT_COLOR_RED,
  CHAT_COLOR_BLUE,
  CHAT_COLOR_SPEC,
  CHAT_COLOR_CHEFE,
  filterPlayersAtWhistle,
  pickMatchMvps,
  pickMatchWorst,
  matchContribution,
  reqLabel,
  reqLabelLong,
  formatTitleCatalog,
};

/**
 * Cargos/emblemas desbloqueáveis por stats + cargos de staff.
 * Só um cargo ativo por vez. req: { games?, goals?, assists?, mvps? }.
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
    color: 0x8e44ad,
    req: { games: 600, goals: 500, assists: 400, mvps: 160 },
  },
  {
    id: "lenda",
    name: "Lenda",
    emblem: "🐉",
    color: 0xe67e22,
    req: { games: 1600, goals: 1200, assists: 800, mvps: 500 },
  },
];

function statsBag(stats) {
  return {
    games: Number(stats?.games) || 0,
    goals: Number(stats?.goals) || 0,
    assists: Number(stats?.assists) || 0,
    mvps: Number(stats?.mvps) || 0,
  };
}

function meetsReq(stats, req = {}) {
  const s = statsBag(stats);
  for (const [key, min] of Object.entries(req)) {
    if ((s[key] || 0) < min) return false;
  }
  return true;
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
  return TITLES.find((t) => t.id === id) || STAFF_TITLES.find((t) => t.id === id) || null;
}

function listUnlockedPlayer(stats) {
  return TITLES.filter((t) => meetsReq(stats, t.req));
}

function listUnlockedStaff(adminLevel = 0) {
  const level = Number(adminLevel) || 0;
  return STAFF_TITLES.filter((t) => level >= t.level);
}

function listUnlocked(stats, adminLevel = 0) {
  return [...listUnlockedStaff(adminLevel), ...listUnlockedPlayer(stats)];
}

function isUnlocked(stats, titleId, adminLevel = 0) {
  const t = getTitleById(titleId);
  if (!t) return false;
  if (t.kind === "staff") return (Number(adminLevel) || 0) >= t.level;
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
 * Cargos de staff escolhidos (ou fallback de admin) não são trocados.
 */
function applyUnlockUpgrade(selectedId, prevStats, nextStats) {
  const newly = newlyUnlockedPlayerTitles(prevStats, nextStats);
  if (!newly.length) return selectedId || null;
  if (selectedId && isStaffTitle(selectedId)) return selectedId;
  if (!selectedId) return null;
  const bestNew = newly[newly.length - 1];
  const selIdx = playerTitleIndex(selectedId);
  const newIdx = playerTitleIndex(bestNew.id);
  if (selIdx >= 0 && newIdx > selIdx) return bestNew.id;
  return selectedId;
}

function formatChatPrefix(title) {
  return title?.emblem || "";
}

function chatColor(title) {
  return title?.color ?? 0xecf0f1;
}

/**
 * MVP da partida: maior (gols*2 + assists), mínimo 1 ponto.
 * Empate: todos com a pontuação máxima.
 */
function pickMatchMvps(players) {
  const scored = (players || []).map((p) => ({
    ...p,
    score: (p.goals || 0) * 2 + (p.assists || 0),
  }));
  const max = Math.max(0, ...scored.map((p) => p.score));
  if (max < 1) return [];
  return scored.filter((p) => p.score === max);
}

function reqLabel(req, title) {
  if (title?.kind === "staff") return `adm nv.${title.level}`;
  if (!req || !Object.keys(req).length) return "livre";
  const map = { games: "J", goals: "G", assists: "A", mvps: "MVP" };
  return Object.entries(req)
    .map(([k, v]) => `${v}${map[k] || k}`)
    .join(" + ");
}

module.exports = {
  TITLES,
  STAFF_TITLES,
  statsBag,
  meetsReq,
  getTitleById,
  getStaffTitleByLevel,
  isStaffTitle,
  listUnlockedPlayer,
  listUnlockedStaff,
  listUnlocked,
  isUnlocked,
  resolveTitle,
  newlyUnlockedPlayerTitles,
  applyUnlockUpgrade,
  formatChatPrefix,
  chatColor,
  pickMatchMvps,
  reqLabel,
};

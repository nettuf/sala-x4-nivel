/**
 * Cargos/emblemas desbloqueáveis por stats.
 * req: { games?, goals?, assists?, mvps? } — todos os campos presentes precisam ser atingidos.
 */

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
    emblem: "👑",
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

function getTitleById(id) {
  return TITLES.find((t) => t.id === id) || null;
}

function listUnlocked(stats) {
  return TITLES.filter((t) => meetsReq(stats, t.req));
}

function isUnlocked(stats, titleId) {
  const t = getTitleById(titleId);
  if (!t) return false;
  return meetsReq(stats, t.req);
}

function resolveTitle(stats, selectedId) {
  if (selectedId && isUnlocked(stats, selectedId)) {
    return getTitleById(selectedId);
  }
  // fallback: melhor cargo desbloqueado (último da lista que passa)
  const unlocked = listUnlocked(stats);
  return unlocked[unlocked.length - 1] || TITLES[0];
}

function formatChatPrefix(title, adminMeta) {
  const parts = [];
  if (adminMeta) parts.push(`[${adminMeta.title}]`);
  if (title) parts.push(`${title.emblem}${title.name}`);
  return parts.join(" ");
}

function chatColor(title, adminMeta) {
  if (adminMeta?.color) return adminMeta.color;
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

function reqLabel(req) {
  if (!req || !Object.keys(req).length) return "livre";
  const map = { games: "J", goals: "G", assists: "A", mvps: "MVP" };
  return Object.entries(req)
    .map(([k, v]) => `${v}${map[k] || k}`)
    .join(" + ");
}

module.exports = {
  TITLES,
  statsBag,
  meetsReq,
  getTitleById,
  listUnlocked,
  isUnlocked,
  resolveTitle,
  formatChatPrefix,
  chatColor,
  pickMatchMvps,
  reqLabel,
};

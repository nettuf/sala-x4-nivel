const config = require("./config");

/**
 * Toda saída involuntária (ban, kick, AFK) aponta o Discord para o jogador
 * pedir informação/recurso — a sala não tem outro canal de contato.
 */
function kickReason(text) {
  const base = String(text || "").trim();
  const url = config.discordInviteUrl;
  if (!url) return base;
  return base ? `${base} · Dúvidas no Discord: ${url}` : `Dúvidas no Discord: ${url}`;
}

function connToIp(conn) {
  if (!conn) return null;
  try {
    const ip = Buffer.from(String(conn), "hex").toString("utf8");
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip;
    return ip || null;
  } catch {
    return null;
  }
}

function parseDurationToMs(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim().toLowerCase();
  if (s === "perm" || s === "permanente" || s === "0") return null;
  const m = s.match(/^(\d+)\s*(s|m|h|d|min|hora|horas|dia|dias)?$/);
  if (!m) {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n * 60 * 1000;
  }
  const n = Number(m[1]);
  const u = m[2] || "m";
  const mult =
    u.startsWith("s") ? 1000 :
    u.startsWith("h") || u === "hora" || u === "horas" ? 3600000 :
    u.startsWith("d") || u === "dia" || u === "dias" ? 86400000 :
    60000;
  return n * mult;
}

function formatDuration(ms) {
  if (ms == null) return "permanente";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function findPlayer(room, ref) {
  const players = room.getPlayerList().filter((p) => p.id !== 0);
  if (!ref) return null;
  const raw = String(ref).trim();
  if (raw.startsWith("#")) {
    const id = Number(raw.slice(1));
    return players.find((p) => p.id === id) || null;
  }
  if (/^\d+$/.test(raw)) {
    const id = Number(raw);
    const byId = players.find((p) => p.id === id);
    if (byId) return byId;
  }
  const lower = raw.toLowerCase();
  const exact = players.find((p) => p.name.toLowerCase() === lower);
  if (exact) return exact;
  // Parcial só resolve se for único: evita banir/mutar o jogador errado.
  const partial = players.filter((p) => p.name.toLowerCase().includes(lower));
  return partial.length === 1 ? partial[0] : null;
}

function findPlayerForWhisper(players, ref) {
  if (!ref) return null;
  const raw = String(ref).trim();
  if (!raw) return null;

  if (raw.startsWith("#")) {
    const id = Number(raw.slice(1));
    return players.find((p) => p.id === id) || null;
  }

  const lower = raw.toLowerCase();
  const exact = players.find((p) => p.name.toLowerCase() === lower);
  if (exact) return exact;

  const partial = players.filter((p) => p.name.toLowerCase().includes(lower));
  if (partial.length === 1) return partial[0];

  if (/^\d+$/.test(raw)) {
    return players.find((p) => p.id === Number(raw)) || null;
  }

  return null;
}

/**
 * `@nick oi` no começo da mensagem. Resolve nick com espaços e prioriza nome
 * sobre id numérico. `oi @nick` continua público.
 */
function resolveWhisper(room, message) {
  const text = String(message || "").trim();
  if (!text.startsWith("@")) return null;
  const rest = text.slice(1).trim();
  if (!rest) return { target: null, body: "" };

  const players = room.getPlayerList().filter((p) => p.id !== 0);

  const hashLead = rest.match(/^#(\d+)(?:\s+([\s\S]+))?$/);
  if (hashLead) {
    return {
      target: findPlayerForWhisper(players, "#" + hashLead[1]),
      body: String(hashLead[2] || "").trim(),
    };
  }

  const sorted = players.slice().sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    const nameLower = p.name.toLowerCase();
    const restLower = rest.toLowerCase();
    if (restLower === nameLower) return { target: p, body: "" };
    if (restLower.startsWith(nameLower + " ")) {
      return { target: p, body: rest.slice(p.name.length).trim() };
    }
  }

  const token = rest.match(/^(\S+)(?:\s+([\s\S]+))?$/);
  if (!token) return null;
  return {
    target: findPlayerForWhisper(players, token[1]),
    body: String(token[2] || "").trim(),
  };
}

/** @deprecated use resolveWhisper(room, message) */
function parseWhisper(message) {
  const text = String(message || "").trim();
  const match = text.match(/^@(\S+)(?:\s+([\s\S]+))?$/);
  if (!match) return null;
  return {
    mention: match[1],
    body: String(match[2] || "").trim(),
  };
}

module.exports = {
  connToIp,
  parseDurationToMs,
  formatDuration,
  findPlayer,
  findPlayerForWhisper,
  parseWhisper,
  resolveWhisper,
  kickReason,
};

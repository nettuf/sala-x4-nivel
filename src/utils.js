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
  return players.find((p) => p.name.toLowerCase() === lower)
    || players.find((p) => p.name.toLowerCase().includes(lower))
    || null;
}

module.exports = { connToIp, parseDurationToMs, formatDuration, findPlayer };
